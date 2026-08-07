import { describe, expect, it } from 'vitest';
import { generatedData, sourceRef } from '../../src/lib/schema';

/**
 * Build-time schemas.
 *
 * These never reach a browser — they validate generated data files so a
 * malformed figure fails the build rather than reaching production
 * (CLAUDE.md rule 7). The URL-parameter tests that used to live here moved to
 * params.test.ts when client-side parsing was rewritten without Zod.
 */

const validSource = {
  label: 'Bank of England Bank Rate',
  url: 'https://www.bankofengland.co.uk/boeapps/database/Bank-Rate.asp',
  retrieved: '2026-08-07',
};

describe('sourceRef', () => {
  it('accepts a fully cited source', () => {
    const parsed = sourceRef.parse(validSource);
    expect(parsed.label).toBe('Bank of England Bank Rate');
    expect(parsed.retrieved).toBeInstanceOf(Date);
  });

  it('rejects a source with no retrieval date', () => {
    // An undated figure is the failure the freshness claim exists to prevent.
    const { retrieved: _omitted, ...undated } = validSource;
    expect(sourceRef.safeParse(undated).success).toBe(false);
  });

  it('rejects a placeholder URL', () => {
    expect(sourceRef.safeParse({ ...validSource, url: 'TODO' }).success).toBe(false);
    expect(sourceRef.safeParse({ ...validSource, url: '' }).success).toBe(false);
  });

  it('rejects a label too short to identify anything', () => {
    expect(sourceRef.safeParse({ ...validSource, label: 'x' }).success).toBe(false);
  });
});

describe('generatedData', () => {
  it('accepts a generated file carrying its provenance', () => {
    const parsed = generatedData.parse({
      generatedAt: '2026-08-07T00:00:00Z',
      sources: [validSource],
    });
    expect(parsed.sources).toHaveLength(1);
  });

  it('rejects a generated file with no sources at all', () => {
    // CLAUDE.md: never invent a rate, threshold or cap. A data file with an
    // empty sources array is an invented figure with extra steps.
    expect(
      generatedData.safeParse({ generatedAt: '2026-08-07T00:00:00Z', sources: [] })
        .success,
    ).toBe(false);
  });

  it('rejects a generated file with no timestamp', () => {
    expect(generatedData.safeParse({ sources: [validSource] }).success).toBe(false);
  });
});
