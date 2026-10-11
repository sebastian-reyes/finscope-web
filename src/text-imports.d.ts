/**
 * Tipo de lo que devuelve `import x from './archivo.html' with { loader: 'text' }`: el
 * contenido del archivo como texto. El compilador de Angular lo resuelve solo; esto es para
 * que TypeScript sepa qué llega.
 *
 * Lo usa `content-security-policy.spec.ts` para leer `index.html`, que de otra forma no
 * podría abrir: las pruebas no tienen los tipos de Node y no merece la pena traerlos por eso.
 */
declare module '*.html' {
  const content: string;
  export default content;
}
