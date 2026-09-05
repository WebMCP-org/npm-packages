import { playwright } from 'vite-plus/test/browser-playwright';
import { defineConfig } from 'vite-plus';

const isCI = process.env.CI === 'true';
const native = process.env.WEBMCP_NATIVE === '1';

export default defineConfig({
  // Both test entries must share the same prebundled React instance.
  optimizeDeps: { include: ['vitest-browser-react', 'vitest-browser-react/pure'] },
  pack: {
    entry: ['src/index.ts'],
    platform: 'browser',
    dts: true,
    minify: process.env.NODE_ENV === 'prod',
    sourcemap: true,
    clean: true,
    treeshake: true,
    deps: {
      neverBundle: [/^react(?:\/.*)?$/, /^react-dom(?:\/.*)?$/],
    },
    tsconfig: './tsconfig.json',
  },
  test: {
    // Use browser mode for real DOM, React rendering, and navigator testing
    browser: {
      enabled: true,
      provider: playwright({
        launchOptions: {
          ...(process.env.CHROME_BIN ? { executablePath: process.env.CHROME_BIN } : {}),
          args: [native ? '--enable-features=WebMCP' : '--disable-features=WebMCP'],
        },
      }),
      instances: [{ browser: 'chromium' }],
      headless: true,
    },
    // Test file patterns
    include: native ? ['src/useWebMCP.native.ts'] : ['src/**/*.{test,spec}.{ts,tsx}'],
    // Exclude build output
    exclude: ['dist', 'node_modules'],
    // Enable globals for cleaner test syntax
    globals: true,
    // Limit concurrency in CI to prevent resource exhaustion
    maxConcurrency: isCI ? 2 : 10,
    fileParallelism: !isCI,
  },
});
