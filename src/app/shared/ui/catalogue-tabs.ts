import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { SegmentedDirective } from './segmented';

/**
 * Conmutador entre las tres pantallas que se organizan por categoría.
 *
 * Categorías y tags son cosas distintas —una clasifica y el otro contextualiza— y el
 * presupuesto no es un catálogo en absoluto, pero las tres se mantienen igual y se llega a
 * ellas por el mismo sitio, así que comparten hueco en lugar de ocupar tres de la barra
 * inferior, donde solo caben cinco y el pulgar ya llega justo.
 *
 * El presupuesto va pegado a las categorías porque se fija sobre ellas; los tags quedan al
 * otro extremo, que es lo lejos que están del plan del mes.
 */
@Component({
  selector: 'fs-catalogue-tabs',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, RouterLinkActive, SegmentedDirective],
  template: `
    <nav class="fs-seg fs-tabs" aria-label="Categorías, presupuestos y tags">
      <a class="fs-seg__btn fs-tabs__link" routerLink="/categories" routerLinkActive="is-active">
        <i class="bi bi-grid-1x2" aria-hidden="true"></i>Categorías
      </a>
      <a class="fs-seg__btn fs-tabs__link" routerLink="/budgets" routerLinkActive="is-active">
        <i class="bi bi-clipboard-check" aria-hidden="true"></i>Presupuestos
      </a>
      <a class="fs-seg__btn fs-tabs__link" routerLink="/tags" routerLinkActive="is-active">
        <i class="bi bi-tags" aria-hidden="true"></i>Tags
      </a>
    </nav>
  `,
  styles: `
    /* La etiqueta del componente es de línea por omisión, y entonces el conmutador comparte
       renglón con lo que venga detrás y su margen inferior se mide contra la línea de texto
       en lugar de contra la pantalla siguiente. */
    :host {
      display: block;
    }

    /* La forma y la pastilla deslizante salen del control segmentado de la capa base; aquí
       solo se ajusta lo propio de unos enlaces: el icono y el subrayado. */
    .fs-tabs {
      margin-bottom: 1rem;
    }

    .fs-tabs__link {
      display: inline-flex;
      align-items: center;
      gap: 0.4rem;
      text-decoration: none;
    }
  `,
})
export class CatalogueTabsComponent {}
