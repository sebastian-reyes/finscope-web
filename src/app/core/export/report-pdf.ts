/**
 * El informe en PDF: lo que se imprime o se manda por correo.
 *
 * A diferencia del Excel, aquí no se va a filtrar ni a sumar nada: se va a leer. Por eso
 * abre con lo que se pregunta primero —de cuándo es, qué filtros lleva y cuánto da— y deja
 * el detalle para después, con la cabecera de la tabla repetida en cada página para no tener
 * que volver a la primera a recordar qué columna era cuál.
 */

import { buildRamp } from '../format/color';
import { CURRENCY_NAMES, currencySymbol, formatMoney } from '../format/money';
import { PAGE_HEIGHT, PAGE_WIDTH, PdfDocument, fitText, textWidth } from './pdf';
import { Currency } from '../models';
import { DocumentCell, ExportReport, ReportFigure, Tone } from './report';

const MARGIN = 40;
const CONTENT = PAGE_WIDTH - MARGIN * 2;
/** Dónde termina lo que se puede escribir: debajo va el pie. */
const BOTTOM = PAGE_HEIGHT - 56;

const INK = '#1f2933';
const MUTED = '#6b7280';
const FAINT = '#9aa1ab';
const LINE = '#e3e7ed';
const ZEBRA = '#f7f8fa';
const WHITE = '#ffffff';

/** Los colores que informan son los de la aplicación en claro: el papel siempre es blanco. */
const TONES: Record<Exclude<Tone, 'brand'>, { ink: string; tint: string }> = {
  income: { ink: '#0f7b54', tint: '#e6f2ec' },
  expense: { ink: '#c0392e', tint: '#fbeae8' },
  warning: { ink: '#a55a07', tint: '#fdf1df' },
  muted: { ink: MUTED, tint: '#eef0f3' },
  neutral: { ink: INK, tint: '#eef0f3' },
};

/**
 * Parte un texto en líneas que quepan en el ancho dado.
 *
 * @return las líneas, sin partir ninguna palabra
 */
function wrap(text: string, width: number, size: number, bold = false): string[] {
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(/\s+/)) {
    const next = line ? `${line} ${word}` : word;
    if (line && textWidth(next, size, bold) > width) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) {
    lines.push(line);
  }
  return lines;
}

/** Un importe tal y como se lee en una cifra del resumen. */
function figureText(figure: ReportFigure, currency: Currency): string {
  const money = formatMoney(figure.amount, currency);
  if (!figure.signed || figure.amount === 0) {
    return money;
  }
  return `${figure.amount > 0 ? '+' : '-'} ${money}`;
}

/**
 * Convierte el informe en un PDF.
 *
 * @param report informe a convertir
 * @return los bytes del `.pdf`
 */
