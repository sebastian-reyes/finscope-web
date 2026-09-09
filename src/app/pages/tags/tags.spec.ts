import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { TagsPage } from './tags';
import { ToastService } from '../../core/toast.service';
import { TagResponse } from '../../core/models';

const CATALOGUE: TagResponse[] = [
  { id: 1, name: 'gab', transactionCount: 4 },
  { id: 2, name: 'viaje', transactionCount: 1 },
  { id: 3, name: 'mudanza', transactionCount: 0 },
];

describe('TagsPage', () => {
  let fixture: ComponentFixture<TagsPage>;
  let http: HttpTestingController;

  function host(): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  function rows(): HTMLElement[] {
    return Array.from(host().querySelectorAll<HTMLElement>('.fs-row'));
  }

  /** La fila de un tag, por su posición en el catálogo. */
  function row(index: number): HTMLElement {
    return rows()[index];
  }

  /** Pulsa un botón por lo que anuncia, que es como lo encuentra quien no ve el icono. */
  function press(label: string): void {
    host().querySelector<HTMLButtonElement>(`[aria-label="${label}"]`)!.click();
    fixture.detectChanges();
  }

  /** Envía un formulario de verdad, no llamando al método: `ngSubmit` es lo que se prueba. */
  function submit(selector: string): void {
    host()
      .querySelector<HTMLFormElement>(selector)!
      .dispatchEvent(new Event('submit', { cancelable: true }));
    fixture.detectChanges();
  }

  function write(selector: string, value: string): void {
    const field = host().querySelector<HTMLInputElement>(selector)!;
    field.value = value;
    field.dispatchEvent(new Event('input'));
    fixture.detectChanges();
  }

  /** Abre el alta desde la cabecera y escribe el nombre. */
  function startCreate(name: string): void {
    host().querySelectorAll<HTMLButtonElement>('.fs-head__actions .fs-btn')[1].click();
    fixture.detectChanges();
    write('#newTag', name);
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TagsPage],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);

    fixture = TestBed.createComponent(TagsPage);
    fixture.detectChanges();
    http.expectOne('/tags').flush(CATALOGUE);
    fixture.detectChanges();
  });

  afterEach(() => {
    http.verify();
  });

  it('da de alta el tag al enviar el formulario', () => {
    startCreate('alimentación');

    submit('.fs-create');

    const request = http.expectOne('/tags');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({ name: 'alimentación' });
    request.flush({ id: 9, name: 'alimentación', transactionCount: 0 });

    // Tras el alta se recarga, que es lo que trae el conteo del tag nuevo.
    http.expectOne('/tags').flush(CATALOGUE);
    fixture.detectChanges();
    expect(host().querySelector('#newTag')).toBeNull();
  });

  it('recorta los espacios del nombre, que no distinguen un tag de otro', () => {
    startCreate('  viaje  ');

    submit('.fs-create');

    const request = http.expectOne('/tags');
    expect(request.request.body).toEqual({ name: 'viaje' });
    request.flush({ id: 9, name: 'viaje', transactionCount: 0 });
    http.expectOne('/tags').flush(CATALOGUE);
  });

  it('no da de alta un tag sin nombre', () => {
    host().querySelectorAll<HTMLButtonElement>('.fs-head__actions .fs-btn')[1].click();
    fixture.detectChanges();

    submit('.fs-create');

    http.expectNone('/tags');
  });

  it('avisa a cuántos movimientos alcanza el cambio antes de renombrar', () => {
    press('Renombrar gab');

    // El tag es uno solo y lo comparten sus movimientos: renombrarlo los alcanza a todos.
    expect(row(0).querySelector('.fs-row__note')!.textContent).toContain('4 movimientos');
  });

  it('renombra el tag y recarga el catálogo con el nombre nuevo', () => {
    press('Renombrar viaje');
    write('.fs-row__field', 'viajes');

    submit('.fs-row__edit');

    const request = http.expectOne('/tags/2');
    expect(request.request.method).toBe('PATCH');
    expect(request.request.body).toEqual({ name: 'viajes' });
    request.flush({ id: 2, name: 'viajes', transactionCount: 1 });

    http.expectOne('/tags').flush(CATALOGUE);
  });

  it('deja el nombre en pantalla si la API lo rechaza, para poder corregirlo', () => {
    press('Renombrar viaje');
    write('.fs-row__field', 'gab');

    submit('.fs-row__edit');
    http
      .expectOne('/tags/2')
      .flush(
        { message: 'Ya tienes un tag con ese nombre' },
        { status: 409, statusText: 'Conflict' },
      );
    fixture.detectChanges();

    // El conflicto se cuenta en un aviso, no borrando lo que se estaba escribiendo: la API
    // rechaza el nombre ocupado en vez de fusionar los dos tags.
    expect(TestBed.inject(ToastService).toasts()[0].tone).toBe('error');
    expect(host().querySelector('.fs-row__edit')).not.toBeNull();
  });

  it('no borra el tag hasta que se confirma en su propia fila', () => {
    press('Borrar gab');

    http.expectNone('/tags/1');
    // La confirmación dice lo que se pierde y lo que no, que es lo que decide el sí.
    const confirm = row(0).querySelector('.fs-row__confirm')!.textContent!;
    expect(confirm).toContain('4 movimientos');
    expect(confirm).toContain('quedan intactos');

    row(0).querySelector<HTMLButtonElement>('.fs-btn--danger')!.click();
    fixture.detectChanges();

    http.expectOne('/tags/1').flush(null);
    http.expectOne('/tags').flush(CATALOGUE);
  });

  it('cancelar la confirmación deja el tag donde estaba', () => {
    press('Borrar gab');

    row(0).querySelectorAll<HTMLButtonElement>('.fs-row__confirm .fs-btn')[1].click();
    fixture.detectChanges();

    http.expectNone('/tags/1');
    expect(row(0).querySelector('.fs-row__confirm')).toBeNull();
    expect(row(0).querySelector('.fs-row__main')).not.toBeNull();
  });

  it('no deja abiertos un renombrado y un borrado a la vez', () => {
    press('Renombrar gab');
    // El nombre a medio escribir de una fila no debe quedarse esperando detrás mientras se
    // decide el borrado de otra.
    press('Borrar viaje');

    expect(row(0).querySelector('.fs-row__edit')).toBeNull();
    expect(row(1).querySelector('.fs-row__confirm')).not.toBeNull();
  });

  it('dice cuántos tags no usa ningún movimiento, que son los que conviene borrar', () => {
    expect(host().querySelector('.fs-note')!.textContent).toContain('1 tag no lo usa');
    expect(row(2).querySelector('.fs-row__count')!.textContent).toContain('Sin usar');
  });

  it('lleva cada tag a su propio filtro del historial', () => {
    const link = row(1).querySelector<HTMLAnchorElement>('.fs-row__main')!;

    expect(link.getAttribute('href')).toBe('/transactions?tag=viaje');
  });

  it('el catálogo vacío manda a registrar un movimiento, que es de donde nacen los tags', () => {
    fixture = TestBed.createComponent(TagsPage);
    fixture.detectChanges();
    http.expectOne('/tags').flush([]);
    fixture.detectChanges();

    const blank = host().querySelector('.fs-blank')!;
    expect(blank.textContent).toContain('Tu catálogo está vacío');
    expect(blank.querySelector('a')!.getAttribute('href')).toBe('/dashboard?registrar=1');
  });
});
