import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Observable } from 'rxjs';
import { FinscopeService } from '../../core/finscope.service';
import { RefreshService } from '../../core/refresh.service';
import { ToastService } from '../../core/toast.service';
import { describeError } from '../../core/api-error';
import {
  BASE_CURRENCY,
  CURRENCIES,
  CURRENCY_NAMES,
  currencySymbol,
  formatMoney,
} from '../../core/format/money';
import { matchesSearch } from '../../core/format/search';
import {
  LOAN_FREQUENCIES,
  LoanFrequency,
  buildLoanPlan,
  dueDistance,
  isoDate,
  parseIsoDate,
  planTotal,
  shortDate,
} from '../../core/format/loan-plan';
import {
  Currency,
  LoanInstallmentRequest,
  LoanInstallmentStatus,
  LoanResponse,
  LoanStatus,
  SaveLoanRequest,
} from '../../core/models';
import { BottomSheetComponent } from '../../shared/ui/bottom-sheet';
import { DateFieldComponent } from '../../shared/ui/date-field';
import { SearchFieldComponent } from '../../shared/ui/search-field';

/** Cómo se devuelve: de una vez o en varias cuotas. */
type RepaymentMode = 'SINGLE' | 'INSTALLMENTS';

/** Máximo de cuotas que acepta la API. */
const MAX_INSTALLMENTS = 120;

/**
 * Escribe juntos los importes de una lista, uno por moneda, sin sumarlos entre sí: soles y
 * dólares no se suman, igual que en los fijos.
 *
 * @param loans préstamos a sumar
 * @param pick  de dónde sale el importe de cada uno
 * @return los totales escritos, o vacío si todos son cero
 */
function byCurrency(loans: LoanResponse[], pick: (loan: LoanResponse) => number): string {
  const totals = new Map<Currency, number>();
  for (const loan of loans) {
    const amount = pick(loan);
    if (amount > 0) {
      totals.set(loan.currency, (totals.get(loan.currency) ?? 0) + amount);
    }
  }
  return [...totals.entries()]
    .map(([currency, amount]) => formatMoney(amount, currency))
    .join(' · ');
}

/** Si de un préstamo todavía se espera dinero. */
function isOpen(loan: LoanResponse): boolean {
  return loan.status === 'ACTIVE' || loan.status === 'OVERDUE';
}

/**
 * Dinero prestado a otras personas.
 *
 * Un préstamo no es un movimiento: prestar no es gastar ni cobrar es ingresar. Por eso no
 * aparece en el historial ni en el análisis, y vive aquí, junto al resto del plan, como algo
 * que se espera que vuelva.
 *
 * La pantalla responde a dos preguntas: cuánto me deben en total, y quién me tiene que pagar
 * pronto. Lo vencido va arriba porque es lo que hay que reclamar. Lo devuelto se registra de
 * un toque con lo que toca de la próxima cuota, y si alguien paga de más o a medias, la API
 * lo reparte sola en orden de cuota.
 *
 * El interés, cuando lo hay, es un monto fijo: entre personas se acuerda «me devuelves
 * 1100», no una tasa. Lo normal es prestar sin interés, por apoyar, y así abre el formulario.
 */
@Component({
  selector: 'app-loans',
  imports: [
    NgTemplateOutlet,
    ReactiveFormsModule,
    BottomSheetComponent,
    DateFieldComponent,
    SearchFieldComponent,
  ],
  templateUrl: './loans.html',
  styleUrl: './loans.scss',
})
export class LoansPage {
  private readonly api = inject(FinscopeService);
  private readonly toasts = inject(ToastService);
  private readonly formBuilder = inject(FormBuilder);

