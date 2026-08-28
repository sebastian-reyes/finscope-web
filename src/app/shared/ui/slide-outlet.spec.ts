import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, RouterOutlet, provideRouter } from '@angular/router';
import { beforeEach, describe, expect, it } from 'vitest';
import { SlideOutletDirective } from './slide-outlet';

@Component({ template: 'inicio' })
class FirstPage {}

@Component({ template: 'movimientos' })
class SecondPage {}

@Component({
  selector: 'fs-host',
  imports: [RouterOutlet, SlideOutletDirective],
  template: '<router-outlet [fsSlide]="destinations" />',
})
class HostComponent {
  readonly destinations = ['/uno', '/dos'];
}

describe('SlideOutletDirective', () => {
  let router: Router;
  let host: HTMLElement;

  /** La pantalla activa, que el router inserta justo detrás de la etiqueta del outlet. */
  function view(): HTMLElement {
    return host.querySelector('router-outlet')!.nextElementSibling as HTMLElement;
  }

  beforeEach(async () => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          { path: 'uno', component: FirstPage },
          { path: 'dos', component: SecondPage },
        ]),
      ],
    });
    router = TestBed.inject(Router);
    const fixture = TestBed.createComponent(HostComponent);
    host = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
    await router.navigateByUrl('/uno');
    fixture.detectChanges();
  });

  it('hace entrar por la derecha la pantalla que está más adelante', async () => {
    await router.navigateByUrl('/dos');

    expect(view().classList.contains('fs-view-in')).toBe(true);
    expect(view().classList.contains('fs-view-in--back')).toBe(false);
  });

  it('hace entrar por la izquierda la que está más atrás, que es volver', async () => {
    await router.navigateByUrl('/dos');
    await router.navigateByUrl('/uno');

    expect(view().classList.contains('fs-view-in--back')).toBe(true);
  });

  it('deja el elemento limpio al terminar: un transform vivo rompería lo que lleve fijo', async () => {
    await router.navigateByUrl('/dos');
    const entering = view();
    entering.dispatchEvent(new Event('animationend'));

    expect(entering.classList.contains('fs-view-in')).toBe(false);
  });
});
