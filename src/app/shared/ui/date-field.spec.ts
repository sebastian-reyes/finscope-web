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

  /** La hora que enseña el botón que abre el panel. */
  function timeValue(): string {
    return host().querySelector('.fs-time__value')!.textContent!.trim();
  }

  /** Abre el panel de la hora y devuelve sus celdas, ya en el orden en que se dibujan. */
  function openClock(): { hours: HTMLButtonElement[]; minutes: HTMLButtonElement[] } {
    host().querySelector<HTMLButtonElement>('.fs-time__open')!.click();
    fixture.detectChanges();
    const [hourColumn, minuteColumn] = Array.from(
      host().querySelectorAll<HTMLElement>('.fs-clock__scroll'),
    );
    return {
      hours: Array.from(hourColumn.querySelectorAll<HTMLButtonElement>('.fs-clock__cell')),
      minutes: Array.from(minuteColumn.querySelectorAll<HTMLButtonElement>('.fs-clock__cell')),
    };
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
    expect(timeValue()).toBe('13:35');
  });

  it('deja la hora sin poner mientras no haya fecha, y se nota que es un hueco', async () => {
    await mount('datetime', '');

    expect(timeValue()).toBe('--:--');
    expect(host().querySelector('.fs-time')!.classList.contains('is-empty')).toBe(true);
  });

  it('elige la hora en el panel propio y no en el del navegador', async () => {
    await mount('datetime', '2026-08-26T13:35');

    const { hours, minutes } = openClock();

    // Veinticuatro horas y los minutos de cinco en cinco, más el 35 que ya traía puesto.
    expect(hours).toHaveLength(24);
    expect(minutes.map((cell) => cell.textContent!.trim())).toContain('35');
    expect(hours[13].classList.contains('is-picked')).toBe(true);
  });

  it('cambia la hora sin tocar el día, y cierra al elegir el minuto', async () => {
    await mount('datetime', '2026-08-26T13:35');

    openClock().hours[8].click();
    fixture.detectChanges();

    expect(fixture.componentInstance.value()).toBe('2026-08-26T08:35');
    // La hora sola no cierra: falta el minuto.
    expect(host().querySelector('.fs-clock')).not.toBeNull();

    const minuteColumn = host().querySelectorAll<HTMLElement>('.fs-clock__scroll')[1];
    minuteColumn.querySelectorAll<HTMLButtonElement>('.fs-clock__cell')[3].click();
    fixture.detectChanges();

    expect(fixture.componentInstance.value()).toBe('2026-08-26T08:15');
    expect(host().querySelector('.fs-clock')).toBeNull();
  });

  it('mantiene el panel fuera de las cajas con scroll, anclado a la ventana', async () => {
    await mount('datetime', '2026-08-26T13:35');

    openClock();

    // Fijo y no absoluto: el campo vive dentro de la hoja del editor, que recorta lo que se
    // sale y tiene su propio desplazamiento.
    const panel = host().querySelector('.fs-clock')!;
    expect(getComputedStyle(panel).position).toBe('fixed');
    expect(host().querySelector('.fs-clock__veil')).not.toBeNull();
  });

  it('pone el momento del día de un toque, conservando el día', async () => {
    await mount('datetime', '2026-08-26T13:35');

    // Ahora, Mañana, Mediodía, Tarde, Noche.
    shortcuts()[2].click();
    fixture.detectChanges();

    expect(fixture.componentInstance.value()).toBe('2026-08-26T13:00');
    expect(timeValue()).toBe('13:00');
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