  protected readonly loans = signal<LoanResponse[]>([]);
  protected readonly loading = signal(true);
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);

  /** Hoy, `yyyy-MM-dd`. Se fija al abrir: la pantalla no vive lo bastante para cambiar de día. */
  protected readonly today = isoDate();

  /**
   * Préstamo con el detalle abierto. Abre en el que diga la dirección (`?prestamo=21`), que
   * es por donde llega un aviso del teléfono.
   */
  protected readonly expandedId = signal<number | null>(
    Number(inject(ActivatedRoute).snapshot.queryParamMap.get('prestamo')) || null,
  );

  /** Préstamo cuya eliminación espera confirmación en su propia tarjeta. */
  protected readonly confirmingId = signal<number | null>(null);

  // --- Alta y cambio --------------------------------------------------------------------

  protected readonly showForm = signal(false);
  protected readonly editingId = signal<number | null>(null);

  protected readonly form = this.formBuilder.nonNullable.group({
    borrowerName: ['', [Validators.required, Validators.maxLength(70)]],
    principal: [null as number | null, [Validators.required, Validators.min(0.01)]],
    interest: [null as number | null, [Validators.min(0)]],
    notes: ['', [Validators.maxLength(255)]],
  });

  protected readonly currencies = CURRENCIES;
  protected readonly frequencies = LOAN_FREQUENCIES;
  protected readonly currency = signal<Currency>(BASE_CURRENCY);
  protected readonly lentOn = signal(this.today);

  /** Si gana interés. Abre en no: lo normal entre personas es prestar por apoyar. */
  protected readonly withInterest = signal(false);
  protected readonly mode = signal<RepaymentMode>('SINGLE');
  protected readonly count = signal(2);
  protected readonly frequency = signal<LoanFrequency>('MONTHLY');
  protected readonly firstDate = signal('');

  /**
   * El plan que se va a mandar. Se rehace solo al cambiar el total, el número de cuotas, la
   * frecuencia o la primera fecha; entre medias cada cuota se puede retocar a mano, que es
   * lo que pasa cuando se acuerda «300 ahora y el resto en diciembre».
   */
  protected readonly plan = signal<LoanInstallmentRequest[]>([]);

  /** Valor del formulario como señal, para que el total y la suma del plan se recalculen. */
  private readonly formValue = signal(this.form.getRawValue());

  /** Validez del formulario reactivo como señal, para que `canSave` la vea. */
  private readonly formValid = signal(false);

  /** Lo que hay que devolver con lo que dice el formulario. */
  protected readonly total = computed(() => {
    const { principal, interest } = this.formValue();
    const gain = this.withInterest() ? Number(interest) || 0 : 0;
    return Math.round(((Number(principal) || 0) + gain) * 100) / 100;
  });

  protected readonly planSum = computed(() => planTotal(this.plan()));

  /** Si el plan cuadra con el total, que es lo que la API exige. */
  protected readonly planMatches = computed(
    () => this.total() > 0 && Math.abs(this.planSum() - this.total()) < 0.005,
  );

  /** Si alguna cuota vence antes de prestar el dinero, que la API rechazaría. */
  protected readonly planBeforeLending = computed(() =>
    this.plan().some((item) => item.dueDate && item.dueDate < this.lentOn()),
  );

  protected readonly canSave = computed(
    () =>
      !this.saving() &&
      this.formValid() &&
      this.planMatches() &&
      !this.planBeforeLending() &&
      this.plan().every((item) => item.dueDate && Number(item.amount) > 0),
  );

  // --- Pagos ----------------------------------------------------------------------------

  /** Préstamo del que se está registrando un pago, que es lo que abre su hoja. */
  protected readonly payingId = signal<number | null>(null);
  protected readonly paying = computed(
    () => this.loans().find((loan) => loan.id === this.payingId()) ?? null,
  );
  protected readonly paymentForm = this.formBuilder.nonNullable.group({
    amount: [null as number | null, [Validators.required, Validators.min(0.01)]],
    note: ['', [Validators.maxLength(140)]],
  });
  protected readonly paidOn = signal(this.today);

  // --- Lo que se ve ---------------------------------------------------------------------

  /** Lo escrito en el buscador. Busca en el nombre y en la nota. */
  protected readonly query = signal('');

  private readonly shown = computed(() =>
    this.loans().filter((loan) =>
      matchesSearch(this.query(), [loan.borrowerName, loan.notes ?? '']),
    ),
  );

  /** Los que todavía deben algo, con lo vencido primero: así llegan ya de la API. */
  protected readonly open = computed(() => this.shown().filter(isOpen));

  /** Saldados y cerrados: no piden nada, pero se conservan como historia. */
  protected readonly settled = computed(() => this.shown().filter((loan) => !isOpen(loan)));

  protected readonly noMatches = computed(() => this.query().trim() !== '' && !this.shown().length);

  /**
   * Cifras de cabecera. Son de todos los préstamos y no de lo que se ve: buscar acota la
   * lista, pero no cambia cuánto te deben.
   */
  protected readonly totals = computed(() => {
    const open = this.loans().filter(isOpen);
    return {
      openCount: open.length,
      outstanding: byCurrency(open, (loan) => loan.outstanding),
      overdue: byCurrency(open, (loan) => loan.overdueAmount),
      // El interés de lo abierto es lo que todavía se va a ganar; el de lo saldado ya se ganó.
      interest: byCurrency(open, (loan) => loan.interest),
    };
  });

  constructor() {
    const destroyRef = inject(DestroyRef);
    destroyRef.onDestroy(inject(RefreshService).register(() => this.reload(), this.loading));
    this.form.valueChanges.pipe(takeUntilDestroyed(destroyRef)).subscribe(() => {
      const before = this.total();
      this.formValue.set(this.form.getRawValue());
      this.formValid.set(this.form.valid);
      if (this.total() !== before) {
        this.regenerate();
      }
    });
    this.reload();
  }

  protected reload(): void {
    this.loading.set(true);
    this.error.set(null);
    this.api.listLoans().subscribe({
      next: (loans) => {
        this.loans.set(loans);
        this.loading.set(false);
      },
      error: (error) => {
        this.error.set(describeError(error));
        this.loading.set(false);
      },
    });
  }

  protected toggleDetail(loan: LoanResponse): void {
    this.expandedId.update((id) => (id === loan.id ? null : loan.id));
    this.confirmingId.set(null);
  }

  // --- Alta y cambio --------------------------------------------------------------------

  protected openForm(): void {
    this.editingId.set(null);
    this.confirmingId.set(null);
    this.form.reset({ borrowerName: '', principal: null, interest: null, notes: '' });
    this.currency.set(BASE_CURRENCY);
    this.lentOn.set(this.today);
    this.withInterest.set(false);
    this.mode.set('SINGLE');
    this.count.set(2);
    this.frequency.set('MONTHLY');
    this.firstDate.set(this.nextMonth(this.today));
    this.regenerate();
    this.showForm.set(true);
  }

  /**
   * Abre el formulario con el préstamo tal y como está, plan incluido. El plan no se rehace
   * al abrir: puede tener cuotas retocadas a mano que no saldrían de ningún reparto.
   */
  protected startEdit(loan: LoanResponse): void {
    this.editingId.set(loan.id);
    this.confirmingId.set(null);
    this.form.setValue(
      {
        borrowerName: loan.borrowerName,
        principal: loan.principal,
        interest: loan.interest || null,
        notes: loan.notes ?? '',
      },
      { emitEvent: false },
    );
    this.formValue.set(this.form.getRawValue());
    this.formValid.set(this.form.valid);
    this.currency.set(loan.currency);
    this.lentOn.set(loan.lentOn);
    this.withInterest.set(loan.interest > 0);
    this.mode.set(loan.installments.length > 1 ? 'INSTALLMENTS' : 'SINGLE');
    this.count.set(Math.max(2, loan.installments.length));
    this.frequency.set('MONTHLY');
    this.firstDate.set(loan.installments[0]?.dueDate ?? this.nextMonth(loan.lentOn));
    this.plan.set(loan.installments.map(({ dueDate, amount }) => ({ dueDate, amount })));
    this.showForm.set(true);
  }

  protected closeForm(): void {
    this.showForm.set(false);
    this.editingId.set(null);
  }

  protected setWithInterest(value: boolean): void {
    this.withInterest.set(value);
    this.regenerate();
  }

  protected setMode(mode: RepaymentMode): void {
    this.mode.set(mode);
    this.regenerate();
  }

  protected setCount(value: string): void {
    const parsed = Math.floor(Number(value));
    this.count.set(Math.min(MAX_INSTALLMENTS, Math.max(2, Number.isFinite(parsed) ? parsed : 2)));
    this.regenerate();
  }

  protected setFrequency(frequency: LoanFrequency): void {
    this.frequency.set(frequency);
    this.regenerate();
  }

  protected setFirstDate(value: string): void {
    this.firstDate.set(value);
    this.regenerate();
  }

  protected setLentOn(value: string): void {
    this.lentOn.set(value);
  }

  /** Retoca una cuota a mano. */
  protected updateRow(index: number, field: keyof LoanInstallmentRequest, value: string): void {
    this.plan.update((plan) =>
      plan.map((item, i) =>
        i === index ? { ...item, [field]: field === 'amount' ? Number(value) : value } : item,
      ),
    );
  }

  /**
   * Guarda el préstamo. Se manda siempre el plan entero, también al modificar: la API lo
   * reemplaza, y el formulario enseña el definitivo.
   */
  protected save(): void {
    if (!this.canSave()) {
      this.form.markAllAsTouched();
      return;
    }
    const value = this.form.getRawValue();
    const request: SaveLoanRequest = {
      borrowerName: value.borrowerName.trim(),
      principal: Number(value.principal),
      interest: this.withInterest() ? Number(value.interest) || 0 : 0,
      currency: this.currency(),
      lentOn: this.lentOn(),
      notes: value.notes.trim(),
      installments: this.plan().map((item) => ({
        dueDate: item.dueDate,
        amount: Number(item.amount),
      })),
    };
    const editing = this.editingId();
    this.saving.set(true);
    const call = editing ? this.api.updateLoan(editing, request) : this.api.createLoan(request);
    call.subscribe({
      next: (saved) => {
        this.toasts.success(
          editing
            ? `Préstamo a ${saved.borrowerName} actualizado`
            : `Préstamo a ${saved.borrowerName} registrado`,
        );
        this.saving.set(false);
        this.closeForm();
        this.reload();
      },
      error: (error) => this.fail(error),
    });
  }

  // --- Pagos ----------------------------------------------------------------------------

  /** Abre la hoja de pago con lo que falta de la próxima cuota: casi siempre es eso. */
  protected startPayment(loan: LoanResponse): void {
    this.payingId.set(loan.id);
    this.confirmingId.set(null);
    this.paymentForm.controls.amount.setValidators([
      Validators.required,
      Validators.min(0.01),
      Validators.max(loan.outstanding),
    ]);
    this.paymentForm.reset({ amount: loan.nextDueAmount ?? loan.outstanding, note: '' });
    this.paidOn.set(this.today);
  }

  protected cancelPayment(): void {
    this.payingId.set(null);
  }

  protected savePayment(loan: LoanResponse): void {
    if (this.paymentForm.invalid || this.saving()) {
      this.paymentForm.markAllAsTouched();
      return;
    }
    const amount = Number(this.paymentForm.controls.amount.value);
    this.run(
      this.api.addLoanPayment(loan.id, {
        paidOn: this.paidOn(),
        amount,
        note: this.paymentForm.controls.note.value.trim() || undefined,
      }),
      (saved) =>
        this.toasts.success(
          saved.status === 'PAID'
            ? `${loan.borrowerName} te devolvió todo`
            : `${formatMoney(amount, loan.currency)} de ${loan.borrowerName} registrados`,
        ),
    );
  }

  protected removePayment(loan: LoanResponse, paymentId: number): void {
    this.run(this.api.deleteLoanPayment(loan.id, paymentId), () =>
      this.toasts.success('Pago quitado'),
    );
  }

  // --- Cerrar y eliminar ----------------------------------------------------------------

  /**
   * Da el préstamo por cerrado aunque falte dinero, o lo reabre. Es lo que se hace al
   * perdonar el resto: conserva lo que sí se devolvió y deja de avisar.
   */
  protected toggleClosed(loan: LoanResponse): void {
    const closing = loan.status !== 'CLOSED';
    this.run(this.api.updateLoan(loan.id, { closed: closing }), () =>
      this.toasts.success(
        closing
          ? `Préstamo a ${loan.borrowerName} cerrado`
          : `Préstamo a ${loan.borrowerName} reabierto`,
      ),
    );
  }

  protected askRemove(loan: LoanResponse): void {
    this.confirmingId.set(loan.id);
  }

  protected cancelRemove(): void {
    this.confirmingId.set(null);
  }

  protected remove(loan: LoanResponse): void {
    this.run(this.api.deleteLoan(loan.id), () =>
      this.toasts.success(`Préstamo a ${loan.borrowerName} eliminado`),
    );
  }

  // --- Rótulos --------------------------------------------------------------------------

  protected stateLabel(status: LoanStatus): string {
    switch (status) {
      case 'ACTIVE':
        return 'Al día';
      case 'OVERDUE':
        return 'Vencido';
      case 'PAID':
        return 'Saldado';
      case 'CLOSED':
        return 'Cerrado';
    }
  }

  protected installmentLabel(status: LoanInstallmentStatus): string {
    switch (status) {
      case 'PENDING':
        return 'Pendiente';
      case 'PARTIAL':
        return 'A medias';
      case 'OVERDUE':
        return 'Vencida';
      case 'PAID':
        return 'Pagada';
    }
  }

  /** Cuánto del total ya volvió, en porcentaje para la barra. */
  protected progress(loan: LoanResponse): number {
    return loan.total > 0 ? Math.min(100, Math.round((loan.paid / loan.total) * 100)) : 0;
  }

  /** La próxima cuota dicha en voz alta: «1 nov · mañana». */
  protected nextDue(loan: LoanResponse): string {
    if (!loan.nextDueDate) {
      return '';
    }
    return `${shortDate(loan.nextDueDate, this.today)} · ${dueDistance(loan.nextDueDate, this.today)}`;
  }

  protected date(value: string): string {
    return shortDate(value, this.today);
  }

  protected money(amount: number, currency: Currency = BASE_CURRENCY): string {
    return formatMoney(amount, currency);
  }

  protected currencySign(currency: Currency): string {
    return currencySymbol(currency);
  }

  protected currencyName(currency: Currency): string {
    return CURRENCY_NAMES[currency];
  }

  // --- Fontanería -----------------------------------------------------------------------

  /** Rehace el plan con el total y el ritmo del formulario. */
  private regenerate(): void {
    const total = this.total();
    if (this.mode() === 'SINGLE') {
      this.plan.set([{ dueDate: this.firstDate(), amount: total }]);
      return;
    }
    if (!this.firstDate() || total <= 0) {
      this.plan.set([]);
      return;
    }
    this.plan.set(buildLoanPlan(total, this.count(), this.frequency(), this.firstDate()));
  }

  /** Un mes después de una fecha, que es cuando se propone la primera devolución. */
  private nextMonth(value: string): string {
    const date = parseIsoDate(value);
    return buildLoanPlan(1, 2, 'MONTHLY', isoDate(date))[1].dueDate;
  }

  /**
   * Lanza una operación que cambia algo y recarga la lista. Se recarga entera porque un pago
   * puede mover el préstamo de sección y de orden.
   */
  private run<T>(call: Observable<T>, done: (result: T) => void): void {
    this.saving.set(true);
    call.subscribe({
      next: (result) => {
        done(result);
        this.saving.set(false);
        this.payingId.set(null);
        this.confirmingId.set(null);
        this.reload();
      },
      error: (error: unknown) => this.fail(error),
    });
  }

  private fail(error: unknown): void {
    this.saving.set(false);
    this.toasts.error(describeError(error));
  }
}
