#!/usr/bin/env node
// Minimal Playwright runner to validate Smart DOM Reader in a real browser
//
// Default behavior (no args):
// - Loads local HTML fixtures via page.setContent (no network)
// - Injects the MCP server bundle and runs assertions
//
// URL mode (pass a URL as arg or --url=...):
// - Navigates to the remote page
// - Injects the bundled library as an inline module script
// - Runs a generic extraction summary for any site
//
// Usage examples:
//   pnpm --filter @mcp-b/smart-dom-reader bundle:mcp
//   pnpm --filter @mcp-b/smart-dom-reader test:local
//   node test/local-playwright-runner.mjs https://example.com --mode=full --screenshot
//   node test/local-playwright-runner.mjs --url=https://example.com --mode=interactive --screenshot=example.png

import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const { chromium } = createRequire(new URL('../mcp-server/package.json', import.meta.url))(
  'playwright'
);

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function getBundleCode() {
  const bundlePath = resolve(__dirname, '../mcp-server/lib/smart-dom-reader.bundle.js');
  return readFileSync(bundlePath, 'utf8');
}

function getEntryBundleCode() {
  const bundlePath = resolve(__dirname, '../dist-bundle/smart-dom-reader-bundle.js');
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
      shadow1.innerHTML = \`
        <style>button{background:blue;color:#fff;padding:6px;border:0}</style>
        <div>
          <h3>Shadow DOM Content 1</h3>
          <button id="shadow-btn">Shadow Button</button>
          <input type="text" placeholder="Shadow Input">
        </div>
      \`;
      const host2 = document.getElementById('shadow-host-2');
      const shadow2 = host2.attachShadow({ mode: 'open' });
      shadow2.innerHTML = '<form><input type="text" name="shadow-field"><button type="submit">Shadow Submit</button></form>';
    </script>
  </body></html>`,

  directShadowChildren: `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>Direct Shadow Children</title></head><body>
    <div id="shadow-host-direct"></div>
    <script>
      const host = document.getElementById('shadow-host-direct');
      const shadow = host.attachShadow({ mode: 'open' });
      shadow.innerHTML = '<button>One</button><button>Two</button>';
    </script>
  </body></html>`,

  shadowSelectorCases: `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>Shadow Selector Cases</title></head><body>
    <div id="shadow-host-mixed"></div>
    <div id="shadow-host-nested"></div>
    <script>
      const mixedHost = document.getElementById('shadow-host-mixed');
      const mixed = mixedHost.attachShadow({ mode: 'open' });
      mixed.innerHTML = '<button>One</button>text<span></span><button>Two</button>';
      const nestedHost = document.getElementById('shadow-host-nested');
      const nested = nestedHost.attachShadow({ mode: 'open' });
      nested.innerHTML = '<button>A</button><div><button>B</button></div>';
    </script>
  </body></html>`,

  // Same-origin iframe so extraction can cross into a second realm. Nothing in
  // the host document says "Widget", so any output mentioning it came from the frame.
  frameHost: `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>Host Page Test</title></head><body>
    <main><h1>Host Document</h1><button id="host-btn">Host Button</button></main>
    <iframe id="widget-frame" title="Widget frame" width="400" height="300" srcdoc='<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>Widget Doc</title></head><body>
      <header><h1>Widget Header</h1></header>
      <main><section><h2>Widget Section</h2><p>Widget body copy for the outline.</p></section></main>
      <form id="widget-form" action="/widget" method="post">
        <input type="text" id="widget-input" name="widgetField" placeholder="Widget Input">
        <button type="submit" id="widget-btn">Widget Button</button>
      </form>
    </body></html>'></iframe>
  </body></html>`,
};

// Playwright inserts the module independently of the page's application scripts.
async function injectLibrary(page) {
  await page.addScriptTag({
    type: 'module',
    content: `${getBundleCode()}\nObject.assign(window, { SmartDOMReader, ProgressiveExtractor, MarkdownFormatter, SelectorGenerator });`,
  });
  await page.waitForFunction(() => typeof window.SmartDOMReader === 'function');
}

