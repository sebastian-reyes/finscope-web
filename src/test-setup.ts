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
