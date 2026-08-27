import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { CatalogueTabsComponent } from '../../shared/ui/catalogue-tabs';

/**
 * Marco común de los dos catálogos del usuario, categorías y tags.
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
  imports: [RouterOutlet, CatalogueTabsComponent],
  template: `
    <fs-catalogue-tabs />
    <router-outlet />
  `,
})
export class CataloguesPage {}
