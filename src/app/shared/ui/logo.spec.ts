import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { LogoComponent } from './logo';
import { ThemeService } from '../../core/theme.service';

@Component({
  imports: [LogoComponent],
  template: `<fs-logo [surface]="surface()" />`,
})
class HostComponent {
  readonly surface = signal<'theme' | 'dark'>('theme');
}

describe('LogoComponent', () => {
  const resolved = signal<'light' | 'dark'>('light');

  function render(surface: 'theme' | 'dark'): HTMLImageElement {
    TestBed.configureTestingModule({
      imports: [HostComponent],
      providers: [{ provide: ThemeService, useValue: { resolved } }],
    });
    const fixture = TestBed.createComponent(HostComponent);
    fixture.componentInstance.surface.set(surface);
    fixture.detectChanges();
    return (fixture.nativeElement as HTMLElement).querySelector('img')!;
  }

  it('enseña la imagen de la marca que toca al tema, no un dibujo', () => {
    resolved.set('light');
    expect(render('theme').getAttribute('src')).toBe('icons/logo-light.png');
  });

  it('en tema oscuro pasa a la variante con el aro en blanco', () => {
    resolved.set('dark');
    expect(render('theme').getAttribute('src')).toBe('icons/logo-dark.png');
  });

  it('sobre una pared oscura usa la variante oscura aunque el tema sea claro', () => {
    resolved.set('light');
    expect(render('dark').getAttribute('src')).toBe('icons/logo-dark.png');
  });
});
