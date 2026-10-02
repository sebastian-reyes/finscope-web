import { describe, expect, it } from 'vitest';
import { fitText, PdfDocument, textWidth, toWinAnsi } from './pdf';
import { ExportReport, reportMonth, reportToCsv } from './report';
import { reportToPdf } from './report-pdf';
import { reportToXlsx } from './xlsx';
import { crc32, zip } from './zip';

const encoder = new TextEncoder();

/** Los bytes como texto: el ZIP va sin comprimir y el PDF es ASCII, así que se leen tal cual. */
const asText = (bytes: Uint8Array) => new TextDecoder('latin1').decode(bytes);

function report(overrides: Partial<ExportReport> = {}): ExportReport {
  return {
    fileName: 'finscope-movimientos-2026-09',
    title: 'Movimientos',
    period: 'Septiembre 2026',
    generatedAt: new Date(2026, 9, 2, 14, 5),
    filters: [{ label: 'Categoría', value: 'Comida' }],
    totals: [
      {
        currency: 'PEN',
        figures: [
          { label: 'Ingresos', amount: 100, tone: 'income' },
          { label: 'Egresos', amount: 40.5, tone: 'expense' },
          { label: 'Balance', amount: 59.5, tone: 'income', signed: true },
        ],
        note: '2 movimientos',
      },
    ],
    breakdowns: [
      {
        title: 'Gasto por categoría',
        currency: 'PEN',
        items: [{ label: 'Comida', amount: 40.5, share: 1 }],
      },
    ],
    sheet: {
      name: 'Movimientos',
      columns: [
        { header: 'Fecha', kind: 'datetime', width: 17 },
        { header: 'Descripción', kind: 'text', width: 30 },
        { header: 'Monto', kind: 'money', width: 14 },
      ],
      rows: [
        [new Date(2026, 8, 14, 18, 5), 'Almuerzo, con "postre"', -40.5],
        [new Date(2026, 8, 1, 9, 0), '=HYPERLINK("x")', 100],
      ],
    },
    document: {
      columns: [
        { header: 'Descripción', width: 3 },
        { header: 'Monto', width: 1, align: 'right' },
      ],
      rows: [
        [
          { text: 'Almuerzo', sub: '#equipo' },
          { text: '- S/ 40.50', tone: 'expense' },
        ],
        [{ text: 'Sueldo' }, { text: 'Cobrado', tone: 'income', pill: true }],
      ],
    },
    emptyText: 'No hay movimientos.',
    notes: ['Los egresos van en negativo.'],
    brand: '#2a5cb8',
    accent: '#1f9e6a',
    ...overrides,
  };
}

describe('zip', () => {
  it('calcula el CRC-32 de referencia', () => {
    expect(crc32(encoder.encode('123456789'))).toBe(0xcbf43926);
  });

  it('empaqueta cada archivo con su cabecera y cierra con el directorio central', () => {
    const bytes = zip([
      { path: 'a.txt', data: encoder.encode('hola') },
      { path: 'b/c.xml', data: encoder.encode('<x/>') },
    ]);
    const text = asText(bytes);

    expect(text.startsWith('PK\u0003\u0004')).toBe(true);
    expect(text).toContain('a.txt');
    expect(text).toContain('<x/>');
    // El registro final dice cuántos archivos hay.
    const end = text.lastIndexOf('PK\u0005\u0006');
    expect(new DataView(bytes.buffer).getUint16(end + 10, true)).toBe(2);
  });
});

describe('CSV', () => {
  const csv = reportToCsv(report());

  it('lleva BOM para que Excel lea las tildes, y la cabecera de la tabla', () => {
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv.slice(1).split('\r\n')[0]).toBe('Fecha,Descripción,Monto');
  });

  it('escribe fechas sin depender de la configuración regional e importes con punto', () => {
    expect(csv).toContain('2026-09-14 18:05,"Almuerzo, con ""postre""",-40.50');
  });

  it('neutraliza lo que una hoja de cálculo ejecutaría como fórmula', () => {
    expect(csv).toContain(`"'=HYPERLINK(""x"")",100.00`);
  });
});

