/**
 * Excel (`.xlsx`) escrito a mano.
 *
 * Un `.xlsx` es un ZIP con media docena de XML. Escribirlos aquí cuesta menos que una
 * librería de hojas de cálculo —que pesa más que la aplicación entera— y basta para lo que
 * se exporta: texto, fechas, importes con su formato, cabecera fija, filtros y anchos.
 *
 * Los textos van como `inlineStr`, sin tabla de cadenas compartidas: Excel, LibreOffice y
 * Numbers los leen igual y el archivo es un poco más largo, que aquí no importa.
 */

import { CURRENCY_NAMES, currencySymbol } from '../format/money';
import { CellValue, ExportReport, SheetColumnKind } from './report';
import { zip } from './zip';

/** Los aspectos de casilla que existen. Cada uno es una entrada de `cellXfs`. */
type CellStyle =
  | 'default'
  | 'title'
  | 'subtitle'
  | 'header'
  | 'section'
  | 'label'
  | 'textStrong'
  | 'moneyStrong'
  | 'percent'
  | SheetColumnKind;

/** Estilos con versión de fila alterna, que son los de la tabla. */
const STRIPED: readonly CellStyle[] = ['text', 'date', 'datetime', 'money', 'rate', 'integer'];

/** Orden fijo de los estilos: su posición es el número que se escribe en cada casilla. */
const STYLE_ORDER: readonly CellStyle[] = [
  'default',
  'title',
  'subtitle',
  'header',
  'section',
  'label',
  'textStrong',
  'moneyStrong',
  'percent',
  ...STRIPED,
];

interface XlsxCell {
  value: CellValue;
  style: CellStyle;
  /** Fila alterna de la tabla, con fondo tenue. */
  striped?: boolean;
}

interface XlsxSheet {
  name: string;
  widths: number[];
  rows: (XlsxCell | null)[][];
  /** Filas que quedan fijas arriba al desplazar. */
  freezeRows?: number;
  /** Rango de la tabla con filtro, en índices de fila y columna desde cero. */
  filter?: { row: number; lastRow: number; lastColumn: number };
  /** Altura de filas concretas, en puntos. */
  heights?: Record<number, number>;
}

const escapeXml = (text: string) =>
  text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    // Los caracteres de control no caben en XML 1.0 y dejan el archivo ilegible.
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');

/** Letra de columna de Excel: 0 → A, 25 → Z, 26 → AA. */
function columnName(index: number): string {
  let name = '';
  for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) {
    name = String.fromCharCode(65 + ((n - 1) % 26)) + name;
  }
  return name;
}

/**
 * Número de serie de Excel para un instante, en hora local.
 * Excel no sabe de zonas horarias: guarda lo que se ve en el reloj.
 */
function serialDate(date: Date): number {
  const local = Date.UTC(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
    date.getHours(),
    date.getMinutes(),
    date.getSeconds(),
  );
  return (local - Date.UTC(1899, 11, 30)) / 86_400_000;
}

/** Hexadecimal `#rrggbb` en el `FFRRGGBB` que espera Excel. */
const argb = (hex: string) => `FF${hex.replace('#', '').toUpperCase()}`;

