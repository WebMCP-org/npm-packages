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

async function registerDirectApiTools(page: Page): Promise<void> {
  const registered = await page.evaluate(async () => {
    return await window.__WEBMCP_E2E__?.registerDirectApiTools?.();
  });
  assert.strictEqual(registered, true);
}

async function callTool(page: Page, name: string, args: Record<string, unknown>): Promise<string> {
  const result = await callToolResult(page, name, args);
  const content = Array.isArray(result?.content) ? result.content : [];
  return typeof content[0]?.text === 'string' ? content[0].text : JSON.stringify(result);
}

async function callToolResult(
  page: Page,
  name: string,
  args: Record<string, unknown>
): Promise<{
  content?: Array<{ type?: string; text?: string }>;
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
}> {
  return page.evaluate(
    async ({ toolName, toolArgs }) => {
      return await window.mcpClient?.callTool({
        name: toolName,
        arguments: toolArgs,
      });
    },
    { toolName: name, toolArgs: args }
  );
}

async function callJsonTool<T>(
  page: Page,
  name: string,
  args: Record<string, unknown>
): Promise<T> {
  return JSON.parse(await callTool(page, name, args)) as T;
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

  it('runs selected first-party extension API tools against real Chrome APIs', async () => {
    const { context, extensionId } = await launchExtensionContext();

    try {
      const page = await openClientPage(context, extensionId);

      await registerDirectApiTools(page);
      await page.waitForFunction(async () => {
        const tools = await window.mcpClient?.listTools?.();
        const names = new Set(tools?.tools.map((tool) => tool.name) ?? []);
        return (
          names.has('extension_tool_set_storage') &&
          names.has('extension_tool_get_storage') &&
          names.has('extension_tool_create_tab') &&
          names.has('extension_tool_get_all_tabs') &&
          names.has('extension_tool_close_tabs')
        );
      });

      const setStorageResult = await callToolResult(page, 'extension_tool_set_storage', {
        area: 'local',
        data: {
          webmcp_e2e_value: 'stored from real chrome.storage',
          webmcp_e2e_count: 2,
        },
      });
      const setStorageText = setStorageResult.content?.[0]?.text ?? '';
      assert.ok(setStorageText.includes('Stored 2 key(s) in local storage'));
      assert.deepStrictEqual(setStorageResult.structuredContent, {
        keys: ['webmcp_e2e_value', 'webmcp_e2e_count'],
      });

      const getStorageResult = await callToolResult(page, 'extension_tool_get_storage', {
        area: 'local',
        keys: ['webmcp_e2e_value', 'webmcp_e2e_count'],
      });
      const stored = JSON.parse(getStorageResult.content?.[0]?.text ?? '') as {
        area: string;
        data: Record<string, unknown>;
        keyCount: number;
      };
      assert.deepStrictEqual(stored, {
        area: 'local',
        data: {
          webmcp_e2e_value: 'stored from real chrome.storage',
          webmcp_e2e_count: 2,
        },
        keyCount: 2,
      });
      assert.deepStrictEqual(getStorageResult.structuredContent, stored);

      const createTabText = await callTool(page, 'extension_tool_create_tab', {
        url: 'about:blank',
        active: false,
      });
      const createdTabId = Number(createTabText.match(/Created tab (\d+)/)?.[1]);
      assert.ok(Number.isInteger(createdTabId) && createdTabId > 0);

      const tabs = await callJsonTool<Array<{ id?: number; url?: string }>>(
        page,
        'extension_tool_get_all_tabs',
        {}
      );
      assert.ok(tabs.some((tab) => tab.id === createdTabId));

      const closeTabText = await callTool(page, 'extension_tool_close_tabs', {
        tabIds: [createdTabId],
      });
      assert.ok(closeTabText.includes(`Closed 1 tab(s): ${createdTabId}`));

      const tabsAfterClose = await callJsonTool<Array<{ id?: number }>>(
        page,
        'extension_tool_get_all_tabs',
        {}
      );
      assert.ok(!tabsAfterClose.some((tab) => tab.id === createdTabId));
    } finally {
      await context.close();
    }
  });
});
