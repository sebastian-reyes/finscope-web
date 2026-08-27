import {
  AfterViewInit,
  Component,
  DOCUMENT,
  ElementRef,
  OnDestroy,
  OnInit,
  computed,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { FinscopeService } from '../../core/finscope.service';
import { ToastService } from '../../core/toast.service';
import { describeError } from '../../core/api-error';
import { CURRENCY_SYMBOL } from '../../core/format/money';
import { toApiDateTime, toInputDateTime } from '../../core/format/period';
import {
  CategoryResponse,
  CreateTransactionRequest,
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

  protected readonly currency = CURRENCY_SYMBOL;
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
    description: ['', Validators.maxLength(255)],
    date: ['', Validators.required],
  });

  protected readonly isEdit = computed(() => this.transaction() !== null);

  /** El tipo elegido dentro del catálogo, que es de donde sale su identificador. */
  protected readonly selectedType = computed(() =>
    this.types().find((type) => type.code === this.kind()),
  );

  ngOnInit(): void {
    const current = this.transaction();
    if (current) {
      this.form.setValue({
        amount: current.amount,
        description: current.description ?? '',
        date: toInputDateTime(current.date),
      });
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
      transactionTypeId: type.id,
      categoryId,
      date: toApiDateTime(value.date),
    };
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
   * @param current  movimiento tal y como estaba al abrir el editor
   * @param type     tipo elegido en el formulario
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
