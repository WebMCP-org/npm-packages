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

async function registerBookmarkApiTools(page: Page): Promise<void> {
  const registered = await page.evaluate(async () => {
    return await window.__WEBMCP_E2E__?.registerBookmarkApiTools?.();
  });
  assert.strictEqual(registered, true);
}

async function registerHistoryApiTools(page: Page): Promise<void> {
  const registered = await page.evaluate(async () => {
    return await window.__WEBMCP_E2E__?.registerHistoryApiTools?.();
  });
  assert.strictEqual(registered, true);
}

async function registerStorageApiTools(page: Page): Promise<void> {
  const registered = await page.evaluate(async () => {
    return await window.__WEBMCP_E2E__?.registerStorageApiTools?.();
  });
  assert.strictEqual(registered, true);
}

async function registerTabsApiTools(page: Page): Promise<void> {
  const registered = await page.evaluate(async () => {
    return await window.__WEBMCP_E2E__?.registerTabsApiTools?.();
  });
  assert.strictEqual(registered, true);
}

async function registerTabGroupsApiTools(page: Page): Promise<void> {
  const registered = await page.evaluate(async () => {
    return await window.__WEBMCP_E2E__?.registerTabGroupsApiTools?.();
  });
  assert.strictEqual(registered, true);
}

async function registerWindowsApiTools(page: Page): Promise<void> {
  const registered = await page.evaluate(async () => {
    return await window.__WEBMCP_E2E__?.registerWindowsApiTools?.();
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
  const bookmarkToolNames = [
    'extension_tool_create_bookmark',
    'extension_tool_get_bookmark_children',
    'extension_tool_get_bookmark_subtree',
    'extension_tool_get_bookmark_tree',
    'extension_tool_get_bookmarks',
    'extension_tool_get_recent_bookmarks',
    'extension_tool_move_bookmark',
    'extension_tool_remove_bookmark',
    'extension_tool_remove_bookmark_tree',
    'extension_tool_search_bookmarks',
    'extension_tool_update_bookmark',
  ].sort();

  const tabToolNames = [
    'extension_tool_close_tabs',
    'extension_tool_create_tab',
    'extension_tool_detect_tab_language',
    'extension_tool_duplicate_tab',
    'extension_tool_get_all_tabs',
    'extension_tool_get_tab',
    'extension_tool_get_tab_zoom',
    'extension_tool_get_tab_zoom_settings',
    'extension_tool_highlight_tabs',
    'extension_tool_list_active_tabs',
    'extension_tool_move_tabs',
    'extension_tool_reload_tab',
    'extension_tool_set_tab_zoom',
    'extension_tool_set_tab_zoom_settings',
    'extension_tool_update_tab',
  ].sort();

  const windowToolNames = [
    'extension_tool_create_window',
    'extension_tool_get_all_windows',
    'extension_tool_get_current_window',
    'extension_tool_get_last_focused_window',
    'extension_tool_get_window',
    'extension_tool_remove_window',
    'extension_tool_update_window',
  ].sort();

  const historyToolNames = [
    'extension_tool_add_history_url',
    'extension_tool_delete_all_history',
    'extension_tool_delete_history_range',
    'extension_tool_delete_history_url',
    'extension_tool_get_history_visits',
    'extension_tool_search_history',
  ].sort();

  const storageToolNames = [
    'extension_tool_clear_storage',
    'extension_tool_get_storage',
    'extension_tool_get_storage_bytes_in_use',
    'extension_tool_remove_storage',
    'extension_tool_set_storage',
  ].sort();

  const tabGroupsToolNames = [
    'extension_tool_close_tabs',
    'extension_tool_create_tab',
    'extension_tool_get_tab_group',
    'extension_tool_group_tabs',
    'extension_tool_move_tab_group',
    'extension_tool_query_tab_groups',
    'extension_tool_ungroup_tabs',
    'extension_tool_update_tab_group',
  ].sort();

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

      const createTabResult = await callToolResult(page, 'extension_tool_create_tab', {
        url: 'about:blank',
        active: false,
      });
      const createdTabId = (createTabResult.structuredContent as { id?: number })?.id;
      assert.ok(Number.isInteger(createdTabId) && createdTabId > 0);

      const tabsResult = await callJsonTool<{ tabs: Array<{ id?: number; url?: string }> }>(
        page,
        'extension_tool_get_all_tabs',
        {}
      );
      assert.ok(tabsResult.tabs.some((tab) => tab.id === createdTabId));

      const closeTabResult = await callToolResult(page, 'extension_tool_close_tabs', {
        tabIds: [createdTabId],
      });
      assert.deepStrictEqual(closeTabResult.structuredContent, { tabIds: [createdTabId] });

      const tabsAfterClose = await callJsonTool<{ tabs: Array<{ id?: number }> }>(
        page,
        'extension_tool_get_all_tabs',
        {}
      );
      assert.ok(!tabsAfterClose.tabs.some((tab) => tab.id === createdTabId));
    } finally {
      await context.close();
    }
  });

  it('runs storage contracts against real Chrome storage APIs', async () => {
    const { context, extensionId } = await launchExtensionContext();

    try {
      const page = await openClientPage(context, extensionId);

      await registerStorageApiTools(page);
      await page.waitForFunction(async (expectedNames) => {
        const tools = await window.mcpClient?.listTools?.();
        const names = new Set(tools?.tools.map((tool) => tool.name) ?? []);
        return expectedNames.every((name) => names.has(name));
      }, storageToolNames);

      const registeredDirectTools = (await listTools(page)).filter((name) =>
        name.startsWith('extension_tool_')
      );
      assert.deepStrictEqual(registeredDirectTools, storageToolNames);

      const areas = ['local', 'session', 'sync'] as const;
      const cleanupKeysByArea = new Map<(typeof areas)[number], string[]>();

      try {
        for (const area of areas) {
          const prefix = `webmcp_e2e_storage_${area}`;
          const keys = [`${prefix}_text`, `${prefix}_count`, `${prefix}_nested`];
          cleanupKeysByArea.set(area, keys);

          const setResult = await callToolResult(page, 'extension_tool_set_storage', {
            area,
            data: {
              [keys[0]]: `stored in ${area}`,
              [keys[1]]: 2,
              [keys[2]]: { ok: true, area },
            },
          });
          assert.strictEqual(setResult.isError, undefined);
          assert.deepStrictEqual(setResult.structuredContent, { keys });
          assert.ok(
            (setResult.content?.[0]?.text ?? '').includes(`Stored 3 key(s) in ${area} storage`)
          );

          const getResult = await callToolResult(page, 'extension_tool_get_storage', {
            area,
            keys,
          });
          const stored = {
            area,
            data: {
              [keys[0]]: `stored in ${area}`,
              [keys[1]]: 2,
              [keys[2]]: { ok: true, area },
            },
            keyCount: 3,
          };
          assert.deepStrictEqual(JSON.parse(getResult.content?.[0]?.text ?? ''), stored);
          assert.deepStrictEqual(getResult.structuredContent, stored);

          const bytesResult = await callToolResult(
            page,
            'extension_tool_get_storage_bytes_in_use',
            {
              area,
              keys,
            }
          );
          assert.strictEqual(bytesResult.isError, undefined);
          assert.deepStrictEqual(
            bytesResult.structuredContent,
            JSON.parse(bytesResult.content?.[0]?.text ?? '')
          );
          assert.strictEqual(bytesResult.structuredContent?.area, area);
          assert.strictEqual(typeof bytesResult.structuredContent?.bytesInUse, 'number');
          assert.strictEqual(typeof bytesResult.structuredContent?.humanReadable, 'string');
          assert.ok(Number(bytesResult.structuredContent?.bytesInUse) > 0);
          assert.ok(
            bytesResult.structuredContent?.quota === null ||
              typeof bytesResult.structuredContent?.quota === 'object'
          );
          assert.ok(
            bytesResult.structuredContent?.percentageUsed === null ||
              typeof bytesResult.structuredContent?.percentageUsed === 'string'
          );

          const removeResult = await callToolResult(page, 'extension_tool_remove_storage', {
            area,
            keys: [keys[0]],
          });
          assert.strictEqual(removeResult.isError, undefined);
          assert.deepStrictEqual(removeResult.structuredContent, { keys: [keys[0]] });

          const afterRemoveResult = await callToolResult(page, 'extension_tool_get_storage', {
            area,
            keys,
          });
          assert.deepStrictEqual(afterRemoveResult.structuredContent, {
            area,
            data: {
              [keys[1]]: 2,
              [keys[2]]: { ok: true, area },
            },
            keyCount: 2,
          });

          await callToolResult(page, 'extension_tool_remove_storage', {
            area,
            keys,
          });
          cleanupKeysByArea.delete(area);
        }

        const clearKey = 'webmcp_e2e_storage_session_clear';
        cleanupKeysByArea.set('session', [clearKey]);
        await callToolResult(page, 'extension_tool_set_storage', {
          area: 'session',
          data: { [clearKey]: true },
        });
        const clearResult = await callToolResult(page, 'extension_tool_clear_storage', {
          area: 'session',
          confirm: true,
        });
        assert.strictEqual(clearResult.isError, undefined);
        assert.strictEqual(clearResult.structuredContent, undefined);
        assert.strictEqual(clearResult.content?.[0]?.text, 'Cleared all data from session storage');
        cleanupKeysByArea.delete('session');

        const afterClearResult = await callToolResult(page, 'extension_tool_get_storage', {
          area: 'session',
          keys: [clearKey],
        });
        assert.deepStrictEqual(afterClearResult.structuredContent, {
          area: 'session',
          data: {},
          keyCount: 0,
        });

        const clearWithoutConfirmResult = await callToolResult(
          page,
          'extension_tool_clear_storage',
          {
            area: 'local',
            confirm: false,
          }
        );
        assert.strictEqual(clearWithoutConfirmResult.isError, true);
        assert.ok(
          (clearWithoutConfirmResult.content?.[0]?.text ?? '').includes('requires confirm=true')
        );

        const validationErrorResult = await callToolResult(page, 'extension_tool_set_storage', {
          area: 'local',
        });
        assert.strictEqual(validationErrorResult.isError, true);
        assert.ok((validationErrorResult.content?.[0]?.text ?? '').length > 0);
      } finally {
        for (const [area, keys] of cleanupKeysByArea) {
          await callToolResult(page, 'extension_tool_remove_storage', { area, keys });
        }
      }
    } finally {
      await context.close();
    }
  });

  it('runs tabs contracts against real Chrome tabs APIs', async () => {
    const { context, extensionId } = await launchExtensionContext();

    try {
      const page = await openClientPage(context, extensionId);

      await registerTabsApiTools(page);
      await page.waitForFunction(async (expectedNames) => {
        const tools = await window.mcpClient?.listTools?.();
        const names = new Set(tools?.tools.map((tool) => tool.name) ?? []);
        return expectedNames.every((name) => names.has(name));
      }, tabToolNames);

      const registeredDirectTools = (await listTools(page)).filter((name) =>
        name.startsWith('extension_tool_')
      );
      assert.deepStrictEqual(registeredDirectTools, tabToolNames);

      const cleanupTabIds = new Set<number>();
      const closeIfPresent = async (tabId: number) => {
        const result = await callToolResult(page, 'extension_tool_close_tabs', {
          tabIds: [tabId],
        });
        if (result.isError !== true) {
          cleanupTabIds.delete(tabId);
        }
      };

      try {
        const firstTabResult = await callToolResult(page, 'extension_tool_create_tab', {
          url: 'about:blank',
          active: false,
          pinned: false,
        });
        const firstTab = firstTabResult.structuredContent as {
          id: number;
          index: number;
          windowId: number;
          active: boolean;
          pinned: boolean;
          url?: string;
        };
        assert.strictEqual(firstTabResult.isError, undefined);
        assert.strictEqual(firstTab.url, '');
        assert.strictEqual(firstTab.active, false);
        assert.strictEqual(firstTab.pinned, false);
        cleanupTabIds.add(firstTab.id);

        const secondTabResult = await callToolResult(page, 'extension_tool_create_tab', {
          url: `data:text/html,<title>WebMCP%20Tabs%20E2E</title><p>tabs</p>`,
          active: false,
        });
        const secondTab = secondTabResult.structuredContent as { id: number; index: number };
        cleanupTabIds.add(secondTab.id);

        const getAllResult = await callToolResult(page, 'extension_tool_get_all_tabs', {});
        assert.deepStrictEqual(
          getAllResult.structuredContent,
          JSON.parse(getAllResult.content?.[0]?.text ?? '')
        );
        assert.ok(
          ((getAllResult.structuredContent as any).tabs as Array<{ id?: number }>).some(
            (candidate) => candidate.id === firstTab.id
          )
        );

        const listActiveResult = await callToolResult(page, 'extension_tool_list_active_tabs', {});
        assert.strictEqual(typeof listActiveResult.structuredContent?.domains, 'object');
        assert.ok(Number(listActiveResult.structuredContent?.totalTabs) >= 2);

        const getTabResult = await callToolResult(page, 'extension_tool_get_tab', {
          tabId: firstTab.id,
        });
        assert.strictEqual((getTabResult.structuredContent as any).tab.id, firstTab.id);

        const updateResult = await callToolResult(page, 'extension_tool_update_tab', {
          tabId: firstTab.id,
          pinned: true,
        });
        assert.deepStrictEqual((updateResult.structuredContent as any).changes, { pinned: true });
        assert.strictEqual((updateResult.structuredContent as any).tab.pinned, true);

        const moveResult = await callToolResult(page, 'extension_tool_move_tabs', {
          tabIds: [firstTab.id],
          index: secondTab.index,
        });
        assert.strictEqual((moveResult.structuredContent as any).tabs[0].id, firstTab.id);

        const highlightResult = await callToolResult(page, 'extension_tool_highlight_tabs', {
          tabs: [secondTab.index],
          windowId: firstTab.windowId,
        });
        assert.strictEqual(typeof (highlightResult.structuredContent as any).window.id, 'number');

        const getZoomResult = await callToolResult(page, 'extension_tool_get_tab_zoom', {
          tabId: firstTab.id,
        });
        assert.strictEqual(typeof getZoomResult.structuredContent?.zoomFactor, 'number');

        const setZoomResult = await callToolResult(page, 'extension_tool_set_tab_zoom', {
          tabId: firstTab.id,
          zoomFactor: 1,
        });
        assert.deepStrictEqual(setZoomResult.structuredContent, {
          tabId: firstTab.id,
          zoomFactor: 1,
        });

        const getZoomSettingsResult = await callToolResult(
          page,
          'extension_tool_get_tab_zoom_settings',
          { tabId: firstTab.id }
        );
        assert.deepStrictEqual(Object.keys(getZoomSettingsResult.structuredContent ?? {}).sort(), [
          'defaultZoomFactor',
          'mode',
          'scope',
        ]);

        const setZoomSettingsResult = await callToolResult(
          page,
          'extension_tool_set_tab_zoom_settings',
          {
            tabId: firstTab.id,
            mode: 'automatic',
            scope: 'per-origin',
          }
        );
        assert.deepStrictEqual(
          Object.keys((setZoomSettingsResult.structuredContent as any).settings).sort(),
          ['defaultZoomFactor', 'mode', 'scope']
        );

        const languageResult = await callToolResult(page, 'extension_tool_detect_tab_language', {
          tabId: secondTab.id,
        });
        assert.strictEqual(typeof languageResult.structuredContent?.language, 'string');

        const reloadResult = await callToolResult(page, 'extension_tool_reload_tab', {
          tabId: firstTab.id,
        });
        assert.deepStrictEqual(reloadResult.structuredContent, {
          tabId: firstTab.id,
          bypassCache: false,
        });

        const duplicateResult = await callToolResult(page, 'extension_tool_duplicate_tab', {
          tabId: firstTab.id,
        });
        const duplicatedTabId = (duplicateResult.structuredContent as any).tab.id as number;
        assert.ok(Number.isInteger(duplicatedTabId));
        cleanupTabIds.add(duplicatedTabId);

        const closeDuplicateResult = await callToolResult(page, 'extension_tool_close_tabs', {
          tabIds: [duplicatedTabId],
        });
        assert.deepStrictEqual(closeDuplicateResult.structuredContent, {
          tabIds: [duplicatedTabId],
        });
        cleanupTabIds.delete(duplicatedTabId);

        const missingTabResult = await callToolResult(page, 'extension_tool_get_tab', {
          tabId: duplicatedTabId,
        });
        assert.strictEqual(missingTabResult.isError, true);
      } finally {
        for (const tabId of [...cleanupTabIds].reverse()) {
          await closeIfPresent(tabId);
        }
      }
    } finally {
      await context.close();
    }
  });

  it('runs tab-groups contracts against real Chrome tabGroups APIs', async () => {
    const { context, extensionId } = await launchExtensionContext();

    try {
      const page = await openClientPage(context, extensionId);

      await registerTabGroupsApiTools(page);
      await page.waitForFunction(async (expectedNames) => {
        const tools = await window.mcpClient?.listTools?.();
        const names = new Set(tools?.tools.map((tool) => tool.name) ?? []);
        return expectedNames.every((name) => names.has(name));
      }, tabGroupsToolNames);

      const registeredDirectTools = (await listTools(page)).filter((name) =>
        name.startsWith('extension_tool_')
      );
      assert.deepStrictEqual(registeredDirectTools, tabGroupsToolNames);

      const cleanupTabIds = new Set<number>();
      const closeIfPresent = async (tabId: number) => {
        const result = await callToolResult(page, 'extension_tool_close_tabs', {
          tabIds: [tabId],
        });
        if (result.isError !== true) {
          cleanupTabIds.delete(tabId);
        }
      };

      try {
        const firstTabResult = await callToolResult(page, 'extension_tool_create_tab', {
          url: 'about:blank',
          active: false,
        });
        const secondTabResult = await callToolResult(page, 'extension_tool_create_tab', {
          url: 'about:blank',
          active: false,
        });
        const firstTabId = (firstTabResult.structuredContent as { id: number }).id;
        const secondTabId = (secondTabResult.structuredContent as { id: number }).id;
        cleanupTabIds.add(firstTabId);
        cleanupTabIds.add(secondTabId);

        const groupTabsResult = await callToolResult(page, 'extension_tool_group_tabs', {
          tabIds: [firstTabId, secondTabId],
        });
        assert.strictEqual(groupTabsResult.isError, undefined);
        assert.deepStrictEqual(Object.keys(groupTabsResult.structuredContent ?? {}).sort(), [
          'groupId',
        ]);
        const groupId = (groupTabsResult.structuredContent as { groupId: number }).groupId;
        assert.ok(Number.isInteger(groupId) && groupId >= 0);

        const updatedTitle = `WebMCP Tab Group E2E ${Date.now()}`;
        const updateResult = await callToolResult(page, 'extension_tool_update_tab_group', {
          groupId,
          title: updatedTitle,
          color: 'cyan',
          collapsed: false,
        });
        assert.strictEqual(updateResult.isError, undefined);
        const updatedGroup = updateResult.structuredContent as {
          id: number;
          title: string;
          color: string;
          collapsed: boolean;
          windowId: number;
          shared?: boolean;
        };
        assert.deepStrictEqual(
          updateResult.structuredContent,
          JSON.parse((updateResult.content?.[0]?.text ?? '').split('\n').slice(1).join('\n'))
        );
        assert.strictEqual(updatedGroup.id, groupId);
        assert.strictEqual(updatedGroup.title, updatedTitle);
        assert.strictEqual(updatedGroup.color, 'cyan');
        assert.strictEqual(updatedGroup.collapsed, false);
        assert.strictEqual(typeof updatedGroup.windowId, 'number');

        const getResult = await callToolResult(page, 'extension_tool_get_tab_group', {
          groupId,
        });
        assert.deepStrictEqual(
          getResult.structuredContent,
          JSON.parse(getResult.content?.[0]?.text ?? '')
        );
        assert.deepStrictEqual(getResult.structuredContent, updatedGroup);

        const queryResult = await callToolResult(page, 'extension_tool_query_tab_groups', {
          title: updatedTitle,
          color: 'cyan',
          collapsed: false,
          windowId: -2,
        });
        assert.deepStrictEqual(
          queryResult.structuredContent,
          JSON.parse(queryResult.content?.[0]?.text ?? '')
        );
        const queryContent = queryResult.structuredContent as {
          count: number;
          groups: Array<{ id: number; title?: string; color: string; collapsed: boolean }>;
        };
        assert.ok(queryContent.count >= 1);
        assert.ok(queryContent.groups.some((group) => group.id === groupId));

        const moveResult = await callToolResult(page, 'extension_tool_move_tab_group', {
          groupId,
          index: -1,
        });
        assert.strictEqual(moveResult.isError, undefined);
        const movedGroup = moveResult.structuredContent as { id: number; windowId: number };
        assert.strictEqual(movedGroup.id, groupId);
        assert.deepStrictEqual(
          moveResult.structuredContent,
          JSON.parse((moveResult.content?.[0]?.text ?? '').split('\n').slice(1).join('\n'))
        );
        assert.ok(!('newIndex' in movedGroup));

        const ungroupResult = await callToolResult(page, 'extension_tool_ungroup_tabs', {
          tabIds: [firstTabId, secondTabId],
        });
        assert.deepStrictEqual(ungroupResult.structuredContent, {
          tabIds: [firstTabId, secondTabId],
        });

        const missingGroupResult = await callToolResult(page, 'extension_tool_get_tab_group', {
          groupId,
        });
        assert.strictEqual(missingGroupResult.isError, true);
      } finally {
        for (const tabId of [...cleanupTabIds].reverse()) {
          await closeIfPresent(tabId);
        }
      }
    } finally {
      await context.close();
    }
  });

  it('runs windows contracts against real Chrome windows APIs', async () => {
    const { context, extensionId } = await launchExtensionContext();

    try {
      const page = await openClientPage(context, extensionId);

      await registerWindowsApiTools(page);
      await page.waitForFunction(async (expectedNames) => {
        const tools = await window.mcpClient?.listTools?.();
        const names = new Set(tools?.tools.map((tool) => tool.name) ?? []);
        return expectedNames.every((name) => names.has(name));
      }, windowToolNames);

      const registeredDirectTools = (await listTools(page)).filter((name) =>
        name.startsWith('extension_tool_')
      );
      assert.deepStrictEqual(registeredDirectTools, windowToolNames);

      const cleanupWindowIds = new Set<number>();
      const removeIfPresent = async (windowId: number) => {
        const result = await callToolResult(page, 'extension_tool_remove_window', { windowId });
        if (result.isError !== true) {
          cleanupWindowIds.delete(windowId);
        }
      };

      try {
        const createResult = await callToolResult(page, 'extension_tool_create_window', {
          url: 'about:blank',
          focused: false,
          type: 'normal',
          width: 640,
          height: 480,
        });
        assert.strictEqual(createResult.isError, undefined);
        assert.deepStrictEqual(
          createResult.structuredContent,
          JSON.parse(createResult.content?.[0]?.text ?? '')
        );
        const createdWindow = createResult.structuredContent as {
          id: number;
          focused: boolean;
          incognito: boolean;
          alwaysOnTop: boolean;
          state: string;
          type: string;
          width?: number;
          height?: number;
          tabs?: Array<{ id?: number; active?: boolean; url?: string }>;
        };
        assert.ok(Number.isInteger(createdWindow.id));
        assert.strictEqual(typeof createdWindow.focused, 'boolean');
        assert.strictEqual(typeof createdWindow.incognito, 'boolean');
        assert.strictEqual(typeof createdWindow.alwaysOnTop, 'boolean');
        assert.strictEqual(createdWindow.state, 'normal');
        assert.strictEqual(createdWindow.type, 'normal');
        cleanupWindowIds.add(createdWindow.id);

        const getResult = await callToolResult(page, 'extension_tool_get_window', {
          windowId: createdWindow.id,
          populate: true,
        });
        assert.strictEqual((getResult.structuredContent as any).id, createdWindow.id);
        assert.ok(Array.isArray((getResult.structuredContent as any).tabs));

        const getAllResult = await callToolResult(page, 'extension_tool_get_all_windows', {
          populate: true,
          windowTypes: ['normal'],
        });
        assert.deepStrictEqual(
          getAllResult.structuredContent,
          JSON.parse(getAllResult.content?.[0]?.text ?? '')
        );
        assert.ok(Number((getAllResult.structuredContent as any).count) >= 1);
        assert.ok(
          ((getAllResult.structuredContent as any).windows as Array<{ id?: number }>).some(
            (candidate) => candidate.id === createdWindow.id
          )
        );

        const currentResult = await callToolResult(page, 'extension_tool_get_current_window', {});
        assert.strictEqual(typeof currentResult.structuredContent?.id, 'number');

        const lastFocusedResult = await callToolResult(
          page,
          'extension_tool_get_last_focused_window',
          {}
        );
        assert.strictEqual(typeof lastFocusedResult.structuredContent?.id, 'number');

        const updateResult = await callToolResult(page, 'extension_tool_update_window', {
          windowId: createdWindow.id,
          width: 620,
          height: 460,
        });
        assert.strictEqual(updateResult.isError, undefined);
        assert.strictEqual((updateResult.structuredContent as any).id, createdWindow.id);
        assert.strictEqual((updateResult.structuredContent as any).state, 'normal');

        const removeResult = await callToolResult(page, 'extension_tool_remove_window', {
          windowId: createdWindow.id,
        });
        assert.deepStrictEqual(removeResult.structuredContent, { windowId: createdWindow.id });
        cleanupWindowIds.delete(createdWindow.id);

        const missingResult = await callToolResult(page, 'extension_tool_get_window', {
          windowId: createdWindow.id,
        });
        assert.strictEqual(missingResult.isError, true);
      } finally {
        for (const windowId of [...cleanupWindowIds].reverse()) {
          await removeIfPresent(windowId);
        }
      }
    } finally {
      await context.close();
    }
  });

  it('runs bookmark contracts against real Chrome bookmarks APIs', async () => {
    const { context, extensionId } = await launchExtensionContext();

    try {
      const page = await openClientPage(context, extensionId);

      await registerBookmarkApiTools(page);
      await page.waitForFunction(async (expectedNames) => {
        const tools = await window.mcpClient?.listTools?.();
        const names = new Set(tools?.tools.map((tool) => tool.name) ?? []);
        return expectedNames.every((name) => names.has(name));
      }, bookmarkToolNames);

      const registeredDirectTools = (await listTools(page)).filter((name) =>
        name.startsWith('extension_tool_')
      );
      assert.deepStrictEqual(registeredDirectTools, bookmarkToolNames);

      const suffix = `${Date.now()}`;
      const sourceTitle = `WebMCP E2E Source ${suffix}`;
      const destTitle = `WebMCP E2E Dest ${suffix}`;
      const bookmarkTitle = `WebMCP E2E Bookmark ${suffix}`;
      const updatedTitle = `WebMCP E2E Bookmark Updated ${suffix}`;
      const bookmarkUrl = `https://example.com/webmcp-bookmark-e2e-${suffix}`;
      const cleanupIds = new Set<string>();

      const removeTreeIfPresent = async (id: string) => {
        const result = await callToolResult(page, 'extension_tool_remove_bookmark_tree', { id });
        if (result.isError !== true) {
          cleanupIds.delete(id);
        }
      };

      try {
        const sourceFolder = await callToolResult(page, 'extension_tool_create_bookmark', {
          title: sourceTitle,
        });
        const source = sourceFolder.structuredContent as {
          id: string;
          title: string;
          parentId: string;
          index: number;
          dateAdded: number;
          type: string;
        };
        assert.deepStrictEqual(Object.keys(source).sort(), [
          'dateAdded',
          'id',
          'index',
          'parentId',
          'title',
          'type',
        ]);
        assert.strictEqual(source.title, sourceTitle);
        assert.strictEqual(source.type, 'folder');
        cleanupIds.add(source.id);

        const destFolder = await callToolResult(page, 'extension_tool_create_bookmark', {
          title: destTitle,
        });
        const dest = destFolder.structuredContent as { id: string; title: string; type: string };
        assert.strictEqual(dest.title, destTitle);
        assert.strictEqual(dest.type, 'folder');
        cleanupIds.add(dest.id);

        const createdBookmark = await callToolResult(page, 'extension_tool_create_bookmark', {
          parentId: source.id,
          title: bookmarkTitle,
          url: bookmarkUrl,
        });
        const bookmark = createdBookmark.structuredContent as {
          id: string;
          title: string;
          url: string;
          parentId: string;
          type: string;
        };
        assert.strictEqual(bookmark.title, bookmarkTitle);
        assert.strictEqual(bookmark.url, bookmarkUrl);
        assert.strictEqual(bookmark.parentId, source.id);
        assert.strictEqual(bookmark.type, 'bookmark');

        const getResult = await callToolResult(page, 'extension_tool_get_bookmarks', {
          idOrIdList: bookmark.id,
        });
        assert.deepStrictEqual(
          getResult.structuredContent,
          JSON.parse(getResult.content?.[0]?.text ?? '')
        );
        assert.deepStrictEqual(getResult.structuredContent, {
          count: 1,
          bookmarks: [
            {
              ...bookmark,
              index: 0,
              dateAdded: (getResult.structuredContent as any).bookmarks[0].dateAdded,
              dateAddedFormatted: (getResult.structuredContent as any).bookmarks[0]
                .dateAddedFormatted,
            },
          ],
        });

        const childrenResult = await callToolResult(page, 'extension_tool_get_bookmark_children', {
          id: source.id,
        });
        assert.strictEqual(childrenResult.structuredContent?.parentId, source.id);
        assert.strictEqual(childrenResult.structuredContent?.count, 1);
        assert.strictEqual(
          (childrenResult.structuredContent as any).children[0].title,
          bookmarkTitle
        );

        const recentResult = await callToolResult(page, 'extension_tool_get_recent_bookmarks', {
          numberOfItems: 5,
        });
        assert.ok(
          ((recentResult.structuredContent as any).recentBookmarks as Array<{ id: string }>).some(
            (candidate) => candidate.id === bookmark.id
          )
        );

        const subtreeResult = await callToolResult(page, 'extension_tool_get_bookmark_subtree', {
          id: source.id,
        });
        assert.strictEqual((subtreeResult.structuredContent as any).rootId, source.id);
        assert.strictEqual(
          (subtreeResult.structuredContent as any).subtree[0].children[0].id,
          bookmark.id
        );

        const treeResult = await callToolResult(page, 'extension_tool_get_bookmark_tree', {});
        assert.ok(Array.isArray((treeResult.structuredContent as any).tree));

        const searchResult = await callToolResult(page, 'extension_tool_search_bookmarks', {
          query: { title: bookmarkTitle },
        });
        assert.deepStrictEqual(
          searchResult.structuredContent,
          JSON.parse(searchResult.content?.[0]?.text ?? '')
        );
        assert.strictEqual(
          (searchResult.structuredContent as any).query,
          JSON.stringify({ title: bookmarkTitle })
        );
        assert.ok(
          ((searchResult.structuredContent as any).results as Array<{ id: string }>).some(
            (candidate) => candidate.id === bookmark.id
          )
        );

        const updateResult = await callToolResult(page, 'extension_tool_update_bookmark', {
          id: bookmark.id,
          title: updatedTitle,
        });
        assert.strictEqual(updateResult.isError, undefined);
        assert.deepStrictEqual(updateResult.structuredContent, {
          id: bookmark.id,
          title: updatedTitle,
          url: bookmarkUrl,
          parentId: source.id,
          index: 0,
          type: 'bookmark',
          changes: { title: updatedTitle },
        });

        const moveResult = await callToolResult(page, 'extension_tool_move_bookmark', {
          id: bookmark.id,
          parentId: dest.id,
        });
        assert.deepStrictEqual(moveResult.structuredContent, {
          id: bookmark.id,
          title: updatedTitle,
          url: bookmarkUrl,
          parentId: dest.id,
          index: 0,
          type: 'bookmark',
        });

        const removeResult = await callToolResult(page, 'extension_tool_remove_bookmark', {
          id: bookmark.id,
        });
        assert.deepStrictEqual(removeResult.structuredContent, { id: bookmark.id });

        const missingResult = await callToolResult(page, 'extension_tool_get_bookmarks', {
          idOrIdList: bookmark.id,
        });
        assert.strictEqual(missingResult.isError, true);

        const nestedFolder = await callToolResult(page, 'extension_tool_create_bookmark', {
          parentId: source.id,
          title: `WebMCP E2E Nested ${suffix}`,
        });
        const nested = nestedFolder.structuredContent as { id: string };
        await callToolResult(page, 'extension_tool_create_bookmark', {
          parentId: nested.id,
          title: `WebMCP E2E Nested Bookmark ${suffix}`,
          url: `https://example.com/webmcp-bookmark-e2e-nested-${suffix}`,
        });

        const removeTreeResult = await callToolResult(page, 'extension_tool_remove_bookmark_tree', {
          id: source.id,
        });
        assert.deepStrictEqual(removeTreeResult.structuredContent, { id: source.id });
        cleanupIds.delete(source.id);

        await removeTreeIfPresent(dest.id);
      } finally {
        for (const id of [...cleanupIds].reverse()) {
          await removeTreeIfPresent(id);
        }
      }
    } finally {
      await context.close();
    }
  });

  it('runs history contracts against real Chrome history APIs', async () => {
    const { context, extensionId } = await launchExtensionContext();

    try {
      const page = await openClientPage(context, extensionId);

      await registerHistoryApiTools(page);
      await page.waitForFunction(async (expectedNames) => {
        const tools = await window.mcpClient?.listTools?.();
        const names = new Set(tools?.tools.map((tool) => tool.name) ?? []);
        return expectedNames.every((name) => names.has(name));
      }, historyToolNames);

      const registeredDirectTools = (await listTools(page)).filter((name) =>
        name.startsWith('extension_tool_')
      );
      assert.deepStrictEqual(registeredDirectTools, historyToolNames);

      const suffix = `${Date.now()}`;
      const urlForDeleteUrl = `https://example.com/webmcp-history-e2e-delete-url-${suffix}`;
      const urlForDeleteRange = `https://example.com/webmcp-history-e2e-delete-range-${suffix}`;
      const urlForDeleteAll = `https://example.com/webmcp-history-e2e-delete-all-${suffix}`;
      const cleanupUrls = new Set([urlForDeleteUrl, urlForDeleteRange, urlForDeleteAll]);
      const removeUrlIfPresent = async (url: string) => {
        const result = await callToolResult(page, 'extension_tool_delete_history_url', { url });
        if (result.isError !== true) {
          cleanupUrls.delete(url);
        }
      };

      try {
        const addResult = await callToolResult(page, 'extension_tool_add_history_url', {
          url: urlForDeleteUrl,
        });
        assert.strictEqual(addResult.isError, undefined);
        assert.deepStrictEqual(addResult.structuredContent, { url: urlForDeleteUrl });

        const searchResult = await callToolResult(page, 'extension_tool_search_history', {
          text: urlForDeleteUrl,
          maxResults: 5,
        });
        assert.strictEqual(searchResult.isError, undefined);
        assert.deepStrictEqual(
          searchResult.structuredContent,
          JSON.parse(searchResult.content?.[0]?.text ?? '')
        );
        const searchContent = searchResult.structuredContent as {
          query: { text: string; maxResults: number };
          resultCount: number;
          results: Array<{ id: string; url?: string; title?: string; lastVisitTime?: number }>;
        };
        assert.deepStrictEqual(searchContent.query, {
          text: urlForDeleteUrl,
          maxResults: 5,
        });
        assert.ok(searchContent.resultCount >= 1);
        assert.ok(searchContent.results.some((item) => item.url === urlForDeleteUrl));

        const visitsResult = await callToolResult(page, 'extension_tool_get_history_visits', {
          url: urlForDeleteUrl,
        });
        assert.strictEqual(visitsResult.isError, undefined);
        assert.deepStrictEqual(
          visitsResult.structuredContent,
          JSON.parse(visitsResult.content?.[0]?.text ?? '')
        );
        const visitsContent = visitsResult.structuredContent as {
          url: string;
          visitCount: number;
          visits: Array<{ id: string; visitId: string; transition: string; visitTime?: number }>;
        };
        assert.strictEqual(visitsContent.url, urlForDeleteUrl);
        assert.ok(visitsContent.visitCount >= 1);
        assert.ok(visitsContent.visits.some((visit) => visit.transition === 'link'));

        const deleteUrlResult = await callToolResult(page, 'extension_tool_delete_history_url', {
          url: urlForDeleteUrl,
        });
        assert.deepStrictEqual(deleteUrlResult.structuredContent, { url: urlForDeleteUrl });
        cleanupUrls.delete(urlForDeleteUrl);

        const searchDeletedUrlResult = await callToolResult(page, 'extension_tool_search_history', {
          text: urlForDeleteUrl,
          maxResults: 5,
        });
        assert.strictEqual((searchDeletedUrlResult.structuredContent as any).resultCount, 0);

        await callToolResult(page, 'extension_tool_add_history_url', {
          url: urlForDeleteRange,
        });
        const rangeStart = Date.now() - 60_000;
        const rangeEnd = Date.now() + 60_000;
        const deleteRangeResult = await callToolResult(
          page,
          'extension_tool_delete_history_range',
          {
            startTime: rangeStart,
            endTime: rangeEnd,
          }
        );
        assert.strictEqual(deleteRangeResult.isError, undefined);
        assert.deepStrictEqual(deleteRangeResult.structuredContent, {
          startTime: rangeStart,
          endTime: rangeEnd,
          startTimeFormatted: new Date(rangeStart).toISOString(),
          endTimeFormatted: new Date(rangeEnd).toISOString(),
        });
        cleanupUrls.delete(urlForDeleteRange);

        const invalidRangeResult = await callToolResult(
          page,
          'extension_tool_delete_history_range',
          {
            startTime: rangeEnd,
            endTime: rangeStart,
          }
        );
        assert.strictEqual(invalidRangeResult.isError, true);

        await callToolResult(page, 'extension_tool_add_history_url', {
          url: urlForDeleteAll,
        });
        const deleteAllResult = await callToolResult(page, 'extension_tool_delete_all_history', {});
        assert.strictEqual(deleteAllResult.isError, undefined);
        assert.strictEqual(deleteAllResult.structuredContent, undefined);
        assert.ok(deleteAllResult.content?.[0]?.text?.includes('All history deleted successfully'));
        cleanupUrls.delete(urlForDeleteAll);

        const searchAfterDeleteAllResult = await callToolResult(
          page,
          'extension_tool_search_history',
          {
            text: urlForDeleteAll,
            maxResults: 5,
          }
        );
        assert.strictEqual((searchAfterDeleteAllResult.structuredContent as any).resultCount, 0);
      } finally {
        for (const url of cleanupUrls) {
          await removeUrlIfPresent(url);
        }
      }
    } finally {
      await context.close();
    }
  });
});
