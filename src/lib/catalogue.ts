/**
 * One registry of every page this site advertises, and which vertical it
 * belongs to.
 *
 * ─── Why this exists ────────────────────────────────────────────────────────
 *
 * The tool list was written out by hand in four places — `index.astro`,
 * `finance/index.astro`, `machining/index.astro`, and a second hand-rolled
 * list of derivations further down `index.astro`. Each was individually
 * correct and none of them agreed about what the site contained.
 *
 * That is not a tidiness problem, it is the defect class this project keeps
 * finding: a page exists and is absent from the place something looks for it.
 * D41 (orphaned from the navigation), D50 (absent from the homepage's own
 * calculator list), D61 (absent from `llms.txt`), and then D69 built a gate
 * for the third one. The fourth instance was live when this file was written:
 * `/15-year-vs-30-year-mortgage` and `/mortgage-overpayment-timing` had
 * shipped, and neither appeared on `/finance`, the cluster hub. Between them
 * they held **six inbound internal links** and not one was from the hub, while
 * `/biweekly-mortgage-payments` had exactly one inbound link site-wide.
 *
 * D69 answered its instance with a gate. This answers the class with a
 * structure: a hub that renders from the registry cannot omit a page, because
 * there is no second list to forget. A gate catches drift after it happens;
 * a single source means the drift has nowhere to occur.
 *
 * ─── What belongs here, and what does not ───────────────────────────────────
 *
 * Here: anything the site lists as a destination — tools, references and
 * derivations, per vertical.
 *
 * NOT here: the trust and site-level pages (`/about`, `/privacy`, `/terms`,
 * `/contact`, `/methodology`, `/apps`, `/`). They are navigation, they live in
 * the footer and the masthead, and they are not part of any vertical's
 * catalogue. `SITE_LEVEL` below names them for the gates, which need to know
 * what is deliberately outside a vertical rather than accidentally missing
 * from one.
 *
 * ─── Figures are deliberately absent from these summaries ───────────────────
 *
 * Two of the existing derivation summaries quote a computed number, and both
 * were typed by hand. D47, D55 and D62 are each an instance of the same
 * failure — a true number in a false sentence, or a number that drifted from
 * the page that computes it, passing every gate because no checker reads
 * English. New entries here describe the finding instead of quoting its
 * output. The page itself computes; a catalogue summary does not need to.
 */

export type Vertical = 'finance' | 'machining';

/**
 * What kind of destination this is, which decides how the gates treat it.
 *
 *   calculator — ships an island, carries `WebApplication` structured data,
 *                must appear in the homepage list and must carry a Related
 *                block (rule 8).
 *   reference  — a tool on its hub, but no island and no JavaScript. The drill
 *                size chart is the only one: it is a printable sheet, so it is
 *                listed beside the calculators but asserting `WebApplication`
 *                on it would be false.
 *   derivation — an article that computes something and shows its working
 *                (D57). Zero JavaScript.
 */
export type Kind = 'calculator' | 'reference' | 'derivation';

export interface Entry {
  href: string;
  title: string;
  /**
   * Two or three words, for the button row in the homepage hero where the full
   * title will not fit. Calculators only — nothing else is listed there.
   */
  short?: string;
  summary: string;
  /** Optional qualifying line — jurisdiction, convention, what is not modelled. */
  detail?: string;
  vertical: Vertical;
  kind: Kind;
}

/**
 * The verticals, in the order the homepage presents them.
 *
 * `label` is the divider on the homepage. It is rendered as a NON-HEADING
 * element on purpose: `check-links.mjs` captures the homepage's calculator
 * list as everything between `<h2>Calculators</h2>` and the next heading of
 * the same or higher level, so an `<h3>` divider would truncate the capture
 * and every calculator listed after it would report as missing. The section
 * has exactly one `<h2>`, and the verticals are separated by styled text.
 */
export const VERTICALS: readonly {
  id: Vertical;
  label: string;
  hub: string;
  hubLabel: string;
}[] = [
  { id: 'finance', label: 'Money', hub: '/finance', hubLabel: 'All money tools' },
  {
    id: 'machining',
    label: 'Shop floor',
    hub: '/machining',
    hubLabel: 'All machining tools',
  },
];

/**
 * Pages that belong to the site rather than to a vertical.
 *
 * The gates read this to tell "deliberately outside every vertical" from
 * "missing from the one it should be in".
 */
export const SITE_LEVEL: readonly string[] = [
  '/',
  '/about',
  '/apps',
  '/contact',
  '/methodology',
  '/privacy',
  '/terms',
  '/verify',
];

