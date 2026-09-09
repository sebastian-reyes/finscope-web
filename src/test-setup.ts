/**
 * Preparación del entorno de pruebas.
 *
 * jsdom no implementa `matchMedia`, que la aplicación usa para saber si el sistema pide
 * tema oscuro. Sin este relleno, cualquier prueba que monte un componente con el servicio
 * de tema detrás falla al construirlo, y el fallo no dice nada del componente.
 */
if (!window.matchMedia) {
  window.matchMedia = (query: string): MediaQueryList =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }) as unknown as MediaQueryList;
}

// jsdom tampoco desplaza la ventana, y el catálogo de categorías sube al abrir el alta. Sin
// este relleno, cada prueba que pasa por ahí escupe un «Not implemented» que no dice nada.
window.scrollTo = () => {};

// Y tampoco desplaza elementos a la vista, que es lo que hace el combobox al recorrer su
// lista con el teclado.
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {};
}

// jsdom tampoco dibuja: `getContext` existe pero avisa de que no está implementado, y cada
// prueba que monta una pantalla con gráficos escupía una decena de «Not implemented» que no
// dicen nada de ella. Devolver nulo es lo mismo que jsdom acaba devolviendo, y Chart.js ya
// sabe quedarse quieto sin lienzo: el gráfico no se dibuja, que en una prueba de jsdom
// tampoco podría comprobarse. Lo que rodea al gráfico —la leyenda, el reparto, los enlaces—
// es HTML y sí se comprueba.
HTMLCanvasElement.prototype.getContext = () => null;
