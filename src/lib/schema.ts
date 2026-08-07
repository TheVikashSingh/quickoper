import { z } from 'zod';

/**
 * Runtime validation for anything crossing a trust boundary.
 *
 * Two callers:
 *   1. URL query parameters (CLAUDE.md rule 11) — attacker-controlled.
 *   2. Generated files in src/data/ — validated at build so a malformed figure
 *      fails the build rather than reaching production.
 *
 * Content frontmatter is validated separately in src/content.config.ts using the
 * copy of Zod that `astro:content` re-exports. Do not mix the two.
 */

/**
 * A finite, non-NaN number parsed from a URL parameter.
 *
 * Deliberately strict: `Number('')` is 0 and `Number('  12  ')` is 12, both of
 * which would silently produce a plausible-looking wrong answer. A calculator
 * that quietly computes the wrong thing is worse than one that resets.
 */
export const urlNumber = (min: number, max: number) =>
  z
    .string()
    .trim()
    .min(1)
    .regex(/^-?\d+(\.\d+)?$/, 'digits only')
    .transform(Number)
    .refine(Number.isFinite, 'not finite')
    .refine((n) => n >= min && n <= max, `out of range [${min}, ${max}]`);

/**
 * Parse a URLSearchParams against a schema, falling back to defaults on ANY
 * failure. Never throws, never echoes the offending value back to the page.
 *
 * Rule 11: a malformed parameter resets to the default and is not reflected.
 */
export function parseParams<T extends z.ZodType>(
  schema: T,
  params: URLSearchParams,
  fallback: z.infer<T>,
): z.infer<T> {
  const result = schema.safeParse(Object.fromEntries(params));
  return result.success ? result.data : fallback;
}

/** A cited source, mirroring the content schema so data files match pages. */
export const sourceRef = z.object({
  label: z.string().min(3),
  // Zod 4: `z.url()`, not the deprecated `z.string().url()`.
  url: z.url(),
  retrieved: z.coerce.date(),
});

/** Every generated file in src/data/ must carry its provenance. */
export const generatedData = z.object({
  generatedAt: z.coerce.date(),
  sources: z.array(sourceRef).min(1),
});

export type SourceRef = z.infer<typeof sourceRef>;
