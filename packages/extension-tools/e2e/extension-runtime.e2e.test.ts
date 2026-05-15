import assert from 'node:assert';
import { accessSync, mkdtempSync, rmSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { after, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import { type BrowserContext, chromium, type Page } from 'playwright';
import type { z } from 'zod';
import {
  clearAlarmOutputSchema,
  clearAllAlarmsOutputSchema,
  createAlarmOutputSchema,
  getAlarmOutputSchema,
  getAllAlarmsOutputSchema,
} from '../src/contracts/alarms.ts';
import {
  getAllCookieStoresOutputSchema,
  getAllCookiesOutputSchema,
  getCookieOutputSchema,
  getPartitionKeyOutputSchema,
  removeCookieOutputSchema,
  setCookieOutputSchema,
} from '../src/contracts/cookies.ts';
import {
  downloadFileOutputSchema,
  eraseDownloadsOutputSchema,
  getFileIconOutputSchema,
  searchDownloadsOutputSchema,
} from '../src/contracts/downloads.ts';
import {
  containsPermissionsOutputSchema,
  getAllPermissionsOutputSchema,
} from '../src/contracts/permissions.ts';
import {
  executeScriptOutputSchema,
  executeUserScriptOutputSchema,
} from '../src/contracts/scripting.ts';
import { messageResultSchema } from '../src/contracts/shared.ts';
import {
  runtimeContextsOutputSchema,
  runtimeGetUrlOutputSchema,
  runtimeManifestOutputSchema,
  runtimePlatformInfoOutputSchema,
} from '../src/contracts/runtime.ts';

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
    acceptDownloads: true,
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

async function callToolResult(
  page: Page,
  name: string,
  args: Record<string, unknown>
): Promise<unknown> {
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

async function callStructured<TSchema extends z.ZodTypeAny>(
  page: Page,
  name: string,
  args: Record<string, unknown>,
  schema: TSchema
): Promise<z.infer<TSchema>> {
  const result = (await Promise.race([
    callToolResult(page, name, args),
    new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error(`${name} timed out`)), 5000);
    }),
  ])) as {
    isError?: boolean;
    content?: Array<{ text?: string }>;
    structuredContent?: unknown;
  };
  assert.notStrictEqual(
    result.isError,
    true,
    `${name} returned error: ${result.content?.[0]?.text ?? JSON.stringify(result)}`
  );
  assert.notStrictEqual(
    result.structuredContent,
    undefined,
    `${name} returned no structuredContent`
  );
  return schema.parse(result.structuredContent);
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

async function getTabIdForUrl(page: Page, urlPrefix: string): Promise<number> {
  return page.evaluate(async (prefix) => {
    const tabs = await chrome.tabs.query({});
    const tab = tabs.find((candidate) => candidate.url?.startsWith(prefix));
    if (!tab?.id) throw new Error(`No tab found for URL prefix: ${prefix}`);
    return tab.id;
  }, urlPrefix);
}

async function startDownloadServer(): Promise<{ server: Server; origin: string }> {
  const server = createServer((request, response) => {
    if (request.url?.startsWith('/download.txt')) {
      response.writeHead(200, {
        'content-type': 'text/plain; charset=utf-8',
        'content-disposition': 'attachment; filename="download.txt"',
      });
      response.end('webmcp extension tools download fixture\n');
      return;
    }

    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    response.end('<!doctype html><title>WebMCP e2e fixture</title><main>fixture</main>');
  });

  await new Promise<void>((resolveListen) => {
    server.listen(0, '127.0.0.1', resolveListen);
  });

  const address = server.address() as AddressInfo;
  return { server, origin: `http://127.0.0.1:${address.port}` };
}

