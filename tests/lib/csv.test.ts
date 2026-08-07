import { describe, expect, it } from 'vitest';
import { escapeCsvField, toCsv, type CsvColumn } from '../../src/lib/csv';

/**
 * Sources:
 *   - RFC 4180 §2 for quoting and CRLF line endings.
 *   - OWASP "CSV Injection" for the formula-trigger mitigation.
 */

describe('escapeCsvField — RFC 4180 quoting', () => {
  it('leaves ordinary fields untouched', () => {
    expect(escapeCsvField('Visa card')).toBe('Visa card');
    expect(escapeCsvField(1234)).toBe('1234');
    expect(escapeCsvField('')).toBe('');
  });

  it('quotes fields containing a comma, quote, CR or LF', () => {
    expect(escapeCsvField('Card, personal')).toBe('"Card, personal"');
    expect(escapeCsvField('line1\nline2')).toBe('"line1\nline2"');
    expect(escapeCsvField('line1\r\nline2')).toBe('"line1\r\nline2"');
  });

  it('doubles embedded quotes', () => {
    expect(escapeCsvField('the "big" card')).toBe('"the ""big"" card"');
  });
});

describe('escapeCsvField — formula injection', () => {
  it('neutralises every character a spreadsheet treats as a formula', () => {
    // A debt name is user input. The file may be emailed to someone else, and
    // Excel would execute this on open. One apostrophe defuses it.
    expect(escapeCsvField("=cmd|' /c calc'!A1")).toBe("'=cmd|' /c calc'!A1");
    expect(escapeCsvField('+1')).toBe("'+1");
    expect(escapeCsvField('-1+2')).toBe("'-1+2");
    expect(escapeCsvField('@SUM(A1)')).toBe("'@SUM(A1)");
    // A tab needs the formula prefix but NOT quoting: RFC 4180 only requires
    // quoting for the delimiter, quote, CR and LF, and this is a comma-
    // delimited file. Prefixing alone defuses it.
    expect(escapeCsvField('\tinjected')).toBe("'\tinjected");
  });

  it('does not corrupt genuine negative numbers, which are quoted-and-prefixed', () => {
    // A negative figure is legitimate in a principal column when a minimum does
    // not cover interest. It is prefixed too — correctness of the DEFENCE beats
    // prettiness of the output, and the value stays readable.
    expect(escapeCsvField(-1234)).toBe("'-1234");
  });
});

describe('toCsv', () => {
  interface Row {
    month: number;
    name: string;
    amount: number;
  }

  const columns: CsvColumn<Row>[] = [
    { header: 'Month', value: (r) => r.month },
    { header: 'Debt', value: (r) => r.name },
    { header: 'Payment', value: (r) => r.amount },
  ];

  it('emits a header row and CRLF line endings', () => {
    const csv = toCsv([{ month: 1, name: 'Visa', amount: 250 }], columns);
    expect(csv).toBe('Month,Debt,Payment\r\n1,Visa,250');
  });

  it('handles an empty row set without losing the header', () => {
    expect(toCsv([], columns)).toBe('Month,Debt,Payment');
  });

  it('escapes headers as well as values', () => {
    const csv = toCsv([], [{ header: 'Interest, monthly', value: () => '' }]);
    expect(csv).toBe('"Interest, monthly"');
  });

  it('refuses to produce a file with no columns', () => {
    expect(() => toCsv([{ month: 1, name: 'x', amount: 1 }], [])).toThrow();
  });

  it('round-trips a row containing every hazardous character at once', () => {
    const csv = toCsv([{ month: 1, name: '=A1,"B"\n', amount: -5 }], columns);
    expect(csv).toBe('Month,Debt,Payment\r\n1,"\'=A1,""B""\n",\'-5');
  });
});
