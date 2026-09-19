import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  afterNextRender,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { CategoryPickerComponent } from '../../shared/ui/category-picker';
import { DateFieldComponent } from '../../shared/ui/date-field';
import { SegmentedDirective } from '../../shared/ui/segmented';
import { TagsFieldComponent } from '../../shared/ui/tags-field';
import { ExchangeRateService } from '../../core/exchange-rate.service';
import { FinscopeService } from '../../core/finscope.service';
import { ToastService } from '../../core/toast.service';
import { describeError } from '../../core/api-error';
import {
  BASE_CURRENCY,
  CURRENCIES,
  currencySymbol,
  formatMoney,
  toBaseCurrency,
} from '../../core/format/money';
import { toApiDateTime } from '../../core/format/period';
import {
  CategoryResponse,
  CreateTransactionRequest,
  Currency,
  TagResponse,
  TransactionTypeCode,
  TransactionTypeResponse,
} from '../../core/models';

/**
 * Lo que se da por que ocupan los detalles mientras no se hayan podido medir —solo se miden
 * estando abiertos—. Se estima de más a propósito: quedarse corto abriría un bloque que no
 * cabe y estiraría el formulario, que es justo lo que este automatismo viene a evitar.
 */
const DETAILS_ROOM_GUESS = 128;

/** Holgura con la que se abre y por debajo de la cual se vuelve a plegar, en píxeles. */
const OPEN_MARGIN = 8;
const CLOSE_MARGIN = 4;

/**
 * Cuánto tiene que quedarse quieto el hueco antes de hacerle caso, en milisegundos.
 *
 * El observador avisa de cada medida intermedia, no solo de la última. Cambiar de moneda en
 * el reparto rehace la columna de al lado, y mientras se rehace el navegador pasa por altos
 * que no son ninguno de los dos estados de verdad: en uno de esos fotogramas cabían los
 * detalles, se abrían, y al fotograma siguiente ya no cabían y se cerraban. Eso es lo que se
 * veía como un parpadeo de medio segundo.
 *
 * Esperar a que la medida se esté quieta cuesta un octavo de segundo en abrir cuando sí toca
 * —que nadie nota, porque el bloque entra animado— y a cambio ninguna decisión se toma sobre
 * un alto de paso.
 */
const SETTLE_MS = 120;

/**
 * Registro de un movimiento.
 *
 * Es la acción por la que se abre la aplicación, así que el camino corto es el que se ve:
 * importe, egreso o ingreso, categoría y guardar. La categoría se elige de un toque entre
 * las que más se usan, que es lo que evita que obligarla alargue el formulario. Los tags
 * son opcionales de verdad —si no se escribe ninguno la petición sale sin `tags`— y admiten
 * varios, igual que en el editor; la fecha y la descripción viven plegadas, porque la
 * mayoría de las veces la fecha correcta es ahora.
 *
 * Plegadas, eso sí, solo mientras no haya sitio: en escritorio la tarjeta se estira para
 * igualar a la columna de al lado —con un balance por moneda esa columna crece de golpe— y
 * lo que sobra se quedaba en blanco justo encima de «Más detalles». Si en ese hueco caben,
 * se abren solos: el papel vacío se llena con lo que había detrás del clic, y como el bloque
 * ocupa hueco que ya estaba de sobra, nada de lo demás se mueve.
 */
@Component({
  selector: 'fs-quick-transaction',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    CategoryPickerComponent,
    DateFieldComponent,
    SegmentedDirective,
    TagsFieldComponent,
  ],
  templateUrl: './quick-transaction.html',
  styleUrl: './quick-transaction.scss',
})
export class QuickTransactionComponent {
  private readonly api = inject(FinscopeService);
  private readonly rates = inject(ExchangeRateService);
  private readonly toasts = inject(ToastService);
  private readonly formBuilder = inject(FormBuilder);
  private readonly destroyRef = inject(DestroyRef);

  /** Catálogo global de tipos, del que sale el identificador que espera la API. */
  readonly types = input.required<TransactionTypeResponse[]>();
  /** Catálogo de categorías del usuario, de donde sale la clasificación principal. */
  readonly categories = input.required<CategoryResponse[]>();
  readonly tags = input.required<TagResponse[]>();
  /**
   * Marca de la petición de registrar. Cada valor nuevo se lleva el foco al importe.
   * Es un número y no un booleano porque hay que poder pedirlo dos veces seguidas.
   */
  readonly focusRequest = input<number | null>(null);

