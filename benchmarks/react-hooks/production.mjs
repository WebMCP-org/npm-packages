import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { cpus, tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build, preview, version } from 'vite-plus';

const directory = dirname(fileURLToPath(import.meta.url));
const root = resolve(directory, '../..');
const require = createRequire(resolve(root, 'packages/usewebmcp/package.json'));
const { chromium } = require('playwright');
const outDir = mkdtempSync(join(tmpdir(), 'webmcp-production-'));
const libraries = ['usewebmcp', '@mcp-b/react-webmcp', 'webmcp-react', 'use-webmcp-tool'];
const packages = JSON.parse(
  readFileSync(resolve(directory, 'package.json'), 'utf8')
).devDependencies;
for (const [name, expected] of Object.entries(packages)) {
  assert.equal(
    JSON.parse(readFileSync(resolve(directory, 'node_modules', name, 'package.json'), 'utf8'))
      .version,
    expected
  );
}
const cases = [1, 10, 100].flatMap((toolCount) =>
  [1, 100].flatMap((fields) =>
    ['stable', 'inline'].map((schemaMode) => ({ toolCount, fields, schemaMode }))
  )
);
const config = {
  configFile: false,
  root: directory,
  logLevel: 'error',
  build: {
    outDir,
    target: 'es2022',
    rolldownOptions: { input: resolve(directory, 'production.html') },
  },
};
let browser;
let server;
try {
  await build({
    ...config,
    mode: 'production',
    resolve: {
      dedupe: ['react', 'react-dom'],
      alias: {
        usewebmcp: resolve(root, 'packages/usewebmcp/dist/index.js'),
        '@mcp-b/react-webmcp': resolve(root, 'packages/react-webmcp/dist/index.js'),
      },
    },
  });
  server = await preview({
    ...config,
    preview: {
      host: '127.0.0.1',
      port: 0,
      headers: {
        'Cross-Origin-Opener-Policy': 'same-origin',
        'Cross-Origin-Embedder-Policy': 'require-corp',
      },
    },
  });
  browser = await chromium.launch({
    headless: true,
    ...(process.env.CHROME_BIN ? { executablePath: process.env.CHROME_BIN } : {}),
    args: ['--enable-features=WebMCP'],
  });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/production.html`);
  await page.waitForFunction(() => typeof window.runProductionCase === 'function');
  assert(await page.evaluate(() => crossOriginIsolated), 'Use an isolated high-resolution clock');
  const samples = [];
  for (let trial = 0; trial <= 5; trial += 1) {
    for (const [index, scenario] of cases.entries()) {
      for (let offset = 0; offset < libraries.length; offset += 1) {
        const library = libraries[(trial + index + offset) % libraries.length];
        const sample = await page
          .evaluate((scenario) => window.runProductionCase(scenario), { ...scenario, library })
          .catch((cause) => {
            throw new Error(JSON.stringify({ trial, ...scenario, library }), { cause });
          });
        if (trial > 0) samples.push({ trial, ...sample });
        assert.deepEqual(errors, [], 'Browser errors invalidate measurements');
      }
    }
    console.log(trial === 0 ? 'Warmup complete' : `Trial ${trial}/5 complete`);
  }
  assert.equal(samples.length, 240);
  const report = {
    recordedAt: new Date().toISOString(),
    sourceCommit: execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: root,
      encoding: 'utf8',
    }).trim(),
    browser: browser.version(),
    platform: `${process.platform}/${process.arch}`,
    cpu: cpus()[0]?.model,
    packages,
    vite: version,
    mode: 'production',
    crossOriginIsolated: true,
    warmupTrials: 1,
    measuredTrials: 5,
    samples,
  };
  writeFileSync(
    resolve(directory, 'production-results.json'),
    `${JSON.stringify(report, null, 2)}\n`
  );
} finally {
  await browser?.close();
  server?.httpServer.close();
  rmSync(outDir, { recursive: true, force: true });
}