async function runBasicInteractiveTest(page) {
  const results = await page.evaluate(() => {
    const res = window.SmartDOMReader.extractInteractive(document, {});
    const findButton = (text) => res.interactive.buttons.find((b) => (b.text || '').includes(text));
    const roleAriaSel = res.interactive.buttons.find(
      (button) => button.attributes?.['aria-label'] === 'Delete Item'
    )?.selector?.css;
    return {
      idSel: findButton('Primary Action')?.selector?.css,
      testIdSel: findButton('Secondary Action')?.selector?.css,
      roleAriaSel,
      roleAriaMatches:
        roleAriaSel &&
        document.querySelector(roleAriaSel)?.getAttribute('aria-label') === 'Delete Item',
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
    ok: results.roleAriaMatches,
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
    const shallow = window.SmartDOMReader.extractFull(document, { maxDepth: 0 });
    return {
      hasHeadings: (res.semantic?.headings?.length || 0) > 0,
      hasImages: (res.semantic?.images?.length || 0) > 0,
      hasTables: (res.semantic?.tables?.length || 0) > 0,
      hasLists: (res.semantic?.lists?.length || 0) > 0,
      hasDirectChildren:
        res.semantic.articles[0].children.map((child) => child.tag).join(',') ===
        'header,section,section',
      respectsZeroDepth: shallow.semantic.articles.every((article) => !article.children),
    };
  });
  return [
    { name: 'Semantic headings', ok: results.hasHeadings, got: JSON.stringify(results) },
    { name: 'Semantic images', ok: results.hasImages, got: JSON.stringify(results) },
    { name: 'Semantic tables', ok: results.hasTables, got: JSON.stringify(results) },
    { name: 'Semantic lists', ok: results.hasLists, got: JSON.stringify(results) },
    {
      name: 'Semantic direct children',
      ok: results.hasDirectChildren,
      got: JSON.stringify(results),
    },
    { name: 'Zero traversal depth', ok: results.respectsZeroDepth, got: JSON.stringify(results) },
  ];
}

async function runSelectorEdgeCases(page) {
  return page.evaluate(() => {
    const fixture = document.createElement('section');
    fixture.id = 'selector-fixture';
    fixture.innerHTML = `
      <button data-test-id="alternate">Alternate test ID</button>
      <button data-test="short">Short test ID</button>
      <button data-cy="cypress">Cypress test ID</button>
      <button data-testid="repeated">First test ID</button>
      <button data-testid="repeated">Second test ID</button>
      <button role="button" aria-label="Repeated">First role</button>
      <button role="button" aria-label="Repeated">Second role</button>
      <input name="repeated" value="First name">
      <input name="repeated" value="Second name">
      <button id="quoted&quot;id">Quoted ID</button>`;
    document.body.append(fixture);

    try {
      return Array.from(fixture.children).flatMap((element, index) => {
        const selector = window.SelectorGenerator.generateSelectors(element);
        const matches = document.querySelectorAll(selector.css);
        let xpathMatches = false;
        try {
          xpathMatches =
            document.evaluate(selector.xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE)
              .singleNodeValue === element;
        } catch {
          // Invalid XPath is a failed selector, just like a selector for the wrong element.
        }
        return [
          {
            name: `Unique CSS selector ${index + 1}`,
            ok: matches.length === 1 && matches[0] === element,
            got: selector.css,
          },
          { name: `XPath selector ${index + 1}`, ok: xpathMatches, got: selector.xpath },
        ];
      });
    } finally {
      fixture.remove();
    }
  });
}

async function runShadowTest(page) {
  const results = await page.evaluate(() => {
    const res = window.SmartDOMReader.extractInteractive(document, {});
    const shadowBtn = res.interactive.buttons.find((b) => (b.text || '').includes('Shadow Button'));
    const regBtn = res.interactive.buttons.find((b) => (b.text || '').includes('Regular Button'));
    const host = document.querySelector('#shadow-host-1');
    const scoped = window.SmartDOMReader.extractFromElement(host);
    const withoutShadow = window.SmartDOMReader.extractFromElement(host, 'interactive', {
      includeShadowDOM: false,
    });
    return {
      shadowBtn: !!shadowBtn,
      regBtn: !!regBtn,
      buttons: res.interactive.buttons.map((button) => button.text),
      scopedShadow: scoped.interactive.buttons.some((button) => button.text === 'Shadow Button'),
      withoutShadow: withoutShadow.interactive.buttons.length === 0,
    };
  });
  return [
    { name: 'Shadow button detected', ok: results.shadowBtn, got: JSON.stringify(results) },
    { name: 'Regular button detected', ok: results.regBtn, got: JSON.stringify(results) },
    { name: 'Scoped shadow host', ok: results.scopedShadow, got: JSON.stringify(results) },
    { name: 'Shadow traversal disabled', ok: results.withoutShadow, got: JSON.stringify(results) },
  ];
}

async function runDirectShadowChildTest(page) {
  const results = await page.evaluate(() => {
    const match = (root, sel) => {
      if (!root || !sel) return { count: 0, text: null };
      const nodes = Array.from(root.querySelectorAll(sel));
      return { count: nodes.length, text: nodes[0]?.textContent ?? null };
    };
    const res = window.SmartDOMReader.extractInteractive(document, {});
    const one = res.interactive.buttons.find((b) => (b.text || '').trim() === 'One');
    const two = res.interactive.buttons.find((b) => (b.text || '').trim() === 'Two');
    const shadow = document.querySelector('#shadow-host-direct')?.shadowRoot;
    const oneCss = match(shadow, one?.selector?.css);
    const twoCss = match(shadow, two?.selector?.css);
    return {
      oneSel: one?.selector?.css,
      twoSel: two?.selector?.css,
      twoXpath: two?.selector?.xpath,
      unique:
        oneCss.count === 1 &&
        twoCss.count === 1 &&
        oneCss.text === 'One' &&
        twoCss.text === 'Two' &&
        one?.selector?.css !== two?.selector?.css,
      xpathIndexed: /button\[2\]/.test(two?.selector?.xpath || ''),
    };
  });
  return [
    {
      name: 'Direct shadow-child selectors unique',
      ok: results.unique,
      got: JSON.stringify(results),
    },
    {
      name: 'Direct shadow-child xpath indexed',
      ok: results.xpathIndexed,
      got: results.twoXpath,
    },
  ];
}

async function runShadowSelectorCaseTest(page) {
  const results = await page.evaluate(() => {
    const match = (root, sel) => {
      if (!root || !sel) return [];
      return Array.from(root.querySelectorAll(sel)).map((n) => n.textContent);
    };
    const res = window.SmartDOMReader.extractInteractive(document, {});
    const mixedRoot = document.querySelector('#shadow-host-mixed')?.shadowRoot;
    const nestedRoot = document.querySelector('#shadow-host-nested')?.shadowRoot;
    const one = res.interactive.buttons.find((b) => (b.text || '').trim() === 'One');
    const two = res.interactive.buttons.find((b) => (b.text || '').trim() === 'Two');
    const a = res.interactive.buttons.find((b) => (b.text || '').trim() === 'A');
    const b = res.interactive.buttons.find((b) => (b.text || '').trim() === 'B');
    const mixedOne = match(mixedRoot, one?.selector?.css);
    const mixedTwo = match(mixedRoot, two?.selector?.css);
    const nestedA = match(nestedRoot, a?.selector?.css);
    const nestedB = match(nestedRoot, b?.selector?.css);
    return {
      mixedTwoXpath: two?.selector?.xpath,
      mixed:
        mixedOne.length === 1 &&
        mixedOne[0] === 'One' &&
        mixedTwo.length === 1 &&
        mixedTwo[0] === 'Two' &&
        /nth-child\(3\)/.test(two?.selector?.css || ''),
      mixedXpath: /button\[2\]/.test(two?.selector?.xpath || ''),
      nested:
        nestedA.length === 1 &&
        nestedA[0] === 'A' &&
        nestedB.length === 1 &&
        nestedB[0] === 'B' &&
        a?.selector?.css !== b?.selector?.css &&
        String(a?.selector?.css || '').includes(':host >'),
      nestedASel: a?.selector?.css,
      nestedBSel: b?.selector?.css,
    };
  });
  return [
    {
      name: 'Mixed sibling nth-child unique',
      ok: results.mixed,
      got: JSON.stringify(results),
    },
    {
      name: 'Mixed sibling xpath indexed',
      ok: results.mixedXpath,
      got: results.mixedTwoXpath,
    },
    {
      name: 'Nested vs direct shadow-child unique',
      ok: results.nested,
      got: JSON.stringify(results),
    },
  ];
}

// frameSelector lives in the IIFE entry bundle, not the ESM library, so it needs its own script tag.
async function injectEntryBundle(page) {
  await page.addScriptTag({ content: getEntryBundleCode() });
  await page.waitForFunction(
    () => typeof window.SmartDOMReaderBundle?.executeExtraction === 'function'
  );
}

async function runFrameSelectorTest(page) {
  const results = await page.evaluate(() => {
    const run = (method) =>
      window.SmartDOMReaderBundle.executeExtraction(method, { frameSelector: '#widget-frame' });
    return {
      structure: run('extractStructure'),
      interactive: run('extractInteractive'),
      full: run('extractFull'),
      missingScope: window.SmartDOMReaderBundle.executeExtraction('extractStructure', {
        selector: '#missing-scope',
      }),
    };
  });

  // A cross-realm failure surfaces as { error }; a wrong-realm success omits "Widget".
  const readFrame = (out) => typeof out === 'string' && out.includes('Widget');
  const describe = (out) => (typeof out === 'string' ? out.slice(0, 160) : JSON.stringify(out));

  return [
    {
      name: 'frameSelector extractStructure',
      ok: readFrame(results.structure),
      got: describe(results.structure),
    },
    {
      name: 'frameSelector extractInteractive',
      ok: readFrame(results.interactive),
      got: describe(results.interactive),
    },
    {
      name: 'frameSelector extractFull',
      ok: readFrame(results.full),
      got: describe(results.full),
    },
    {
      name: 'Missing structure scope fails without extracting the document',
      ok: results.missingScope?.error === 'No element found matching selector: #missing-scope',
      got: describe(results.missingScope),
    },
  ];
}

async function main() {
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
  const browser = await chromium.launch({
    headless: args.headless,
    executablePath: process.env.CHROME_BIN,
  });
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
          }
          if (typeof Smart.extractFull === 'function') {
            return Smart.extractFull(document, {});
          }
          const reader = new Smart({ mode: 'full' });
          return reader.extract(document);
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
    const checks = [
      ...(await runBasicInteractiveTest(page)),
      ...(await runSelectorEdgeCases(page)),
    ];
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

    await page.setContent(PAGES.directShadowChildren, { waitUntil: 'domcontentloaded' });
    await injectLibrary(page);
    const checksShadowDirect = await runDirectShadowChildTest(page);
    for (const c of checksShadowDirect) {
      if (c.ok) report.passed++;
      else report.failed++;
      report.checks.push(c);
    }

    await page.setContent(PAGES.shadowSelectorCases, { waitUntil: 'domcontentloaded' });
    await injectLibrary(page);
    const checksShadowCases = await runShadowSelectorCaseTest(page);
    for (const c of checksShadowCases) {
      if (c.ok) report.passed++;
      else report.failed++;
      report.checks.push(c);
    }

    await page.setContent(PAGES.frameHost, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(
      () => !!document.querySelector('#widget-frame')?.contentDocument?.querySelector('#widget-btn')
    );
    await injectEntryBundle(page);
    const checks4 = await runFrameSelectorTest(page);
    for (const c of checks4) {
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
    console.log(`- ${c.ok ? '✅' : '❌'} ${c.name}: ${c.ok ? 'ok' : `got ${c.got}`}`);
  console.log(`Summary: ${report.passed} passed, ${report.failed} failed`);

  if (report.failed > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
