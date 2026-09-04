import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { SegmentedDirective } from './segmented';

/**
 * Conmutador entre las cuatro pantallas que se organizan por categoría.
 *
 * Categorías y tags son cosas distintas —una clasifica y el otro contextualiza— y ni el
 * presupuesto ni los fijos son catálogos en absoluto, pero las cuatro se mantienen igual y
 * se llega a ellas por el mismo sitio, así que comparten hueco en lugar de ocupar cuatro de
 * la barra inferior, donde solo caben cinco y el pulgar ya llega justo.
 *
 * El orden es el del razonamiento: en qué se gasta, cuánto se piensa gastar, qué parte de
 * eso ya está comprometida, y al final los tags, que es lo lejos que están del plan del mes.
 * Los rótulos son de una palabra porque en móvil las cuatro comparten renglón.
 */
@Component({
  selector: 'fs-catalogue-tabs',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, RouterLinkActive, SegmentedDirective],
  template: `
    <nav class="fs-seg fs-tabs" aria-label="Categorías, presupuestos, fijos y tags">
      <a class="fs-seg__btn fs-tabs__link" routerLink="/categories" routerLinkActive="is-active">
        <i class="bi bi-grid-1x2" aria-hidden="true"></i>Categorías
      </a>
      <a class="fs-seg__btn fs-tabs__link" routerLink="/budgets" routerLinkActive="is-active">
        <i class="bi bi-clipboard-check" aria-hidden="true"></i>Presupuestos
      </a>
      <a class="fs-seg__btn fs-tabs__link" routerLink="/recurring" routerLinkActive="is-active">
        <i class="bi bi-arrow-repeat" aria-hidden="true"></i>Fijos
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
