#!/usr/bin/env node
// Minimal Playwright runner to validate Smart DOM Reader in a real browser
//
// Default behavior (no args):
// - Loads local HTML fixtures via page.setContent (no network)
// - Injects the MCP server bundle and runs assertions
//
// URL mode (pass a URL as arg or --url=...):
// - Navigates to the remote page
// - Injects the bundled library using a CSP-friendly blob import
// - Runs a generic extraction summary for any site
//
// Usage examples:
//   pnpm --filter @mcp-b/smart-dom-reader bundle:mcp
//   pnpm --filter @mcp-b/smart-dom-reader test:local
//   node test/local-playwright-runner.mjs https://example.com --mode=full --screenshot
//   node test/local-playwright-runner.mjs --url=https://example.com --mode=interactive --screenshot=example.png

import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

let chromium;
async function loadPlaywright() {
  try {
    const mod = await import('playwright');
    chromium = mod.chromium;
    return;
  } catch {
    // Fallback: resolve from mcp-server's node_modules symlink target
    const { readlinkSync, lstatSync } = await import('node:fs');
    const { resolve: pathResolve, dirname: pathDirname } = await import('node:path');
    const linkPath = pathResolve(
      pathDirname(fileURLToPath(import.meta.url)),
      '../mcp-server/node_modules/playwright'
    );
    let target;
    try {
      const stat = lstatSync(linkPath);
      if (stat.isSymbolicLink()) {
        const link = readlinkSync(linkPath);
        target = pathResolve(pathDirname(linkPath), link);
      } else {
        target = linkPath;
      }
    } catch {
      target = linkPath;
    }
    const entry = new URL(pathResolve(target, 'index.js'), 'file:').href;
    const mod = await import(entry);
    chromium = mod.chromium || (mod.default && mod.default.chromium);
  }
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function getBundleCode() {
  const bundlePath = resolve(__dirname, '../mcp-server/lib/smart-dom-reader.bundle.js');
  return readFileSync(bundlePath, 'utf8');
}

function parseArgs(argv) {
  const args = { url: null, mode: 'full', screenshot: null, headless: true, selector: null };
  for (const raw of argv) {
    if (!raw) continue;
    if (raw.startsWith('--url=')) args.url = raw.slice('--url='.length);
    else if (raw === '--url')
      args.url = null; // expect next positional
    else if (raw.startsWith('--mode=')) args.mode = raw.slice('--mode='.length);
    else if (raw === '--mode') args.mode = 'full';
    else if (raw.startsWith('--screenshot=')) args.screenshot = raw.slice('--screenshot='.length);
    else if (raw === '--screenshot') args.screenshot = true;
    else if (raw === '--no-headless') args.headless = false;
    else if (raw === '--headless') args.headless = true;
    else if (raw.startsWith('--selector=')) args.selector = raw.slice('--selector='.length);
    else if (raw === '--help' || raw === '-h') args.help = true;
    else if (!raw.startsWith('-') && !args.url) args.url = raw; // positional URL
  }
  return args;
}

const PAGES = {
  basicInteractive: `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>Interactive Elements Test</title></head><body>
    <section>
      <button id="primary-btn" class="btn btn-primary">Primary Action</button>
      <button data-testid="secondary-action">Secondary Action</button>
      <div role="button" aria-label="Delete Item" class="icon-btn">Delete</div>
      <input type="button" value="Input Button">
      <input type="submit" value="Submit Form">
    </section>
    <section>
      <a href="/home" id="home-link">Home</a>
      <a href="/about" class="nav-link">About Us</a>
    </section>
    <section>
      <form id="test-form" action="/submit" method="post">
        <input type="text" id="username" name="username" required placeholder="Enter username">
        <input type="email" id="email" name="email">
        <button type="submit">Submit Form</button>
      </form>
    </section>
  </body></html>`,

  semanticElements: `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>Semantic Elements Test</title></head><body>
    <header><nav><a href="/">Home</a></nav></header>
    <main class="container">
      <article>
        <header>
          <h1>Main Article Title</h1>
          <p class="meta">Published on <time datetime="2024-01-15">January 15, 2024</time></p>
        </header>
        <section>
          <h2>Introduction</h2>
          <p>This is the introduction paragraph with some <strong>bold text</strong> and <em>italic text</em>.</p>
          <figure>
            <img src="data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAwIiBoZWlnaHQ9IjIwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iNDAwIiBoZWlnaHQ9IjIwMCIgZmlsbD0iI2RkZCIvPjx0ZXh0IHg9IjUwJSIgeT0iNTAlIiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBkeT0iLjNlbSI+UGxhY2Vob2xkZXIgSW1hZ2U8L3RleHQ+PC9zdmc+" alt="Placeholder image">
            <figcaption>Figure caption</figcaption>
          </figure>
        </section>
        <section>
          <h2>Data Section</h2>
          <h3>Table</h3>
          <table><thead><tr><th>Name</th><th>Value</th></tr></thead><tbody><tr><td>Item 1</td><td>100</td></tr></tbody></table>
          <h3>Lists</h3>
          <ul><li>Bullet 1</li><li>Bullet 2</li></ul>
        </section>
      </article>
      <aside><h2>Related</h2><p>Sidebar text</p></aside>
    </main>
    <footer><p>Footer</p></footer>
  </body></html>`,

  shadowDom: `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>Shadow Test</title></head><body>
    <section>
      <h2>Regular DOM</h2>
      <button id="regular-btn">Regular Button</button>
      <input type="text" id="regular-input" placeholder="Regular Input">
    </section>
    <section>
      <h2>Shadow DOM Components</h2>
      <div id="shadow-host-1" class="shadow-container"></div>
      <div id="shadow-host-2" class="shadow-container"></div>
    </section>
    <script>
      const host1 = document.getElementById('shadow-host-1');
      const shadow1 = host1.attachShadow({ mode: 'open' });
      shadow1.innerHTML = ${`
        <style>button{background:blue;color:#fff;padding:6px;border:0}</style>
        <div>
          <h3>Shadow DOM Content 1</h3>
          <button id="shadow-btn">Shadow Button</button>
          <input type="text" placeholder="Shadow Input">
        </div>
      `};
      const host2 = document.getElementById('shadow-host-2');
      const shadow2 = host2.attachShadow({ mode: 'open' });
      shadow2.innerHTML = '<form><input type="text" name="shadow-field"><button type="submit">Shadow Submit</button></form>';
    </script>
  </body></html>`,
};

// Inject library in a CSP-friendly way by importing from a blob: URL inside page.evaluate
async function injectLibrary(page) {
  const code = getBundleCode();
  await page.evaluate(
    async ({ code }) => {
      const blob = new Blob([code], { type: 'text/javascript' });
      const url = URL.createObjectURL(blob);
      try {
        const mod = await import(/* webpackIgnore: true */ url);
        const SmartDOMReader = mod.SmartDOMReader ?? mod.default;
        const { ProgressiveExtractor, MarkdownFormatter, SelectorGenerator } = mod;
        // Attach to window for subsequent evaluations
        // @ts-ignore
        window.SmartDOMReader = SmartDOMReader;
        // @ts-ignore
        window.ProgressiveExtractor = ProgressiveExtractor;
        // @ts-ignore
        window.MarkdownFormatter = MarkdownFormatter;
        // @ts-ignore
        window.SelectorGenerator = SelectorGenerator;
      } finally {
        URL.revokeObjectURL(url);
      }
    },
    { code }
  );
}

async function runBasicInteractiveTest(page) {
  const results = await page.evaluate(() => {
    const res = window.SmartDOMReader.extractInteractive(document, {});
    const findButton = (text) => res.interactive.buttons.find((b) => (b.text || '').includes(text));
    return {
      idSel: findButton('Primary Action')?.selector?.css,
      testIdSel: findButton('Secondary Action')?.selector?.css,
      roleAriaSel: res.interactive.buttons.find(
        (b) => b.attributes?.['aria-label'] === 'Delete Item'
      )?.selector?.css,
      usernameSel: res.interactive.inputs.find((i) => i.attributes?.name === 'username')?.selector
        ?.css,
    };
  });

  const assertions = [];
  assertions.push({
    name: 'ID selector',
    ok: results.idSel === '#primary-btn',
    got: results.idSel,
  });
  assertions.push({
    name: 'data-testid selector',
    ok: /\[data-testid="secondary-action"\]/.test(results.testIdSel || ''),
    got: results.testIdSel,
  });
  assertions.push({
    name: 'role+aria selector',
    ok: /\[role="button"\]\[aria-label="Delete Item"\]/.test(results.roleAriaSel || ''),
    got: results.roleAriaSel,
  });
  assertions.push({
    name: 'name or id selector',
    ok: results.usernameSel === '#username' || results.usernameSel === '[name="username"]',
    got: results.usernameSel,
  });

  return assertions;
}

async function runSemanticTest(page) {
  const results = await page.evaluate(() => {
    const res = window.SmartDOMReader.extractFull(document, {});
    return {
      hasHeadings: (res.semantic?.headings?.length || 0) > 0,
      hasImages: (res.semantic?.images?.length || 0) > 0,
      hasTables: (res.semantic?.tables?.length || 0) > 0,
      hasLists: (res.semantic?.lists?.length || 0) > 0,
    };
  });
  return [
    { name: 'Semantic headings', ok: results.hasHeadings, got: JSON.stringify(results) },
    { name: 'Semantic images', ok: results.hasImages, got: JSON.stringify(results) },
    { name: 'Semantic tables', ok: results.hasTables, got: JSON.stringify(results) },
    { name: 'Semantic lists', ok: results.hasLists, got: JSON.stringify(results) },
  ];
}

async function runShadowTest(page) {
  const results = await page.evaluate(() => {
    const res = window.SmartDOMReader.extractInteractive(document, {});
    const shadowBtn = res.interactive.buttons.find((b) => (b.text || '').includes('Shadow Button'));
    const regBtn = res.interactive.buttons.find((b) => (b.text || '').includes('Regular Button'));
    return { shadowBtn: !!shadowBtn, regBtn: !!regBtn };
  });
  return [
    { name: 'Shadow button detected', ok: results.shadowBtn, got: results },
    { name: 'Regular button detected', ok: results.regBtn, got: results },
  ];
}

async function main() {
  await loadPlaywright();
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(
      'Usage: node test/local-playwright-runner.mjs [URL] [--mode=interactive|full] [--screenshot[=path]] [--no-headless] [--selector=CSS]'
    );
    console.log('Examples:');
    console.log('  node test/local-playwright-runner.mjs');
    console.log(
      '  node test/local-playwright-runner.mjs https://example.com --mode=full --screenshot'
    );
    console.log(
      '  node test/local-playwright-runner.mjs --url=https://example.com --mode=interactive --screenshot=example.png'
    );
    return;
  }

  // If a URL was provided, run "any website" mode; otherwise run local fixture tests
  const browser = await chromium.launch({ headless: args.headless });
  const page = await browser.newPage();

  if (args.url) {
    const url = args.url;
    const mode = args.mode === 'interactive' ? 'interactive' : 'full';
    try {
      await page.goto(url, { waitUntil: 'networkidle' });
    } catch (e) {
      console.error('Failed to navigate to URL:', url, e);
      await browser.close();
      process.exitCode = 1;
      return;
    }

    // Inject the library and extract a generic summary
    await injectLibrary(page);

    const summary = await page.evaluate(
      ({ mode, selector }) => {
        const target = selector ? (document.querySelector(selector) ?? document) : document;
        const Smart = window.SmartDOMReader;

        function runExtract(mode, target) {
          if (!Smart) return null;
          if (mode === 'interactive') {
            if (typeof Smart.extractInteractive === 'function') {
              return Smart.extractInteractive(target, {});
            }
            const reader = new Smart({ mode: 'interactive' });
            return reader.extract(target);
          } else {
            if (typeof Smart.extractFull === 'function') {
              return Smart.extractFull(document, {});
            }
            const reader = new Smart({ mode: 'full' });
            return reader.extract(document);
          }
        }

        const res = runExtract(mode, target);
        if (!res) return { ok: false, reason: 'SmartDOMReader not available' };
        const semantic = res.semantic || {};
        const pageMeta = res.page || { title: document.title, url: location.href };
        return {
          ok: true,
          mode,
          title: pageMeta.title,
          url: pageMeta.url,
          interactiveCounts: {
            buttons: res.interactive?.buttons?.length || 0,
            links: res.interactive?.links?.length || 0,
            inputs: res.interactive?.inputs?.length || 0,
            clickable: res.interactive?.clickable?.length || 0,
            forms: res.interactive?.forms?.length || 0,
          },
          semanticCounts: {
            headings: semantic.headings?.length || 0,
            images: semantic.images?.length || 0,
            tables: semantic.tables?.length || 0,
            lists: semantic.lists?.length || 0,
          },
        };
      },
      { mode, selector: args.selector || null }
    );

    if (!summary?.ok) {
      console.error('Extraction failed:', summary?.reason || 'unknown error');
      await browser.close();
      process.exitCode = 1;
      return;
    }

    // Optional screenshot
    if (args.screenshot) {
      const path =
        args.screenshot === true
          ? `${new URL(url).hostname.replace(/:\\d+$/, '')}_screenshot.png`
          : String(args.screenshot);
      try {
        await page.screenshot({ path, fullPage: true });
        console.log(`Screenshot saved to ${path}`);
      } catch (e) {
        console.warn('Failed to capture screenshot:', e);
      }
    }

    console.log('Smart DOM Reader — URL Mode');
    console.log(`- Title: ${summary.title}`);
    console.log(`- URL:   ${summary.url}`);
    console.log(`- Mode:  ${summary.mode}`);
    console.log('- Interactive:', summary.interactiveCounts);
    if (summary.mode === 'full') console.log('- Semantic:   ', summary.semanticCounts);

    await browser.close();
    return;
  }

  // Local fixtures mode (no URL provided)
  const report = { passed: 0, failed: 0, checks: [] };
  try {
    await page.setContent(PAGES.basicInteractive, { waitUntil: 'domcontentloaded' });
    await injectLibrary(page);
    const checks = await runBasicInteractiveTest(page);
    for (const c of checks) {
      if (c.ok) report.passed++;
      else report.failed++;
      report.checks.push(c);
    }

    await page.setContent(PAGES.semanticElements, { waitUntil: 'domcontentloaded' });
    await injectLibrary(page);
    const checks2 = await runSemanticTest(page);
    for (const c of checks2) {
      if (c.ok) report.passed++;
      else report.failed++;
      report.checks.push(c);
    }

    await page.setContent(PAGES.shadowDom, { waitUntil: 'domcontentloaded' });
    await injectLibrary(page);
    const checks3 = await runShadowTest(page);
    for (const c of checks3) {
      if (c.ok) report.passed++;
      else report.failed++;
      report.checks.push(c);
    }
  } finally {
    await browser.close();
  }

  // Print concise report
  console.log('Smart DOM Reader — Local Playwright Runner');
  for (const c of report.checks)
    console.log(`- ${c.ok ? '✅' : '❌'} ${c.name}: ${c.ok ? 'ok' : 'got ' + c.got}`);
  console.log(`Summary: ${report.passed} passed, ${report.failed} failed`);

  if (report.failed > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
