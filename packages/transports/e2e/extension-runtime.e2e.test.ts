import assert from 'node:assert';
import { accessSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { type BrowserContext, chromium, type Page } from 'playwright';

const PACKAGE_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const EXTENSION_DIR = resolve(PACKAGE_DIR, 'e2e/dist/extension');

async function launchExtensionContext(): Promise<{
  context: BrowserContext;
  extensionId: string;
  userDataDir: string;
}> {
  for (const file of ['manifest.json', 'background.js', 'client.js', 'client.html']) {
    accessSync(resolve(EXTENSION_DIR, file));
  }

  const userDataDir = mkdtempSync(resolve(tmpdir(), 'webmcp-extension-runtime-'));
  let context: BrowserContext | undefined;
  try {
    context = await chromium.launchPersistentContext(userDataDir, {
      channel: process.env.PLAYWRIGHT_EXTENSION_CHROMIUM_CHANNEL ?? 'chromium',
      headless: process.env.PLAYWRIGHT_EXTENSION_HEADLESS !== 'false',
      args: [`--disable-extensions-except=${EXTENSION_DIR}`, `--load-extension=${EXTENSION_DIR}`],
    });
    const serviceWorker =
      context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));

    return { context, extensionId: new URL(serviceWorker.url()).host, userDataDir };
  } catch (error) {
    await context?.close().catch(() => undefined);
    rmSync(userDataDir, { recursive: true, force: true });
    throw error;
  }
}

async function openClientPage(context: BrowserContext, extensionId: string): Promise<Page> {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/client.html`);
  await page.waitForSelector('#client-status[data-status="ready"]', { timeout: 20_000 });
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
      const result = await window.mcpClient?.callTool(
        { name: toolName, arguments: toolArgs },
        { timeout: 5000 }
      );
      const content = Array.isArray(result?.content) ? result.content : [];
      const first = content[0];
      return first?.type === 'text' ? first.text : JSON.stringify(result);
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
          const first = content[0];
          return first?.type === 'text' ? first.text : JSON.stringify(result);
        }
        return '';
      } catch (error) {
        return error instanceof Error ? error.message : String(error);
      }
    },
    { toolName: name, toolArgs: args }
  );
}

describe('extension runtime contract', () => {
  it('supports tools, mutations, reconnection, and isolated sessions', async () => {
    const { context, extensionId, userDataDir } = await launchExtensionContext();

    try {
      const firstPage = await openClientPage(context, extensionId);
      assert.deepStrictEqual(await listTools(firstPage), ['always_fail', 'echo', 'sum']);

      await firstPage.evaluate(async () => window.__WEBMCP_E2E__?.resetInvocations?.());
      assert.strictEqual(await callTool(firstPage, 'sum', { a: 3, b: 9 }), 'sum:12');
      assert.deepStrictEqual(
        await firstPage.evaluate(async () => {
          return (await window.__WEBMCP_E2E__?.readInvocations?.()) ?? [];
        }),
        [{ name: 'sum', arguments: { a: 3, b: 9 } }]
      );

      assert.strictEqual(
        await firstPage.evaluate(async () => {
          return await window.__WEBMCP_E2E__?.registerDynamicTool?.();
        }),
        true
      );
      await firstPage.waitForFunction(async () => {
        return (await window.mcpClient?.listTools?.())?.tools.some(
          (tool) => tool.name === 'dynamic_tool'
        );
      });
      assert.strictEqual(
        await callTool(firstPage, 'dynamic_tool', { value: 'extension' }),
        'dynamic:extension'
      );

      assert.strictEqual(
        await firstPage.evaluate(async () => {
          return await window.__WEBMCP_E2E__?.unregisterDynamicTool?.();
        }),
        true
      );
      await firstPage.waitForFunction(async () => {
        return !(await window.mcpClient?.listTools?.())?.tools.some(
          (tool) => tool.name === 'dynamic_tool'
        );
      });
      assert.ok(
        (await callToolError(firstPage, 'dynamic_tool', { value: 'gone' })).includes('dynamic_tool')
      );
      assert.ok(
        (await callToolError(firstPage, 'always_fail', { reason: 'extension' })).includes(
          'always_fail:extension'
        )
      );
      await firstPage.close();

      const secondPage = await openClientPage(context, extensionId);
      assert.strictEqual(
        await callTool(secondPage, 'echo', { message: 'reconnected' }),
        'echo:reconnected'
      );

      const thirdPage = await openClientPage(context, extensionId);
      assert.deepStrictEqual(await listTools(secondPage), ['always_fail', 'echo', 'sum']);
      assert.deepStrictEqual(await listTools(thirdPage), ['always_fail', 'echo', 'sum']);
      assert.deepStrictEqual(
        await Promise.all([
          callTool(secondPage, 'echo', { message: 'second' }),
          callTool(thirdPage, 'echo', { message: 'third' }),
        ]),
        ['echo:second', 'echo:third']
      );

      await secondPage.close();
      assert.strictEqual(
        await callTool(thirdPage, 'echo', { message: 'still-connected' }),
        'echo:still-connected'
      );
    } finally {
      try {
        await context.close();
      } finally {
        rmSync(userDataDir, { recursive: true, force: true });
      }
    }
  });
});
