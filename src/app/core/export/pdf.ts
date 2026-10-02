/**
 * PDF escrito a mano: páginas, texto, rectángulos, líneas y un degradado.
 *
 * Es lo justo para un informe, y por eso no hace falta una librería de PDF: usa las dos
 * Helvetica que todo lector trae de serie, de modo que no hay que incrustar ninguna fuente,
 * y mide el texto con sus anchos para poder alinear importes a la derecha y recortar lo que
 * no cabe. Lo que no existe en la codificación de esas fuentes —un emoji en una descripción—
 * se descarta en lugar de salir como un cuadro.
 *
 * Las coordenadas de esta clase van con el origen arriba a la izquierda, como en pantalla;
 * la conversión al origen de abajo del PDF se hace aquí dentro y en ningún otro sitio.
 */

import { parseHex } from '../format/color';

/** A4 vertical, en puntos. */
export const PAGE_WIDTH = 595.28;
export const PAGE_HEIGHT = 841.89;

/**
 * Anchos de Helvetica y Helvetica-Bold para los códigos 32 a 255 de WinAnsi, en milésimas
 * del cuerpo. Sacados de Arial, que se dibujó con las mismas medidas que Helvetica.
 */
// prettier-ignore
const REGULAR = [278,278,355,556,556,889,667,191,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,278,278,584,584,584,556,1015,667,667,722,722,667,611,778,722,278,500,667,556,833,722,778,667,778,722,667,611,722,667,944,667,667,611,278,278,278,469,556,333,556,556,500,556,556,278,556,556,222,222,500,222,833,556,556,556,556,333,500,278,556,500,722,500,500,500,334,260,334,584,750,556,0,222,556,333,1000,556,556,333,1000,667,333,1000,0,611,0,0,222,222,333,333,350,556,1000,333,1000,500,333,944,0,500,667,278,333,556,556,556,556,260,556,333,737,370,556,584,333,737,552,400,549,333,333,333,576,537,333,333,333,365,556,834,834,834,611,667,667,667,667,667,667,1000,722,667,667,667,667,278,278,278,278,722,722,778,778,778,778,778,584,778,722,722,722,722,667,667,611,556,556,556,556,556,556,889,500,556,556,556,556,278,278,278,278,556,556,556,556,556,556,556,549,611,556,556,556,556,500,556,500];
// prettier-ignore
const BOLD = [278,333,474,556,556,889,722,238,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,333,333,584,584,584,611,975,722,722,722,722,667,611,778,722,278,556,722,611,833,722,778,667,778,722,667,611,722,667,944,667,667,611,333,278,333,584,556,333,556,611,556,611,556,333,611,611,278,278,556,278,889,611,611,611,611,389,556,333,611,556,778,556,556,500,389,280,389,584,750,556,0,278,556,500,1000,556,556,333,1000,667,333,1000,0,611,0,0,278,278,500,500,350,556,1000,333,1000,556,333,944,0,500,667,278,333,556,556,556,556,280,556,333,737,370,556,584,333,737,552,400,549,333,333,333,576,556,333,333,333,365,556,834,834,834,611,722,722,722,722,722,722,1000,722,667,667,667,667,278,278,278,278,722,722,778,778,778,778,778,584,778,722,722,722,722,667,667,611,556,556,556,556,556,556,889,556,556,556,556,556,278,278,278,278,611,611,611,611,611,611,611,549,611,611,611,611,611,556,611,556];

/** Los caracteres de 0x80 a 0x9F de WinAnsi, que no coinciden con Latin-1. */
const WIN_ANSI_EXTRA: Record<number, number> = {
  0x20ac: 0x80,
  0x201a: 0x82,
  0x0192: 0x83,
  0x201e: 0x84,
  0x2026: 0x85,
  0x2020: 0x86,
  0x2021: 0x87,
  0x02c6: 0x88,
  0x2030: 0x89,
  0x0160: 0x8a,
  0x2039: 0x8b,
  0x0152: 0x8c,
  0x017d: 0x8e,
  0x2018: 0x91,
  0x2019: 0x92,
  0x201c: 0x93,
  0x201d: 0x94,
  0x2022: 0x95,
  0x2013: 0x96,
  0x2014: 0x97,
  0x02dc: 0x98,
  0x2122: 0x99,
  0x0161: 0x9a,
  0x203a: 0x9b,
  0x0153: 0x9c,
  0x017e: 0x9e,
  0x0178: 0x9f,
};

