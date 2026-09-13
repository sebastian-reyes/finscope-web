import {
  AfterViewInit,
  Component,
  DOCUMENT,
  ElementRef,
  OnDestroy,
  OnInit,
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
import { toApiDateTime, toInputDateTime } from '../../core/format/period';
import {
  CategoryResponse,
  CreateTransactionRequest,
  Currency,
  TagResponse,
  TransactionResponse,
  TransactionTypeCode,
  TransactionTypeResponse,
  UpdateTransactionRequest,
} from '../../core/models';
import { CategoryPickerComponent } from './category-picker';
import { DateFieldComponent } from './date-field';
import { TagsFieldComponent } from './tags-field';

/**
 * Alta y edición completa de un movimiento.
 *
 * Todo lo que define un movimiento —monto, tipo, categoría, descripción, fecha y tags— se
 * cambia en el mismo sitio y de la misma forma que se creó, en lugar de repartirlo entre
 * una fila editable y un formulario aparte. Se abre encima de la lista y no en otra pantalla para
 * que al cerrarlo se siga viendo dónde estaba uno.
 *
 * Al guardar una edición solo se manda lo que ha cambiado: la API aplica un `PATCH` campo
 * a campo, así que mandar el objeto entero pisaría con valores viejos cualquier cambio que
 * hubiera entrado por otro lado mientras el formulario estaba abierto.
 */
@Component({
  selector: 'fs-transaction-editor',
  imports: [ReactiveFormsModule, CategoryPickerComponent, DateFieldComponent, TagsFieldComponent],
  templateUrl: './transaction-editor.html',
  styleUrl: './transaction-editor.scss',
  host: {
    '(document:keydown.escape)': 'requestClose()',
    // El anfitrión es el velo, así que pulsar fuera de la hoja es pulsarlo a él.
    '(click)': 'onBackdrop($event)',
  },
})
export class TransactionEditorComponent implements OnInit, AfterViewInit, OnDestroy {
  private readonly api = inject(FinscopeService);
  private readonly rates = inject(ExchangeRateService);
  private readonly toasts = inject(ToastService);
  private readonly formBuilder = inject(FormBuilder);
  private readonly document = inject(DOCUMENT);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  /** Movimiento a editar, o nulo para registrar uno nuevo. */
  readonly transaction = input<TransactionResponse | null>(null);

  /** Catálogo global de tipos, del que sale el identificador que espera la API. */
  readonly types = input.required<TransactionTypeResponse[]>();

  /** Catálogo de categorías del usuario, de donde sale la clasificación principal. */
  readonly categories = input.required<CategoryResponse[]>();

  /** Catálogo de tags del usuario, para autocompletar y sugerir. */
  readonly catalogue = input.required<TagResponse[]>();

  /** Se ha guardado un alta o una edición. Lleva el identificador del movimiento. */
  readonly saved = output<number>();

  /** Se ha borrado el movimiento que se estaba editando. */
  readonly deleted = output<void>();

  /** Hay que cerrar el editor sin más. */
  readonly closed = output<void>();

  /** Se ha creado una categoría desde el selector: el catálogo de fuera se ha quedado viejo. */
  readonly catalogueChanged = output<void>();

  protected readonly currencies = CURRENCIES;
  /**
   * Moneda elegida. Vive fuera del formulario porque se elige tocando un botón, igual que
   * el tipo, y porque manda sobre otro campo: al volver a la base limpia el tipo de cambio.
   */
  protected readonly currency = signal<Currency>(BASE_CURRENCY);
  protected readonly kind = signal<TransactionTypeCode>('EXPENSE');
  /** Categoría elegida. Vive fuera del formulario porque se elige tocando una ficha. */
  protected readonly categoryId = signal<number | null>(null);
  /** Se enseña el aviso de categoría solo tras intentar guardar sin ninguna. */
  protected readonly categoryMissing = signal(false);
  protected readonly tags = signal<string[]>([]);
  protected readonly saving = signal(false);
  /** Si el borrado está esperando confirmación dentro del propio editor. */
  protected readonly confirmingDelete = signal(false);

  private readonly amountField = viewChild<ElementRef<HTMLInputElement>>('amountField');

  protected readonly form = this.formBuilder.nonNullable.group({
    amount: [null as number | null, [Validators.required, Validators.min(0.01)]],
    // Sin validador fijo: es obligatorio o prohibido según la moneda, y de eso se encarga
    // `setCurrency`, que es lo único que puede cambiar esa condición.
    exchangeRate: [null as number | null],
    description: ['', Validators.maxLength(255)],
    date: ['', Validators.required],
  });

  protected readonly isEdit = computed(() => this.transaction() !== null);

  /**
   * Lo que hay escrito en el formulario, como señal.
   * El formulario reactivo no lo es, y la ayuda de conversión tiene que recalcularse con
   * cada tecla: sin este puente habría que repetir el cálculo en dos manejadores de evento.
   */
  private readonly draft = toSignal(this.form.valueChanges, {
    initialValue: this.form.getRawValue(),
  });

  /** Si el movimiento está en la moneda base, la única que no lleva tipo de cambio. */
  protected readonly isBaseCurrency = computed(() => this.currency() === BASE_CURRENCY);

  /** Símbolo de la moneda elegida, el que acompaña al monto mientras se escribe. */
  protected readonly symbol = computed(() => currencySymbol(this.currency()));

  /**
   * De cuándo es la tasa que se ha propuesto, o nulo si el usuario ya escribió otra.
   * Una tasa de hace dos semanas es una propuesta razonable, pero hay que poder ver que es
   * de hace dos semanas antes de darla por buena.
   */
  protected readonly suggestedFrom = computed(() => {
    const last = this.rates.lastRate(this.currency());
    if (this.isBaseCurrency() || !last || Number(this.draft().exchangeRate) !== last.rate) {
      return null;
    }
    return new Date(last.date).toLocaleDateString('es', { day: 'numeric', month: 'long' });
  });

  /**
   * La conversión escrita en palabras, mientras se teclean monto y cambio.
   * Es lo que evita el error de tecleo que no se ve hasta el mes siguiente: un cambio de
   * 35.5 en lugar de 3.55 se lee de golpe al ver el resultado.
   */
  protected readonly converted = computed(() => {
    const value = this.draft();
    const amount = Number(value.amount);
    const rate = Number(value.exchangeRate);
    if (!amount || !rate || this.isBaseCurrency()) {
      return null;
    }
    const money = formatMoney(amount, this.currency());
    return `${money} × ${rate} = ${formatMoney(toBaseCurrency(amount, rate))}`;
  });

  /** El tipo elegido dentro del catálogo, que es de donde sale su identificador. */
  protected readonly selectedType = computed(() =>
    this.types().find((type) => type.code === this.kind()),
  );

  constructor() {
    // La última tasa conocida se pide a la API, así que puede llegar después de haber
    // elegido la moneda. Sin esto habría que volver a tocar el selector para que la
    // propuesta apareciera, que es justo el paso de más que se quiere quitar.
    effect(() => {
      const currency = this.currency();
      const last = this.rates.lastRate(currency);
      const control = this.form.controls.exchangeRate;
      if (currency !== BASE_CURRENCY && last && control.value == null) {
        control.setValue(last.rate);
      }
    });
  }

  ngOnInit(): void {
    const current = this.transaction();
    if (current) {
      this.form.setValue({
        amount: current.amount,
        exchangeRate: current.exchangeRate ?? null,
        description: current.description ?? '',
        date: toInputDateTime(current.date),
      });
      // Se carga lo que se guardó, no lo que valdría hoy: editar la descripción de una
      // compra de agosto no puede cambiar por cuánto se apuntó aquel día.
      this.setCurrency(current.currency);
      this.kind.set(current.transactionType.code);
      this.categoryId.set(current.category.id);
      this.tags.set([...current.tags]);
    } else {
      // En un alta la fecha se rellena con el instante actual en vez de dejarse vacía: es
      // la que va a quedar registrada, así que conviene verla y poder corregirla.
      this.form.controls.date.setValue(toInputDateTime(new Date()));
    }
    // Mientras el editor está abierto, la lista de detrás no debe poder desplazarse.
    this.document.body.style.overflow = 'hidden';
  }

  ngAfterViewInit(): void {
    this.amountField()?.nativeElement.focus();
  }

  ngOnDestroy(): void {
    this.document.body.style.overflow = '';
  }

  protected setKind(kind: TransactionTypeCode): void {
    this.kind.set(kind);
  }

  /**
   * Elige la moneda y deja el tipo de cambio como esa moneda exige.
   *
   * La base no lo lleva, así que al volver a ella el campo se limpia y deja de ser
   * obligatorio; fuera de ella pasa a hacer falta. Vaciarlo al salir no es solo cosmético:
   * un cambio que se quedó escrito de antes viajaría con un importe que ya no convierte
   * nada, y la API lo rechazaría con un error que el usuario no sabría de dónde sale.
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
      // La tasa se propone sola: teclearla en cada movimiento es el paso de sobra que hace
      // que se deje de registrar. Solo se rellena si el campo está vacío, de modo que ni
      // pisa lo que el usuario haya escrito ni la que traiga un movimiento que se edita.
      this.rates.ensureLoaded(currency);
      const last = this.rates.lastRate(currency);
      if (control.value == null && last) {
        control.setValue(last.rate);
      }
    }
    control.updateValueAndValidity();
  }

  /** Símbolo con el que se rotula cada moneda en el selector. */
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

  /** Cierra el editor, salvo que haya una operación en curso que no conviene interrumpir. */
  protected requestClose(): void {
    if (!this.saving()) {
      this.closed.emit();
    }
  }

  /**
   * Cierra al pulsar sobre el velo, pero no al soltar ahí un arrastre nacido dentro de la
   * hoja: el suceso llega igual por burbujeo, y solo cuenta si nació en el propio velo.
   */
  protected onBackdrop(event: MouseEvent): void {
    if (event.target === event.currentTarget) {
      this.requestClose();
    }
  }

  protected submit(): void {
    const type = this.selectedType();
    const categoryId = this.categoryId();
    if (this.form.invalid || !type || categoryId === null || this.saving()) {
      this.form.markAllAsTouched();
      this.categoryMissing.set(categoryId === null);
      this.revealFirstProblem();
      return;
    }

    const current = this.transaction();
    if (current) {
      this.update(current, type, categoryId);
    } else {
      this.create(type, categoryId);
    }
  }

  /**
   * Lleva a la vista lo primero que falta por rellenar.
   *
   * El cuerpo de la hoja se desplaza, así que quien pulsa «Registrar» desde abajo puede
   * tener el monto vacío fuera de la pantalla: sin esto, el botón parecería no hacer nada.
   * Se apunta al campo y no a su aviso porque el campo ya está puesto —el aviso se pinta al
   * cerrar este ciclo— y porque el foco, además de traerlo a la vista, es lo que un lector
   * de pantalla anuncia. El salto es seco: esto es una corrección, no un paseo.
   */
  private revealFirstProblem(): void {
    const host = this.host.nativeElement;
    let target: HTMLElement | null = null;
    if (this.form.controls.amount.invalid) {
      target = this.amountField()?.nativeElement ?? null;
    } else if (this.form.controls.exchangeRate.invalid) {
      target = host.querySelector('#editorRate');
    } else if (this.categoryId() === null) {
      target = host.querySelector('fs-category-picker');
    } else if (this.form.controls.date.invalid) {
      target = host.querySelector('fs-date-field');
    }
    // El foco no arrastra la vista por su cuenta: de eso se encarga la línea de abajo, y
    // dos desplazamientos seguidos dejarían el campo pegado al borde.
    if (target instanceof HTMLInputElement) {
      target.focus({ preventScroll: true });
    }
    // Centrado y no solo asomado: acercarlo lo mínimo lo deja rozando el borde y con su
    // rótulo fuera, que es la mitad de lo que hay que leer.
    target?.scrollIntoView({ block: 'center' });
  }

  protected askDelete(): void {
    this.confirmingDelete.set(true);
  }

  protected cancelDelete(): void {
    this.confirmingDelete.set(false);
  }

  /** Borra el movimiento. El borrado es físico y se lleva por delante sus tags. */
  protected remove(): void {
    const current = this.transaction();
    if (!current || this.saving()) {
      return;
    }
    this.saving.set(true);
    this.api.deleteTransaction(current.id).subscribe({
      next: () => {
        this.toasts.success('Movimiento eliminado');
        this.saving.set(false);
        this.deleted.emit();
      },
      error: (error) => this.fail(error),
    });
  }

  private create(type: TransactionTypeResponse, categoryId: number): void {
    const value = this.form.getRawValue();
    const request: CreateTransactionRequest = {
      amount: Number(value.amount),
      currency: this.currency(),
      transactionTypeId: type.id,
      categoryId,
      date: toApiDateTime(value.date),
    };
    // El cambio viaja solo fuera de la moneda base: mandarlo en un movimiento en soles es
    // justo lo que la API rechaza, porque nadie convirtió nada.
    if (!this.isBaseCurrency()) {
      request.exchangeRate = Number(value.exchangeRate);
    }
    if (value.description.trim()) {
      request.description = value.description.trim();
    }
    // Una lista vacía significa «sin ningún tag», que en un alta es justo lo mismo que no
    // mandar el campo; se omite para que la petición diga solo lo que hace falta.
    if (this.tags().length) {
      request.tags = this.tags();
    }

    this.start();
    this.api.createTransaction(request).subscribe({
      next: (created) => {
        this.rememberRate(created);
        this.toasts.success(type.code === 'INCOME' ? 'Ingreso registrado' : 'Egreso registrado');
        this.finish();
        this.saved.emit(created.id);
      },
      error: (error) => this.fail(error),
    });
  }

  private update(
    current: TransactionResponse,
    type: TransactionTypeResponse,
    categoryId: number,
  ): void {
    const request = this.buildPatch(current, type, categoryId);
    if (!Object.keys(request).length) {
      this.closed.emit();
      return;
    }

    this.start();
    this.api.updateTransaction(current.id, request).subscribe({
      next: (updated) => {
        this.rememberRate(updated);
        this.toasts.success('Movimiento actualizado');
        this.finish();
        this.saved.emit(updated.id);
      },
      error: (error) => this.fail(error),
    });
  }

  /**
   * Compone la petición con los campos que el usuario ha tocado de verdad.
   *
   * La descripción vaciada se manda como texto vacío y no como nulo, porque para la API un
   * nulo es «este campo no viene» y dejaría la descripción anterior intacta: sin esto no
   * habría forma de quitar una descripción escrita por error.
   *
   * Volver a la moneda base no manda ningún tipo de cambio: la API lo borra al ver la
   * moneda, que es lo único que puede hacerse cuando un nulo significa «no lo toques».
   *
   * @param current    movimiento tal y como estaba al abrir el editor
   * @param type       tipo elegido en el formulario
   * @param categoryId categoría elegida en el formulario
   * @return los cambios a enviar, vacío si no hay ninguno
   */
  private buildPatch(
    current: TransactionResponse,
    type: TransactionTypeResponse,
    categoryId: number,
  ): UpdateTransactionRequest {
    const value = this.form.getRawValue();
    const request: UpdateTransactionRequest = {};

    const amount = Number(value.amount);
    if (amount !== current.amount) {
      request.amount = amount;
    }
    // La moneda manda sobre el cambio, igual que en la API: si cambia, el cambio viaja con
    // ella aunque el número sea el mismo, porque el anterior era el de la moneda anterior.
    const currencyChanged = this.currency() !== current.currency;
    if (currencyChanged) {
      request.currency = this.currency();
    }
    const rate = this.isBaseCurrency() ? null : Number(value.exchangeRate);
    if (!this.isBaseCurrency() && (currencyChanged || rate !== current.exchangeRate)) {
      request.exchangeRate = rate;
    }
    const description = value.description.trim();
    if (description !== (current.description ?? '')) {
      request.description = description;
    }
    const date = toApiDateTime(value.date);
    if (date !== toApiDateTime(toInputDateTime(current.date))) {
      request.date = date;
    }
    if (type.id !== current.transactionType.id) {
      request.transactionTypeId = type.id;
    }
    if (categoryId !== current.category.id) {
      request.categoryId = categoryId;
    }
    if (hasTagChanges(current.tags, this.tags())) {
      request.tags = this.tags();
    }
    return request;
  }

  /**
   * Se queda con la tasa del movimiento recién guardado, para proponerla en el siguiente.
   * Lo que acaba de guardarse es, por definición, lo último: no hace falta volver a
   * preguntárselo a la API.
   *
   * @param saved movimiento tal y como lo devolvió la API
   */
  private rememberRate(saved: TransactionResponse): void {
    if (saved.currency && saved.exchangeRate) {
      this.rates.remember(saved.currency, saved.exchangeRate, saved.date);
    }
  }

  private start(): void {
    this.saving.set(true);
    this.form.disable();
  }

  private finish(): void {
    this.saving.set(false);
    this.form.enable();
  }

  private fail(error: unknown): void {
    this.toasts.error(describeError(error));
    this.finish();
    this.confirmingDelete.set(false);
  }
}

/**
 * Decide si los tags han cambiado.
 * El orden no cuenta —la API los devuelve alfabéticos y el campo los guarda como se
 * escriben— y las mayúsculas tampoco, porque al guardar se reutiliza el tag existente con
 * la grafía que ya tuviera.
 *
 * @param before tags con los que se abrió el editor
 * @param after  tags que quedan en el formulario
 * @return si hay que mandar la lista de tags en la petición
 */
function hasTagChanges(before: readonly string[], after: readonly string[]): boolean {
  if (before.length !== after.length) {
    return true;
  }
  const normalise = (tags: readonly string[]) => [...tags].map((tag) => tag.toLowerCase()).sort();
  const left = normalise(before);
  const right = normalise(after);
  return left.some((tag, index) => tag !== right[index]);
}