  /**
   * Si lo que rodea al formulario todavía está cambiando de alto.
   *
   * Mientras la pantalla recarga, la columna de al lado son esqueletos: mide lo que mide un
   * hueco de carga, que no es lo que va a medir cuando lleguen los datos. Abrir o plegar por
   * ese alto es decidir con una respuesta provisional, así que el automatismo se está quieto
   * hasta que haya algo de verdad que medir. Lo que ya estuviera abierto se queda abierto:
   * cerrarlo y volver a abrirlo es justo el parpadeo que se quiere evitar.
   */
  readonly settling = input(false);

  /**
   * Avisa de que hay un movimiento nuevo para que el dashboard se recalcule.
   * Lleva su identificador, para poder señalarlo en la lista de los últimos.
   */
  readonly saved = output<number>();

  /** Se ha creado una categoría desde el selector: el catálogo de fuera se ha quedado viejo. */
  readonly catalogueChanged = output<void>();

  protected readonly currencies = CURRENCIES;
  /** Moneda elegida. Manda sobre el tipo de cambio, que solo existe fuera de la base. */
  protected readonly currency = signal<Currency>(BASE_CURRENCY);
  protected readonly kind = signal<TransactionTypeCode>('EXPENSE');
  /** Categoría elegida. Vive fuera del formulario porque se elige tocando una ficha. */
  protected readonly categoryId = signal<number | null>(null);
  /** Se enseña el aviso de categoría solo tras intentar guardar sin ninguna. */
  protected readonly categoryMissing = signal(false);
  /**
   * Lo que ha decidido el usuario sobre los detalles, o nulo mientras no toque el botón.
   * Nulo no es «cerrado»: es «decide tú», y decide el sitio que sobre.
   */
  private readonly detailsChoice = signal<boolean | null>(null);
  /** Si en el hueco sobrante caben los detalles enteros. */
  private readonly detailsFit = signal(false);
  protected readonly showDetails = computed(() => this.detailsChoice() ?? this.detailsFit());

  /**
   * Si el botón de plegar los detalles tiene algo que ofrecer.
   *
   * Cuando los ha abierto el sitio que sobra —pantalla ancha, tarjeta estirada— plegarlos no
   * gana nada: el hueco seguiría ahí, vacío, y el botón solo sería un mando que devuelve la
   * pantalla a como estaba peor. Así que desaparece, y con él la fila entera si tampoco hay
   * nada más que decir.
   */
  protected readonly canToggleDetails = computed(
    () => this.detailsChoice() !== null || !this.detailsFit(),
  );
  protected readonly saving = signal(false);

  private readonly amountField = viewChild<ElementRef<HTMLInputElement>>('amountField');
  private readonly slackGap = viewChild<ElementRef<HTMLElement>>('slackGap');
  private readonly extraBlock = viewChild<ElementRef<HTMLElement>>('extraBlock');

  /** Lo que ocupa el bloque de detalles con su hueco, en cuanto se haya podido medir. */
  private detailsRoom = DETAILS_ROOM_GUESS;

  /** La medida pendiente de confirmar, mientras el hueco no se esté quieto. */
  private fitTimer: ReturnType<typeof setTimeout> | null = null;

  protected readonly form = this.formBuilder.nonNullable.group({
    amount: [null as number | null, [Validators.required, Validators.min(0.01)]],
    // Obligatorio o prohibido segun la moneda: lo decide `setCurrency`.
    exchangeRate: [null as number | null],
    description: ['', Validators.maxLength(255)],
    date: [''],
  });

  /** Si el movimiento esta en la moneda base, la unica que no lleva tipo de cambio. */
  protected readonly isBaseCurrency = computed(() => this.currency() === BASE_CURRENCY);

  /** Simbolo de la moneda elegida, el que acompana al monto mientras se escribe. */
  protected readonly symbol = computed(() => currencySymbol(this.currency()));

  /** Lo escrito en el formulario, como senal, para poder recalcular la conversion. */
  private readonly draft = toSignal(this.form.valueChanges, {
    initialValue: this.form.getRawValue(),
  });

  /** De cuando es la tasa propuesta, o nulo si el usuario ya escribio otra. */
  protected readonly suggestedFrom = computed(() => {
    const last = this.rates.lastRate(this.currency());
    if (this.isBaseCurrency() || !last || Number(this.draft().exchangeRate) !== last.rate) {
      return null;
    }
    return new Date(last.date).toLocaleDateString('es', { day: 'numeric', month: 'long' });
  });

