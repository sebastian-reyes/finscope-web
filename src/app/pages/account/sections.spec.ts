import { describe, expect, it } from 'vitest';
import { ACCOUNT_SECTIONS, sectionOf } from './sections';

describe('sectionOf', () => {
  it('reconoce la sección por su dirección, con o sin parámetros', () => {
    expect(sectionOf('/account/security')?.title).toBe('Seguridad');
    expect(sectionOf('/account/appearance?x=1')?.title).toBe('Tema y colores');
  });

  it('cuenta categorías y tags como la misma sección, la de su fila del menú', () => {
    expect(sectionOf('/account/categories')?.slug).toBe('categories');
    expect(sectionOf('/account/tags')?.slug).toBe('categories');
  });

  it('no ve ninguna sección en el menú ni fuera de la configuración', () => {
    expect(sectionOf('/account')).toBeNull();
    expect(sectionOf('/budgets')).toBeNull();
  });

  it('da a la barra todas las direcciones que siguen siendo la cuenta', () => {
    expect(ACCOUNT_SECTIONS).toContain('/account/categories');
    expect(ACCOUNT_SECTIONS).toContain('/account/tags');
    expect(ACCOUNT_SECTIONS).not.toContain('/account/profile/');
  });
});