function stylesXml(brand: string): string {
  // Formatos propios desde el 164, que es donde terminan los de fábrica.
  const formats = [
    [164, 'dd/mm/yyyy'],
    [165, 'dd/mm/yyyy hh:mm'],
    [166, '#,##0.00;[Red]-#,##0.00;0.00'],
    [167, '0.0000'],
    [168, '0.0%'],
  ];
  // Fuentes: 0 normal, 1 título, 2 gris, 3 cabecera blanca, 4 negrita, 5 sección.
  const fonts = [
    '<font><sz val="10"/><color rgb="FF1F2933"/><name val="Calibri"/><family val="2"/></font>',
    `<font><b/><sz val="18"/><color rgb="${argb(brand)}"/><name val="Calibri"/><family val="2"/></font>`,
    '<font><sz val="10"/><color rgb="FF6B7280"/><name val="Calibri"/><family val="2"/></font>',
    '<font><b/><sz val="10"/><color rgb="FFFFFFFF"/><name val="Calibri"/><family val="2"/></font>',
    '<font><b/><sz val="10"/><color rgb="FF1F2933"/><name val="Calibri"/><family val="2"/></font>',
    `<font><b/><sz val="12"/><color rgb="${argb(brand)}"/><name val="Calibri"/><family val="2"/></font>`,
  ];
  // Rellenos: los dos primeros los exige el formato; 2 marca, 3 fila alterna.
  const fills = [
    '<fill><patternFill patternType="none"/></fill>',
    '<fill><patternFill patternType="gray125"/></fill>',
    `<fill><patternFill patternType="solid"><fgColor rgb="${argb(brand)}"/><bgColor indexed="64"/></patternFill></fill>`,
    '<fill><patternFill patternType="solid"><fgColor rgb="FFF4F6F9"/><bgColor indexed="64"/></patternFill></fill>',
  ];
  // Bordes: 0 ninguno, 1 filete inferior tenue.
  const borders = [
    '<border><left/><right/><top/><bottom/><diagonal/></border>',
    '<border><left/><right/><top/><bottom style="thin"><color rgb="FFE3E7ED"/></bottom><diagonal/></border>',
  ];

  const xf = (font: number, numFmt = 0, fill = 0, border = 0, align = '') =>
    `<xf numFmtId="${numFmt}" fontId="${font}" fillId="${fill}" borderId="${border}" xfId="0"` +
    `${numFmt ? ' applyNumberFormat="1"' : ''}${font ? ' applyFont="1"' : ''}` +
    `${fill ? ' applyFill="1"' : ''}${border ? ' applyBorder="1"' : ''}` +
    `${align ? ` applyAlignment="1"><alignment ${align}/></xf>` : '/>'}`;

  const table = (fill: number): Record<string, string> => ({
    text: xf(0, 0, fill, 1, 'vertical="center"'),
    date: xf(0, 164, fill, 1, 'horizontal="left" vertical="center"'),
    datetime: xf(0, 165, fill, 1, 'horizontal="left" vertical="center"'),
    money: xf(0, 166, fill, 1, 'vertical="center"'),
    rate: xf(2, 167, fill, 1, 'vertical="center"'),
    integer: xf(0, 1, fill, 1, 'horizontal="center" vertical="center"'),
  });

  const fixed: Record<string, string> = {
    default: xf(0),
    title: xf(1, 0, 0, 0, 'vertical="center"'),
    subtitle: xf(2),
    header: xf(3, 0, 2, 0, 'vertical="center"'),
    section: xf(5),
    label: xf(2, 0, 0, 1),
    textStrong: xf(4, 0, 0, 1),
    moneyStrong: xf(4, 166, 0, 1),
    percent: xf(2, 168, 0, 1),
  };
  const plain = table(0);
  const zebra = table(3);
  const xfs = [
    ...STYLE_ORDER.map((style) => fixed[style] ?? plain[style]),
    ...STRIPED.map((style) => zebra[style]),
  ];

  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    `<numFmts count="${formats.length}">${formats
      .map(([id, code]) => `<numFmt numFmtId="${id}" formatCode="${escapeXml(String(code))}"/>`)
      .join('')}</numFmts>` +
    `<fonts count="${fonts.length}">${fonts.join('')}</fonts>` +
    `<fills count="${fills.length}">${fills.join('')}</fills>` +
    `<borders count="${borders.length}">${borders.join('')}</borders>` +
    '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
    `<cellXfs count="${xfs.length}">${xfs.join('')}</cellXfs>` +
    '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
    '</styleSheet>'
  );
}

function styleIndex(cell: XlsxCell): number {
  if (cell.striped && STRIPED.includes(cell.style)) {
    return STYLE_ORDER.length + STRIPED.indexOf(cell.style);
  }
  return Math.max(0, STYLE_ORDER.indexOf(cell.style));
}

