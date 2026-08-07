// @ts-check
import { defineConfig } from 'astro/config';
import preact from '@astrojs/preact';
import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';
import tailwindcss from '@tailwindcss/vite';

// NOTE for future edits (see CLAUDE.md "Version reality check"):
// Tailwind v4 is a VITE PLUGIN, not an Astro integration. `@astrojs/tailwind`
// is deprecated and must not be reintroduced. Design tokens live in the
// `@theme` block in src/styles/global.css, never in a tailwind.config file.

export default defineConfig({
  site: 'https://quickoper.com',
  output: 'static',
  trailingSlash: 'never',

  integrations: [
    // compat: true maps react/react-dom imports onto Preact, so JSX is written
    // exactly as React would be at roughly one eighth of the bytes. React itself
    // is ~45KB gzipped and would exceed the entire 15KB budget on its own.
    preact({ compat: true }),
    mdx(),
    sitemap(),
  ],

  vite: {
    plugins: [tailwindcss()],
  },

  build: {
    // Content-hashed asset names so everything is immutably cacheable.
    assets: '_assets',
  },

  prefetch: {
    prefetchAll: false,
  },
});
