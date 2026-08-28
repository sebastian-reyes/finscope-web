import { ComponentFixture, TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { TagResponse } from '../../core/models';
import { TagsFieldComponent } from './tags-field';

const CATALOGUE: TagResponse[] = [
  { id: 1, name: 'alimentación', transactionCount: 40 },
  { id: 2, name: 'transporte', transactionCount: 12 },
  { id: 3, name: 'alimentos para el gato', transactionCount: 3 },
  { id: 4, name: 'viaje', transactionCount: 1 },
];

describe('TagsFieldComponent', () => {
  let fixture: ComponentFixture<TagsFieldComponent>;

  function host(): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  function input(): HTMLInputElement {
    return host().querySelector<HTMLInputElement>('.fs-tags__input')!;
  }

  /** Lo que enseña el desplegable, en el orden en que se dibuja. */
  function options(): string[] {
    return Array.from(host().querySelectorAll<HTMLElement>('.fs-picker__item')).map((option) =>
      option.textContent!.replace(/\s+/g, ' ').trim(),
    );
  }

  /** Solo los tags del catálogo, sin la fila de crear uno nuevo. */
  function matches(): string[] {
    return Array.from(
      host().querySelectorAll<HTMLElement>('.fs-picker__item:not(.fs-picker__create)'),
    ).map((option) => option.textContent!.replace(/\s+/g, ' ').trim());
  }

  function type(value: string): void {
    input().value = value;
    input().dispatchEvent(new Event('input'));
    fixture.detectChanges();
  }

  function press(key: string): void {
    input().dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
    fixture.detectChanges();
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [TagsFieldComponent] }).compileComponents();
    fixture = TestBed.createComponent(TagsFieldComponent);
    fixture.componentRef.setInput('catalogue', CATALOGUE);
    fixture.detectChanges();

    input().dispatchEvent(new Event('focus'));
    fixture.detectChanges();
  });

  it('ofrece el catálogo entero ordenado por uso mientras no se escribe nada', () => {
    expect(matches()).toEqual([
      'alimentación 40',
      'transporte 12',
      'alimentos para el gato 3',
      'viaje 1',
    ]);
  });

  it('filtra por lo escrito sin que estorben las tildes ni las mayúsculas', () => {
    type('ALIMENT');

    expect(matches()).toEqual(['alimentación 40', 'alimentos para el gato 3']);
  });

  it('el intro elige lo marcado, que es como no se acaba duplicando un tag existente', () => {
    type('alimentacion');
    press('Enter');

    expect(fixture.componentInstance.tags()).toEqual(['alimentación']);
  });

  it('las flechas recorren la lista y dan la vuelta al llegar al final', () => {
    type('alim');
    press('ArrowDown');
    press('Enter');

    expect(fixture.componentInstance.tags()).toEqual(['alimentos para el gato']);
  });

  it('ofrece crear solo lo que todavía no existe', () => {
    type('alimentación');
    expect(options().some((option) => option.startsWith('Crear'))).toBe(false);

    type('mascotas');
    expect(options()).toEqual(['Crear «mascotas»']);
  });

  it('no vuelve a ofrecer un tag que el movimiento ya lleva', () => {
    type('viaje');
    press('Enter');
    type('');

    expect(matches()).toEqual(['alimentación 40', 'transporte 12', 'alimentos para el gato 3']);
  });

  it('la coma cierra el tag tal y como se escribió, sin pasar por la lista', () => {
    type('alim');
    press(',');

    expect(fixture.componentInstance.tags()).toEqual(['alim']);
  });

  it('el escape cierra el desplegable sin añadir nada', () => {
    type('alim');
    press('Escape');

    expect(host().querySelector('.fs-picker')).toBeNull();
    expect(fixture.componentInstance.tags()).toEqual([]);
  });
});