function sheetXml(sheet: XlsxSheet): string {
  const rows = sheet.rows
    .map((cells, rowIndex) => {
      const ref = rowIndex + 1;
      const height = sheet.heights?.[rowIndex];
      const content = cells
        .map((cell, columnIndex) => {
          if (!cell) {
            return '';
          }
          const at = `${columnName(columnIndex)}${ref}`;
          const s = styleIndex(cell);
          const { value } = cell;
          if (value === null || value === '') {
            return s ? `<c r="${at}" s="${s}"/>` : '';
          }
          if (value instanceof Date) {
            return `<c r="${at}" s="${s}"><v>${serialDate(value)}</v></c>`;
          }
          if (typeof value === 'number') {
            return `<c r="${at}" s="${s}"><v>${value}</v></c>`;
          }
          return `<c r="${at}" s="${s}" t="inlineStr"><is><t xml:space="preserve">${escapeXml(value)}</t></is></c>`;
        })
        .join('');
      const size = height ? ` ht="${height}" customHeight="1"` : '';
      return `<row r="${ref}"${size}>${content}</row>`;
    })
    .join('');

  const freeze = sheet.freezeRows
    ? '<sheetViews><sheetView workbookViewId="0" showGridLines="0">' +
      `<pane ySplit="${sheet.freezeRows}" topLeftCell="A${sheet.freezeRows + 1}" activePane="bottomLeft" state="frozen"/>` +
      '</sheetView></sheetViews>'
    : '<sheetViews><sheetView workbookViewId="0" showGridLines="0"/></sheetViews>';
  const cols = `<cols>${sheet.widths
    .map(
      (width, index) =>
        `<col min="${index + 1}" max="${index + 1}" width="${width}" customWidth="1"/>`,
    )
    .join('')}</cols>`;
  const filter = sheet.filter
    ? `<autoFilter ref="A${sheet.filter.row + 1}:${columnName(sheet.filter.lastColumn)}${sheet.filter.lastRow + 1}"/>`
    : '';

  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ' +
    'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
    // Al imprimir, la tabla cabe de ancho en la hoja: sin esto Excel la parte en dos.
    '<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>' +
    `${freeze}<sheetFormatPr defaultRowHeight="16"/>${cols}<sheetData>${rows}</sheetData>${filter}` +
    '<pageMargins left="0.5" right="0.5" top="0.6" bottom="0.6" header="0.3" footer="0.3"/>' +
    '<pageSetup orientation="landscape" fitToWidth="1" fitToHeight="0"/>' +
    '</worksheet>'
  );
}

/** Excel no admite en el nombre de una hoja `[]:*?/\` ni más de 31 caracteres. */
const sheetName = (name: string) => name.replace(/[[\]:*?/\\]/g, ' ').slice(0, 31);

/**
 * Escribe un libro con las hojas dadas.
 *
 * @param sheets hojas, en orden
 * @param title  título del documento, para sus propiedades
 * @param brand  color de la cabecera de las tablas
 * @return los bytes del `.xlsx`
 */