/**
 * Sustitutos para lo que se usa en la aplicación y no existe en WinAnsi: el signo menos, la
 * flecha de los rangos y los espacios finos que mete Intl al formatear.
 */
const LOOKALIKES: Record<string, string> = Object.fromEntries(
  [
    [0x2212, '-'],
    [0x2192, '-'],
    [0x00a0, ' '],
    [0x202f, ' '],
  ].map(([code, replacement]) => [String.fromCodePoint(code as number), String(replacement)]),
);

/**
 * Pasa un texto a códigos WinAnsi.
 * Lo que no tiene código se descarta: un emoji no se puede dibujar con Helvetica, y un hueco
 * se lee mejor que un signo de interrogación en mitad de una descripción.
 *
 * @param text texto a codificar
 * @return los códigos, uno por carácter que se puede dibujar
 */
export function toWinAnsi(text: string): number[] {
  const codes: number[] = [];
  for (const char of text.normalize('NFC')) {
    const mapped = LOOKALIKES[char] ?? char;
    for (const piece of mapped) {
      const point = piece.codePointAt(0)!;
      if (point === 32 && codes.at(-1) === 32) {
        // Lo descartado deja a veces dos espacios seguidos: «Cine 🎬 con amigos».
        continue;
      }
      if ((point >= 32 && point < 127) || (point >= 160 && point <= 255)) {
        codes.push(point);
      } else if (WIN_ANSI_EXTRA[point]) {
        codes.push(WIN_ANSI_EXTRA[point]);
      }
    }
  }
  return codes;
}

/**
 * Ancho de un texto, en puntos.
 *
 * @param text texto a medir
 * @param size cuerpo de la letra
 * @param bold si es la negrita
 */
export function textWidth(text: string, size: number, bold = false): number {
  const table = bold ? BOLD : REGULAR;
  return (
    (toWinAnsi(text).reduce((total, code) => total + (table[code - 32] || 556), 0) * size) / 1000
  );
}

/**
 * Recorta un texto hasta que quepa, terminándolo en «…».
 *
 * @param text     texto a recortar
 * @param maxWidth ancho disponible, en puntos
 * @param size     cuerpo de la letra
 * @param bold     si es la negrita
 * @return el texto entero si cabe, o recortado
 */
export function fitText(text: string, maxWidth: number, size: number, bold = false): string {
  if (textWidth(text, size, bold) <= maxWidth) {
    return text;
  }
  const chars = [...text];
  let low = 0;
  let high = chars.length;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    const candidate = `${chars.slice(0, middle).join('').trimEnd()}…`;
    if (textWidth(candidate, size, bold) <= maxWidth) {
      low = middle;
    } else {
      high = middle - 1;
    }
  }
  return low ? `${chars.slice(0, low).join('').trimEnd()}…` : '';
}

/** Un texto ya codificado como cadena literal de PDF, solo con ASCII. */
function pdfString(text: string): string {
  return `(${toWinAnsi(text)
    .map((code) => {
      if (code === 0x28 || code === 0x29 || code === 0x5c) {
        return `\\${String.fromCharCode(code)}`;
      }
      return code < 127 ? String.fromCharCode(code) : `\\${code.toString(8).padStart(3, '0')}`;
    })
    .join('')})`;
}

const num = (value: number) => (Math.round(value * 100) / 100).toString();

/** Un color `#rrggbb` como los tres componentes que espera el PDF. */
function rgb(hex: string): string {
  // `parseHex` ya devuelve cada canal entre 0 y 1, que es lo que pide el PDF.
  const color = parseHex(hex) ?? { r: 0, g: 0, b: 0 };
  return `${num(color.r)} ${num(color.g)} ${num(color.b)}`;
}

export interface TextOptions {
  size?: number;
  bold?: boolean;
  color?: string;
  align?: 'left' | 'right' | 'center';
  /** Si se da, el texto se recorta con «…» para no pasar de este ancho. */
  maxWidth?: number;
  /** Separación extra entre letras, en puntos: para los rótulos en versalita. */
  spacing?: number;
}

