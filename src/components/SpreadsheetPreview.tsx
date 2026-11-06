import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import type { Workbook, Worksheet, Cell, CellValue, Color, Style, Border, RichText } from 'exceljs';
import { getFileContentUrl } from '../api/files';
import { Icon } from './Icon';

// XLSX를 ExcelJS로 파싱해 React 표로 직접 그린다. 셀 내용은 전부 텍스트 노드로만 넣으므로
// (innerHTML 없음) 문서에 들어 있는 문자열이 마크업으로 해석될 여지가 없다.
// SheetJS(npm 0.18.5)는 알려진 취약점이 있어 쓰지 않는다.

interface Props {
  fileId?: number;
  contentUrl?: string;
  onError: (message: string) => void;
}

// 브라우저 메모리 안에서 압축을 풀고 전체 셀을 객체로 만들기 때문에 상한을 둔다.
// (14.7MB/140만 셀 파일 기준 메인 스레드 파싱 ~2.3초, JS 힙 ~700MB)
const MAX_FILE_BYTES = 15 * 1024 * 1024;
const MAX_RENDER_ROWS = 1000;
const MAX_RENDER_COLS = 100;

const DEFAULT_COL_WIDTH_CHARS = 8.43;
const DEFAULT_ROW_HEIGHT_PT = 15;
const PT_TO_PX = 4 / 3;

// 테마 색 인덱스 순서(lt1, dk1, lt2, dk2, accent1..6, hlink, folHlink). Office 기본 테마 값.
const DEFAULT_THEME_COLORS = [
  'FFFFFF', '000000', 'E7E6E6', '44546A', '4472C4', 'ED7D31',
  'A5A5A5', 'FFC000', '5B9BD5', '70AD47', '0563C1', '954F72',
];

// 구형 indexed 팔레트(0~63). 64/65는 시스템 전경/배경색.
const INDEXED_COLORS = (
  '000000 FFFFFF FF0000 00FF00 0000FF FFFF00 FF00FF 00FFFF ' +
  '000000 FFFFFF FF0000 00FF00 0000FF FFFF00 FF00FF 00FFFF ' +
  '800000 008000 000080 808000 800080 008080 C0C0C0 808080 ' +
  '9999FF 993366 FFFFCC CCFFFF 660066 FF8080 0066CC CCCCFF ' +
  '000080 FF00FF FFFF00 00FFFF 800080 800000 008080 0000FF ' +
  '00CCFF CCFFFF CCFFCC FFFF99 99CCFF FF99CC CC99FF FFCC99 ' +
  '3366FF 33CCCC 99CC00 FFCC00 FF9900 FF6600 666699 969696 ' +
  '003366 339966 003300 333300 993300 993366 333399 333333'
).split(' ');

type NumFmtModule = typeof import('numfmt');

interface SheetSummary {
  index: number;
  name: string;
}

interface RenderRun {
  text: string;
  style: CSSProperties;
}

interface RenderCell {
  key: string;
  rowSpan: number;
  colSpan: number;
  text: string;
  runs?: RenderRun[];
  link?: string;
  style: CSSProperties;
  className: string;
}

interface RenderRow {
  rowNumber: number;
  heightPx: number;
  cells: RenderCell[];
}

interface RenderColumn {
  colNumber: number;
  widthPx: number;
}

interface RenderSheet {
  columns: RenderColumn[];
  rows: RenderRow[];
  truncatedRows: boolean;
  truncatedCols: boolean;
  totalRows: number;
  totalCols: number;
}

interface LoadedWorkbook {
  workbook: Workbook;
  numfmt: NumFmtModule;
  themeColors: string[];
}

function getErrorMessage(err: unknown): string {
  if (err instanceof Error && err.message) return err.message;
  if (typeof err === 'string' && err) return err;
  return '스프레드시트 미리보기를 불러올 수 없습니다.';
}

function columnLetter(col: number): string {
  let n = col;
  let out = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    out = String.fromCharCode(65 + rem) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
}

