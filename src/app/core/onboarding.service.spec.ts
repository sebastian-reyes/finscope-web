import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { afterEach, describe, expect, it } from 'vitest';
import { OnboardingService } from './onboarding.service';
import { UserResponse } from './models';

const USER: UserResponse = {
  id: 7,
  email: 'nueva@example.com',
  emailVerified: false,
  displayName: 'Nueva',
};

/** Arranca el servicio con una sesión ya guardada, o sin ninguna. */
function start(user: UserResponse | null): OnboardingService {
  if (user) {
    localStorage.setItem('finscope.accessToken', 'token');
    localStorage.setItem('finscope.user', JSON.stringify(user));
  }
  TestBed.configureTestingModule({
    providers: [provideHttpClient(), provideHttpClientTesting()],
  });
  return TestBed.inject(OnboardingService);
}

describe('OnboardingService', () => {
  afterEach(() => {
    TestBed.resetTestingModule();
    localStorage.clear();
  });

  it('no se abre a una cuenta que ya existía', () => {
    // Es la decisión de fondo: no haberlo visto no basta, porque ninguna cuenta anterior lo
    // ha visto y a nadie con meses de movimientos le hace falta.
    expect(start(USER).isOpen()).toBe(false);
  });

  it('se abre al marcar la cuenta como nueva', () => {
    const onboarding = start(USER);

    onboarding.markNewAccount();

    expect(onboarding.isOpen()).toBe(true);
    expect(localStorage.getItem('finscope.onboarding.7')).toBe('pending');
  });

  it('sigue pendiente al volver a cargar si no se terminó', () => {
    localStorage.setItem('finscope.onboarding.7', 'pending');

    expect(start(USER).isOpen()).toBe(true);
  });

  it('terminarlo lo cierra y no vuelve a abrirse solo', () => {
    const onboarding = start(USER);
    onboarding.markNewAccount();

    onboarding.finish();

    expect(onboarding.isOpen()).toBe(false);
    expect(localStorage.getItem('finscope.onboarding.7')).toBe('done');
  });

  it('no se lo abre a otra cuenta que entre en el mismo navegador', () => {
    localStorage.setItem('finscope.onboarding.7', 'pending');

    expect(start({ ...USER, id: 11 }).isOpen()).toBe(false);
  });

  it('no hace caso de una clave sin usuario', () => {
    // A diferencia del tema, aquí no hay caída a la ranura anónima: una clave suelta abriría
    // el recorrido a quien entrara después.
    localStorage.setItem('finscope.onboarding', 'pending');

    expect(start(USER).isOpen()).toBe(false);
  });

  it('sin sesión no hace nada', () => {
    const onboarding = start(null);

    onboarding.markNewAccount();

    expect(onboarding.isOpen()).toBe(false);
    expect(localStorage.length).toBe(0);
  });

  it('se puede volver a ver sin cambiar lo guardado', () => {
    localStorage.setItem('finscope.onboarding.7', 'done');
    const onboarding = start(USER);

    onboarding.replay();

    expect(onboarding.isOpen()).toBe(true);
    expect(localStorage.getItem('finscope.onboarding.7')).toBe('done');
  });
});
