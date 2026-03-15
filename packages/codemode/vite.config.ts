import { playwright } from 'vite-plus/test/browser-playwright';
import { defineConfig } from 'vite-plus';

const isCI = process.env.CI === 'true';

export default defineConfig({
  pack: {
    entry: ['src/index.ts', 'src/ai.ts', 'src/browser.ts', 'src/acorn.ts', 'src/webmcp.ts'],
    format: ['esm'],
    dts: true,
    splitting: false,
    sourcemap: true,
    clean: true,
    treeshake: true,
    minify: false,
    target: 'esnext',
    platform: 'browser',
    external: [/^ai$/, /^zod/, /^@mcp-b\//, /^acorn$/],
    tsconfig: './tsconfig.json',
  },
  test: {
    browser: {
      enabled: true,
      provider: playwright({
        launchOptions: process.env.CHROME_BIN ? { executablePath: process.env.CHROME_BIN } : {},
      }),
      instances: [{ browser: 'chromium' }],
    },
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    exclude: ['dist', 'node_modules'],
    globals: true,
    maxConcurrency: isCI ? 2 : 10,
    fileParallelism: !isCI,
  },
});
