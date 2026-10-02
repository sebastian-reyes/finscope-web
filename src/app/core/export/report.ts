/**
 * Lo que se exporta, dicho una sola vez para los tres formatos.
 *
 * Movimientos y fijos construyen un {@link ExportReport} y de él salen el Excel, el CSV y el
 * PDF. Así los tres no pueden discrepar sobre qué filas entran, con qué filtros o cuánto
 * suman: lo único que cambia entre ellos es cómo se pinta lo mismo.
 */

import { Currency } from '../models';

/** El valor de una casilla de la hoja de cálculo. Las fechas viajan como `Date`. */
export type CellValue = string | number | Date | null;

/**
 * Cómo se lee una columna de la hoja de cálculo.
 * Decide el formato numérico del Excel y cómo se escribe en el CSV.
 */
export type SheetColumnKind = 'text' | 'date' | 'datetime' | 'money' | 'rate' | 'integer';

export interface SheetColumn {
  header: string;
  kind: SheetColumnKind;
  /** Ancho en caracteres, el que usa Excel. */
  width: number;
}

/** Color con el que se pinta algo en el PDF; el valor exacto lo decide cada formato. */
export type Tone = 'income' | 'expense' | 'muted' | 'brand' | 'warning' | 'neutral';

export interface DocumentColumn {
  header: string;
  /** Parte del ancho de la tabla, en proporción a las demás. */
  width: number;
  align?: 'left' | 'right';
}

/** Una casilla de la tabla del PDF: una línea principal y, si hace falta, otra debajo. */
export interface DocumentCell {
  text: string;
  /** Segunda línea, más pequeña y en gris: los tags debajo de la descripción. */
  sub?: string;
  tone?: Tone;
  /** Se dibuja como una pastilla teñida, para los estados. */
  pill?: boolean;
  bold?: boolean;
}

/** Una cifra del resumen: «Ingresos S/ 4,200.00». */
export interface ReportFigure {
  label: string;
  amount: number;
  tone: Tone;
  /** Si se escribe con signo delante (el balance), o solo su valor (ingresos, egresos). */
  signed?: boolean;
}

/** Las cifras de una moneda. Nunca se suman monedas entre sí. */
export interface ReportTotals {
  currency: Currency;
  figures: ReportFigure[];
  /** Una frase corta debajo: «24 movimientos». */
  note: string;
}

/** Un reparto: cuánto se llevó cada categoría, dentro de una moneda. */
export interface ReportBreakdown {
  title: string;
  currency: Currency;
  items: { label: string; amount: number; share: number }[];
}

export interface ExportReport {
  /** Nombre del archivo sin extensión. */
  fileName: string;
  /** Qué es: «Movimientos», «Movimientos fijos». */
  title: string;
  /** De cuándo: «Septiembre 2026», «Del 1 ago al 15 sep 2026», «Todo el historial». */
  period: string;
  generatedAt: Date;
  /** Lo que acota el informe, como pares rótulo/valor. Vacío si no hay nada puesto. */
  filters: { label: string; value: string }[];
  totals: ReportTotals[];
  breakdowns: ReportBreakdown[];
  /** Las filas, tal y como van a la hoja de cálculo y al CSV. */
  sheet: { name: string; columns: SheetColumn[]; rows: CellValue[][] };
  /** Las mismas filas, compuestas para leerse en papel. */
  document: { columns: DocumentColumn[]; rows: DocumentCell[][] };
  /** Frase que se enseña en lugar de la tabla cuando no hay nada. */
  emptyText: string;
  /** Avisos al pie: de dónde sale cada número cuando no es obvio. */
  notes: string[];
  /** Color principal elegido por el usuario, para que el informe se parezca a su aplicación. */
  brand: string;
  /** Color secundario, con el que termina el degradado de la cabecera del PDF. */
  accent: string;
}

/** Los formatos que se ofrecen. */
export type ExportFormat = 'xlsx' | 'csv' | 'pdf';

/** El tipo MIME de cada formato. */
export const EXPORT_MIME: Record<ExportFormat, string> = {
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  csv: 'text/csv;charset=utf-8',
  pdf: 'application/pdf',
};

/** Marca de orden de bytes: sin ella, Excel abre un CSV en UTF-8 como si fuera Latin-1. */
const BOM = String.fromCharCode(0xfeff);

const pad = (value: number) => String(value).padStart(2, '0');

/**
 * Escribe una fecha como `2026-09-14`, que es lo que entiende cualquier hoja de cálculo sin
 * depender de su configuración regional.
 */
export function isoDate(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** La misma fecha con la hora local: `2026-09-14 18:05`. */
export function isoDateTime(date: Date): string {
  return `${isoDate(date)} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/**
 * Escapa una casilla de CSV.
 *
 * Además de las comillas, neutraliza lo que una hoja de cálculo tomaría por fórmula: una
 * descripción que empiece por `=`, `+`, `-` o `@` se ejecutaría al abrir el archivo. Los
 * números no pasan por aquí, así que un importe negativo sigue siendo un número.
 */
function csvText(value: string): string {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[",\r\n;]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

/**
 * Convierte el informe en CSV.
 *
 * Solo lleva la tabla, con una fila de cabecera: un CSV con resúmenes encima deja de poder
 * importarse en ningún sitio, que es para lo único que se elige este formato. Va con BOM para
 * que Excel lea bien las tildes, separado por comas y con el punto decimal de `es-PE`.
 *
 * @param report informe a convertir
 * @return el texto del archivo
 */
export function reportToCsv(report: ExportReport): string {
  const { columns, rows } = report.sheet;
  const lines = [columns.map((column) => csvText(column.header)).join(',')];
  for (const row of rows) {
    lines.push(
      row
        .map((value, index) => {
          if (value === null || value === undefined) {
            return '';
          }
          const kind = columns[index]?.kind;
          if (value instanceof Date) {
            return kind === 'date' ? isoDate(value) : isoDateTime(value);
          }
          if (typeof value === 'number') {
            if (kind === 'money') {
              return value.toFixed(2);
            }
            return String(value);
          }
          return csvText(value);
        })
        .join(','),
    );
  }
  return `${BOM}${lines.join('\r\n')}\r\n`;
}

/**
 * El mes de un informe, siempre con su año: «Septiembre 2026».
 * En pantalla el año sobra cuando es el actual, pero un archivo se abre meses después.
 */
export function reportMonth(month: number, year: number): string {
  const label = new Date(year, month - 1, 1).toLocaleDateString('es', { month: 'long' });
  return `${label.charAt(0).toUpperCase()}${label.slice(1)} ${year}`;
}