export interface BoxOptions {
  fill?: string;
  stroke?: string;
  lineWidth?: number;
  radius?: number;
}

/** Un documento en construcción. */
export class PdfDocument {
  private readonly pages: string[][] = [];
  private readonly shadings: string[] = [];
  /** Degradados que usa cada página, por índice de página. */
  private readonly pageShadings: number[][] = [];
  /** Página en la que se dibuja; -1 es «la última». */
  private current = -1;

  /** Número de páginas que lleva el documento. */
  get pageCount(): number {
    return this.pages.length;
  }

  /** Empieza una página nueva; lo que se dibuje a partir de aquí va en ella. */
  addPage(): void {
    this.pages.push([]);
    this.pageShadings.push([]);
    this.current = -1;
  }

  /**
   * Cambia la página en la que se dibuja, para volver a una ya hecha: el pie con «Página 1
   * de 3» solo puede escribirse cuando se sabe cuántas hay.
   */
  onPage(index: number): void {
    this.current = index;
  }

  private get ops(): string[] {
    const index = this.current >= 0 ? this.current : this.pages.length - 1;
    return this.pages[index];
  }

  text(text: string, x: number, y: number, options: TextOptions = {}): void {
    const size = options.size ?? 10;
    const bold = options.bold ?? false;
    const content = options.maxWidth ? fitText(text, options.maxWidth, size, bold) : text;
    if (!content) {
      return;
    }
    const spacing = options.spacing ?? 0;
    const width = textWidth(content, size, bold) + spacing * Math.max(0, [...content].length - 1);
    const left =
      options.align === 'right' ? x - width : options.align === 'center' ? x - width / 2 : x;
    // `y` es la línea base, medida desde arriba.
    this.ops.push(
      `BT /${bold ? 'F2' : 'F1'} ${num(size)} Tf ${rgb(options.color ?? '#1f2933')} rg` +
        `${spacing ? ` ${num(spacing)} Tc` : ''} ${num(left)} ${num(PAGE_HEIGHT - y)} Td ` +
        `${pdfString(content)} Tj${spacing ? ' 0 Tc' : ''} ET`,
    );
  }

  /** Rectángulo, con las esquinas redondeadas si se pide. `y` es su borde de arriba. */
  rect(x: number, y: number, width: number, height: number, options: BoxOptions): void {
    if (!options.fill && !options.stroke) {
      return;
    }
    const parts = ['q'];
    if (options.fill) {
      parts.push(`${rgb(options.fill)} rg`);
    }
    if (options.stroke) {
      parts.push(`${rgb(options.stroke)} RG ${num(options.lineWidth ?? 0.75)} w`);
    }
    parts.push(this.path(x, y, width, height, options.radius ?? 0));
    parts.push(options.fill && options.stroke ? 'B' : options.fill ? 'f' : 'S', 'Q');
    this.ops.push(parts.join(' '));
  }

  line(x1: number, y1: number, x2: number, y2: number, color: string, width = 0.75): void {
    this.ops.push(
      `q ${rgb(color)} RG ${num(width)} w ${num(x1)} ${num(PAGE_HEIGHT - y1)} m ` +
        `${num(x2)} ${num(PAGE_HEIGHT - y2)} l S Q`,
    );
  }

  /**
   * Rectángulo relleno con un degradado de izquierda a derecha.
   *
   * @param from color del borde izquierdo
   * @param to   color del borde derecho
   */
  gradient(
    x: number,
    y: number,
    width: number,
    height: number,
    from: string,
    to: string,
    radius = 0,
  ): void {
    const id = this.shadings.length;
    const top = PAGE_HEIGHT - y;
    this.shadings.push(
      `<< /ShadingType 2 /ColorSpace /DeviceRGB /Coords [${num(x)} ${num(top)} ${num(x + width)} ` +
        `${num(top - height)}] /Function << /FunctionType 2 /Domain [0 1] /C0 [${rgb(from)}] ` +
        `/C1 [${rgb(to)}] /N 1 >> /Extend [true true] >>`,
    );
    this.pageShadings[this.current >= 0 ? this.current : this.pages.length - 1].push(id);
    this.ops.push(`q ${this.path(x, y, width, height, radius)} W n /Sh${id} sh Q`);
  }

