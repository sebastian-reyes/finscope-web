import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { CatalogueTabsComponent, SectionTab } from '../../shared/ui/catalogue-tabs';
import { SlideOutletDirective } from '../../shared/ui/slide-outlet';

/**
 * Las caras del plan, en el orden del razonamiento: cuánto se piensa gastar, qué parte ya
 * tiene dueño, y qué dinero prestado tiene que volver.
 */
export const PLAN_TABS: readonly SectionTab[] = [
  { path: '/budgets', label: 'Presupuestos', icon: 'bi-clipboard-check' },
  { path: '/recurring', label: 'Fijos', icon: 'bi-arrow-repeat' },
  { path: '/loans', label: 'Préstamos', icon: 'bi-cash-coin' },
];

/**
 * Marco del plan del mes: los presupuestos, que dicen cuánto se piensa gastar, los
 * movimientos fijos, que dicen qué parte de eso ya tiene dueño antes de empezar, y los
 * préstamos, el dinero que se dejó a otros y tiene que volver.
 *
 * Antes compartían marco con las categorías y los tags, y la pestaña se llamaba
 * «Categorías» y abría en ellas: lo que se mira cada mes quedaba a un toque de más, detrás
 * de lo que se configura una vez. Las categorías y los tags viven ahora en la configuración.
 *
 * El marco existe para que el conmutador sobreviva al salto de una pantalla a la otra:
 * montado dentro de cada página, se destruía y su pastilla aparecía ya colocada en la opción
 * nueva en lugar de deslizarse hasta ella.
 */
@Component({
  selector: 'app-catalogues',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet, CatalogueTabsComponent, SlideOutletDirective],
  template: `
    <fs-catalogue-tabs [tabs]="tabs" label="Presupuestos, fijos y préstamos" />
    <router-outlet [fsSlide]="destinations" />
  `,
})
export class CataloguesPage {
  protected readonly tabs = PLAN_TABS;

  /** El mismo orden que el conmutador, para que la pantalla entre por el lado que le toca. */
  protected readonly destinations = PLAN_TABS.map((tab) => tab.path);
}
