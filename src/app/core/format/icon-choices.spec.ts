import { describe, expect, it } from 'vitest';
import bootstrapIcons from 'bootstrap-icons/font/bootstrap-icons.json';
import { ICON_GROUPS, chipIcon, searchIcons } from './icon-choices';
import { iconFor } from './icons';

const ALL = ICON_GROUPS.flatMap((group) => group.icons.map((choice) => choice.icon));

describe('ICON_GROUPS', () => {
  it('solo ofrece iconos que existen en la fuente instalada', () => {
    const missing = ALL.filter((icon) => !(icon in bootstrapIcons));
    expect(missing).toEqual([]);
  });

  it('no repite ningún icono entre grupos', () => {
    expect(new Set(ALL).size).toBe(ALL.length);
  });

  it('incluye todos los que se deducen de un nombre, para poder fijarlos a mano', () => {
    const deduced = [
      'Comida',
      'Transporte',
      'Casa',
      'Ocio',
      'Salud',
      'Internet',
      'Software',
      'Curso',
      'Regalo',
      'Salario',
      'Freelance',
      'Venta',
      'Intereses',
      'Ropa',
      'Ahorro',
      'Mascota',
      'Otros',
      'zzz',
    ].map((name) => iconFor(name).replace(/^bi-/, ''));
    expect(deduced.filter((icon) => !ALL.includes(icon))).toEqual([]);
  });
});

describe('chipIcon', () => {
  it('usa el elegido y cae en el deducido si no hay o no se conoce', () => {
    expect(chipIcon('Comida', 'airplane')).toBe('bi-airplane');
    expect(chipIcon('Comida', null)).toBe('bi-basket');
    expect(chipIcon('Comida', 'no-existe')).toBe('bi-basket');
  });
});

describe('searchIcons', () => {
  it('encuentra por palabras en castellano, sin tildes ni mayúsculas', () => {
    const found = searchIcons('CAFÉ').flatMap((group) => group.icons.map((c) => c.icon));
    expect(found).toContain('cup-hot');
  });

  it('devuelve todo sin búsqueda y nada si no coincide', () => {
    expect(searchIcons('  ')).toHaveLength(ICON_GROUPS.length);
    expect(searchIcons('zzzz')).toEqual([]);
  });
});
