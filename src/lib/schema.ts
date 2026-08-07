import { z } from 'zod';

/**
 * Build-time validation. NEVER imported by an island.
 *
 * Zod runs here at build time, where it costs the visitor nothing and its
 * expressiveness is worth having. Importing it into a hydrated island put
 * 28.64 KB of JavaScript on a page with a 15 KB budget — roughly double — so
 * client-side parsing lives in lib/params.ts and is dependency-free.
 *
 * If you find yourself importing this file from `components/`, that is the
 * mistake. Use lib/params.ts.
 *
 * Content frontmatter is validated separately in src/content.config.ts.
 */

/** A cited source, mirroring the content schema so data files match pages. */
export const sourceRef = z.object({
  label: z.string().min(3),
  // Zod 4: `z.url()`, not the deprecated `z.string().url()`.
  url: z.url(),
  retrieved: z.coerce.date(),
});

/**
 * Every generated file in src/data/ must carry its provenance.
 *
 * Validated at build time so a malformed figure fails the build rather than
 * reaching production (CLAUDE.md rule 7).
 */
export const generatedData = z.object({
  generatedAt: z.coerce.date(),
  sources: z.array(sourceRef).min(1),
});

export type SourceRef = z.infer<typeof sourceRef>;
export type GeneratedData = z.infer<typeof generatedData>;