function decodeAddress(address: string): { row: number; col: number } | null {
  const match = /^\$?([A-Z]+)\$?(\d+)$/i.exec(address.trim());
  if (!match) return null;
  let col = 0;
  for (const ch of match[1].toUpperCase()) col = col * 26 + (ch.charCodeAt(0) - 64);
  return { row: Number(match[2]), col };
}

function readThemeColors(workbook: Workbook): string[] {
  const xml = (workbook as unknown as { _themes?: Record<string, string> })._themes?.theme1;
  if (!xml) return DEFAULT_THEME_COLORS;
  try {
    // DOMParser의 XML 모드는 스크립트를 실행하지 않는다.
    const doc = new DOMParser().parseFromString(xml, 'application/xml');
    const scheme = doc.getElementsByTagNameNS('*', 'clrScheme')[0];
    if (!scheme) return DEFAULT_THEME_COLORS;
    const read = (name: string, fallback: string) => {
      const node = scheme.getElementsByTagNameNS('*', name)[0];
      const color = node?.firstElementChild;
      const value = color?.getAttribute('val') === 'windowText' || color?.getAttribute('val') === 'window'
        ? color.getAttribute('lastClr')
        : color?.getAttribute('val') ?? color?.getAttribute('lastClr');
      return value && /^[0-9a-f]{6}$/i.test(value) ? value.toUpperCase() : fallback;
    };
    const names = ['lt1', 'dk1', 'lt2', 'dk2', 'accent1', 'accent2', 'accent3', 'accent4', 'accent5', 'accent6', 'hlink', 'folHlink'];
    return names.map((name, i) => read(name, DEFAULT_THEME_COLORS[i]));
  } catch {
    return DEFAULT_THEME_COLORS;
  }
}

function applyTint(hex: string, tint: number): string {
  if (!tint) return hex;
  const r = parseInt(hex.slice(0, 2), 16) / 255;
  const g = parseInt(hex.slice(2, 4), 16) / 255;
  const b = parseInt(hex.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  let l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    h /= 6;
  }
  l = tint < 0 ? l * (1 + tint) : l * (1 - tint) + tint;

  const hue = (p: number, q: number, t: number) => {
    let x = t;
    if (x < 0) x += 1;
    if (x > 1) x -= 1;
    if (x < 1 / 6) return p + (q - p) * 6 * x;
    if (x < 1 / 2) return q;
    if (x < 2 / 3) return p + (q - p) * (2 / 3 - x) * 6;
    return p;
  };
  let nr = l;
  let ng = l;
  let nb = l;
  if (s !== 0) {
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    nr = hue(p, q, h + 1 / 3);
    ng = hue(p, q, h);
    nb = hue(p, q, h - 1 / 3);
  }
  const toHex = (v: number) => Math.round(Math.min(1, Math.max(0, v)) * 255).toString(16).padStart(2, '0');
  return `${toHex(nr)}${toHex(ng)}${toHex(nb)}`.toUpperCase();
}

function resolveColor(color: Partial<Color> | undefined, themeColors: string[]): string | undefined {
  if (!color) return undefined;
  const c = color as Partial<Color> & { indexed?: number; tint?: number };
  let hex: string | undefined;
  if (typeof c.argb === 'string' && /^[0-9a-f]{6,8}$/i.test(c.argb)) {
    hex = c.argb.length === 8 ? c.argb.slice(2) : c.argb;
  } else if (typeof c.theme === 'number') {
    hex = themeColors[c.theme];
  } else if (typeof c.indexed === 'number') {
    hex = INDEXED_COLORS[c.indexed];
  }
  if (!hex) return undefined;
  return `#${applyTint(hex, c.tint ?? 0)}`;
}

function fontToCss(font: Style['font'] | RichText['font'] | undefined, themeColors: string[]): CSSProperties {
  if (!font) return {};
  const css: CSSProperties = {};
  if (font.bold) css.fontWeight = 700;
  if (font.italic) css.fontStyle = 'italic';
  const decorations = [
    font.underline && font.underline !== 'none' ? 'underline' : '',
    font.strike ? 'line-through' : '',
  ].filter(Boolean);
  if (decorations.length) css.textDecoration = decorations.join(' ');
  if (font.size) css.fontSize = `${font.size}pt`;
  if (font.name) css.fontFamily = `"${font.name.replace(/["\\]/g, '')}", "Malgun Gothic", sans-serif`;
  const color = resolveColor(font.color, themeColors);
  if (color) css.color = color;
  if (font.vertAlign === 'superscript') css.verticalAlign = 'super';
  if (font.vertAlign === 'subscript') css.verticalAlign = 'sub';
  return css;
}

