import { playwright } from 'vite-plus/test/browser-playwright';
import { defineConfig } from 'vite-plus';

const isCI = process.env.CI === 'true';

export default defineConfig({
  pack: {
    entry: ['src/index.ts'],
    platform: 'browser',
    dts: true,
    minify: process.env.NODE_ENV === 'prod',
    sourcemap: true,
    clean: true,
    treeshake: true,
    // Don't bundle peer dependencies or type-only dependencies
    external: [
      'react',
      'react/jsx-runtime',
      'react-dom',
      'zod',
      '@mcp-b/webmcp-types',
      'zod-to-json-schema',
    ],
    tsconfig: './tsconfig.json',
  },
  test: {
    // Use browser mode for real DOM, React rendering, and navigator testing
    browser: {
      enabled: true,
      provider: playwright({
        launchOptions: process.env.CHROME_BIN ? { executablePath: process.env.CHROME_BIN } : {},
      }),
      instances: [{ browser: 'chromium' }],
      headless: true,
    },
    // Test file patterns
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    // Exclude build output
    exclude: ['dist', 'node_modules'],
    // Enable globals for cleaner test syntax
    globals: true,
    // Limit concurrency in CI to prevent resource exhaustion
    maxConcurrency: isCI ? 2 : 10,
    fileParallelism: !isCI,
  },
});
