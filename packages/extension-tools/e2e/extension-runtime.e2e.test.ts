import assert from 'node:assert';
import { accessSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { after, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import { type BrowserContext, chromium, type Page } from 'playwright';

const PACKAGE_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const EXTENSION_DIR = resolve(PACKAGE_DIR, 'dist/e2e-extension');
const USER_DATA_DIRS: string[] = [];

function ensureBuiltExtension(): void {
  accessSync(resolve(EXTENSION_DIR, 'manifest.json'));
  accessSync(resolve(EXTENSION_DIR, 'background.js'));
  accessSync(resolve(EXTENSION_DIR, 'client.js'));
  accessSync(resolve(EXTENSION_DIR, 'client.html'));
}

async function launchExtensionContext(): Promise<{ context: BrowserContext; extensionId: string }> {
  ensureBuiltExtension();

  const userDataDir = mkdtempSync(resolve(tmpdir(), 'webmcp-extension-runtime-'));
  USER_DATA_DIRS.push(userDataDir);

  const context = await chromium.launchPersistentContext(userDataDir, {
    channel: 'chromium',
    headless: true,
    args: [`--disable-extensions-except=${EXTENSION_DIR}`, `--load-extension=${EXTENSION_DIR}`],
  });

  const serviceWorker =
    context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
  const extensionId = new URL(serviceWorker.url()).host;

  return { context, extensionId };
}

async function openClientPage(context: BrowserContext, extensionId: string): Promise<Page> {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/client.html`);
  await page.waitForSelector('#client-status[data-status="ready"]', { timeout: 20000 });
  return page;
}

async function listTools(page: Page): Promise<string[]> {
  return page.evaluate(async () => {
    const tools = await window.mcpClient?.listTools();
    return tools?.tools.map((tool) => tool.name).sort() ?? [];
  });
}

async function callTool(page: Page, name: string, args: Record<string, unknown>): Promise<string> {
  return page.evaluate(
    async ({ toolName, toolArgs }) => {
      const result = await window.mcpClient?.callTool({
        name: toolName,
        arguments: toolArgs,
      });
      const content = Array.isArray(result?.content) ? result.content : [];
      return typeof content[0]?.text === 'string' ? content[0].text : JSON.stringify(result);
    },
    { toolName: name, toolArgs: args }
  );
}

async function callToolError(
  page: Page,
  name: string,
  args: Record<string, unknown>
): Promise<string> {
  return page.evaluate(
    async ({ toolName, toolArgs }) => {
      try {
        const result = await window.mcpClient?.callTool({
          name: toolName,
          arguments: toolArgs,
        });
        if (result?.isError) {
          const content = Array.isArray(result.content) ? result.content : [];
          return typeof content[0]?.text === 'string' ? content[0].text : JSON.stringify(result);
        }
        return '';
      } catch (error) {
        return error instanceof Error ? error.message : String(error);
      }
    },
    { toolName: name, toolArgs: args }
  );
}

after(() => {
  for (const userDataDir of USER_DATA_DIRS) {
    rmSync(userDataDir, { recursive: true, force: true });
  }
});

describe('extension runtime contract', () => {
  it('discovers, calls, mutates, and errors through real extension transports', async () => {
    const { context, extensionId } = await launchExtensionContext();

    try {
      const page = await openClientPage(context, extensionId);

      const initialTools = await listTools(page);
      assert.deepStrictEqual(initialTools, ['always_fail', 'echo', 'sum']);

      await page.evaluate(async () => {
        await window.__WEBMCP_E2E__?.resetInvocations?.();
      });

      const sumText = await callTool(page, 'sum', { a: 3, b: 9 });
      assert.strictEqual(sumText, 'sum:12');

      const invocations = await page.evaluate(async () => {
        return (await window.__WEBMCP_E2E__?.readInvocations?.()) ?? [];
      });
      assert.deepStrictEqual(invocations, [{ name: 'sum', arguments: { a: 3, b: 9 } }]);

      const registerResult = await page.evaluate(async () => {
        return await window.__WEBMCP_E2E__?.registerDynamicTool?.();
      });
      assert.strictEqual(registerResult, true);

      await page.waitForFunction(async () => {
        const tools = await window.mcpClient?.listTools?.();
        return tools?.tools.some((tool) => tool.name === 'dynamic_tool') ?? false;
      });

      const dynamicText = await callTool(page, 'dynamic_tool', { value: 'extension' });
      assert.strictEqual(dynamicText, 'dynamic:extension');

      const unregisterResult = await page.evaluate(async () => {
        return await window.__WEBMCP_E2E__?.unregisterDynamicTool?.();
      });
      assert.strictEqual(unregisterResult, true);

      await page.waitForFunction(async () => {
        const tools = await window.mcpClient?.listTools?.();
        return !(tools?.tools.some((tool) => tool.name === 'dynamic_tool') ?? false);
      });

      const missingError = await callToolError(page, 'dynamic_tool', { value: 'gone' });
      assert.ok(missingError.includes('dynamic_tool'));

      const runtimeError = await callToolError(page, 'always_fail', { reason: 'extension' });
      assert.ok(runtimeError.includes('always_fail:extension'));
    } finally {
      await context.close();
    }
  });

  it('reconnects from a fresh extension page after the first client disconnects', async () => {
    const { context, extensionId } = await launchExtensionContext();

    try {
      const firstPage = await openClientPage(context, extensionId);
      assert.deepStrictEqual(await listTools(firstPage), ['always_fail', 'echo', 'sum']);

      await firstPage.close();

      const secondPage = await openClientPage(context, extensionId);
      assert.deepStrictEqual(await listTools(secondPage), ['always_fail', 'echo', 'sum']);

      const echoText = await callTool(secondPage, 'echo', { message: 'reconnected' });
      assert.strictEqual(echoText, 'echo:reconnected');

      await secondPage.close();
    } finally {
      await context.close();
    }
  });
});