function borderToCss(border: Partial<Border> | undefined, themeColors: string[]): string | undefined {
  if (!border?.style) return undefined;
  const color = resolveColor(border.color, themeColors) ?? '#000';
  switch (border.style) {
    case 'medium':
    case 'mediumDashDot':
    case 'mediumDashDotDot':
      return `2px solid ${color}`;
    case 'mediumDashed':
      return `2px dashed ${color}`;
    case 'thick':
      return `3px solid ${color}`;
    case 'double':
      return `3px double ${color}`;
    case 'dashed':
    case 'dashDot':
    case 'dashDotDot':
    case 'slantDashDot':
      return `1px dashed ${color}`;
    case 'dotted':
    case 'hair':
      return `1px dotted ${color}`;
    default:
      return `1px solid ${color}`;
  }
}

function dateToSerial(date: Date): number {
  // ExcelJS는 날짜 셀을 UTC 기준 Date로 돌려준다.
  return date.getTime() / 86_400_000 + 25_569;
}

function normalizeNumFmt(numFmt: string | undefined): string {
  if (!numFmt) return 'General';
  // 기본 서식 14(짧은 날짜)는 로캘마다 다르게 보이는데 ExcelJS는 미국식으로 준다.
  if (numFmt === 'mm-dd-yy' || numFmt === 'm/d/yy') return 'yyyy-mm-dd';
  return numFmt;
}

interface DisplayValue {
  text: string;
  runs?: RenderRun[];
  color?: string;
  align: 'left' | 'right' | 'center';
  link?: string;
}

function safeLink(href: unknown): string | undefined {
  if (typeof href !== 'string') return undefined;
  try {
    const url = new URL(href);
    return url.protocol === 'http:' || url.protocol === 'https:' || url.protocol === 'mailto:' ? url.href : undefined;
  } catch {
    return undefined;
  }
}

function formatNumber(value: number, numFmt: string | undefined, numfmt: NumFmtModule): DisplayValue {
  const pattern = normalizeNumFmt(numFmt);
  let text: string;
  let color: string | undefined;
  try {
    text = numfmt.format(pattern, value, { locale: 'ko', throws: false });
    const c = numfmt.formatColor(pattern, value, { throws: false });
    if (typeof c === 'string') color = c;
  } catch {
    text = String(value);
  }
  return { text, color, align: 'right' };
}

function displayValue(value: CellValue | undefined, numFmt: string | undefined, numfmt: NumFmtModule, themeColors: string[]): DisplayValue {
  if (value == null) return { text: '', align: 'left' };
  if (typeof value === 'number') return formatNumber(value, numFmt, numfmt);
  if (typeof value === 'string') return { text: value, align: 'left' };
  if (typeof value === 'boolean') return { text: value ? 'TRUE' : 'FALSE', align: 'center' };
  if (value instanceof Date) {
    const pattern = numFmt && numfmt.isDateFormat(normalizeNumFmt(numFmt))
      ? numFmt
      : (value.getUTCHours() || value.getUTCMinutes() ? 'yyyy-mm-dd hh:mm' : 'yyyy-mm-dd');
    return formatNumber(dateToSerial(value), pattern, numfmt);
  }
  if (typeof value === 'object') {
    if ('richText' in value && Array.isArray(value.richText)) {
      const runs = value.richText.map(run => ({ text: run.text ?? '', style: fontToCss(run.font, themeColors) }));
      return { text: runs.map(r => r.text).join(''), runs, align: 'left' };
    }
    if ('error' in value) return { text: String(value.error), align: 'center' };
    if ('formula' in value || 'sharedFormula' in value) {
      const result = (value as { result?: CellValue }).result;
      return displayValue(result, numFmt, numfmt, themeColors);
    }
    if ('hyperlink' in value) {
      const inner = displayValue((value as { text?: CellValue }).text, numFmt, numfmt, themeColors);
      return { ...inner, link: safeLink(value.hyperlink) };
    }
  }
  return { text: '', align: 'left' };
}