export function reportToPdf(report: ExportReport): Uint8Array<ArrayBuffer> {
  const brand = buildRamp(report.brand, 'light');
  const accent = buildRamp(report.accent, 'light');
  const tone = (name: Tone = 'neutral') =>
    name === 'brand' ? { ink: brand.base, tint: brand.tint } : TONES[name];

  const pdf = new PdfDocument();
  let y = 0;

  const generated = report.generatedAt.toLocaleString('es-PE', {
    dateStyle: 'long',
    timeStyle: 'short',
  });

  // --- Cabeceras ---------------------------------------------------------------------------

  const firstPage = () => {
    pdf.addPage();
    const height = 124;
    pdf.gradient(0, 0, PAGE_WIDTH, height, brand.base, accent.base);
    pdf.text('FINSCOPE', MARGIN, 36, { size: 9, bold: true, color: WHITE, spacing: 1.8 });
    pdf.text(`Generado el ${generated}`, PAGE_WIDTH - MARGIN, 36, {
      size: 8.5,
      color: WHITE,
      align: 'right',
    });
    pdf.text(report.title, MARGIN, 78, {
      size: 26,
      bold: true,
      color: WHITE,
      maxWidth: CONTENT,
    });
    pdf.text(report.period, MARGIN, 102, { size: 12, color: WHITE, maxWidth: CONTENT });
    y = height + 26;
  };

  const nextPage = () => {
    pdf.addPage();
    pdf.gradient(0, 0, PAGE_WIDTH, 5, brand.base, accent.base);
    pdf.text(`${report.title} · ${report.period}`, MARGIN, 30, {
      size: 8.5,
      bold: true,
      color: MUTED,
      maxWidth: CONTENT,
    });
    y = 48;
  };

  /** Salta de página si lo que viene no cabe en lo que queda. */
  const ensure = (height: number): boolean => {
    if (y + height <= BOTTOM) {
      return false;
    }
    nextPage();
    return true;
  };

  const sectionTitle = (title: string, aside?: string) => {
    ensure(40);
    pdf.text(title, MARGIN, y + 12, { size: 12, bold: true, color: INK });
    if (aside) {
      pdf.text(aside, PAGE_WIDTH - MARGIN, y + 12, { size: 8.5, color: MUTED, align: 'right' });
    }
    y += 24;
  };

  /** Rótulo pequeño en mayúsculas, el de las cifras y las columnas. */
  const overline = (
    text: string,
    x: number,
    at: number,
    color = MUTED,
    align: 'left' | 'right' = 'left',
  ) => pdf.text(text.toUpperCase(), x, at, { size: 7, bold: true, color, spacing: 0.7, align });

  firstPage();

  // --- Filtros -----------------------------------------------------------------------------

  overline('Filtros aplicados', MARGIN, y);
  y += 10;
  if (report.filters.length) {
    let x = MARGIN;
    const size = 8.5;
    for (const filter of report.filters) {
      const label = `${filter.label}: `;
      const value = fitText(filter.value, 220, size, true);
      const width = textWidth(label, size) + textWidth(value, size, true) + 20;
      if (x + width > PAGE_WIDTH - MARGIN) {
        x = MARGIN;
        y += 24;
      }
      pdf.rect(x, y, width, 19, { fill: brand.tint, radius: 9.5 });
      pdf.text(label, x + 10, y + 12.6, { size, color: MUTED });
      pdf.text(value, x + 10 + textWidth(label, size), y + 12.6, {
        size,
        bold: true,
        color: brand.base,
      });
      x += width + 6;
    }
    y += 19 + 24;
  } else {
    pdf.text('Ninguno: entra todo lo del periodo.', MARGIN, y + 11, { size: 9, color: INK });
    y += 34;
  }

  // --- Cifras ------------------------------------------------------------------------------

  const several = report.totals.length > 1;
  for (const totals of report.totals) {
    const height = 62;
    ensure((several ? 18 : 0) + height + 22);
    if (several) {
      pdf.text(
        `${CURRENCY_NAMES[totals.currency]} (${currencySymbol(totals.currency)})`,
        MARGIN,
        y + 9,
        {
          size: 10,
          bold: true,
          color: INK,
        },
      );
      y += 18;
    }
    const gap = 10;
    const count = totals.figures.length;
    const width = (CONTENT - gap * (count - 1)) / count;
    totals.figures.forEach((figure, index) => {
      const x = MARGIN + index * (width + gap);
      const colors = tone(figure.tone);
      pdf.rect(x, y, width, height, { fill: WHITE, stroke: LINE, radius: 9 });
      // Un filo del color de la cifra a la izquierda: se lee de qué es antes de leer el rótulo.
      pdf.rect(x, y + 14, 3, height - 28, { fill: colors.ink, radius: 1.5 });
      overline(figure.label, x + 14, y + 22);
      pdf.text(figureText(figure, totals.currency), x + 14, y + 45, {
        size: 16,
        bold: true,
        color: colors.ink,
        maxWidth: width - 24,
      });
    });
    y += height + 10;
    pdf.text(totals.note, MARGIN, y + 6, { size: 8.5, color: MUTED });
    y += 26;
  }

  // --- Repartos ----------------------------------------------------------------------------

  for (const breakdown of report.breakdowns) {
    if (!breakdown.items.length) {
      continue;
    }
    // Un reparto se lee entero: si cabe en una página, no se parte dejando una fila huérfana.
    const blockHeight = 24 + breakdown.items.length * 20;
    if (blockHeight <= BOTTOM - 48) {
      ensure(blockHeight);
    }
    sectionTitle(breakdown.title, several ? CURRENCY_NAMES[breakdown.currency] : undefined);
    const top = Math.max(...breakdown.items.map((item) => item.share));
    const labelWidth = 150;
    const amountWidth = 92;
    const shareWidth = 40;
    const barX = MARGIN + labelWidth + 10;
    const barWidth = CONTENT - labelWidth - amountWidth - shareWidth - 20;
    for (const item of breakdown.items) {
      ensure(20);
      pdf.text(item.label, MARGIN, y + 10, { size: 9, color: INK, maxWidth: labelWidth });
      pdf.rect(barX, y + 4, barWidth, 7, { fill: '#eef0f3', radius: 3.5 });
      const filled = top ? Math.max(7, (barWidth * item.share) / top) : 0;
      pdf.gradient(barX, y + 4, filled, 7, brand.base, accent.base, 3.5);
      pdf.text(
        formatMoney(item.amount, breakdown.currency),
        PAGE_WIDTH - MARGIN - shareWidth,
        y + 10,
        { size: 9, bold: true, color: INK, align: 'right' },
      );
      pdf.text(`${(item.share * 100).toFixed(1)} %`, PAGE_WIDTH - MARGIN, y + 10, {
        size: 8.5,
        color: MUTED,
        align: 'right',
      });
      y += 20;
    }
    y += 16;
  }

  // --- Detalle -----------------------------------------------------------------------------

  const { columns, rows } = report.document;
  const total = columns.reduce((sum, column) => sum + column.width, 0);
  const widths = columns.map((column) => (CONTENT * column.width) / total);
  const lefts = widths.map((_, index) =>
    widths.slice(0, index).reduce((sum, width) => sum + width, MARGIN),
  );
  const pad = 7;

  const tableHead = () => {
    pdf.rect(MARGIN, y, CONTENT, 22, { fill: brand.tint, radius: 6 });
    columns.forEach((column, index) => {
      const right = column.align === 'right';
      overline(
        fitText(column.header, widths[index] - pad * 2, 7, true),
        right ? lefts[index] + widths[index] - pad : lefts[index] + pad,
        y + 14,
        brand.base,
        right ? 'right' : 'left',
      );
    });
    y += 26;
  };

  sectionTitle('Detalle', `${rows.length} ${rows.length === 1 ? 'registro' : 'registros'}`);

  if (!rows.length) {
    ensure(70);
    pdf.rect(MARGIN, y, CONTENT, 64, { stroke: LINE, radius: 9 });
    pdf.text(report.emptyText, PAGE_WIDTH / 2, y + 36, {
      size: 10,
      color: MUTED,
      align: 'center',
      maxWidth: CONTENT - 40,
    });
    y += 80;
  } else {
    ensure(26 + 30);
    tableHead();
    rows.forEach((row, rowIndex) => {
      const tall = row.some((cell) => cell.sub);
      const height = tall ? 32 : 24;
      if (ensure(height)) {
        tableHead();
      }
      if (rowIndex % 2 === 1) {
        pdf.rect(MARGIN, y, CONTENT, height, { fill: ZEBRA, radius: 4 });
      }
      row.forEach((cell, index) => drawCell(cell, index, height));
      y += height;
    });
    pdf.line(MARGIN, y, PAGE_WIDTH - MARGIN, y, LINE);
    y += 18;
  }

  function drawCell(cell: DocumentCell, index: number, height: number): void {
    const column = columns[index];
    const width = widths[index] - pad * 2;
    const right = column.align === 'right';
    const x = right ? lefts[index] + widths[index] - pad : lefts[index] + pad;
    const align = right ? 'right' : 'left';
    const colors = tone(cell.tone);
    const main = cell.sub ? y + 13.5 : y + height / 2 + 3.2;

    if (cell.pill) {
      const size = 7.5;
      const text = fitText(cell.text, width - 14, size, true);
      const pillWidth = textWidth(text, size, true) + 14;
      const left = right ? x - pillWidth : x;
      pdf.rect(left, y + height / 2 - 7.5, pillWidth, 15, { fill: colors.tint, radius: 7.5 });
      pdf.text(text, left + 7, y + height / 2 + 2.7, { size, bold: true, color: colors.ink });
      return;
    }
    pdf.text(cell.text, x, main, {
      size: 8.5,
      bold: cell.bold,
      color: cell.tone ? colors.ink : INK,
      align,
      maxWidth: width,
    });
    if (cell.sub) {
      pdf.text(cell.sub, x, y + 24.5, { size: 7.5, color: FAINT, align, maxWidth: width });
    }
  }

  // --- Notas -------------------------------------------------------------------------------

  for (const note of report.notes) {
    const lines = wrap(note, CONTENT, 8);
    ensure(lines.length * 11 + 4);
    for (const line of lines) {
      pdf.text(line, MARGIN, y, { size: 8, color: MUTED });
      y += 11;
    }
    y += 4;
  }

  // --- Pie, ya con el número de páginas ---------------------------------------------------

  const pages = pdf.pageCount;
  for (let index = 0; index < pages; index++) {
    pdf.onPage(index);
    pdf.line(MARGIN, PAGE_HEIGHT - 38, PAGE_WIDTH - MARGIN, PAGE_HEIGHT - 38, LINE);
    pdf.text(`FinScope · ${report.title} · ${report.period}`, MARGIN, PAGE_HEIGHT - 24, {
      size: 7.5,
      color: FAINT,
      maxWidth: CONTENT - 80,
    });
    pdf.text(`Página ${index + 1} de ${pages}`, PAGE_WIDTH - MARGIN, PAGE_HEIGHT - 24, {
      size: 7.5,
      color: FAINT,
      align: 'right',
    });
  }

  return pdf.build(`${report.title} · ${report.period}`);
}
