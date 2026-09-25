import { ComponentFixture, TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { AvatarComponent } from './avatar';
import { AVATARS } from '../../core/format/avatars';

describe('AvatarComponent', () => {
  let fixture: ComponentFixture<AvatarComponent>;

  function host(): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  function render(inputs: Record<string, unknown>): void {
    for (const [name, value] of Object.entries(inputs)) {
      fixture.componentRef.setInput(name, value);
    }
    fixture.detectChanges();
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [AvatarComponent] }).compileComponents();
    fixture = TestBed.createComponent(AvatarComponent);
  });

  it('pinta las iniciales de las dos primeras palabras del nombre', () => {
    render({ name: 'sebastián reyes torres', email: 'sebas@example.com' });

    expect(host().textContent!.trim()).toBe('SR');
    expect(host().querySelector('svg')).toBeNull();
  });

  it('cae en la inicial del correo cuando la cuenta no tiene nombre', () => {
    render({ name: '   ', email: 'lucia@example.com' });

    expect(host().textContent!.trim()).toBe('L');
  });

  it('dibuja la ilustración elegida en lugar de las iniciales', () => {
    render({ avatar: 'llama', name: 'Sebastián' });

    expect(host().querySelector('svg')).not.toBeNull();
    expect(host().classList).toContain('is-art');
    expect(host().textContent!.trim()).toBe('');
  });

  it('vuelve a las iniciales con una imagen que no conoce', () => {
    render({ avatar: 'unicornio', name: 'Sebastián' });

    expect(host().querySelector('svg')).toBeNull();
    expect(host().textContent!.trim()).toBe('S');
  });

  it('es decoración salvo que se le dé un nombre que leer', () => {
    render({ avatar: 'fox' });
    expect(host().getAttribute('aria-hidden')).toBe('true');

    render({ label: 'Tu imagen: zorro' });
    expect(host().getAttribute('role')).toBe('img');
    expect(host().getAttribute('aria-label')).toBe('Tu imagen: zorro');
  });

  it('tiene once ilustraciones con identificadores que la API acepta', () => {
    expect(AVATARS).toHaveLength(11);
    for (const choice of AVATARS) {
      expect(choice.id).toMatch(/^[a-z]+(-[a-z]+)*$/);
      expect(choice.id.length).toBeLessThanOrEqual(20);
    }
  });
});