describe('Excel', () => {
  const text = asText(reportToXlsx(report()));

  it('trae las piezas que exige el formato y dos hojas', () => {
    for (const part of [
      '[Content_Types].xml',
      'xl/workbook.xml',
      'xl/styles.xml',
      'xl/worksheets/sheet1.xml',
      'xl/worksheets/sheet2.xml',
    ]) {
      expect(text).toContain(part);
    }
    expect(text).toContain('<sheet name="Movimientos"');
    expect(text).toContain('<sheet name="Resumen"');
  });

  it('deja la cabecera fija, con filtro, y los importes como números', () => {
    expect(text).toContain('<pane ySplit="4"');
    expect(text).toContain('<autoFilter ref="A4:C6"/>');
    expect(text).toMatch(/<c r="C5" s="\d+"><v>-40.5<\/v><\/c>/);
  });

  it('guarda las fechas como número de serie, que es lo que Excel ordena y filtra', () => {
    // 14/09/2026 18:05 → 46279 días desde 1899-12-30 y 18:05 en fracción de día.
    expect(text).toMatch(/<c r="A5" s="\d+"><v>46279\.753472\d*<\/v><\/c>/);
  });

  it('escapa el texto para el XML', () => {
    expect(text).toContain('Almuerzo, con &quot;postre&quot;');
  });
});

describe('PDF', () => {
  it('codifica en WinAnsi y descarta lo que Helvetica no puede dibujar', () => {
    expect(toWinAnsi('Cine 🎬 con €')).toEqual([...toWinAnsi('Cine con '), 0x80]);
    expect(toWinAnsi('ñ')).toEqual([0xf1]);
  });

  it('mide con los anchos de Helvetica', () => {
    // H 722 + e 556 + l 222 + l 222 + o 556 = 2278 milésimas.
    expect(textWidth('Hello', 10)).toBeCloseTo(22.78);
    expect(textWidth('Hello', 10, true)).toBeGreaterThan(textWidth('Hello', 10));
  });

  it('recorta con puntos suspensivos sin pasarse del ancho', () => {
    const fitted = fitText('Una descripción larguísima que no cabe', 60, 9);
    expect(fitted.endsWith('…')).toBe(true);
    expect(textWidth(fitted, 9)).toBeLessThanOrEqual(60);
    expect(fitText('Corto', 60, 9)).toBe('Corto');
  });

  it('cuadra la tabla de referencias con la posición real de cada objeto', () => {
    const doc = new PdfDocument();
    doc.addPage();
    doc.text('Hola (mundo)', 40, 40);
    const text = asText(doc.build('Prueba'));

    expect(text.startsWith('%PDF-1.4')).toBe(true);
    expect(text.trimEnd().endsWith('%%EOF')).toBe(true);
    expect(text).toContain('(Hola \\(mundo\\)) Tj');
    const xref = Number(/startxref\n(\d+)/.exec(text)![1]);
    expect(text.slice(xref, xref + 4)).toBe('xref');
    const offsets = text
      .slice(xref)
      .split('\n')
      .filter((line) => / 00000 n $/.test(line))
      .map((line) => Number(line.slice(0, 10)));
    offsets.forEach((offset, index) => {
      expect(text.startsWith(`${index + 1} 0 obj`, offset)).toBe(true);
    });
  });

  it('pagina el detalle y numera cada página', () => {
    const many = report({
      document: {
        columns: [{ header: 'Descripción', width: 1 }],
        rows: Array.from({ length: 80 }, (_, i) => [{ text: `Movimiento ${i}` }]),
      },
    });
    const text = asText(reportToPdf(many));
    const pages = Number(/\/Count (\d+)/.exec(text)![1]);

    expect(pages).toBeGreaterThan(1);
    expect(text).toContain(`(P\\341gina ${pages} de ${pages}) Tj`);
    expect(text).toContain('(Movimiento 79) Tj');
  });

  it('dice que no hay nada en lugar de dibujar una tabla vacía', () => {
    const text = asText(
      reportToPdf(report({ document: { columns: [{ header: 'A', width: 1 }], rows: [] } })),
    );
    expect(text).toContain('(No hay movimientos.) Tj');
  });
});

describe('reportMonth', () => {
  it('pone siempre el año: el archivo se abre meses después', () => {
    expect(reportMonth(1, new Date().getFullYear())).toMatch(/^Enero \d{4}$/);
  });
});
