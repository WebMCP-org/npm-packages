import { playwright } from 'vite-plus/test/browser-playwright';
import { defineConfig } from 'vite-plus';

const isCI = process.env.CI === 'true';
const native = process.env.WEBMCP_NATIVE === '1';
const launchArgs = [native ? '--enable-features=WebMCP' : '--disable-features=WebMCP'];
const launchOptions = process.env.CHROME_BIN
  ? { executablePath: process.env.CHROME_BIN, args: launchArgs }
  : { args: launchArgs };

export default defineConfig({
  // Prebundle every React test entry to avoid reloads that invalidate render counts.
  optimizeDeps: {
    include: [
      'react-dom',
      'react/jsx-dev-runtime',
      'vitest-browser-react',
      'vitest-browser-react/pure',
    ],
  },
  pack: {
    entry: ['src/index.ts', 'src/internal.ts'],
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
    // Use browser mode for real DOM and React rendering
    browser: {
      enabled: true,
      provider: playwright({
        launchOptions,
      }),
      instances: [{ browser: 'chromium' }],
      headless: true,
    },
    include: [native ? 'src/useWebMCP.native.test.ts' : 'src/**/*.{test,spec}.{ts,tsx}'],
    exclude: native ? [] : ['src/useWebMCP.native.test.ts'],
    // Enable globals for cleaner test syntax
    globals: true,
    // Limit concurrency in CI to prevent resource exhaustion
    maxConcurrency: isCI ? 2 : 10,
    fileParallelism: !isCI,
  },
});