export const CATALOGUE: readonly Entry[] = [
  // ── Finance tools ──────────────────────────────────────────────────────────
  {
    href: '/finance/debt-payoff-calculator',
    title: 'Debt payoff — avalanche vs snowball',
    short: 'Debt payoff',
    summary:
      'Compare both methods against paying only the minimums. Full month-by-month schedule, chart, spreadsheet and printable PDF.',
    detail: 'Works in any currency. No jurisdiction rules involved.',
    vertical: 'finance',
    kind: 'calculator',
  },
  {
    href: '/finance/mortgage-overpayment-calculator',
    title: 'Mortgage overpayment — what paying extra removes',
    short: 'Mortgage overpayment',
    summary:
      'See exactly what an extra monthly payment takes off a mortgage, in months and in interest. Full schedule, chart, spreadsheet and printable PDF.',
    detail:
      'US fixed-rate convention. The required payment matches the published figure to the cent.',
    vertical: 'finance',
    kind: 'calculator',
  },
  {
    href: '/finance/uk-early-repayment-charge-calculator',
    title: 'UK early repayment charge — is the charge worth paying?',
    short: 'UK repayment charge',
    summary:
      'What an overpayment charge costs against the interest the overpayment removes, split into the part your fixed rate guarantees and the part that assumes it holds. Full schedule, chart and spreadsheet.',
    detail:
      'United Kingdom. Your allowance and charge are inputs — no lender’s terms are assumed.',
    vertical: 'finance',
    kind: 'calculator',
  },
  {
    href: '/finance/coast-fire-calculator',
    title: 'Coast FIRE — when saving becomes optional',
    short: 'Coast FIRE',
    summary:
      'How much you need invested today for it to reach your retirement target on its own. Year-by-year projection, chart, spreadsheet and printable PDF.',
    detail: 'Everything in today’s money. Works in any currency.',
    vertical: 'finance',
    kind: 'calculator',
  },

  // ── Finance derivations ────────────────────────────────────────────────────
  {
    href: '/minimum-payments',
    title: 'How long minimum payments take, and when they never finish',
    summary:
      'the one line that decides whether a card ever clears, and the balances where it does not',
    vertical: 'finance',
    kind: 'derivation',
  },
  {
    href: '/credit-card-interest',
    title: 'How credit card interest is actually calculated',
    summary: 'the daily periodic rate, and why a stated APR is not what a card charges',
    vertical: 'finance',
    kind: 'derivation',
  },
  {
    href: '/biweekly-mortgage-payments',
    title: 'Biweekly mortgage payments: what the thirteenth payment does',
    summary:
      'why 26 half-payments is 13 monthly ones, and what that one extra payment removes',
    vertical: 'finance',
    kind: 'derivation',
  },
  {
    href: '/mortgage-overpayment-timing',
    title: 'What an extra payment does in year one versus year twenty',
    summary:
      'the same money, several times the effect, decided by how much term is left in front of it',
    vertical: 'finance',
    kind: 'derivation',
  },
  {
    href: '/15-year-vs-30-year-mortgage',
    title: 'What a 15-year mortgage costs against a 30-year',
    summary:
      'both loans are charged the same interest in month one, and the term turns out not to be a property of the product',
    vertical: 'finance',
    kind: 'derivation',
  },
  {
    href: '/monthly-return-rate',
    title: 'Why a 7% return is not 0.583% a month',
    summary:
      'the division that overstates a thirty-year projection, and the correct conversion',
    vertical: 'finance',
    kind: 'derivation',
  },
  {
    href: '/withdrawal-rate',
    title: 'Where the 4% rule comes from',
    summary: 'what Bengen and the Trinity Study actually tested, and what they did not',
    vertical: 'finance',
    kind: 'derivation',
  },
  {
    href: '/coast-number',
    title: 'What a coast number is, and what it is not',
    summary: 'the assumption that moves the figure more than any other',
    vertical: 'finance',
    kind: 'derivation',
  },

  // ── Machining tools ────────────────────────────────────────────────────────
  {
    href: '/machining/tap-drill-calculator',
    title: 'Tap drill — the drill you actually own',
    short: 'Tap drill',
    summary:
      'Enter a thread, get the drill from a real index and the thread engagement that drill genuinely produces. Metric-first, with the whole neighbourhood shown rather than one rounded number.',
    detail: 'Metric and fractional inch. Works offline once loaded.',
    vertical: 'machining',
    kind: 'calculator',
  },
  {
    href: '/machining/feeds-and-speeds-calculator',
    title: 'Feeds and speeds — milling and turning, treated the same',
    short: 'Feeds and speeds',
    summary:
      'Spindle speed, feed in both mm/rev and mm/min, removal rate, chip thinning and cutting power, with every substituted value shown.',
    detail: 'No material dropdown. Your cutting data comes from your tooling sheet.',
    vertical: 'machining',
    kind: 'calculator',
  },
  {
    href: '/machining/drill-size-chart',
    title: 'Drill size chart — the whole index, on one sheet',
    summary:
      'Every metric drill from 0.5 to 13.0 mm and every fractional inch drill from 1/64 to 1/2, with both units on every row. Generated from the series definitions, so no diameter on it is a value anyone transcribed.',
    detail: 'No JavaScript, prints on A4, and says which series it does not carry.',
    vertical: 'machining',
    kind: 'reference',
  },
];

/** Everything a vertical's hub lists as a tool: calculators and references. */
export function toolsIn(vertical: Vertical): Entry[] {
  return CATALOGUE.filter(
    (entry) =>
      entry.vertical === vertical &&
      (entry.kind === 'calculator' || entry.kind === 'reference'),
  );
}

/** Only the pages that ship an island. This is what the gates assert on. */
export function calculatorsIn(vertical: Vertical): Entry[] {
  return CATALOGUE.filter(
    (entry) => entry.vertical === vertical && entry.kind === 'calculator',
  );
}

/** Every calculator on the site, across all verticals. */
export function calculators(): Entry[] {
  return CATALOGUE.filter((entry) => entry.kind === 'calculator');
}

export function derivationsIn(vertical: Vertical): Entry[] {
  return CATALOGUE.filter(
    (entry) => entry.vertical === vertical && entry.kind === 'derivation',
  );
}

/** Every href the catalogue knows, for the gates to check the build against. */
export function catalogued(): string[] {
  return CATALOGUE.map((entry) => entry.href);
}