  /** La conversion en palabras, que es lo que delata un cambio mal tecleado. */
  protected readonly converted = computed(() => {
    const value = this.draft();
    const amount = Number(value.amount);
    const rate = Number(value.exchangeRate);
    if (!amount || !rate || this.isBaseCurrency()) {
      return null;
    }
    const money = formatMoney(amount, this.currency());
    return `${money} \u00d7 ${rate} = ${formatMoney(toBaseCurrency(amount, rate))}`;
  });

  /** Tags escritos. Viven fuera del formulario porque se manejan como fichas. */
  protected readonly pickedTags = signal<string[]>([]);

  /** El tipo elegido dentro del catálogo, que es de donde sale su identificador. */
  protected readonly selectedType = computed(() =>
    this.types().find((type) => type.code === this.kind()),
  );

  constructor() {
    // La ultima tasa conocida se pide a la API, asi que puede llegar despues de haber
    // elegido la moneda: sin esto habria que volver a tocar el selector para verla.
    effect(() => {
      const currency = this.currency();
      const last = this.rates.lastRate(currency);
      const control = this.form.controls.exchangeRate;
      if (currency !== BASE_CURRENCY && last && control.value == null) {
        control.setValue(last.rate);
      }
    });

    effect(() => {
      if (this.focusRequest() === null) {
        return;
      }
      const field = this.amountField()?.nativeElement;
      field?.focus();
      // En móvil el formulario queda por debajo del balance: enfocarlo sin traerlo a la
      // vista dejaría al usuario escribiendo en un campo que no ve.
      field?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    });

    // El hueco sobrante se vigila con un observador y no se calcula: depende del alto de la
    // otra columna, que cambia con los datos del mes, con la moneda del reparto y con el
    // ancho de la ventana. Se observa el hueco en persona —su alto *es* lo que sobra—, así
    // que abrir o cerrar los detalles vuelve a disparar la medida y el resultado se asienta
    // solo: al abrir, lo que sobra baja justo lo que ocupa el bloque, y ahí se queda.
    //
    // Lo que no se hace es creerse la primera medida: se espera a que el hueco se quede
    // quieto. Ver `SETTLE_MS`.
    afterNextRender(() => {
      const gap = this.slackGap()?.nativeElement;
      if (!gap || typeof ResizeObserver === 'undefined') {
        return;
      }
      const observer = new ResizeObserver(() => this.scheduleFit());
      observer.observe(gap);
      this.destroyRef.onDestroy(() => {
        observer.disconnect();
        this.cancelFit();
      });
      this.scheduleFit();
    });
  }

  /**
   * Aplaza la decisión hasta que el hueco lleve `SETTLE_MS` sin moverse.
   * Cada medida nueva vuelve a empezar la espera, de modo que de una ráfaga de reflujos solo
   * se atiende al alto en el que la ráfaga termina.
   */
  private scheduleFit(): void {
    this.cancelFit();
    this.fitTimer = setTimeout(() => {
      this.fitTimer = null;
      this.fitDetails();
    }, SETTLE_MS);
  }

  private cancelFit(): void {
    if (this.fitTimer !== null) {
      clearTimeout(this.fitTimer);
      this.fitTimer = null;
    }
  }

  /**
   * Abre los detalles si caben en lo que sobra y los pliega cuando deja de sobrar nada.
   *
   * Las dos holguras no son un adorno: sin ellas, el caso justo —lo que sobra igual a lo que
   * ocupa el bloque— abriría, quedaría a cero, cerraría y volvería a abrir sin parar. Con
   * ellas, abrir deja siempre al menos `OPEN_MARGIN` de sobra, que es más de lo que pide
   * `CLOSE_MARGIN` para plegar, así que el estado al que se llega no se deshace solo.
   */
  private fitDetails(): void {
    const gap = this.slackGap()?.nativeElement;
    if (!gap) {
      return;
    }
    // Con la pantalla recargando, el alto de al lado es el de un esqueleto y no el de los
    // datos: no hay nada que medir todavía.
    if (this.settling()) {
      return;
    }
    const slack = gap.offsetHeight;

    // Lo que ocupa el bloque solo se puede medir estando abierto, y se mide por dentro: el
    // de fuera está animando su alto y durante ese cuarto de segundo mediría de menos.
    const inner = this.extraBlock()?.nativeElement;
    if (inner?.scrollHeight) {
      this.detailsRoom = inner.scrollHeight + this.rowGap(gap.parentElement);
    }

    // Quien haya tocado el botón manda: ni se le abre lo que plegó ni se le pliega lo que abrió.
    if (this.detailsChoice() !== null) {
      return;
    }
    if (!this.showDetails()) {
      if (slack >= this.detailsRoom + OPEN_MARGIN) {
        this.detailsFit.set(true);
      }
    } else if (slack < CLOSE_MARGIN) {
      this.detailsFit.set(false);
    }
  }

