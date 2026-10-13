import { describe, expect, it } from 'vitest';
import Papa from 'papaparse';
import { analyzeDataset, cleanDataset, parseCsv, serializeCsv, validateFile, LIMITS, type Dataset } from '../src/lib/processor';

const sample = 'name,age,marks\nAsha,20,80\nRavi,,70\nAsha,20,80\nNeha,24,';

describe('CSV input', () => {
  it('reads BOM, quoted commas, escaped quotes and embedded line breaks', () => {
    expect(parseCsv('\uFEFFname,note\r\n"Asha, A.","said ""hello""\nagain"').rows)
      .toEqual([['Asha, A.', 'said "hello"\nagain']]);
  });
  it('keeps text and leading zeroes and normalizes whitespace-only cells', () => {
    expect(parseCsv('id,note\n001,   \n002,hello ').rows).toEqual([['001', ''], ['002', 'hello ']]);
  });
  it.each(['', '   \n', 'name,age', 'name,age\n\n'])('rejects empty or header-only input: %j', (text) => {
    expect(() => parseCsv(text)).toThrow();
  });
  it.each(['name,name\na,b', ' name,name \na,b', ',age\na,2', 'name,age\na,2,3', 'name,age\na', 'name,note\na,"unclosed'])('rejects malformed CSV: %j', (text) => {
    expect(() => parseCsv(text)).toThrow();
  });
  it('accepts a single column CSV and fully empty data rows', () => {
    expect(parseCsv('value\nhello').rows).toEqual([['hello']]);
    expect(parseCsv('a,b\n,').rows).toEqual([['', '']]);
  });
  it('preserves explicitly quoted empty records while ignoring physically blank lines', () => {
    expect(parseCsv('value\nhello\n\n""\nworld\n').rows).toEqual([['hello'], [''], ['world']]);
    expect(parseCsv('value\n""').rows).toEqual([['']]);
  });
  it('accepts case-insensitive CSV extensions but rejects empty, oversized or other files', () => {
    expect(() => validateFile({ name: 'DEMO.CSV', size: 10 })).not.toThrow();
    expect(() => validateFile({ name: 'data.xlsx', size: 10 })).toThrow(/CSV/);
    expect(() => validateFile({ name: 'data.csv', size: 0 })).toThrow(/empty/);
    expect(() => validateFile({ name: 'data.csv', size: LIMITS.bytes + 1 })).toThrow(/5 MB/);
  });
  it('enforces row, column, cell and byte limits', () => {
    expect(() => parseCsv('a\n' + 'x\n'.repeat(LIMITS.rows + 1))).toThrow(/rows/);
    const headers = Array.from({ length: LIMITS.columns + 1 }, (_, i) => `c${i}`).join(',');
    expect(() => parseCsv(headers + '\n' + headers)).toThrow(/columns/);
    const wide = Array.from({ length: 100 }, (_, i) => `c${i}`).join(',');
    expect(() => parseCsv(wide + '\n' + (wide + '\n').repeat(2501))).toThrow(/cells/);
    expect(() => parseCsv('a\n' + 'x'.repeat(LIMITS.bytes))).toThrow(/5 MB/);
  });
});

describe('quality report', () => {
  it('counts rows, columns, missing cells and extra duplicate rows', () => {
    const report = analyzeDataset(parseCsv(sample));
    expect(report).toMatchObject({ rows: 4, columns: 3, missingCells: 2, duplicateRows: 1, invalidNumericCells: 0 });
    expect(report.byColumn.map((c) => c.missing)).toEqual([0, 1, 1]);
  });
  it('reports numeric-invalid values only at the 80% threshold, excluding missing cells', () => {
    const report = analyzeDataset(parseCsv('number,text\n1,a\n2,b\n3,c\n4,2\noops,d\n, '));
    expect(report.byColumn[0]).toMatchObject({ type: 'numeric', missing: 1, invalid: 1 });
    expect(report.byColumn[1]).toMatchObject({ type: 'text', missing: 1, invalid: 0 });
  });
  it('does not infer leading-zero identifiers as numeric', () => {
    expect(analyzeDataset(parseCsv('id\n001\n002')).byColumn[0].type).toBe('text');
  });
  it('rejects Infinity, hexadecimal and non-finite exponents as numeric values', () => {
    const report = analyzeDataset(parseCsv('value\n1\n2\n3\n4\nInfinity'));
    expect(report.byColumn[0].invalid).toBe(1);
    expect(analyzeDataset(parseCsv('value\n0x12\n1e999')).byColumn[0].type).toBe('text');
  });
  it('handles empty datasets without division by zero', () => {
    expect(analyzeDataset({ headers: [], rows: [] })).toMatchObject({ rows: 0, columns: 0, missingCells: 0, duplicateRows: 0, byColumn: [] });
  });
});