  /** El trazado de un rectángulo, redondeado con curvas de Bézier si lleva radio. */
  private path(x: number, y: number, width: number, height: number, radius: number): string {
    const bottom = PAGE_HEIGHT - y - height;
    if (!radius) {
      return `${num(x)} ${num(bottom)} ${num(width)} ${num(height)} re`;
    }
    const r = Math.min(radius, width / 2, height / 2);
    // Distancia de los puntos de control para que un cuarto de Bézier imite un cuarto de círculo.
    const k = r * 0.5523;
    const left = x;
    const right = x + width;
    const top = bottom + height;
    return [
      `${num(left + r)} ${num(bottom)} m`,
      `${num(right - r)} ${num(bottom)} l`,
      `${num(right - r + k)} ${num(bottom)} ${num(right)} ${num(bottom + r - k)} ${num(right)} ${num(bottom + r)} c`,
      `${num(right)} ${num(top - r)} l`,
      `${num(right)} ${num(top - r + k)} ${num(right - r + k)} ${num(top)} ${num(right - r)} ${num(top)} c`,
      `${num(left + r)} ${num(top)} l`,
      `${num(left + r - k)} ${num(top)} ${num(left)} ${num(top - r + k)} ${num(left)} ${num(top - r)} c`,
      `${num(left)} ${num(bottom + r)} l`,
      `${num(left)} ${num(bottom + r - k)} ${num(left + r - k)} ${num(bottom)} ${num(left + r)} ${num(bottom)} c`,
      'h',
    ].join(' ');
  }

  /**
   * Cierra el documento.
   *
   * Todo lo escrito es ASCII —los caracteres con tilde van como escapes octales—, así que la
   * longitud de la cadena es la de los bytes y los desplazamientos de la tabla `xref` salen
   * de contar caracteres.
   *
   * @param title título del documento, el que enseña el lector en su barra
   * @return los bytes del PDF
   */
  build(title: string): Uint8Array<ArrayBuffer> {
    const objects: string[] = [];
    const add = (body: string) => {
      objects.push(body);
      return objects.length;
    };

    const catalog = add('');
    const pagesId = add('');
    const regular = add(
      '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
    );
    const bold = add(
      '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>',
    );
    const shadingIds = this.shadings.map((shading) => add(shading));

    const kids = this.pages.map((ops, index) => {
      const stream = ops.join('\n');
      const content = add(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
      const used = this.pageShadings[index];
      const shadings = used.length
        ? ` /Shading << ${used.map((id) => `/Sh${id} ${shadingIds[id]} 0 R`).join(' ')} >>`
        : '';
      return add(
        `<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] ` +
          `/Resources << /Font << /F1 ${regular} 0 R /F2 ${bold} 0 R >>${shadings} >> ` +
          `/Contents ${content} 0 R >>`,
      );
    });

    objects[catalog - 1] = `<< /Type /Catalog /Pages ${pagesId} 0 R >>`;
    objects[pagesId - 1] =
      `<< /Type /Pages /Kids [${kids.map((id) => `${id} 0 R`).join(' ')}] /Count ${kids.length} >>`;
    const info = add(`<< /Title ${pdfString(title)} /Creator (FinScope) /Producer (FinScope) >>`);

    let out = '%PDF-1.4\n';
    const offsets: number[] = [];
    objects.forEach((body, index) => {
      offsets.push(out.length);
      out += `${index + 1} 0 obj\n${body}\nendobj\n`;
    });
    const xref = out.length;
    out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
    out += offsets.map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`).join('');
    out += `trailer\n<< /Size ${objects.length + 1} /Root ${catalog} 0 R /Info ${info} 0 R >>\n`;
    out += `startxref\n${xref}\n%%EOF\n`;

    const bytes = new Uint8Array(out.length);
    for (let i = 0; i < out.length; i++) {
      bytes[i] = out.charCodeAt(i);
    }
    return bytes;
  }
}
