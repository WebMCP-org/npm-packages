/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';

import { WebMCPClientTransport } from '../src/transports/WebMCPClientTransport.js';
import { serverHooks } from './server.js';
import { withBrowser } from './utils.js';

const PACKAGE_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const REPO_ROOT = resolve(PACKAGE_DIR, '../..');
const GLOBAL_RUNTIME_PATH = resolve(REPO_ROOT, 'packages/global/dist/index.iife.js');
const RUNTIME_CONTRACT_CORE_PATH = resolve(REPO_ROOT, 'e2e/runtime-contract/core.js');
const RUNTIME_CONTRACT_MODULE_PATH = resolve(REPO_ROOT, 'e2e/runtime-contract/browser-contract.js');

function readRequiredFile(filePath: string, label: string): string {
  try {
    return readFileSync(filePath, 'utf8');
  } catch {
    throw new Error(`Missing ${label} at ${filePath}. Build the required assets first.`);
  }
}

function createClient() {
  return new Client(
    {
      name: 'webmcp-devtools-runtime-contract',
      version: '1.0.0',
    },
    {
      capabilities: {},
    }
  );
}

function buildRuntimePage(): string {
  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>WebMCP Runtime Contract</title>
  </head>
  <body>
    <div id="status" data-state="booting">booting</div>
    <script src="/runtime/global.iife.js"></script>
    <script type="module">
      import { installBrowserRuntimeContract } from '/runtime/browser-contract.js';

      const statusEl = document.getElementById('status');

      try {
        installBrowserRuntimeContract(navigator.modelContext, { runtimeLabel: 'devtools' });
        statusEl.dataset.state = 'ready';
        statusEl.textContent = 'ready';
      } catch (error) {
        statusEl.dataset.state = 'error';
        statusEl.textContent = error instanceof Error ? error.message : String(error);
        throw error;
      }
    </script>
  </body>
</html>`;
}

function installRuntimeRoutes(
  server: ReturnType<typeof serverHooks>,
  assets: {
    globalRuntime: string;
    runtimeContractCore: string;
    runtimeContractModule: string;
  }
) {
  server.addRoute('/runtime/global.iife.js', (_req, res) => {
    res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
    res.statusCode = 200;
    res.end(assets.globalRuntime);
  });
  server.addRoute('/runtime/browser-contract.js', (_req, res) => {
    res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
    res.statusCode = 200;
    res.end(assets.runtimeContractModule);
  });
  server.addRoute('/runtime/core.js', (_req, res) => {
    res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
    res.statusCode = 200;
    res.end(assets.runtimeContractCore);
  });
  server.addHtmlRoute('/runtime-contract', buildRuntimePage());
}

function textFromResult(result: unknown): string {
  const content =
    typeof result === 'object' && result !== null && 'content' in result
      ? (result as { content?: Array<{ text?: string }> }).content
      : undefined;
  return typeof content?.[0]?.text === 'string' ? content[0].text : '';
}

async function callToolErrorText(
  client: Client,
  params: { name: string; arguments?: Record<string, unknown> }
): Promise<string> {
  try {
    const result = await client.callTool(params);
    if (result.isError) {
      return textFromResult(result);
    }
    return '';
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

describe('WebMCP runtime contract (real DevTools transport)', () => {
  const server = serverHooks();
  const globalRuntime = readRequiredFile(GLOBAL_RUNTIME_PATH, '@mcp-b/global IIFE');
  const runtimeContractCore = readRequiredFile(
    RUNTIME_CONTRACT_CORE_PATH,
    'shared runtime-contract core module'
  );
  const runtimeContractModule = readRequiredFile(
    RUNTIME_CONTRACT_MODULE_PATH,
    'shared runtime-contract module'
  );
  const runtimeAssets = {
    globalRuntime,
    runtimeContractCore,
    runtimeContractModule,
  };

  it('discovers, calls, updates, and errors through a real WebMCP client transport', async () => {
    installRuntimeRoutes(server, runtimeAssets);

    await withBrowser(async (_browser, page) => {
      await page.goto(server.getRoute('/runtime-contract'));
      await page.waitForSelector('#status[data-state="ready"]');

      const transport = new WebMCPClientTransport({ page });
      const client = createClient();

      try {
        await client.connect(transport);

        const initialTools = await client.listTools();
        const initialNames = initialTools.tools.map((tool) => tool.name).sort();
        assert.deepStrictEqual(initialNames, ['always_fail', 'echo', 'sum']);

        await page.evaluate(() => {
          (
            window as Window & { __WEBMCP_E2E__?: { resetInvocations: () => void } }
          ).__WEBMCP_E2E__?.resetInvocations();
        });

        const sumResult = await client.callTool({
          name: 'sum',
          arguments: { a: 5, b: 4 },
        });
        assert.strictEqual(textFromResult(sumResult), 'sum:9');

        const invocations = await page.evaluate(
          () =>
            (
              window as Window & {
                __WEBMCP_E2E__?: {
                  readInvocations: () => Array<{
                    name: string;
                    arguments: Record<string, unknown>;
                  }>;
                };
              }
            ).__WEBMCP_E2E__?.readInvocations() ?? []
        );
        assert.deepStrictEqual(invocations, [{ name: 'sum', arguments: { a: 5, b: 4 } }]);

        await page.evaluate(() => {
          (
            window as Window & { __WEBMCP_E2E__?: { registerDynamicTool: () => boolean } }
          ).__WEBMCP_E2E__?.registerDynamicTool();
        });

        const dynamicTools = await client.listTools();
        assert.ok(dynamicTools.tools.some((tool) => tool.name === 'dynamic_tool'));

        const dynamicResult = await client.callTool({
          name: 'dynamic_tool',
          arguments: { value: 'devtools' },
        });
        assert.strictEqual(textFromResult(dynamicResult), 'dynamic:devtools');

        await page.evaluate(() => {
          (
            window as Window & { __WEBMCP_E2E__?: { unregisterDynamicTool: () => boolean } }
          ).__WEBMCP_E2E__?.unregisterDynamicTool();
        });

        const afterUnregister = await client.listTools();
        assert.ok(!afterUnregister.tools.some((tool) => tool.name === 'dynamic_tool'));

        const missingToolError = await callToolErrorText(client, {
          name: 'dynamic_tool',
          arguments: { value: 'late' },
        });
        assert.ok(missingToolError.includes('dynamic_tool'));

        const runtimeError = await callToolErrorText(client, {
          name: 'always_fail',
          arguments: { reason: 'devtools' },
        });
        assert.ok(runtimeError.includes('always_fail:devtools'));
      } finally {
        await client.close().catch(() => undefined);
        await transport.close().catch(() => undefined);
      }
    });
  });

  it('reconnects after a full page reload and rediscovers the runtime tools', async () => {
    installRuntimeRoutes(server, runtimeAssets);

    await withBrowser(async (_browser, page) => {
      await page.goto(server.getRoute('/runtime-contract'));
      await page.waitForSelector('#status[data-state="ready"]');

      const initialTransport = new WebMCPClientTransport({ page });
      const initialClient = createClient();

      try {
        await initialClient.connect(initialTransport);

        const initialTools = await initialClient.listTools();
        assert.deepStrictEqual(initialTools.tools.map((tool) => tool.name).sort(), [
          'always_fail',
          'echo',
          'sum',
        ]);

        const initialClose = new Promise<void>((resolve) => {
          initialTransport.onclose = () => resolve();
        });

        await page.reload();
        await page.waitForSelector('#status[data-state="ready"]');
        await initialClose;
        assert.strictEqual(initialTransport.isClosed(), true);
      } finally {
        await initialClient.close().catch(() => undefined);
        await initialTransport.close().catch(() => undefined);
      }

      const reconnectedTransport = new WebMCPClientTransport({ page });
      const reconnectedClient = createClient();

      try {
        await reconnectedClient.connect(reconnectedTransport);

        const reloadedTools = await reconnectedClient.listTools();
        assert.deepStrictEqual(reloadedTools.tools.map((tool) => tool.name).sort(), [
          'always_fail',
          'echo',
          'sum',
        ]);

        const echoResult = await reconnectedClient.callTool({
          name: 'echo',
          arguments: { message: 'reload' },
        });
        assert.strictEqual(textFromResult(echoResult), 'echo:reload');
      } finally {
        await reconnectedClient.close().catch(() => undefined);
        await reconnectedTransport.close().catch(() => undefined);
      }
    });
  });
});
