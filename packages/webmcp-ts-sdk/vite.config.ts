import { playwright } from 'vite-plus/test/browser-playwright';
import { defineConfig } from 'vite-plus';

export default defineConfig({
  pack: {
    entry: ['src/index.ts'],
    dts: true,
    format: ['esm'],
    sourcemap: true,
    clean: true,
    treeshake: true,
    minify: false,
    target: 'esnext',
    platform: 'browser',
    deps: {
      neverBundle: [/^@mcp-b\//],
    },
    tsconfig: './tsconfig.json',
  },
  test: {
    browser: {
      enabled: true,
      provider: playwright({
        launchOptions: process.env.CHROME_BIN ? { executablePath: process.env.CHROME_BIN } : {},
      }),
      instances: [{ browser: 'chromium' }],
      headless: true,
    },
  },
});