describe('cleaning', () => {
  it('deduplicates before filling medians and never mutates the original', () => {
    const original = parseCsv(sample);
    const snapshot = structuredClone(original);
    const result = cleanDataset(original);
    expect(result.dataset.rows).toEqual([['Asha', '20', '80'], ['Ravi', '22', '70'], ['Neha', '24', '75']]);
    expect(result).toMatchObject({ removedRows: 1, filledCells: 2 });
    expect(original).toEqual(snapshot);
    expect(result.dataset).not.toBe(original);
  });
  it('fills text mode, breaks ties by first occurrence, and leaves empty columns empty', () => {
    const result = cleanDataset(parseCsv('name,city,empty\na,Pune,\nb,Mumbai,\nc,,'));
    expect(result.dataset.rows[2]).toEqual(['c', 'Pune', '']);
    expect(analyzeDataset(result.dataset).missingCells).toBe(3);
  });
  it('retains invalid numeric text and fills only blanks with median', () => {
    const result = cleanDataset(parseCsv('value\n10\n20\n30\n40\nwrong\n" "'));
    expect(result.dataset.rows).toEqual([['10'], ['20'], ['30'], ['40'], ['wrong'], ['25']]);
  });
  it('honors both disabled options while returning an independent copy', () => {
    const input = parseCsv(sample);
    const result = cleanDataset(input, { fillMissing: false, removeDuplicates: false });
    expect(result.dataset).toEqual(input);
    expect(result.dataset.rows[0]).not.toBe(input.rows[0]);
    expect(result).toMatchObject({ filledCells: 0, removedRows: 0 });
  });
  it('honors each option independently', () => {
    expect(cleanDataset(parseCsv(sample), { fillMissing: false, removeDuplicates: true })).toMatchObject({ filledCells: 0, removedRows: 1 });
    expect(cleanDataset(parseCsv(sample), { fillMissing: true, removeDuplicates: false })).toMatchObject({ filledCells: 2, removedRows: 0 });
  });
  it('removes duplicates introduced by filling when enabled', () => {
    const result = cleanDataset(parseCsv('name,age\nAsha,20\nAsha,'));
    expect(result.dataset.rows).toEqual([['Asha', '20']]);
    expect(result).toMatchObject({ filledCells: 1, removedRows: 1 });
  });
  it('calculates finite medians for large finite values', () => {
    const result = cleanDataset(parseCsv('name,value\na,1e308\nb,1e308\nc,'));
    expect(result.dataset.rows[2][1]).toBe('1e+308');
  });
  it('handles empty datasets', () => {
    expect(cleanDataset({ headers: [], rows: [] }).dataset.rows).toEqual([]);
  });
});

describe('CSV export', () => {
  it('round-trips an empty single-column record without losing it', () => {
    const input: Dataset = { headers: ['value'], rows: [['hello'], ['']] };
    expect(parseCsv(serializeCsv(input))).toEqual(input);
  });
  it('round-trips commas, quotes and newlines without adding a row index', () => {
    const input = parseCsv('name,note\n"A, B","say ""hi""\nagain"');
    expect(parseCsv(serializeCsv(input))).toEqual(input);
  });
  it('escapes formula-like strings and headers, preserves real negative numbers', () => {
    const data: Dataset = { headers: ['=header', 'value'], rows: [['=SUM(1,2)', '-12'], [' @SUM(A1)', '+cmd'], ['\tcommand', '-cmd']] };
    const exported = Papa.parse<string[]>(serializeCsv(data)).data;
    expect(exported).toEqual([["'=header", 'value'], ["'=SUM(1,2)", '-12'], ["' @SUM(A1)", "'+cmd"], ["'\tcommand", "'-cmd"]]);
  });
});
