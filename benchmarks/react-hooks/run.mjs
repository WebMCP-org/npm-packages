import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite-plus';

const directory = dirname(fileURLToPath(import.meta.url));
const root = resolve(directory, '../..');
const require = createRequire(resolve(root, 'packages/usewebmcp/package.json'));
const { chromium } = require('playwright');
const renderOnly = process.argv.includes('--render');
const designSystem = process.env.DESIGN_SYSTEM_DIR && resolve(process.env.DESIGN_SYSTEM_DIR);
if (renderOnly) assert(designSystem, 'Set DESIGN_SYSTEM_DIR to the design-system checkout');
const resultFile = resolve(directory, 'results.json');
const assets = resolve(root, 'apps/documentation-website/images/react-hooks');
const server = await createServer({
  configFile: false,
  root: directory,
  logLevel: 'error',
  server: {
    host: '127.0.0.1',
    port: 0,
    fs: { allow: [root, ...(designSystem ? [designSystem] : [])] },
  },
  resolve: {
    dedupe: ['react', 'react-dom'],
    alias: {
      usewebmcp: resolve(root, 'packages/usewebmcp/dist/index.js'),
      '@mcp-b/react-webmcp': resolve(root, 'packages/react-webmcp/dist/index.js'),
      ...(designSystem
        ? {
            'design-tokens': resolve(designSystem, 'packages/design-tokens/src/index.css'),
            'design-chart': resolve(
              designSystem,
              'packages/viz-components/dist/components/chart/chart.js'
            ),
            'design-chart-card': resolve(
              designSystem,
              'packages/viz-components/dist/components/chart-card/chart-card.js'
            ),
          }
        : {}),
    },
  },
  optimizeDeps: {
    entries: [renderOnly ? 'report.html' : 'index.html'],
    include: ['react', 'react-dom/client', 'webmcp-react', 'use-webmcp-tool'],
  },
});
let browser;
try {
  await server.listen();
  browser = await chromium.launch({
    headless: true,
    ...(process.env.CHROME_BIN ? { executablePath: process.env.CHROME_BIN } : {}),
    args: ['--enable-features=WebMCP'],
  });
  const page = await browser.newPage({
    viewport: { width: 1120, height: 1100 },
    deviceScaleFactor: 2,
  });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  const origin = `http://127.0.0.1:${server.httpServer.address().port}`;
  if (renderOnly) {
    await page.goto(`${origin}/report.html`);
    await page.waitForFunction(() => window.reportReady);
    mkdirSync(assets, { recursive: true });
    for (const theme of ['light', 'dark']) {
      await page.evaluate((theme) => {
        document.documentElement.dataset.theme = theme;
      }, theme);
      for (const id of ['performance', 'architecture']) {
        await page.locator(`#${id}`).screenshot({ path: resolve(assets, `${id}-${theme}.png`) });
      }
    }
    writeFileSync(
      resolve(assets, 'provenance.json'),
      JSON.stringify(
        {
          designSystemCommit: execFileSync('git', ['rev-parse', 'HEAD'], {
            cwd: designSystem,
            encoding: 'utf8',
          }).trim(),
          resultsSha256: createHash('sha256').update(readFileSync(resultFile)).digest('hex'),
          browser: browser.version(),
          viewportWidth: 1120,
          deviceScaleFactor: 2,
        },
        null,
        2
      ) + '\n'
    );
    console.log(`Exported charts to ${assets}`);
  } else {
    await page.goto(origin);
    await page.waitForFunction(() => typeof window.runBenchmarks === 'function');
    const samples = await page.evaluate(() => window.runBenchmarks());
    assert.equal(samples.length, 40);
    assert.deepEqual(errors, [], 'Browser errors invalidate the comparison');
    const report = {
      recordedAt: new Date().toISOString(),
      sourceCommit: execFileSync('git', ['rev-parse', 'HEAD'], {
        cwd: root,
        encoding: 'utf8',
      }).trim(),
      browser: browser.version(),
      platform: `${process.platform}/${process.arch}`,
      packages: JSON.parse(readFileSync(resolve(directory, 'package.json'), 'utf8'))
        .devDependencies,
      samples,
    };
    writeFileSync(resultFile, `${JSON.stringify(report, null, 2)}\n`);
    const range = (values) =>
      Math.min(...values) === Math.max(...values)
        ? String(values[0])
        : `${Math.min(...values)}–${Math.max(...values)}`;
    const table = [...new Set(samples.map((sample) => sample.library))].map((name) => {
      const rows = samples.filter((sample) => sample.library === name);
      return `| ${name} | ${range(rows.map((row) => row.parent.commits))} | ${range(rows.map((row) => row.parent.registrations))} | ${range(rows.map((row) => row.metadata.commits))} | ${rows[0].executionState ? range(rows.map((row) => row.start)) : 'N/A'} | ${rows[0].executionState ? range(rows.map((row) => row.settle)) : 'N/A'} |`;
    });
    writeFileSync(
      resolve(directory, 'RESULTS.md'),
      `# React hook measurements

Generated by \`node benchmarks/react-hooks/run.mjs\` on ${report.recordedAt.slice(0, 10)}.
React ${report.packages.react}, Chrome ${report.browser}, ${report.platform}.
Our hooks: source commit \`${report.sourceCommit}\` (unreleased PR #329).
External packages: webmcp-react ${report.packages['webmcp-react']} and use-webmcp-tool ${report.packages['use-webmcp-tool']}.

Five trials per hook with StrictMode off and five with it on. Cells show the observed range.
Every scenario performs ten operations. Mount commits are excluded.

| Hook | Parent-update commits | Re-registrations on parent updates | Metadata-update commits | Start pending calls | Settle calls |
| --- | ---: | ---: | ---: | ---: | ---: |
${table.join('\n')}

All hooks register ten times when metadata changes. The parent-update baseline is ten requested commits, so ten means zero extra commits.
Metadata commits include registration-status updates where a hook exposes them.
Google's hook exposes no execution state, so its execution-state columns are N/A.
Counts describe this fixture, not elapsed time or a general speed ranking.
See [methodology](README.md) and [all samples](results.json).
`
    );
    for (const name of new Set(samples.map((sample) => sample.library))) {
      console.log(name, samples.filter((sample) => sample.library === name)[0]);
    }
  }
  assert.deepEqual(errors, [], 'Browser errors invalidate the comparison');
} finally {
  await browser?.close();
  await server.close();
}
