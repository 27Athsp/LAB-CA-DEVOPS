import Papa from 'papaparse';

export interface Dataset { headers: string[]; rows: string[][] }
export interface ColumnReport { name: string; type: 'numeric' | 'text' | 'empty'; missing: number; invalid: number }
export interface QualityReport {
  rows: number;
  columns: number;
  missingCells: number;
  duplicateRows: number;
  invalidNumericCells: number;
  byColumn: ColumnReport[];
}
export interface CleanOptions { fillMissing: boolean; removeDuplicates: boolean }
export interface CleanResult { dataset: Dataset; filledCells: number; removedRows: number }

export const LIMITS = { bytes: 5 * 1024 * 1024, rows: 20_000, columns: 100, cells: 250_000 } as const;
export const DEFAULT_OPTIONS: CleanOptions = { fillMissing: true, removeDuplicates: true };
const DECIMAL = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i;
const LEADING_ZERO_ID = /^[+-]?0\d+$/;
export const isMissing = (value: string) => value.trim() === '';
export const isNumeric = (value: string) => DECIMAL.test(value.trim()) && Number.isFinite(Number(value));
const normalize = (value: string) => isMissing(value) ? '' : value;
const uniqueRows = (rows: string[][]) => {
  const seen = new Set<string>();
  return rows.filter((row) => {
    const key = JSON.stringify(row.map(normalize));
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

export function validateFile(file: { name: string; size: number }): void {
  if (!/\.csv$/i.test(file.name)) throw new Error('Choose a CSV file (.csv). Other file types are not supported.');
  if (file.size === 0) throw new Error('This file is empty. Choose a CSV with a header and at least one data row.');
  if (file.size > LIMITS.bytes) throw new Error('This file exceeds the 5 MB limit. Split it into smaller CSV files.');
}

export function parseCsv(text: string): Dataset {
  if (new TextEncoder().encode(text).byteLength > LIMITS.bytes) throw new Error('This file exceeds the 5 MB limit.');
  if (!text.trim()) throw new Error('This CSV is empty. Add a header and at least one data row.');
  if (text.includes('\0')) throw new Error('This file is not a valid UTF-8 CSV. Export it as CSV UTF-8 and try again.');
  const source = text.replace(/^\uFEFF/, '');
  const records: string[][] = [];
  let cursor = 0;
  Papa.parse<string[]>(source, {
    delimiter: ',', dynamicTyping: false,
    step(result) {
      if (result.errors.length) throw new Error(`Could not read this CSV: ${result.errors[0].message}`);
      const rawRecord = source.slice(cursor, result.meta.cursor).replace(/(?:\r\n|\n|\r)$/, '');
      cursor = result.meta.cursor;
      // Skip physical blank lines, but preserve explicitly quoted empty cells.
      if (rawRecord !== '') records.push(result.data);
    },
  });
  const [rawHeaders, ...rawRows] = records;
  if (!rawHeaders?.length || rawRows.length === 0) throw new Error('This CSV needs a header and at least one data row.');
  const headers = rawHeaders.map((header) => header.trim());
  if (headers.some((header) => !header)) throw new Error('Every column needs a name. Add the missing header and try again.');
  if (new Set(headers).size !== headers.length) throw new Error('Column names must be unique. Rename duplicate headers and try again.');
  if (headers.length > LIMITS.columns) throw new Error(`This CSV exceeds ${LIMITS.columns} columns.`);
  if (rawRows.length > LIMITS.rows) throw new Error(`This CSV exceeds ${LIMITS.rows.toLocaleString('en-US')} rows.`);
  if (rawRows.length * headers.length > LIMITS.cells) throw new Error('This CSV exceeds 250,000 cells. Split it into smaller files.');
  const badRow = rawRows.findIndex((row) => row.length !== headers.length);
  if (badRow !== -1) throw new Error(`Data row ${badRow + 1} has ${rawRows[badRow].length} values; expected ${headers.length}. Check commas and quotes.`);
  return { headers, rows: rawRows.map((row) => row.map(normalize)) };
}

function inspectColumn(name: string, values: string[]): ColumnReport {
  const present = values.filter((value) => !isMissing(value));
  const missing = values.length - present.length;
  if (!present.length) return { name, type: 'empty', missing, invalid: 0 };
  const numericCount = present.filter(isNumeric).length;
  // ponytail: a documented 80% heuristic; explicit schemas would suit larger or domain-specific datasets.
  const numeric = numericCount / present.length >= 0.8 && !present.some((value) => LEADING_ZERO_ID.test(value.trim()));
  return { name, type: numeric ? 'numeric' : 'text', missing, invalid: numeric ? present.length - numericCount : 0 };
}

export function analyzeDataset(dataset: Dataset): QualityReport {
  const byColumn = dataset.headers.map((name, i) => inspectColumn(name, dataset.rows.map((row) => row[i])));
  return {
    rows: dataset.rows.length,
    columns: dataset.headers.length,
    missingCells: byColumn.reduce((sum, col) => sum + col.missing, 0),
    duplicateRows: dataset.rows.length - uniqueRows(dataset.rows).length,
    invalidNumericCells: byColumn.reduce((sum, col) => sum + col.invalid, 0),
    byColumn,
  };
}

function replacementValue(values: string[], type: ColumnReport['type']): string | undefined {
  const present = values.filter((value) => !isMissing(value));
  if (!present.length) return undefined;
  if (type === 'numeric') {
    const numbers = present.filter(isNumeric).map(Number).sort((a, b) => a - b);
    const middle = Math.floor(numbers.length / 2);
    // Halve before addition to avoid overflowing two large, finite values.
    return String(numbers.length % 2 ? numbers[middle] : numbers[middle - 1] / 2 + numbers[middle] / 2);
  }
  const counts = new Map<string, number>();
  for (const value of present) counts.set(value, (counts.get(value) ?? 0) + 1);
  let mode = present[0];
  for (const [value, count] of counts) if (count > (counts.get(mode) ?? 0)) mode = value;
  return mode;
}

export function cleanDataset(input: Dataset, options: CleanOptions = DEFAULT_OPTIONS): CleanResult {
  let rows = input.rows.map((row) => row.map(normalize));
  if (options.removeDuplicates) rows = uniqueRows(rows);
  let filledCells = 0;
  if (options.fillMissing) {
    input.headers.forEach((name, column) => {
      const values = rows.map((row) => row[column]);
      const replacement = replacementValue(values, inspectColumn(name, values).type);
      if (replacement === undefined) return;
      rows.forEach((row) => {
        if (isMissing(row[column])) { row[column] = replacement; filledCells++; }
      });
    });
  }
  // Filling can make previously different rows identical.
  if (options.removeDuplicates) rows = uniqueRows(rows);
  return { dataset: { headers: [...input.headers], rows }, filledCells, removedRows: input.rows.length - rows.length };
}

function safeCell(value: string, allowNumber: boolean): string {
  if (allowNumber && isNumeric(value)) return value;
  return /^(?:\s*[=+@-]|[\t\r\n])/.test(value) ? `'${value}` : value;
}

export function serializeCsv(dataset: Dataset): string {
  return Papa.unparse([
    dataset.headers.map((value) => safeCell(value, false)),
    ...dataset.rows.map((row) => row.map((value) => safeCell(value, true))),
  ], { newline: '\r\n', quotes: (value) => value === '' });
}