async function waitForDownloadState(
  page: Page,
  downloadId: number,
  state: 'in_progress' | 'interrupted' | 'complete'
) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const search = await callStructured(
      page,
      'extension_tool_search_downloads',
      {
        id: downloadId,
        limit: 1,
      },
      searchDownloadsOutputSchema
    );
    if (search.downloads[0]?.state === state) return search.downloads[0];
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 100));
  }
  throw new Error(`Download ${downloadId} did not reach state ${state}`);
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
      assert.ok(initialTools.includes('always_fail'));
      assert.ok(initialTools.includes('echo'));
      assert.ok(initialTools.includes('sum'));

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
      assert.ok((await listTools(firstPage)).includes('sum'));

      await firstPage.close();

      const secondPage = await openClientPage(context, extensionId);
      assert.ok((await listTools(secondPage)).includes('sum'));

      const echoText = await callTool(secondPage, 'echo', { message: 'reconnected' });
      assert.strictEqual(echoText, 'echo:reconnected');

      await secondPage.close();
    } finally {
      await context.close();
    }
  });

  it('schema-validates deterministic Chrome API outputs in real Chromium', async () => {
    const { context, extensionId } = await launchExtensionContext();
    const { server: downloadServer, origin } = await startDownloadServer();

    try {
      const page = await openClientPage(context, extensionId);
      const toolNames = await listTools(page);
      for (const name of [
        'extension_tool_create_alarm',
        'extension_tool_get_alarm',
        'extension_tool_get_all_alarms',
        'extension_tool_clear_alarm',
        'extension_tool_clear_all_alarms',
        'extension_tool_get_cookie',
        'extension_tool_get_all_cookies',
        'extension_tool_get_all_cookie_stores',
        'extension_tool_get_partition_key',
        'extension_tool_set_cookie',
        'extension_tool_remove_cookie',
        'extension_tool_download_file',
        'extension_tool_search_downloads',
        'extension_tool_get_file_icon',
        'extension_tool_remove_file',
        'extension_tool_erase_downloads',
        'extension_tool_runtime_get_contexts',
        'extension_tool_runtime_get_manifest',
        'extension_tool_runtime_get_platform_info',
        'extension_tool_runtime_get_url',
        'extension_tool_contains_permissions',
        'extension_tool_get_all_permissions',
        'extension_tool_execute_script',
        'extension_tool_insert_css',
        'extension_tool_remove_css',
      ]) {
        assert.ok(toolNames.includes(name), `${name} should be registered`);
      }

      const alarmName = `webmcp-e2e-${Date.now()}`;
      const alarm = await callStructured(
        page,
        'extension_tool_create_alarm',
        {
          name: alarmName,
          delayInMinutes: 1,
        },
        createAlarmOutputSchema
      );
      assert.strictEqual(alarm.alarm.name, alarmName);

      const fetchedAlarm = await callStructured(
        page,
        'extension_tool_get_alarm',
        { name: alarmName },
        getAlarmOutputSchema
      );
      assert.strictEqual(fetchedAlarm.alarm?.name, alarmName);

      const alarms = await callStructured(
        page,
        'extension_tool_get_all_alarms',
        {},
        getAllAlarmsOutputSchema
      );
      assert.ok(alarms.count >= 1);
      assert.ok(alarms.alarms.some((item) => item.name === alarmName));

      const stores = await callStructured(
        page,
        'extension_tool_get_all_cookie_stores',
        {},
        getAllCookieStoresOutputSchema
      );
      assert.ok(stores.count >= 1);
      assert.ok(Array.isArray(stores.cookieStores));

      const targetPage = await context.newPage();
      await targetPage.goto(`${origin}/fixture.html`);
      const targetTabId = await getTabIdForUrl(page, `${origin}/`);

      const cookieName = `webmcp_e2e_${Date.now()}`;
      const setCookie = await callStructured(
        page,
        'extension_tool_set_cookie',
        {
          url: origin,
          name: cookieName,
          value: 'cookie-value',
          sameSite: 'lax',
        },
        setCookieOutputSchema
      );
      assert.strictEqual(setCookie.cookie.name, cookieName);

      const getCookie = await callStructured(
        page,
        'extension_tool_get_cookie',
        {
          url: origin,
          name: cookieName,
        },
        getCookieOutputSchema
      );
      assert.strictEqual(getCookie.cookie?.value, 'cookie-value');

      const allCookies = await callStructured(
        page,
        'extension_tool_get_all_cookies',
        {
          url: origin,
          name: cookieName,
        },
        getAllCookiesOutputSchema
      );
      assert.strictEqual(allCookies.count, 1);

      const partition = await callStructured(
        page,
        'extension_tool_get_partition_key',
        {
          tabId: targetTabId,
          frameId: 0,
        },
        getPartitionKeyOutputSchema
      );
      assert.ok(typeof partition.partitionKey === 'object');

      const removeCookie = await callStructured(
        page,
        'extension_tool_remove_cookie',
        {
          url: origin,
          name: cookieName,
        },
        removeCookieOutputSchema
      );
      assert.strictEqual(removeCookie.removed, true);

      const downloadFilename = `webmcp-e2e-${Date.now()}.txt`;
      const download = await callStructured(
        page,
        'extension_tool_download_file',
        {
          url: `${origin}/download.txt`,
          filename: downloadFilename,
          conflictAction: 'overwrite',
        },
        downloadFileOutputSchema
      );
      assert.strictEqual(download.filename, downloadFilename);

      const completedDownload = await waitForDownloadState(page, download.downloadId, 'complete');
      assert.strictEqual(completedDownload.id, download.downloadId);

      const downloads = await callStructured(
        page,
        'extension_tool_search_downloads',
        {
          id: download.downloadId,
          limit: 1,
        },
        searchDownloadsOutputSchema
      );
      assert.strictEqual(downloads.count, 1);
      assert.strictEqual(downloads.downloads[0]?.id, download.downloadId);

      const iconResult = (await callToolResult(page, 'extension_tool_get_file_icon', {
        downloadId: download.downloadId,
        size: 16,
      })) as {
        content?: Array<{ text?: string }>;
        isError?: boolean;
        structuredContent?: unknown;
      };
      if (iconResult.isError) {
        assert.match(iconResult.content?.[0]?.text ?? '', /Icon not found/);
      } else {
        const icon = getFileIconOutputSchema.parse(iconResult.structuredContent);
        assert.strictEqual(icon.downloadId, download.downloadId);
        assert.strictEqual(icon.size, 16);
      }

      const removeFile = await callStructured(
        page,
        'extension_tool_remove_file',
        {
          downloadId: download.downloadId,
        },
        messageResultSchema
      );
      assert.strictEqual(removeFile.ok, true);

      const erase = await callStructured(
        page,
        'extension_tool_erase_downloads',
        {
          id: download.downloadId,
        },
        eraseDownloadsOutputSchema
      );
      assert.strictEqual(erase.erasedCount, 1);
      assert.deepStrictEqual(erase.erasedIds, [download.downloadId]);
      assert.strictEqual(erase.filesDeleted, false);

      const contexts = await callStructured(
        page,
        'extension_tool_runtime_get_contexts',
        {},
        runtimeContextsOutputSchema
      );
      assert.ok(contexts.count >= 1);

      const manifest = await callStructured(
        page,
        'extension_tool_runtime_get_manifest',
        {},
        runtimeManifestOutputSchema
      );
      assert.strictEqual(manifest.name, 'Extension Runtime Contract');
      assert.strictEqual(manifest.manifestVersion, 3);

      const platform = await callStructured(
        page,
        'extension_tool_runtime_get_platform_info',
        {},
        runtimePlatformInfoOutputSchema
      );
      assert.ok(platform.os.length > 0);
      assert.ok(platform.arch.length > 0);

      const url = await callStructured(
        page,
        'extension_tool_runtime_get_url',
        {
          path: 'client.html',
        },
        runtimeGetUrlOutputSchema
      );
      assert.strictEqual(url.relativePath, 'client.html');
      assert.ok(url.fullUrl.startsWith(`chrome-extension://${extensionId}/`));

      const permissions = await callStructured(
        page,
        'extension_tool_contains_permissions',
        {
          permissions: ['alarms'],
        },
        containsPermissionsOutputSchema
      );
      assert.strictEqual(permissions.hasPermissions, true);

      const allPermissions = await callStructured(
        page,
        'extension_tool_get_all_permissions',
        {},
        getAllPermissionsOutputSchema
      );
      assert.ok(allPermissions.permissions.includes('alarms'));

      const cssText = 'body { outline: 3px solid rgb(1, 2, 3); }';
      const css = await callStructured(
        page,
        'extension_tool_insert_css',
        {
          tabId: targetTabId,
          css: cssText,
        },
        messageResultSchema
      );
      assert.strictEqual(css.ok, true);

      const script = await callStructured(
        page,
        'extension_tool_execute_script',
        {
          tabId: targetTabId,
          code: 'document.title',
        },
        executeScriptOutputSchema
      );
      assert.strictEqual(script.injectionCount, 1);
      assert.strictEqual(script.results[0]?.result, 'WebMCP e2e fixture');

      if (toolNames.includes('extension_tool_execute_user_script')) {
        const userScriptResult = (await callToolResult(page, 'extension_tool_execute_user_script', {
          tabId: targetTabId,
          code: 'location.origin',
          world: 'MAIN',
        })) as {
          isError?: boolean;
          structuredContent?: { chromeApi?: string; message?: string };
        };

        if (userScriptResult.isError) {
          assert.strictEqual(
            userScriptResult.structuredContent?.chromeApi,
            'chrome.userScripts.execute'
          );
          assert.match(userScriptResult.structuredContent?.message ?? '', /userScripts/i);
        } else {
          const userScript = executeUserScriptOutputSchema.parse(
            userScriptResult.structuredContent
          );
          assert.strictEqual(userScript.injectionCount, 1);
          assert.strictEqual(userScript.results[0]?.result, origin);
        }
      }

      const removeCss = await callStructured(
        page,
        'extension_tool_remove_css',
        {
          tabId: targetTabId,
          css: cssText,
        },
        messageResultSchema
      );
      assert.strictEqual(removeCss.ok, true);

      const clear = await callStructured(
        page,
        'extension_tool_clear_alarm',
        {
          name: alarmName,
        },
        clearAlarmOutputSchema
      );
      assert.strictEqual(clear.cleared, true);

      const clearAll = await callStructured(
        page,
        'extension_tool_clear_all_alarms',
        {},
        clearAllAlarmsOutputSchema
      );
      assert.strictEqual(clearAll.cleared, true);

      const error = (await callToolResult(page, 'extension_tool_create_alarm', {})) as {
        isError?: boolean;
      };
      assert.strictEqual(error.isError, true);
    } finally {
      downloadServer.closeAllConnections();
      await new Promise<void>((resolveClose) => {
        downloadServer.close(() => resolveClose());
      });
      await context.close();
    }
  });
});
