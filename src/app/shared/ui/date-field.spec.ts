import { ComponentFixture, TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DateFieldComponent } from './date-field';

describe('DateFieldComponent', () => {
  let fixture: ComponentFixture<DateFieldComponent>;

  function host(): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  function field(): HTMLInputElement {
    return host().querySelector<HTMLInputElement>('.fs-date__input')!;
  }

  /** El control de hora del navegador. */
  function timeInput(): HTMLInputElement {
    return host().querySelector<HTMLInputElement>('.fs-time__input')!;
  }

  /** Los atajos de momento del día. */
  function shortcuts(): HTMLButtonElement[] {
    return Array.from(host().querySelectorAll<HTMLButtonElement>('.fs-times__item'));
  }

  async function mount(mode: 'date' | 'datetime' | 'month', value: string): Promise<void> {
    fixture = TestBed.createComponent(DateFieldComponent);
    fixture.componentRef.setInput('mode', mode);
    fixture.componentRef.setInput('value', value);
    fixture.detectChanges();
    // La librería resuelve la selección en una promesa propia, así que no basta con
    // esperar a Angular: hay que dejar correr también la cola de tareas.
    await new Promise((resolve) => setTimeout(resolve));
    fixture.detectChanges();
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [DateFieldComponent] }).compileComponents();
  });

  // El calendario se dibuja colgando del documento: sin destruirlo, cada prueba dejaría el
  // suyo puesto y la siguiente leería el de antes.
  afterEach(() => {
    fixture.destroy();
  });

  it('muestra la fecha en español y no en el formato del campo nativo', async () => {
    await mount('date', '2026-08-26');

    expect(field().value).toBe('26 Ago 2026');
  });

  it('separa la hora de la fecha, cada una en su control', async () => {
    await mount('datetime', '2026-08-26T13:35');

    expect(field().value).toBe('26 Ago 2026');
    expect(timeInput().type).toBe('time');
    expect(timeInput().value).toBe('13:35');
  });

  it('deja la hora sin poner mientras no haya fecha, y se nota que es un hueco', async () => {
    await mount('datetime', '');

    expect(timeInput().value).toBe('');
    expect(host().querySelector('.fs-time')!.classList.contains('is-empty')).toBe(true);
  });

  it('cambia la hora sin tocar el día al escribirla', async () => {
    await mount('datetime', '2026-08-26T13:35');

    timeInput().value = '08:15';
    timeInput().dispatchEvent(new Event('change'));
    fixture.detectChanges();

    expect(fixture.componentInstance.value()).toBe('2026-08-26T08:15');
  });

  it('pone el momento del día de un toque, conservando el día', async () => {
    await mount('datetime', '2026-08-26T13:35');

    // Ahora, Mañana, Mediodía, Tarde, Noche.
    shortcuts()[2].click();
    fixture.detectChanges();

    expect(fixture.componentInstance.value()).toBe('2026-08-26T13:00');
    expect(timeInput().value).toBe('13:00');
  });

  it('marca el atajo que corresponde a la hora puesta', async () => {
    await mount('datetime', '2026-08-26T21:00');

    expect(shortcuts()[4].classList.contains('is-picked')).toBe(true);
    expect(shortcuts()[1].classList.contains('is-picked')).toBe(false);
  });

  it('no ofrece hora ni atajos cuando solo se elige un día', async () => {
    await mount('date', '2026-08-26');

    expect(host().querySelector('.fs-time')).toBeNull();
    expect(shortcuts()).toHaveLength(0);
  });

  it('rotula el mes como lo hacía la cabecera, con el año solo si no es el de hoy', async () => {
    await mount('month', '2025-03');

    expect(field().value).toBe('Marzo 2025');
  });

  it('rotula el mes del año en curso sin repetir el año', async () => {
    const now = new Date();
    await mount('month', `${now.getFullYear()}-03`);

    expect(field().value).toBe('Marzo');
  });

  it('no se corre de día al interpretar la fecha en hora local', async () => {
    // `new Date('2026-01-01')` sería medianoche UTC y aquí caería en el 31 de diciembre.
    await mount('date', '2026-01-01');

    expect(field().value).toBe('01 Ene 2026');
  });

  it('cuelga el calendario de su contenedor global, fuera de cualquier caja con scroll', async () => {
    await mount('date', '2026-08-26');

    // La librería crea este contenedor pegado al body solo cuando no se le pasa uno propio.
    // Pasarle un elemento del DOM lo dejaba sin contenedor utilizable y reventaba al
    // dibujarse, que es el fallo que se vio en el navegador.
    const container = document.getElementById('air-datepicker-global-container');
    expect(container).not.toBeNull();
    expect(container!.parentElement).toBe(document.body);
  });

  it('queda vacío cuando no hay fecha', async () => {
    await mount('date', '');

    expect(field().value).toBe('');
  });
});
