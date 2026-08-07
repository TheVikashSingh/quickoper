/**
 * CSV export, generated entirely in the browser.
 *
 * The export is not a nicety. A schedule someone can take away is one of the
 * things a chat window structurally cannot hand over (CLAUDE.md rule 10), and
 * generating it client-side keeps the privacy claim literally true: the numbers
 * are never sent anywhere to be turned into a file.
 *
 * `toCsv` is pure and tested. `downloadCsv` is the thin DOM wrapper.
 */

export interface CsvColumn<Row> {
  readonly header: string;
  readonly value: (row: Row) => string | number;
}

/**
 * Characters that make a spreadsheet treat a cell as a formula.
 *
 * A debt named `=cmd|' /c calc'!A1` would execute on open in Excel. Our inputs
 * come from the user's own keyboard, so this is not a remote attack — but a
 * file they email to someone else is, and the mitigation costs one character.
 * Prefixing with an apostrophe is the standard defence (OWASP CSV Injection).
 */
const FORMULA_TRIGGERS = ['=', '+', '-', '@', '\t', '\r'];

/** RFC 4180: quote a field if it contains a comma, quote, CR or LF. */
const NEEDS_QUOTING = /[",\r\n]/;

export function escapeCsvField(value: string | number): string {
  let field = String(value);

  if (field.length > 0 && FORMULA_TRIGGERS.includes(field[0] as string)) {
    field = `'${field}`;
  }

  if (NEEDS_QUOTING.test(field)) {
    return `"${field.replaceAll('"', '""')}"`;
  }
  return field;
}

/**
 * Render rows to an RFC 4180 CSV string.
 *
 * CRLF line endings, because that is what the specification says and what
 * Excel expects; every other tool accepts them.
 */
export function toCsv<Row>(
  rows: readonly Row[],
  columns: readonly CsvColumn<Row>[],
): string {
  if (columns.length === 0) {
    throw new Error('toCsv() requires at least one column.');
  }

  const lines: string[] = [columns.map((c) => escapeCsvField(c.header)).join(',')];

  for (const row of rows) {
    lines.push(columns.map((c) => escapeCsvField(c.value(row))).join(','));
  }

  return lines.join('\r\n');
}

/**
 * Trigger a download of `content` as `filename`.
 *
 * The BOM is deliberate: without it Excel on Windows reads UTF-8 as the local
 * ANSI codepage and mangles every currency symbol.
 */
export function downloadCsv(filename: string, content: string): void {
  const blob = new Blob([`﻿${content}`], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.style.display = 'none';
  document.body.append(link);
  link.click();
  link.remove();

  // Revoking immediately can cancel the download in some browsers.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
