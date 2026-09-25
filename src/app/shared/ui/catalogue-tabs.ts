import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { SegmentedDirective } from './segmented';

/** Una de las pantallas hermanas entre las que se salta con el conmutador. */
export interface SectionTab {
  path: string;
  label: string;
  icon: string;
}

/**
 * Conmutador entre pantallas hermanas que comparten un hueco de la navegación.
 *
 * Lo usan dos marcos: el plan del mes —presupuestos y fijos— y, dentro de la configuración,
 * categorías y tags. En los dos casos son cosas distintas que se mantienen igual y se llega a
 * ellas por el mismo sitio, así que comparten hueco en lugar de ocupar uno cada una.
 *
 * Los rótulos son de una palabra porque en el teléfono todas comparten renglón.
 */
@Component({
  selector: 'fs-catalogue-tabs',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, RouterLinkActive, SegmentedDirective],
  template: `
    <nav class="fs-seg fs-tabs" [attr.aria-label]="label()">
      @for (tab of tabs(); track tab.path) {
        <a
          class="fs-seg__btn fs-tabs__link"
          [routerLink]="tab.path"
          routerLinkActive="is-active"
          ariaCurrentWhenActive="page"
        >
          <i class="bi {{ tab.icon }}" aria-hidden="true"></i>{{ tab.label }}
        </a>
      }
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
      /* Lo que se salga se queda dentro del conmutador. Con cuatro opciones la tira medía
         433 px y en un teléfono de 390 estiraba el documento entero; hoy son dos y caben,
         pero si vuelve a crecer lo que se desplaza tiene que ser la tira, no la pantalla. */
      max-width: 100%;
      overflow-x: auto;
      /* La barra de desplazamiento sobra: la tira es corta y se arrastra con el dedo. */
      scrollbar-width: none;
    }

    .fs-tabs::-webkit-scrollbar {
      display: none;
    }

    .fs-tabs__link {
      display: inline-flex;
      align-items: center;
      gap: 0.4rem;
      text-decoration: none;
      /* Sin encoger y sin partir palabras: una opción a medias no se lee, y para eso está
         el desplazamiento. */
      flex: none;
      white-space: nowrap;
    }
  `,
})
export class CatalogueTabsComponent {
  readonly tabs = input.required<readonly SectionTab[]>();

  /** Lo que se le lee al lector de pantalla al llegar al conmutador. */
  readonly label = input.required<string>();
}
