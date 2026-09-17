import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { ChipIconPickerComponent } from './chip-icon-picker';

@Component({
  imports: [ChipIconPickerComponent],
  template: `<fs-chip-icon-picker name="Comida" [(value)]="icon" />`,
})
class HostComponent {
  readonly icon = signal<string | null>(null);
}

describe('ChipIconPickerComponent', () => {
  let fixture: ComponentFixture<HostComponent>;

  function host(): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  function open(): void {
    host().querySelector<HTMLButtonElement>('.fs-cip__toggle')!.click();
    fixture.detectChanges();
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [HostComponent] }).compileComponents();
    fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
  });

  it('plegado enseña el icono deducido del nombre', () => {
    expect(host().querySelector('.fs-cip__current i')!.classList).toContain('bi-basket');
    expect(host().querySelector('.fs-cip__panel')).toBeNull();
  });

  it('elige un icono, lo enseña y se pliega', () => {
    open();
    host().querySelector<HTMLButtonElement>('.fs-cip__icon i.bi-airplane')!.parentElement!.click();
    fixture.detectChanges();

    expect(fixture.componentInstance.icon()).toBe('airplane');
    expect(host().querySelector('.fs-cip__current i')!.classList).toContain('bi-airplane');
    expect(host().querySelector('.fs-cip__panel')).toBeNull();
  });

  it('filtra con el buscador y vuelve al automático', () => {
    fixture.componentInstance.icon.set('airplane');
    open();

    const search = host().querySelector<HTMLInputElement>('input[type="search"]')!;
    search.value = 'ahorro';
    search.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    const shown = Array.from(host().querySelectorAll('.fs-cip__icon i')).map((i) => i.className);
    expect(shown).toEqual(['bi bi-piggy-bank']);

    search.value = '';
    search.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    host().querySelector<HTMLButtonElement>('.fs-cip__auto')!.click();
    fixture.detectChanges();

    expect(fixture.componentInstance.icon()).toBeNull();
  });
});
