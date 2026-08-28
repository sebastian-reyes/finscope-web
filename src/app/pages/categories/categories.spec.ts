import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CategoriesPage } from './categories';
import { CategoryResponse } from '../../core/models';

const CATALOGUE: CategoryResponse[] = [
  { id: 1, name: 'Otros', appliesTo: 'BOTH', isSystem: true, transactionCount: 3 },
  { id: 4, name: 'Comida', appliesTo: 'EXPENSE', isSystem: false, transactionCount: 12 },
  { id: 5, name: 'Transporte', appliesTo: 'EXPENSE', isSystem: false, transactionCount: 0 },
  { id: 6, name: 'Salario', appliesTo: 'INCOME', isSystem: false, transactionCount: 2 },
];

describe('CategoriesPage', () => {
  let fixture: ComponentFixture<CategoriesPage>;
  let http: HttpTestingController;

  function host(): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  /** Las tarjetas de grupo, en el orden en que se pintan. */
  function groups(): HTMLElement[] {
    return Array.from(host().querySelectorAll<HTMLElement>('.fs-group'));
  }

  /** Nombres de las categorías de un grupo. */
  function namesIn(group: HTMLElement): string[] {
    return Array.from(group.querySelectorAll<HTMLElement>('.fs-row__main .fs-chip')).map((chip) =>
      chip.textContent!.trim(),
    );
  }

  /** El ámbito marcado en el formulario de alta. */
  function activeScope(): string {
    return host().querySelector<HTMLElement>('.fs-scope.is-active')!.textContent!.trim();
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CategoriesPage],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);

    fixture = TestBed.createComponent(CategoriesPage);
    fixture.detectChanges();
    http.expectOne('/categories').flush(CATALOGUE);
    fixture.detectChanges();
  });

  afterEach(() => {
    http.verify();
  });

  it('da de alta la categoría al enviar el formulario', () => {
    // Abrir el alta desde el grupo de ingresos, que además preselecciona su ámbito.
    groups()[1].querySelector<HTMLButtonElement>('.fs-group__add')!.click();
    fixture.detectChanges();

    const name = host().querySelector<HTMLInputElement>('#newCategory')!;
    name.value = 'Alquiler';
    name.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    // El envío del formulario, no un clic directo al método: `ngSubmit` solo llega si la
    // etiqueta lleva su `[formGroup]`, y sin él el navegador recargaba la página en vez de
    // dar de alta nada.
    host()
      .querySelector<HTMLFormElement>('.fs-create')!
      .dispatchEvent(new Event('submit', { cancelable: true }));

    const request = http.expectOne('/categories');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({ name: 'Alquiler', appliesTo: 'INCOME' });
    request.flush({
      id: 9,
      name: 'Alquiler',
      appliesTo: 'INCOME',
      isSystem: false,
      transactionCount: 0,
    });

    // Tras el alta la pantalla se recarga para verla ya en su grupo.
    http.expectOne('/categories').flush(CATALOGUE);
  });

  it('separa el catálogo en egresos, ingresos y ambos, en ese orden', () => {
    const titles = groups().map(
      (group) => group.querySelector<HTMLElement>('.fs-group__title')!.textContent,
    );

    expect(titles).toEqual(['Egresos', 'Ingresos', 'Ambos']);
  });

  it('coloca cada categoría en el grupo de su ámbito', () => {
    const [expense, income, both] = groups();

    expect(namesIn(expense)).toEqual(['Comida', 'Transporte']);
    expect(namesIn(income)).toEqual(['Salario']);
    expect(namesIn(both)).toEqual(['Otros']);
  });

  it('cuenta cuántas categorías hay en cada grupo', () => {
    const counts = groups().map((group) =>
      group.querySelector<HTMLElement>('.fs-group__count')!.textContent!.trim(),
    );

    expect(counts).toEqual(['2', '1', '1']);
  });

  it('enseña el grupo vacío en lugar de esconderlo', () => {
    // Sin categorías de ingresos, el grupo sigue estando con su explicación.
    fixture = TestBed.createComponent(CategoriesPage);
    fixture.detectChanges();
    http.expectOne('/categories').flush(CATALOGUE.filter((one) => one.appliesTo !== 'INCOME'));
    fixture.detectChanges();

    const income = groups()[1];
    expect(income.querySelector('.fs-group__empty')!.textContent).toContain('ingresos');
  });

  it('el alta desde un grupo llega con ese ámbito ya elegido', () => {
    groups()[1].querySelector<HTMLButtonElement>('.fs-group__add')!.click();
    fixture.detectChanges();

    expect(activeScope()).toBe('Ingresos');
  });

  it('el alta desde la cabecera parte de egresos, que es lo habitual', () => {
    host().querySelectorAll<HTMLButtonElement>('.fs-head__actions .fs-btn')[1].click();
    fixture.detectChanges();

    expect(activeScope()).toBe('Egresos');
  });

  it('no ofrece borrar la categoría de reserva', () => {
    const both = groups()[2];

    expect(both.querySelector('.fs-row__badge')!.textContent).toContain('Reserva');
    expect(both.querySelector('[aria-label="Borrar Otros"]')).toBeNull();
    expect(both.querySelector('[aria-label="Editar Otros"]')).not.toBeNull();
  });
});
