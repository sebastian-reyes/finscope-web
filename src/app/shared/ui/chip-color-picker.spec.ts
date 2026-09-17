import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { ChipColorPickerComponent } from './chip-color-picker';

@Component({
  imports: [ChipColorPickerComponent],
  template: `<fs-chip-color-picker kind="tag" name="viaje" [(value)]="color" />`,
})
class HostComponent {
  readonly color = signal<string | null>(null);
}

describe('ChipColorPickerComponent', () => {
  let fixture: ComponentFixture<HostComponent>;

  function host(): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  function chip(): HTMLElement {
    return host().querySelector<HTMLElement>('.fs-ccp__preview .fs-chip')!;
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [HostComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
    fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
  });

  it('empieza en automático y sin campo hexadecimal', () => {
    expect(host().querySelector('.fs-ccp__auto')!.getAttribute('aria-pressed')).toBe('true');
    expect(host().querySelector('.fs-ccp__hex')).toBeNull();
  });

  it('elige una ficha de la paleta y la enseña en la vista previa', () => {
    host().querySelector<HTMLButtonElement>('[aria-label="Color 4 de la paleta"]')!.click();
    fixture.detectChanges();

    expect(fixture.componentInstance.color()).toBe('preset-3');
    expect(chip().classList).toContain('fs-chip--3');
  });

  it('escribe un color libre y calcula la tinta de la ficha', () => {
    host().querySelector<HTMLInputElement>('.fs-ccp__native')!.click();
    fixture.detectChanges();

    const hex = host().querySelector<HTMLInputElement>('.fs-ccp__hex')!;
    hex.value = '#000000';
    hex.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    expect(fixture.componentInstance.color()).toBe('#000000');
    expect(chip().style.getPropertyValue('--fs-chip-bg')).toBe('#000000');
    expect(chip().style.getPropertyValue('--fs-chip-ink')).not.toBe('');
  });

  it('no aplica un hexadecimal a medio escribir', () => {
    fixture.componentInstance.color.set('#123456');
    fixture.detectChanges();

    const hex = host().querySelector<HTMLInputElement>('.fs-ccp__hex')!;
    hex.value = '#12';
    hex.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    expect(fixture.componentInstance.color()).toBe('#123456');
  });

  it('vuelve al automático', () => {
    fixture.componentInstance.color.set('preset-1');
    fixture.detectChanges();

    host().querySelector<HTMLButtonElement>('.fs-ccp__auto')!.click();
    fixture.detectChanges();

    expect(fixture.componentInstance.color()).toBeNull();
  });
});
