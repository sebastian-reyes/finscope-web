import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { CatalogueTabsComponent } from '../../shared/ui/catalogue-tabs';
import { SlideOutletDirective } from '../../shared/ui/slide-outlet';

/**
 * Marco común de las cuatro pantallas que se organizan por categoría: el catálogo de
 * categorías, el presupuesto que se fija sobre ellas, los movimientos fijos que lo
 * comprometen y el catálogo de tags.
 *
 * Existe por una razón concreta: el conmutador tiene que sobrevivir al salto de una
 * pantalla a la otra. Montado dentro de cada página, cambiar de catálogo lo destruía y lo
 * volvía a crear, así que su pastilla aparecía ya colocada en la opción nueva en lugar de
 * deslizarse hasta ella, que es justo lo que cuenta que son dos caras de lo mismo.
 *
 * De paso, el conmutador se escribe una vez y no una por pantalla.
 */
@Component({
  selector: 'app-catalogues',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet, CatalogueTabsComponent, SlideOutletDirective],
  template: `
    <fs-catalogue-tabs />
    <router-outlet [fsSlide]="destinations" />
  `,
})
export class CataloguesPage {
  /**
   * El mismo orden que tienen las cuatro opciones en el conmutador, para que la pantalla
   * entre por el lado hacia el que se deslizó la pastilla.
   */
  protected readonly destinations = ['/categories', '/budgets', '/recurring', '/tags'];
}