function isEmptyValue(cell: Cell | undefined): boolean {
  const value = cell?.value;
  return value == null || value === '';
}

function buildSheet(sheet: Worksheet, loaded: LoadedWorkbook): RenderSheet {
  const { numfmt, themeColors } = loaded;
  const defaultColWidth = sheet.properties.defaultColWidth ?? DEFAULT_COL_WIDTH_CHARS;
  const defaultRowHeight = sheet.properties.defaultRowHeight ?? DEFAULT_ROW_HEIGHT_PT;

  // 병합 영역: 좌상단 셀 주소 → 범위, 나머지 셀은 가려진 셀로 표시
  const mergeMasters = new Map<string, { bottom: number; right: number }>();
  const covered = new Set<string>();
  let totalRows = sheet.rowCount;
  let totalCols = sheet.columnCount;
  for (const range of sheet.model.merges ?? []) {
    const [startRef, endRef] = String(range).split(':');
    const start = decodeAddress(startRef ?? '');
    const end = decodeAddress(endRef ?? startRef ?? '');
    if (!start || !end) continue;
    mergeMasters.set(`${start.row}:${start.col}`, { bottom: end.row, right: end.col });
    for (let r = start.row; r <= end.row; r++) {
      for (let c = start.col; c <= end.col; c++) {
        if (r !== start.row || c !== start.col) covered.add(`${r}:${c}`);
      }
    }
    totalRows = Math.max(totalRows, end.row);
    totalCols = Math.max(totalCols, end.col);
  }

  const lastRow = Math.min(totalRows, MAX_RENDER_ROWS);
  const lastCol = Math.min(totalCols, MAX_RENDER_COLS);

  const columns: RenderColumn[] = [];
  const hiddenCols = new Set<number>();
  for (let c = 1; c <= lastCol; c++) {
    const column = sheet.getColumn(c);
    if (column.hidden) {
      hiddenCols.add(c);
      continue;
    }
    const width = column.width ?? defaultColWidth;
    columns.push({ colNumber: c, widthPx: Math.max(8, Math.round(width * 7 + 5)) });
  }

  const hiddenRows = new Set<number>();
  for (let r = 1; r <= lastRow; r++) {
    if (sheet.getRow(r).hidden) hiddenRows.add(r);
  }

  const rows: RenderRow[] = [];
  for (let r = 1; r <= lastRow; r++) {
    if (hiddenRows.has(r)) continue;
    const row = sheet.getRow(r);
    const cells: RenderCell[] = [];

    for (const { colNumber: c } of columns) {
      const key = `${r}:${c}`;
      if (covered.has(key)) continue;

      const cell = row.getCell(c);
      const style = cell.style ?? {};
      const display = displayValue(cell.value, style.numFmt, numfmt, themeColors);

      let rowSpan = 1;
      let colSpan = 1;
      const merge = mergeMasters.get(key);
      if (merge) {
        rowSpan = 0;
        for (let mr = r; mr <= Math.min(merge.bottom, lastRow); mr++) if (!hiddenRows.has(mr)) rowSpan++;
        colSpan = 0;
        for (let mc = c; mc <= Math.min(merge.right, lastCol); mc++) if (!hiddenCols.has(mc)) colSpan++;
        rowSpan = Math.max(1, rowSpan);
        colSpan = Math.max(1, colSpan);
      }

      const css: CSSProperties = fontToCss(style.font, themeColors);
      if (display.color) css.color = display.color;

      const fill = style.fill;
      let hasFill = false;
      if (fill?.type === 'pattern' && fill.pattern && fill.pattern !== 'none') {
        const bg = resolveColor(fill.fgColor, themeColors) ?? resolveColor(fill.bgColor, themeColors);
        if (bg) {
          css.backgroundColor = bg;
          hasFill = true;
        }
      } else if (fill?.type === 'gradient' && fill.stops?.length) {
        const bg = resolveColor(fill.stops[0].color, themeColors);
        if (bg) {
          css.backgroundColor = bg;
          hasFill = true;
        }
      }

      const border = style.border;
      const top = borderToCss(border?.top, themeColors);
      const right = borderToCss(border?.right, themeColors);
      const bottom = borderToCss(border?.bottom, themeColors);
      const left = borderToCss(border?.left, themeColors);
      if (top) css.borderTop = top;
      if (right) css.borderRight = right;
      if (bottom) css.borderBottom = bottom;
      if (left) css.borderLeft = left;

      const alignment = style.alignment;
      const horizontal = alignment?.horizontal;
      css.textAlign = horizontal === 'center' || horizontal === 'centerContinuous' ? 'center'
        : horizontal === 'right' ? 'right'
        : horizontal === 'justify' || horizontal === 'distributed' ? 'justify'
        : horizontal === 'left' || horizontal === 'fill' ? 'left'
        : display.align;
      css.verticalAlign = alignment?.vertical === 'top' ? 'top'
        : alignment?.vertical === 'middle' || alignment?.vertical === 'distributed' || alignment?.vertical === 'justify' ? 'middle'
        : 'bottom';
      if (alignment?.indent) {
        if (css.textAlign === 'right') css.paddingRight = `${3 + alignment.indent * 9}px`;
        else css.paddingLeft = `${3 + alignment.indent * 9}px`;
      }

      const wrap = Boolean(alignment?.wrapText);
      // 엑셀처럼 줄바꿈 없는 텍스트는 오른쪽 셀이 비어 있으면 넘쳐서 보이게 한다.
      const canOverflow = !wrap && display.text !== '' && display.align === 'left'
        && css.textAlign === 'left' && !merge && isEmptyValue(row.getCell(c + 1));

      const classes = ['sheet-cell'];
      if (wrap) classes.push('wrap');
      if (canOverflow) classes.push('overflow');
      if (hasFill) classes.push('filled');

      cells.push({
        key,
        rowSpan,
        colSpan,
        text: display.text,
        runs: display.runs,
        link: display.link,
        style: css,
        className: classes.join(' '),
      });
    }

    const height = row.height ?? defaultRowHeight;
    rows.push({ rowNumber: r, heightPx: Math.max(4, Math.round(height * PT_TO_PX)), cells });
  }

  return {
    columns,
    rows,
    truncatedRows: totalRows > MAX_RENDER_ROWS,
    truncatedCols: totalCols > MAX_RENDER_COLS,
    totalRows,
    totalCols,
  };
}

