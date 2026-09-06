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
  const median = (values) => {
    const sorted = values.toSorted((a, b) => a - b);
    return (
      (sorted[Math.floor((sorted.length - 1) / 2)] + sorted[Math.floor(sorted.length / 2)]) / 2
    );
  };
  const cell = (values) =>
    `${median(values).toFixed(2)} (${Math.min(...values).toFixed(2)}–${Math.max(...values).toFixed(2)})`;
  const counts = [
    ['Registrations on mount', (sample) => [sample.mount.registrations]],
    [
      'Registrations per unrelated update',
      (sample) => sample.updates.map((update) => update.registrations),
    ],
    ['Registrations per description change', (sample) => [sample.metadata.registrations]],
    ['Re-renders per description change', (sample) => [sample.metadata.renders]],
    ['Re-renders per sequential call', (sample) => sample.calls.map((call) => call.renders)],
  ].map(([label, metric]) => {
    const cells = libraries.map((library) => {
      const values = samples
        .filter(
          (sample) =>
            sample.library === library &&
            sample.toolCount === 1 &&
            sample.fields === 1 &&
            sample.schemaMode === 'stable'
        )
        .flatMap(metric);
      if (values.every((value) => value === null)) return 'No execution state';
      assert(values.every(Number.isInteger));
      const min = Math.min(...values);
      const max = Math.max(...values);
      return min === max ? String(min) : `${min}–${max}`;
    });
    return `| ${label} | ${cells.join(' | ')} |`;
  });
  const tables = [
    ['Mount all tools', (sample) => sample.mount.ms],
    ['Unrelated parent update', (sample) => median(sample.updates.map((update) => update.ms))],
    ['Refresh every tool description', (sample) => sample.metadata.ms],
    [
      'One sequential tool call, including React updates',
      (sample) => median(sample.calls.map((call) => call.ms)),
    ],
  ].map(
    ([title, metric]) =>
      `## ${title}\n\n| Tools | Schema fields | Schema objects | ${libraries.join(' | ')} |\n| ---: | ---: | --- | ---: | ---: | ---: | ---: |\n${cases.map((scenario) => `| ${scenario.toolCount} | ${scenario.fields} | ${scenario.schemaMode} | ${libraries.map((library) => cell(samples.filter((sample) => sample.library === library && sample.toolCount === scenario.toolCount && sample.fields === scenario.fields && sample.schemaMode === scenario.schemaMode).map(metric))).join(' | ')} |`).join('\n')}`
  );
  writeFileSync(
    resolve(directory, 'PRODUCTION.md'),
    `# Production browser measurements\n\nGenerated ${report.recordedAt}. React ${packages.react}, Chrome ${report.browser}, ${report.platform}, ${report.cpu}.\nHook source: \`${report.sourceCommit}\`.\n\n## Registrations and re-renders\n\nOne tool, one-field stable schema. Ranges cover five trials; calls run ten times per trial.\nThe README chart uses these production counts.\n\n| Metric | ${libraries.join(' | ')} |\n| --- | ---: | ---: | ---: | ---: |\n${counts.join('\n')}\n\nOur metadata counts include pending and completed native registration. MCP Cat exposes no registration status; Google's hook declares success without awaiting the native promise.\n\n## Timing method\n\nCells below show median milliseconds (minimum–maximum) across five trials after one warmup.\nUpdate/call cells summarize each trial's ten sequential operations first. Hook order rotates.\nThese are browser completion latencies, including scheduling and native registration, not CPU or paint time.\nThe same one-task asynchronous handler runs in every hook; no network or schema validation is timed.\nNo \`act\`, \`flushSync\`, or development Profiler is used. Settlement waits are excluded from endpoint timestamps.\nCross-origin isolation enables the high-resolution clock; displayed values round to 0.01 ms.\nSee [methodology](README.md) and [raw samples](production-results.json).\n\n${tables.join('\n\n')}\n`
  );
} finally {
  await browser?.close();
  server?.httpServer.close();
  rmSync(outDir, { recursive: true, force: true });
}
