import { ComponentFixture, TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { CategoryPickerComponent } from './category-picker';
import { CategoryResponse } from '../../core/models';

/** Catálogo de prueba con las tres formas de ámbito. */
const CATALOGUE: CategoryResponse[] = [
  { id: 1, name: 'Comida', appliesTo: 'EXPENSE', isSystem: false, transactionCount: 12 },
  { id: 2, name: 'Transporte', appliesTo: 'EXPENSE', isSystem: false, transactionCount: 3 },
  { id: 3, name: 'Salario', appliesTo: 'INCOME', isSystem: false, transactionCount: 2 },
  { id: 4, name: 'Otros', appliesTo: 'BOTH', isSystem: true, transactionCount: 0 },
];

describe('CategoryPickerComponent', () => {
  let fixture: ComponentFixture<CategoryPickerComponent>;

  /** Botones de categoría que se están ofreciendo, en el orden en que se pintan. */
  function options(): HTMLButtonElement[] {
    const host = fixture.nativeElement as HTMLElement;
    return Array.from(host.querySelectorAll<HTMLButtonElement>('.fs-picker__option'));
  }

  /** Nombres de esas categorías. */
  function offered(): string[] {
    return options().map((option) => option.textContent!.trim());
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CategoryPickerComponent],
    }).compileComponents();
    fixture = TestBed.createComponent(CategoryPickerComponent);
    fixture.componentRef.setInput('categories', CATALOGUE);
    fixture.componentRef.setInput('kind', 'EXPENSE');
    fixture.detectChanges();
  });

  it('no elige ninguna categoría por su cuenta', () => {
    expect(fixture.componentInstance.selected()).toBeNull();
    expect(options().some((option) => option.classList.contains('is-picked'))).toBe(false);
  });

  it('ofrece las categorías de egresos y las de ámbito mixto, las más usadas primero', () => {
    expect(offered()).toEqual(['Comida', 'Transporte', 'Otros']);
  });

  it('ofrece las de ingresos cuando el movimiento es un ingreso', () => {
    fixture.componentRef.setInput('kind', 'INCOME');
    fixture.detectChanges();

    expect(offered()).toEqual(['Salario', 'Otros']);
  });

  it('elige la categoría al tocarla y la suelta al volver a tocarla', () => {
    options()[0].click();
    fixture.detectChanges();
    expect(fixture.componentInstance.selected()).toBe(1);

    options()[0].click();
    fixture.detectChanges();
    expect(fixture.componentInstance.selected()).toBeNull();
  });

  it('suelta la categoría elegida si deja de valer al cambiar el tipo', () => {
    options()[0].click();
    fixture.detectChanges();
    expect(fixture.componentInstance.selected()).toBe(1);

    fixture.componentRef.setInput('kind', 'INCOME');
    fixture.detectChanges();

    // «Comida» es de egresos: arrastrarla a un ingreso daría un dato sin sentido.
    expect(fixture.componentInstance.selected()).toBeNull();
  });

  it('conserva la categoría de ámbito mixto al cambiar el tipo', () => {
    fixture.componentInstance.selected.set(4);
    fixture.detectChanges();

    fixture.componentRef.setInput('kind', 'INCOME');
    fixture.detectChanges();

    expect(fixture.componentInstance.selected()).toBe(4);
  });
});