function renderCellContent(cell: RenderCell): ReactNode {
  const content = cell.runs
    ? cell.runs.map((run, i) => <span key={i} style={run.style}>{run.text}</span>)
    : cell.text;
  if (cell.link) {
    return (
      <a href={cell.link} target="_blank" rel="noopener noreferrer nofollow">
        {content}
      </a>
    );
  }
  return content;
}

export function SpreadsheetPreview({ fileId, contentUrl, onError }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState<LoadedWorkbook | null>(null);
  const [sheets, setSheets] = useState<SheetSummary[]>([]);
  const [activeSheet, setActiveSheet] = useState<number | null>(null);
  const previewUrl = contentUrl ?? (fileId != null ? getFileContentUrl(fileId, false) : null);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    setLoading(true);
    setLoaded(null);
    setSheets([]);
    setActiveSheet(null);
    onError('');

    async function run() {
      if (!previewUrl) throw new Error('스프레드시트 미리보기 URL이 없습니다.');

      const [excel, numfmt, response] = await Promise.all([
        import('exceljs'),
        import('numfmt'),
        fetch(previewUrl, { credentials: 'include', signal: controller.signal }),
      ]);
      if (!response.ok) throw new Error(`스프레드시트 로드 실패: HTTP ${response.status}`);

      const declaredSize = Number(response.headers.get('Content-Length'));
      if (declaredSize > MAX_FILE_BYTES) {
        controller.abort();
        throw new Error('파일이 너무 커서 브라우저에서 미리볼 수 없습니다. 다운로드해서 확인하세요.');
      }
      const buffer = await response.arrayBuffer();
      if (cancelled) return;
      if (buffer.byteLength > MAX_FILE_BYTES) {
        throw new Error('파일이 너무 커서 브라우저에서 미리볼 수 없습니다. 다운로드해서 확인하세요.');
      }

      // exceljs의 browser 번들은 UMD라 번들러에 따라 default 아래에 들어간다.
      const WorkbookCtor = excel.Workbook
        ?? (excel as unknown as { default: typeof import('exceljs') }).default.Workbook;
      const workbook = new WorkbookCtor();
      try {
        await workbook.xlsx.load(buffer);
      } catch (err) {
        console.warn('XLSX parse failed:', err);
        throw new Error('손상되었거나 지원하지 않는 엑셀 파일입니다. 다운로드해서 확인하세요.');
      }
      if (cancelled) return;

      const visible = workbook.worksheets
        .map((sheet, index) => ({ sheet, index }))
        .filter(({ sheet }) => sheet.state === 'visible' || sheet.state == null);
      if (visible.length === 0) throw new Error('표시할 시트가 없습니다.');

      const activeTab = workbook.views?.[0]?.activeTab ?? 0;
      const initial = visible.find(v => v.index === activeTab) ?? visible[0];

      setLoaded({ workbook, numfmt, themeColors: readThemeColors(workbook) });
      setSheets(visible.map(({ sheet, index }) => ({ index, name: sheet.name })));
      setActiveSheet(initial.index);
      setLoading(false);
    }

    run().catch(err => {
      if (cancelled) return;
      onError(getErrorMessage(err));
      setLoading(false);
    });

    return () => {
      cancelled = true;
      controller.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewUrl]);

  const rendered = useMemo(() => {
    if (!loaded || activeSheet == null) return null;
    const sheet = loaded.workbook.worksheets[activeSheet];
    if (!sheet) return null;
    try {
      return { sheet: buildSheet(sheet, loaded), error: '' };
    } catch (err) {
      return { sheet: null, error: getErrorMessage(err) };
    }
  }, [loaded, activeSheet]);

  useEffect(() => {
    if (rendered?.error) onError(rendered.error);
  }, [rendered, onError]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0, left: 0 });
  }, [activeSheet]);

  const sheet = rendered?.sheet;
  const tableWidth = sheet ? 44 + sheet.columns.reduce((sum, col) => sum + col.widthPx, 0) : 0;

  return (
    <div className="sheet-preview">
      <style>{SHEET_PREVIEW_STYLES}</style>
      <div className="sheet-preview-scroll" ref={scrollRef}>
        {sheet && (
          <>
            {(sheet.truncatedRows || sheet.truncatedCols) && (
              <div className="sheet-preview-notice">
                <Icon name="info" size={14} />
                <span>
                  큰 시트라 {sheet.truncatedRows ? `${MAX_RENDER_ROWS.toLocaleString()}행` : ''}
                  {sheet.truncatedRows && sheet.truncatedCols ? ', ' : ''}
                  {sheet.truncatedCols ? `${MAX_RENDER_COLS}열(${columnLetter(MAX_RENDER_COLS)})` : ''}까지만 표시합니다.
                  (전체 {sheet.totalRows.toLocaleString()}행 × {sheet.totalCols}열)
                </span>
              </div>
            )}
            {sheet.columns.length === 0 || sheet.rows.length === 0 ? (
              <div className="sheet-preview-empty">빈 시트입니다.</div>
            ) : (
              <table className="sheet-preview-table" style={{ width: tableWidth }}>
                <colgroup>
                  <col style={{ width: 44 }} />
                  {sheet.columns.map(col => <col key={col.colNumber} style={{ width: col.widthPx }} />)}
                </colgroup>
                <thead>
                  <tr>
                    <th className="sheet-corner" />
                    {sheet.columns.map(col => (
                      <th key={col.colNumber} className="sheet-col-header">{columnLetter(col.colNumber)}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sheet.rows.map(row => (
                    <tr key={row.rowNumber} style={{ height: row.heightPx }}>
                      <th className="sheet-row-header">{row.rowNumber}</th>
                      {row.cells.map(cell => (
                        <td
                          key={cell.key}
                          rowSpan={cell.rowSpan > 1 ? cell.rowSpan : undefined}
                          colSpan={cell.colSpan > 1 ? cell.colSpan : undefined}
                          className={cell.className}
                          style={cell.style}
                        >
                          {renderCellContent(cell)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </>
        )}
      </div>
      {sheets.length > 0 && (
        <div className="sheet-preview-tabs" role="tablist">
          {sheets.map(s => (
            <button
              key={s.index}
              type="button"
              role="tab"
              aria-selected={s.index === activeSheet}
              className={'sheet-preview-tab' + (s.index === activeSheet ? ' active' : '')}
              onClick={() => setActiveSheet(s.index)}
              title={s.name}
            >
              {s.name}
            </button>
          ))}
        </div>
      )}
      {loading && (
        <div className="viewer-office-loading">
          <Icon name="spinner" size={28} />
          <span>스프레드시트를 불러오는 중...</span>
          <small>큰 파일은 잠시 시간이 걸릴 수 있습니다.</small>
        </div>
      )}
    </div>
  );
}

const SHEET_PREVIEW_STYLES = `
  .sheet-preview {
    position: relative;
    min-width: 0;
    min-height: 0;
    display: grid;
    grid-template-rows: 1fr auto;
    background: #fff;
  }
  .sheet-preview-scroll {
    min-width: 0;
    min-height: 0;
    overflow: auto;
    overscroll-behavior: contain;
    background: #fff;
  }
  .sheet-preview-notice {
    position: sticky;
    left: 0;
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 7px 12px;
    background: #fff8e1;
    border-bottom: 1px solid #f1e3b0;
    color: #6b5a1e;
    font-size: 12px;
  }
  .sheet-preview-empty {
    padding: 48px 16px;
    text-align: center;
    color: #7a8494;
    font-size: 13px;
  }
  .sheet-preview-table {
    table-layout: fixed;
    border-collapse: collapse;
    border-spacing: 0;
    color: #000;
    font-family: Calibri, "Malgun Gothic", "Apple SD Gothic Neo", sans-serif;
    font-size: 11pt;
    line-height: 1.2;
  }
  .sheet-preview-table th {
    position: sticky;
    z-index: 2;
    padding: 0 4px;
    background: #f3f4f6;
    color: #5f6878;
    font-family: system-ui, sans-serif;
    font-size: 11px;
    font-weight: 500;
    text-align: center;
    border: 1px solid #d5d9e0;
    white-space: nowrap;
    overflow: hidden;
  }
  .sheet-preview-table thead th {
    top: 0;
    height: 22px;
  }
  .sheet-preview-table .sheet-row-header {
    left: 0;
    z-index: 1;
  }
  .sheet-preview-table .sheet-corner {
    left: 0;
    z-index: 3;
  }
  .sheet-cell {
    padding: 0 3px;
    overflow: hidden;
    white-space: pre;
    background-image:
      linear-gradient(to right, transparent calc(100% - 1px), #e2e5ea calc(100% - 1px)),
      linear-gradient(to bottom, transparent calc(100% - 1px), #e2e5ea calc(100% - 1px));
  }
  .sheet-cell.filled {
    background-image: none;
  }
  .sheet-cell.wrap {
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }
  .sheet-cell.overflow {
    overflow: visible;
  }
  .sheet-cell a {
    color: inherit;
  }
  .sheet-preview-tabs {
    display: flex;
    gap: 2px;
    min-width: 0;
    overflow-x: auto;
    padding: 0 8px;
    background: #f3f4f6;
    border-top: 1px solid #d5d9e0;
  }
  .sheet-preview-tab {
    flex: none;
    max-width: 200px;
    padding: 7px 14px;
    border: none;
    border-bottom: 2px solid transparent;
    background: transparent;
    color: #5f6878;
    font-size: 12px;
    font-weight: 500;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .sheet-preview-tab:hover {
    color: #1f2937;
    background: #e9ecf1;
  }
  .sheet-preview-tab.active {
    color: #107c41;
    font-weight: 650;
    background: #fff;
    border-bottom-color: #107c41;
  }
`;
