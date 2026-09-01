/**
 * The drill size chart as a static CSV, generated at build time.
 *
 * A download that costs no JavaScript. The tap drill calculator builds its CSV
 * in the browser because the rows depend on what the user typed; this chart is
 * the same rows for everyone, so the file can simply exist — which keeps the
 * page at the 0.53 KB content-page floor rather than paying a hydration bundle
 * to serialise a table it had already printed.
 */

import type { APIRoute } from 'astro';
import { chartCsv } from '../../lib/calc/drill-chart';

export const prerender = true;

export const GET: APIRoute = () =>
  new Response(chartCsv(), {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': 'attachment; filename="quickoper-drill-sizes.csv"',
    },
  });