  /** El hueco entre campos del formulario, que es lo que el bloque suma además de su alto. */
  private rowGap(form: HTMLElement | null): number {
    if (!form) {
      return 0;
    }
    return parseFloat(getComputedStyle(form).rowGap) || 0;
  }

  /**
   * Abre o cierra los detalles a mano. A partir de aquí manda la elección del usuario y el
   * sitio que sobre deja de decidir: plegarlos teniendo hueco es una decisión legítima.
   */
  protected toggleDetails(): void {
    this.detailsChoice.set(!this.showDetails());
  }

  protected setKind(kind: TransactionTypeCode): void {
    this.kind.set(kind);
  }

  /**
   * Elige la moneda y deja el tipo de cambio como esa moneda exige: obligatorio fuera de la
   * base, vaciado al volver a ella para que no viaje un cambio que ya no convierte nada.
   *
   * @param currency moneda elegida
   */
  protected setCurrency(currency: Currency): void {
    this.currency.set(currency);
    const control = this.form.controls.exchangeRate;
    if (currency === BASE_CURRENCY) {
      control.reset(null);
      control.clearValidators();
    } else {
      control.setValidators([Validators.required, Validators.min(0.000001)]);
      // Se propone la ultima que se uso: teclearla en cada movimiento es el paso de sobra
      // que hace que se deje de registrar. Solo si el campo esta vacio.
      this.rates.ensureLoaded(currency);
      const last = this.rates.lastRate(currency);
      if (control.value == null && last) {
        control.setValue(last.rate);
      }
    }
    control.updateValueAndValidity();
  }

  /** Simbolo con el que se rotula cada moneda en el selector. */
  protected symbolOf(currency: Currency): string {
    return currencySymbol(currency);
  }

  /** Recoge la categoría elegida y retira el aviso en cuanto deja de faltar. */
  protected onCategoryChange(id: number | null): void {
    this.categoryId.set(id);
    if (id !== null) {
      this.categoryMissing.set(false);
    }
  }

  protected submit(): void {
    const type = this.selectedType();
    const categoryId = this.categoryId();
    if (this.form.invalid || !type || categoryId === null || this.saving()) {
      this.form.markAllAsTouched();
      this.categoryMissing.set(categoryId === null);
      return;
    }

    const value = this.form.getRawValue();
    const request: CreateTransactionRequest = {
      amount: Number(value.amount),
      currency: this.currency(),
      transactionTypeId: type.id,
      categoryId,
    };
    if (!this.isBaseCurrency()) {
      request.exchangeRate = Number(value.exchangeRate);
    }
    if (value.description.trim()) {
      request.description = value.description.trim();
    }
    if (value.date) {
      request.date = toApiDateTime(value.date);
    }
    // Sin tags no se manda el campo: el contrato lo admite ausente y una lista vacía
    // significaría otra cosa distinta, que es dejar la transacción explícitamente sin tags.
    if (this.pickedTags().length) {
      request.tags = this.pickedTags();
    }

    this.saving.set(true);
    this.form.disable();
    this.api.createTransaction(request).subscribe({
      next: (created) => {
        // Lo que acaba de guardarse es, por definicion, lo ultimo: se recuerda para el
        // siguiente movimiento en lugar de volver a preguntarselo a la API.
        if (created.currency && created.exchangeRate) {
          this.rates.remember(created.currency, created.exchangeRate, created.date);
        }
        this.toasts.success(type.code === 'INCOME' ? 'Ingreso registrado' : 'Egreso registrado');
        this.reset();
        this.saved.emit(created.id);
      },
      error: (error) => {
        this.toasts.error(describeError(error));
        this.finish();
      },
    });
  }

  private reset(): void {
    this.finish();
    this.form.reset({ amount: null, exchangeRate: null, description: '', date: '' });
    this.setCurrency(BASE_CURRENCY);
    this.pickedTags.set([]);
    this.categoryId.set(null);
    this.categoryMissing.set(false);
    // Vuelve a decidir el sitio, no se cierra: si el hueco sigue ahí, el movimiento
    // siguiente se escribe con la fecha a la vista, igual que el que se acaba de guardar.
    this.detailsChoice.set(null);
    // Encadenar movimientos es lo normal al ponerse al día: el foco vuelve al importe.
    this.amountField()?.nativeElement.focus();
  }

  private finish(): void {
    this.saving.set(false);
    this.form.enable();
  }
}
