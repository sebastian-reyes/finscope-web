import { ComponentFixture, TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { SelectFieldComponent, SelectOption } from './select-field';

/** Catálogo corto: por debajo del umbral, así que sale sin buscador. */
const SHORT: SelectOption[] = [
  { value: '', label: 'Todas las categorías', icon: 'bi-grid-1x2' },
  { value: '4', label: 'Comida', icon: 'bi-basket', hint: '12' },
  { value: '5', label: 'Educación', icon: 'bi-mortarboard', hint: '3' },
];

/** Catálogo largo: pasa del umbral y aparece el buscador. */
const LONG: SelectOption[] = Array.from({ length: 12 }, (_, index) => ({
  value: String(index),
  label: index === 7 ? 'Mascotas' : `Opción ${index}`,
}));

describe('SelectFieldComponent', () => {
  let fixture: ComponentFixture<SelectFieldComponent>;

  function host(): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  function trigger(): HTMLButtonElement {
    return host().querySelector<HTMLButtonElement>('.fs-select')!;
  }

  function optionEls(): HTMLElement[] {
    return Array.from(host().querySelectorAll<HTMLElement>('.fs-select__option'));
  }

  function labels(): string[] {
    return optionEls().map((option) => option.textContent!.trim());
  }

  function search(): HTMLInputElement | null {
    return host().querySelector<HTMLInputElement>('.fs-select__search input');
  }

  function press(key: string): void {
    const target = search() ?? trigger();
    target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
    fixture.detectChanges();
  }

  function mount(options: SelectOption[], value = ''): void {
    fixture = TestBed.createComponent(SelectFieldComponent);
    fixture.componentRef.setInput('options', options);
    fixture.componentRef.setInput('value', value);
    fixture.detectChanges();
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [SelectFieldComponent] }).compileComponents();
  });

  it('enseña la opción elegida y no despliega nada hasta que se pide', () => {
    mount(SHORT, '4');

    expect(trigger().textContent).toContain('Comida');
    expect(trigger().getAttribute('aria-expanded')).toBe('false');
    expect(optionEls()).toHaveLength(0);
  });

  it('cae en la primera opción cuando el valor no está en la lista', () => {
    mount(SHORT, '');

    expect(trigger().textContent).toContain('Todas las categorías');
  });

  it('despliega la lista completa al pulsarlo', () => {
    mount(SHORT);

    trigger().click();
    fixture.detectChanges();

    expect(trigger().getAttribute('aria-expanded')).toBe('true');
    expect(optionEls()).toHaveLength(3);
  });

  it('elige la opción tocada y se cierra', () => {
    mount(SHORT);
    trigger().click();
    fixture.detectChanges();

    optionEls()[1].click();
    fixture.detectChanges();

    expect(fixture.componentInstance.value()).toBe('4');
    expect(optionEls()).toHaveLength(0);
  });

  it('recorre la lista con las flechas y elige con intro', () => {
    mount(SHORT);
    trigger().click();
    fixture.detectChanges();

    press('ArrowDown');
    press('Enter');

    expect(fixture.componentInstance.value()).toBe('4');
  });

  it('da la vuelta al llegar al final de la lista', () => {
    mount(SHORT);
    trigger().click();
    fixture.detectChanges();

    press('ArrowUp');
    press('Enter');

    expect(fixture.componentInstance.value()).toBe('5');
  });

  it('no ofrece buscador con pocas opciones', () => {
    mount(SHORT);
    trigger().click();
    fixture.detectChanges();

    expect(search()).toBeNull();
  });

  it('ofrece buscador cuando la lista se hace larga', () => {
    mount(LONG);
    trigger().click();
    fixture.detectChanges();

    expect(search()).not.toBeNull();
  });

  it('filtra por lo escrito, sin distinguir tildes ni mayúsculas', () => {
    mount(LONG);
    trigger().click();
    fixture.detectChanges();

    search()!.value = 'MASCOTAS';
    search()!.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    expect(labels()).toEqual(['Mascotas']);
  });

  it('avisa cuando nada coincide en lugar de dejar el panel vacío', () => {
    mount(LONG);
    trigger().click();
    fixture.detectChanges();

    search()!.value = 'zzz';
    search()!.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    expect(optionEls()).toHaveLength(0);
    expect(host().querySelector('.fs-select__empty')!.textContent).toContain('zzz');
  });

  it('se cierra al pulsar fuera', () => {
    mount(SHORT);
    trigger().click();
    fixture.detectChanges();

    document.body.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    fixture.detectChanges();

    expect(optionEls()).toHaveLength(0);
  });
});
