import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { after, before, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { chromium, type BrowserContext, type Page } from 'playwright';

const packageDirectory = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const extensionDirectory = resolve(packageDirectory, 'e2e/dist/extension');

const pageHtml = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <title>WebMCP extension fixture</title>
    <script nonce="webmcp-e2e">
      Promise.resolve().then(async () => {
        if (!document.modelContext) throw new Error('document.modelContext was not injected');
        let dynamicController;

        await document.modelContext.registerTool({
          name: 'extension_echo',
          description: 'Echo a value from the extension E2E fixture.',
          inputSchema: {
            type: 'object',
            properties: { value: { type: 'string' } },
            required: ['value']
          },
          annotations: { readOnlyHint: true },
          execute({ value }) {
            document.documentElement.dataset.webmcpInvoked = value;
            return { content: [{ type: 'text', text: 'echo:' + value }] };
          }
        });
        await document.modelContext.registerTool({
          name: 'extension_fail',
          description: 'Fail so the extension can verify MCP error propagation.',
          execute() {
            throw new Error('expected extension failure');
          }
        });
        await document.modelContext.registerTool({
          name: 'extension_set_dynamic',
          description: 'Register or remove the dynamic extension fixture tool.',
          inputSchema: {
            type: 'object',
            properties: { enabled: { type: 'boolean' } },
            required: ['enabled']
          },
          async execute({ enabled }) {
            if (enabled && !dynamicController) {
              dynamicController = new AbortController();
              await document.modelContext.registerTool({
                name: 'extension_dynamic',
                description: 'A dynamically registered extension fixture tool.',
                inputSchema: {
                  type: 'object',
                  properties: { value: { type: 'string' } },
                  required: ['value']
                },
                execute({ value }) {
                  return { content: [{ type: 'text', text: 'dynamic:' + value }] };
                }
              }, { signal: dynamicController.signal });
            } else if (!enabled && dynamicController) {
              dynamicController.abort();
              dynamicController = undefined;
            }
            return { content: [{ type: 'text', text: enabled ? 'enabled' : 'disabled' }] };
          }
        });
        document.addEventListener('submit', (event) => {
          const form = event.target;
          if (
            !(form instanceof HTMLFormElement) ||
            form.getAttribute('toolname') !== 'extension_declarative'
          ) {
            return;
          }
          event.preventDefault();
          const value = String(new FormData(form).get('value'));
          document.documentElement.dataset.webmcpDeclarativeInvoked = value;
          event.respondWith(Promise.resolve('submitted:' + value));
        });
        document.documentElement.dataset.webmcpPageReady = 'true';
      }).catch((error) => {
        document.documentElement.dataset.webmcpPageError = String(error?.message ?? error);
      });
    </script>
  </head>
  <body>
    WebMCP extension fixture
    <form
      toolname="extension_declarative"
      tooldescription="Submit a value through an annotated form."
      toolautosubmit
    >
      <input name="value" toolparamdescription="Value to submit" required>
      <button type="submit">Submit</button>
    </form>
    <iframe src="/child" title="Uninjected child frame"></iframe>
  </body>
</html>`;

const childHtml = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <script nonce="webmcp-e2e">
      document.documentElement.dataset.webmcpChildReady = 'true';
    </script>
  </head>
  <body>Child frame</body>
</html>`;

let server: Server;
let origin: string;

before(async () => {
  server = createServer((request, response) => {
    response.writeHead(200, {
      'content-security-policy':
        "script-src 'nonce-webmcp-e2e'; object-src 'none'; base-uri 'none'",
      'content-type': 'text/html; charset=utf-8',
    });
    response.end(request.url === '/child' ? childHtml : pageHtml);
  });
  await new Promise<void>((resolvePromise, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolvePromise);
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Fixture server has no TCP port');
  origin = `http://127.0.0.1:${address.port}`;
});

after(async () => {
  await new Promise<void>((resolvePromise, reject) => {
    server.close((error) => (error ? reject(error) : resolvePromise()));
  });
});

async function launchExtension(): Promise<{
  context: BrowserContext;
  userDataDirectory: string;
}> {
  const userDataDirectory = mkdtempSync(resolve(tmpdir(), 'webmcp-extension-e2e-'));
  try {
    const context = await chromium.launchPersistentContext(userDataDirectory, {
      channel: process.env.PLAYWRIGHT_EXTENSION_CHROMIUM_CHANNEL ?? 'chromium',
      headless: process.env.PLAYWRIGHT_EXTENSION_HEADLESS !== 'false',
      // Playwright disables BFCache by default; this suite exercises extension restore behavior.
      ignoreDefaultArgs: ['--disable-back-forward-cache'],
      args: [
        `--disable-extensions-except=${extensionDirectory}`,
        `--load-extension=${extensionDirectory}`,
      ],
    });
    return { context, userDataDirectory };
  } catch (error) {
    rmSync(userDataDirectory, { recursive: true, force: true });
    throw error;
  }
}

async function readOutcome(page: Page): Promise<Record<string, string | undefined>> {
  await page.waitForFunction(() => {
    const { dataset } = document.documentElement;
    return Boolean(dataset.webmcpExtensionReady || dataset.webmcpExtensionError);
  });
  return page.evaluate(() => ({ ...document.documentElement.dataset }));
}

describe('WebMCP extension template', () => {
  it(
    'injects the page runtime and calls its tools from an isolated content script across navigations',
    { timeout: 60_000 },
    async () => {
      const { context, userDataDirectory } = await launchExtension();
      try {
        const page = await context.newPage();
        for (const pathname of ['/first', '/second']) {
          await page.goto(`${origin}${pathname}`);
          const outcome = await readOutcome(page);
          assert.deepStrictEqual(
            {
              contentError: outcome.webmcpExtensionError,
              declarativeInvocation: outcome.webmcpDeclarativeInvoked,
              declarativeResult: outcome.webmcpExtensionDeclarativeResult,
              dynamicResult: outcome.webmcpExtensionDynamicResult,
              failure: outcome.webmcpExtensionFailure,
              invocation: outcome.webmcpInvoked,
              isolatedWorld: outcome.webmcpIsolatedWorld,
              pageError: outcome.webmcpPageError,
              pageReady: outcome.webmcpPageReady,
              ready: outcome.webmcpExtensionReady,
              result: outcome.webmcpExtensionResult,
              sawDynamic: outcome.webmcpExtensionSawDynamic,
              sawDynamicRemoval: outcome.webmcpExtensionSawDynamicRemoval,
              tools: outcome.webmcpExtensionTools,
            },
            {
              contentError: undefined,
              declarativeInvocation: pathname,
              declarativeResult: `submitted:${pathname}`,
              dynamicResult: `dynamic:${pathname}`,
              failure: 'expected extension failure',
              invocation: pathname,
              isolatedWorld: 'true',
              pageError: undefined,
              pageReady: 'true',
              ready: 'true',
              result: `echo:${pathname}`,
              sawDynamic: 'true',
              sawDynamicRemoval: 'true',
              tools: 'extension_declarative,extension_echo,extension_fail,extension_set_dynamic',
            }
          );

          const child = page.frames().find((frame) => frame.url() === `${origin}/child`);
          assert.ok(child, 'child frame did not load');
          await child.waitForFunction(() => document.documentElement.dataset.webmcpChildReady);
          assert.deepStrictEqual(
            await child.evaluate(() => ({ ...document.documentElement.dataset })),
            { webmcpChildReady: 'true' }
          );
        }

        await page.goBack({ waitUntil: 'commit' });
        await page.waitForFunction(() => {
          const { dataset } = document.documentElement;
          return Boolean(dataset.webmcpExtensionBfcacheResult || dataset.webmcpExtensionError);
        });
        const restored = await page.evaluate(() => ({ ...document.documentElement.dataset }));
        assert.deepStrictEqual(
          {
            error: restored.webmcpExtensionError,
            invocation: restored.webmcpInvoked,
            restored: restored.webmcpExtensionBfcacheRestored,
            result: restored.webmcpExtensionBfcacheResult,
          },
          {
            error: undefined,
            invocation: 'bfcache',
            restored: 'true',
            result: 'echo:bfcache',
          }
        );
      } finally {
        try {
          await context.close();
        } finally {
          rmSync(userDataDirectory, { recursive: true, force: true });
        }
      }
    }
  );
});
