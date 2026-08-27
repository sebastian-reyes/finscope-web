import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { SegmentedDirective } from './segmented';

/**
 * Conmutador entre los dos catálogos del usuario.
 *
 * Categorías y tags son cosas distintas —una clasifica y el otro contextualiza— pero se
 * mantienen igual, así que comparten sitio en la navegación en lugar de ocupar dos huecos
 * de la barra inferior, donde solo caben cinco y el pulgar ya llega justo.
 */
@Component({
  selector: 'fs-catalogue-tabs',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, RouterLinkActive, SegmentedDirective],
  template: `
    <nav class="fs-seg fs-tabs" aria-label="Catálogos">
      <a class="fs-seg__btn fs-tabs__link" routerLink="/categories" routerLinkActive="is-active">
        <i class="bi bi-grid-1x2" aria-hidden="true"></i>Categorías
      </a>
      <a class="fs-seg__btn fs-tabs__link" routerLink="/tags" routerLinkActive="is-active">
        <i class="bi bi-tags" aria-hidden="true"></i>Tags
      </a>
    </nav>
  `,
  styles: `
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