function workbook(sheets: XlsxSheet[], title: string, brand: string): Uint8Array<ArrayBuffer> {
  const encoder = new TextEncoder();
  const file = (path: string, text: string) => ({ path, data: encoder.encode(text) });
  const created = new Date().toISOString().replace(/\.\d+Z$/, 'Z');

  const contentTypes =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
    '<Default Extension="xml" ContentType="application/xml"/>' +
    '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
    sheets
      .map(
        (_, index) =>
          `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
      )
      .join('') +
    '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
    '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>' +
    '</Types>';

  const rootRels =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
    '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>' +
    '</Relationships>';

  const core =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" ' +
    'xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" ' +
    'xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">' +
    `<dc:title>${escapeXml(title)}</dc:title><dc:creator>FinScope</dc:creator>` +
    `<dcterms:created xsi:type="dcterms:W3CDTF">${created}</dcterms:created>` +
    '</cp:coreProperties>';

  const filters = sheets
    .map((sheet, index) =>
      sheet.filter
        ? `<definedName name="_xlnm._FilterDatabase" localSheetId="${index}" hidden="1">` +
          `'${escapeXml(sheetName(sheet.name)).replace(/'/g, "''")}'!$A$${sheet.filter.row + 1}:` +
          `$${columnName(sheet.filter.lastColumn)}$${sheet.filter.lastRow + 1}</definedName>`
        : '',
    )
    .join('');
  const book =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ' +
    'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
    `<sheets>${sheets
      .map(
        (sheet, index) =>
          `<sheet name="${escapeXml(sheetName(sheet.name))}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`,
      )
      .join('')}</sheets>` +
    `${filters ? `<definedNames>${filters}</definedNames>` : ''}</workbook>`;

  const bookRels =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    sheets
      .map(
        (_, index) =>
          `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`,
      )
      .join('') +
    `<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>` +
    '</Relationships>';

  return zip([
    file('[Content_Types].xml', contentTypes),
    file('_rels/.rels', rootRels),
    file('docProps/core.xml', core),
    file('xl/workbook.xml', book),
    file('xl/_rels/workbook.xml.rels', bookRels),
    file('xl/styles.xml', stylesXml(brand)),
    ...sheets.map((sheet, index) => file(`xl/worksheets/sheet${index + 1}.xml`, sheetXml(sheet))),
  ]);
}

const cell = (value: CellValue, style: CellStyle, striped = false): XlsxCell => ({
  value,
  style,
  striped,
});

/**
 * Convierte el informe en un libro de Excel.
 *
 * La primera hoja es la tabla, lista para filtrar, ordenar y sumar: los importes son números
 * con signo —los egresos en negativo y en rojo—, de modo que un `SUMA` sobre la columna da
 * el balance. La segunda es el resumen: los filtros con los que se sacó, las cifras de cada
 * moneda y el reparto por categoría.
 *
 * @param report informe a convertir
 * @return los bytes del `.xlsx`
 */
export function reportToXlsx(report: ExportReport): Uint8Array<ArrayBuffer> {
  const { columns, rows } = report.sheet;
  const lastColumn = columns.length - 1;
  const subtitle = `${report.period} · Generado el ${report.generatedAt.toLocaleString('es-PE', {
    dateStyle: 'long',
    timeStyle: 'short',
  })}`;

  // Título, subtítulo, una fila de aire y la tabla: la cabecera queda en la fila 4.
  const head = 3;
  const tableRows: (XlsxCell | null)[][] = [
    [cell(report.title, 'title')],
    [cell(subtitle, 'subtitle')],
    [],
    columns.map((column) => cell(column.header, 'header')),
    ...rows.map((row, index) =>
      row.map((value, column) => cell(value, columns[column].kind, index % 2 === 1)),
    ),
  ];
  if (!rows.length) {
    tableRows.push([cell(report.emptyText, 'subtitle')]);
  }
  const table: XlsxSheet = {
    name: report.sheet.name,
    widths: columns.map((column) => column.width),
    rows: tableRows,
    freezeRows: head + 1,
    filter: rows.length ? { row: head, lastRow: head + rows.length, lastColumn } : undefined,
    heights: { 0: 28, [head]: 22 },
  };

  const summary: (XlsxCell | null)[][] = [
    [cell(`${report.title} · Resumen`, 'title')],
    [cell(subtitle, 'subtitle')],
    [],
  ];
  if (report.filters.length) {
    summary.push([cell('Filtros aplicados', 'section')]);
    for (const filter of report.filters) {
      summary.push([cell(filter.label, 'label'), cell(filter.value, 'textStrong')]);
    }
    summary.push([]);
  }
  for (const totals of report.totals) {
    summary.push([
      cell(`${CURRENCY_NAMES[totals.currency]} (${currencySymbol(totals.currency)})`, 'section'),
    ]);
    for (const figure of totals.figures) {
      // Las cifras van tal cual: «Egresos 1,200.00» ya dice que sale; solo el balance lleva signo.
      summary.push([cell(figure.label, 'label'), cell(figure.amount, 'moneyStrong')]);
    }
    summary.push([cell(totals.note, 'subtitle')]);
    summary.push([]);
  }
  for (const breakdown of report.breakdowns) {
    summary.push([cell(`${breakdown.title} · ${currencySymbol(breakdown.currency)}`, 'section')]);
    for (const item of breakdown.items) {
      summary.push([
        cell(item.label, 'label'),
        cell(item.amount, 'moneyStrong'),
        cell(item.share, 'percent'),
      ]);
    }
    summary.push([]);
  }
  for (const note of report.notes) {
    summary.push([cell(note, 'subtitle')]);
  }

  return workbook(
    [table, { name: 'Resumen', widths: [30, 20, 12], rows: summary, heights: { 0: 28 } }],
    `${report.title} · ${report.period}`,
    report.brand,
  );
}
