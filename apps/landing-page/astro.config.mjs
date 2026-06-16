// @ts-check
import { defineConfig, fontProviders } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';
import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';
import sentry from '@sentry/astro';

import react from '@astrojs/react';

import tailwindcss from '@tailwindcss/vite';

// https://astro.build/config
export default defineConfig({
  site: 'https://mcp-b.ai',
  output: 'server',
  prefetch: { defaultStrategy: 'hover', prefetchAll: false },
  build: { inlineStylesheets: 'auto' },

  fonts: [
    {
      name: 'Inter',
      cssVariable: '--font-sans',
      provider: fontProviders.fontsource(),
    },
    {
      name: 'JetBrains Mono',
      cssVariable: '--font-mono',
      provider: fontProviders.fontsource(),
    },
  ],

  markdown: {
    shikiConfig: {
      themes: {
        light: 'github-light',
        dark: 'github-dark',
      },
    },
  },

  integrations: [
    mdx(),
    sitemap({
      filter: (page) => !page.includes('/api/'),
    }),
    sentry({
      project: 'mcp-b-landing-page',
      org: 'mcp-b-h2',
      authToken: process.env.SENTRY_AUTH_TOKEN,
    }),
    react(),
  ],
  adapter: cloudflare(),

  vite: {
    plugins: [tailwindcss()],
  },
});
