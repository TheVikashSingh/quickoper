import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'zod';

/**
 * Content schemas.
 *
 * These are not documentation — they are a build gate. A page that omits
 * `lastVerified` or `sources` does not render as a warning; it fails the build.
 * That is the mechanism behind the "freshness" claim in the charter.
 *
 * NOTE: `z` is imported from `zod` directly. Astro 7 deprecated re-exporting it
 * from `astro:content`; importing from there emits a deprecation warning and
 * will break on removal.
 */

const source = z.object({
  label: z.string().min(3),
  // Zod 4: `z.url()`, not the deprecated `z.string().url()`.
  url: z.url(),
  /** When this source was last read. Not when the page was edited. */
  retrieved: z.coerce.date(),
});

/**
 * CLAUDE.md rule A: compute, never advise.
 *
 * Advice-shaped titles from an uncredentialed author in a YMYL category are the
 * fastest route to a helpful-content demotion. Rather than trusting this to
 * review, the shapes are rejected at build time.
 */
const ADVICE_SHAPES = [
  /^should\s+(you|i|we)\b/i,
  /^(the\s+)?best\s+way\s+to\b/i,
  /^\d+\s+(tips|ways|reasons|things)\b/i,
  /^why\s+you\s+should\b/i,
  /\bshould\s+you\s+.*\?$/i,
];

const notAdviceShaped = (value: string) =>
  !ADVICE_SHAPES.some((pattern) => pattern.test(value.trim()));

const ADVICE_MESSAGE =
  'Advice-shaped title. This site computes, it does not advise (CLAUDE.md rule A). ' +
  'Name the calculation, not a recommendation.';

const common = {
  title: z.string().min(10).max(70).refine(notAdviceShaped, ADVICE_MESSAGE),
  description: z.string().min(50).max(160),
  author: z.string().min(2),
  /** Optional credentialed reviewer. Null is honest; a fabricated name is not. */
  reviewedBy: z.string().nullable().default(null),
  publishedAt: z.coerce.date(),
  /** Enforced. An undated page is unpublishable — that is the entire point. */
  lastVerified: z.coerce.date(),
  sources: z.array(source).min(1),
  draft: z.boolean().default(false),
};

const tools = defineCollection({
  loader: glob({ base: './src/content/tools', pattern: '**/*.{md,mdx}' }),
  schema: z.object({
    ...common,
    /** Matches the island component key in src/components/calculators/. */
    calculator: z.string().min(2),
    /** 'generic' where the arithmetic is identical in every market. */
    jurisdiction: z.enum(['generic', 'us', 'uk', 'ca', 'au', 'ie']),
    currency: z.string().length(3).default('USD'),
    /** Cluster hub this tool belongs to, for hub-and-spoke internal linking. */
    cluster: z.string().min(2),
    faq: z
      .array(z.object({ q: z.string().min(10), a: z.string().min(20) }))
      .min(3)
      .max(6),
    /** 2-3 genuine internal links. Enforced so it cannot quietly become zero. */
    related: z.array(z.string()).min(2).max(3),
  }),
});

const articles = defineCollection({
  loader: glob({ base: './src/content/articles', pattern: '**/*.{md,mdx}' }),
  schema: z.object({
    ...common,
    cluster: z.string().min(2),
    related: z.array(z.string()).min(1).max(3),
  }),
});

export const collections = { tools, articles };
