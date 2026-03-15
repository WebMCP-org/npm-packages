import { type ChildProcess, spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { type Browser, chromium, type Page } from 'playwright';
import { describe, expect, it } from 'vitest';

import { sanitizeName } from './naming.js';

const TEST_TOOL_NAME = 'sum';
const PACKAGE_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const REPO_ROOT = resolve(PACKAGE_DIR, '../..');
const CLI_ENTRY_PATH = resolve(PACKAGE_DIR, 'dist/cli.mjs');

const GLOBAL_RUNTIME_PATH = resolve(REPO_ROOT, 'packages/global/dist/index.iife.js');
const POLYFILL_RUNTIME_PATH = resolve(REPO_ROOT, 'packages/webmcp-polyfill/dist/index.iife.js');
const RUNTIME_CONTRACT_CORE_PATH = resolve(REPO_ROOT, 'e2e/runtime-contract/core.js');
const RUNTIME_CONTRACT_MODULE_PATH = resolve(REPO_ROOT, 'e2e/runtime-contract/browser-contract.js');
const REAL_EMBED_PATH = resolve(PACKAGE_DIR, 'dist/browser/embed.js');
const REAL_WIDGET_PATH = resolve(PACKAGE_DIR, 'dist/browser/widget.html');

type RuntimeMode = 'global' | 'polyfill-testing';

interface RuntimeCase {
  mode: RuntimeMode;
  scriptRoute: string;
  scriptPath: string;
}

interface StartedHttpServer {
  server: Server;
  origin: string;
}

interface SpawnedRelay {
  child: ChildProcess;
  logs: string[];
  stop: () => Promise<void>;
}

interface E2EHarness {
  client: Client;
  page: Page;
  expectedToolName: string;
  relayLogs: string[];
  pageErrors: string[];
  pageConsole: string[];
  cleanup: () => Promise<void>;
}

const RUNTIME_CASES: RuntimeCase[] = [
  {
    mode: 'global',
    scriptRoute: '/runtime/global.iife.js',
    scriptPath: GLOBAL_RUNTIME_PATH,
  },
  {
    mode: 'polyfill-testing',
    scriptRoute: '/runtime/webmcp-polyfill.iife.js',
    scriptPath: POLYFILL_RUNTIME_PATH,
  },
];

function jsonForInlineScript(value: unknown): string {
  return JSON.stringify(value).replaceAll('<', '\\u003c');
}

function sendHtml(response: ServerResponse, html: string): void {
  response.statusCode = 200;
  response.setHeader('content-type', 'text/html; charset=utf-8');
  response.end(html);
}

function sendJavaScript(response: ServerResponse, script: string): void {
  response.statusCode = 200;
  response.setHeader('content-type', 'application/javascript; charset=utf-8');
  response.end(script);
}

function readRequiredFile(filePath: string, label: string): string {
  try {
    return readFileSync(filePath, 'utf8');
  } catch {
    throw new Error(
      `Missing ${label} at ${filePath}. Build required runtime/browser assets first.`
    );
  }
}

function readRuntimeScriptOrThrow(filePath: string): string {
  return readRequiredFile(filePath, 'runtime bundle');
}

async function startHttpServer(
  handler: (request: IncomingMessage, response: ServerResponse) => void
): Promise<StartedHttpServer> {
  const server = createServer(handler);
  await new Promise<void>((resolvePromise, rejectPromise) => {
    server.listen(0, '127.0.0.1', () => resolvePromise());
    server.once('error', rejectPromise);
  });

  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('Expected server to bind to an IP address');
  }

  return {
    server,
    origin: `http://127.0.0.1:${(address as AddressInfo).port}`,
  };
}

async function stopHttpServer(server: Server | null): Promise<void> {
  if (!server) {
    return;
  }

  await new Promise<void>((resolvePromise) => {
    server.close(() => resolvePromise());
  });
}

async function getOpenPort(): Promise<number> {
  const holder = createServer();
  await new Promise<void>((resolvePromise, rejectPromise) => {
    holder.listen(0, '127.0.0.1', () => resolvePromise());
    holder.once('error', rejectPromise);
  });

  const address = holder.address();
  if (!address || typeof address === 'string') {
    throw new Error('Expected holder server to bind to an IP address');
  }

  const port = (address as AddressInfo).port;
  await new Promise<void>((resolvePromise) => {
    holder.close(() => resolvePromise());
  });

  return port;
}

async function waitForValue<T>(
  fn: () => Promise<T | undefined> | T | undefined,
  timeoutMs = 15_000,
  pollIntervalMs = 100
): Promise<T> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const value = await fn();
    if (value !== undefined) {
      return value;
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, pollIntervalMs));
  }

  throw new Error(`Timed out after ${timeoutMs}ms`);
}

function contentTextItems(result: unknown): string[] {
  const content =
    typeof result === 'object' && result !== null && 'content' in result
      ? (result as { content?: unknown }).content
      : undefined;
  if (!Array.isArray(content)) {
    return [];
  }
  return content
    .map((item) => {
      if (!item || typeof item !== 'object') {
        return undefined;
      }
      const text = (item as { text?: unknown }).text;
      return typeof text === 'string' ? text : undefined;
    })
    .filter((text): text is string => typeof text === 'string');
}

function firstContentText(result: unknown): string {
  return contentTextItems(result)[0] ?? '';
}

function buildHostPageHtml(options: {
  widgetOrigin: string;
  relayPort: number;
  runtimeScriptRoute: string;
  runtimeContractRoute: string;
  runtimeMode: RuntimeMode;
}): string {
  const { widgetOrigin, relayPort, runtimeScriptRoute, runtimeContractRoute, runtimeMode } =
    options;

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>WebMCP Relay E2E Host</title>
  </head>
  <body>
    <h1>WebMCP Relay E2E Host</h1>
    <div id="status" data-state="booting">booting</div>
    <script src="${runtimeScriptRoute}"></script>
    <script type="module">
      import { installBrowserRuntimeContract } from '${runtimeContractRoute}';

      (() => {
        const statusEl = document.getElementById('status');
        const runtimeMode = ${jsonForInlineScript(runtimeMode)};

        try {
          installBrowserRuntimeContract(navigator.modelContext, {
            runtimeLabel: runtimeMode,
            registrationMode: runtimeMode === 'polyfill-testing' ? 'dynamic' : 'context',
          });

          statusEl.dataset.state = 'runtime_ready';
          statusEl.textContent = 'runtime ready';
        } catch (error) {
          statusEl.dataset.state = 'runtime_error';
          statusEl.textContent = String(error instanceof Error ? error.message : error);
          throw error;
        }
      })();
    </script>
    <script
      src="${widgetOrigin}/embed.js"
      data-relay-host="127.0.0.1"
      data-relay-port="${String(relayPort)}"
    ></script>
  </body>
</html>`;
}

function formatE2EError(
  label: string,
  error: unknown,
  harness: Pick<E2EHarness, 'pageErrors' | 'pageConsole' | 'relayLogs'> | null,
  extraLogs: string[] = []
): Error {
  const errorMsg = String(error instanceof Error ? error.message : error);

  if (!harness) {
    return new Error(`E2E failure (${label}): ${errorMsg}`);
  }

  return new Error(
    [
      `E2E failure (${label}): ${errorMsg}`,
      '',
      '[page errors]',
      harness.pageErrors.join('\\n'),
      '',
      '[page console]',
      harness.pageConsole.join('\\n'),
      '',
      '[relay stderr]',
      harness.relayLogs.join(''),
      '',
      '[extra relay logs]',
      extraLogs.join(''),
    ].join('\\n')
  );
}

async function stopChildProcess(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null) {
    return;
  }

  child.kill('SIGTERM');
  const exited = await waitForValue(
    () => (child.exitCode !== null ? true : undefined),
    5_000,
    50
  ).catch(() => false);
  if (exited) {
    return;
  }

  child.kill('SIGKILL');
  await waitForValue(() => (child.exitCode !== null ? true : undefined), 5_000, 50).catch(
    () => undefined
  );
}

async function startRelayProcess(relayPort: number): Promise<SpawnedRelay> {
  const logs: string[] = [];
  const child = spawn(
    process.execPath,
    [CLI_ENTRY_PATH, '--host', '127.0.0.1', '--port', String(relayPort)],
    {
      cwd: PACKAGE_DIR,
      stdio: ['pipe', 'pipe', 'pipe'],
    }
  );

  child.stderr?.on('data', (chunk) => {
    logs.push(String(chunk));
  });
  child.stdout?.on('data', (chunk) => {
    logs.push(String(chunk));
  });

  await waitForValue(() => {
    const merged = logs.join('');
    if (merged.includes('server mode: listening')) {
      return true;
    }
    if (child.exitCode !== null) {
      throw new Error(`Relay owner process exited early (${child.exitCode})`);
    }
    return undefined;
  }, 15_000);

  return {
    child,
    logs,
    stop: async () => {
      await stopChildProcess(child);
    },
  };
}

async function startWidgetAssetServer(): Promise<StartedHttpServer> {
  const embedScript = readRequiredFile(REAL_EMBED_PATH, 'packaged embed.js');
  const widgetHtml = readRequiredFile(REAL_WIDGET_PATH, 'packaged widget.html');

  return startHttpServer((request, response) => {
    const url = request.url ?? '/';
    if (url.startsWith('/embed.js')) {
      sendJavaScript(response, embedScript);
      return;
    }
    if (url.startsWith('/widget.html')) {
      sendHtml(response, widgetHtml);
      return;
    }
    response.statusCode = 404;
    response.end('not found');
  });
}

async function setupE2EHarness(options: {
  runtimeCase: RuntimeCase;
  relayPort: number;
  widgetOrigin: string;
  clientName: string;
}): Promise<E2EHarness> {
  const { runtimeCase, relayPort, widgetOrigin, clientName } = options;
  const runtimeScript = readRuntimeScriptOrThrow(runtimeCase.scriptPath);
  const runtimeContractCore = readRequiredFile(
    RUNTIME_CONTRACT_CORE_PATH,
    'shared runtime contract core module'
  );
  const runtimeContractModule = readRequiredFile(
    RUNTIME_CONTRACT_MODULE_PATH,
    'shared runtime contract module'
  );

  let host: StartedHttpServer | null = null;
  let client: Client | null = null;
  let browser: Browser | null = null;
  let page: Page | null = null;
  const relayLogs: string[] = [];
  const pageErrors: string[] = [];
  const pageConsole: string[] = [];

  try {
    host = await startHttpServer((request, response) => {
      const url = request.url ?? '/';
      if (url === runtimeCase.scriptRoute) {
        sendJavaScript(response, runtimeScript);
        return;
      }
      if (url === '/runtime/browser-contract.js') {
        sendJavaScript(response, runtimeContractModule);
        return;
      }
      if (url === '/runtime/core.js') {
        sendJavaScript(response, runtimeContractCore);
        return;
      }
      if (url === '/' || url.startsWith('/index.html')) {
        sendHtml(
          response,
          buildHostPageHtml({
            widgetOrigin,
            relayPort,
            runtimeScriptRoute: runtimeCase.scriptRoute,
            runtimeContractRoute: '/runtime/browser-contract.js',
            runtimeMode: runtimeCase.mode,
          })
        );
        return;
      }

      response.statusCode = 404;
      response.end('not found');
    });

    const stdioTransport = new StdioClientTransport({
      command: process.execPath,
      args: [
        CLI_ENTRY_PATH,
        '--host',
        '127.0.0.1',
        '--port',
        String(relayPort),
        '--widget-origin',
        host.origin,
      ],
      cwd: PACKAGE_DIR,
      stderr: 'pipe',
    });
    stdioTransport.stderr?.on('data', (chunk) => {
      relayLogs.push(String(chunk));
    });

    client = new Client(
      {
        name: clientName,
        version: '1.0.0',
      },
      {
        capabilities: {},
      }
    );
    await client.connect(stdioTransport);

    browser = await chromium.launch({ headless: true });
    page = await browser.newPage();
    page.on('pageerror', (runtimeError) => {
      pageErrors.push(runtimeError.message);
    });
    page.on('console', (message) => {
      pageConsole.push(`${message.type()}: ${message.text()}`);
    });
    await page.goto(`${host.origin}/`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#status[data-state="runtime_ready"]', {
      timeout: 20_000,
    });

    const expectedToolName = sanitizeName(TEST_TOOL_NAME);

    await waitForValue(async () => {
      const toolList = await client?.listTools();
      return toolList?.tools.some((tool) => tool.name === expectedToolName) ? true : undefined;
    }, 20_000);

    return {
      client,
      page,
      expectedToolName,
      relayLogs,
      pageErrors,
      pageConsole,
      cleanup: async () => {
        await client?.close();
        await browser?.close();
        await stopHttpServer(host?.server ?? null);
      },
    };
  } catch (error) {
    await client?.close().catch(() => undefined);
    await browser?.close().catch(() => undefined);
    await stopHttpServer(host?.server ?? null);
    throw error;
  }
}

describe('relay e2e (real browser assets)', () => {
  for (const runtimeCase of RUNTIME_CASES) {
    it(`executes page-registered WebMCP tools through dynamic tool (${runtimeCase.mode})`, async () => {
      let widgetServer: StartedHttpServer | null = null;
      let harness: E2EHarness | null = null;

      try {
        const relayPort = await getOpenPort();
        widgetServer = await startWidgetAssetServer();
        harness = await setupE2EHarness({
          runtimeCase,
          relayPort,
          widgetOrigin: widgetServer.origin,
          clientName: `webmcp-local-relay-e2e-client-${runtimeCase.mode}-dynamic`,
        });

        const result = await harness.client.callTool({
          name: harness.expectedToolName,
          arguments: { a: 2, b: 5 },
        });

        const text = firstContentText(result);
        expect(text).toBe('sum:7');

        const invocations = await harness.page.evaluate(() => {
          return (
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
        });
        expect(invocations).toEqual([{ name: 'sum', arguments: { a: 2, b: 5 } }]);
      } catch (error) {
        throw formatE2EError(runtimeCase.mode, error, harness);
      } finally {
        await harness?.cleanup();
        await stopHttpServer(widgetServer?.server ?? null);
      }
    });

    it(`propagates dynamic tool registration and unregistration (${runtimeCase.mode})`, async () => {
      let widgetServer: StartedHttpServer | null = null;
      let harness: E2EHarness | null = null;

      try {
        const relayPort = await getOpenPort();
        widgetServer = await startWidgetAssetServer();
        harness = await setupE2EHarness({
          runtimeCase,
          relayPort,
          widgetOrigin: widgetServer.origin,
          clientName: `webmcp-local-relay-e2e-client-${runtimeCase.mode}-dynamic-reg`,
        });

        const initialTools = await harness.client.listTools();
        expect(initialTools.tools.some((t) => t.name === harness?.expectedToolName)).toBe(true);

        if (runtimeCase.mode === 'polyfill-testing') {
          await harness.page.evaluate(() => {
            const modelContext = (
              navigator as unknown as { modelContext: { registerTool: (tool: unknown) => void } }
            ).modelContext;
            modelContext.registerTool({
              name: 'dynamic_tool',
              description: 'A dynamically registered contract tool.',
              inputSchema: {
                type: 'object',
                properties: {
                  value: { type: 'string' },
                },
                required: ['value'],
              },
              execute: async (args: Record<string, unknown>) => ({
                content: [{ type: 'text' as const, text: `dynamic:${String(args.value ?? '')}` }],
                structuredContent: {
                  value: String(args.value ?? ''),
                  runtime: 'polyfill-testing',
                },
              }),
            });
          });
        } else {
          await harness.page.evaluate(() => {
            (
              window as Window & { __WEBMCP_E2E__?: { registerDynamicTool: () => boolean } }
            ).__WEBMCP_E2E__?.registerDynamicTool();
          });
        }

        const dynamicToolName = await waitForValue(async () => {
          const toolList = await harness?.client.listTools();
          const found = toolList?.tools.find((t) => t.name === sanitizeName('dynamic_tool'));
          return found ? found.name : undefined;
        }, 15_000);

        expect(dynamicToolName).toBe(sanitizeName('dynamic_tool'));

        const result = await harness.client.callTool({
          name: dynamicToolName,
          arguments: { value: 'hello' },
        });
        const text = firstContentText(result);
        expect(text).toContain('dynamic:hello');

        if (runtimeCase.mode === 'polyfill-testing') {
          await harness.page.evaluate(() => {
            const modelContext = (
              navigator as unknown as { modelContext: { unregisterTool: (name: string) => void } }
            ).modelContext;
            modelContext.unregisterTool('dynamic_tool');
          });
        } else {
          await harness.page.evaluate(() => {
            (
              window as Window & { __WEBMCP_E2E__?: { unregisterDynamicTool: () => boolean } }
            ).__WEBMCP_E2E__?.unregisterDynamicTool();
          });
        }

        await waitForValue(async () => {
          const toolList = await harness?.client.listTools();
          const stillThere = toolList?.tools.some((t) => t.name === sanitizeName('dynamic_tool'));
          return stillThere ? undefined : true;
        }, 15_000);

        const finalTools = await harness.client.listTools();
        expect(finalTools.tools.some((t) => t.name === harness?.expectedToolName)).toBe(true);
        expect(finalTools.tools.some((t) => t.name === sanitizeName('dynamic_tool'))).toBe(false);
      } catch (error) {
        throw formatE2EError(`${runtimeCase.mode} dynamic-tools`, error, harness);
      } finally {
        await harness?.cleanup();
        await stopHttpServer(widgetServer?.server ?? null);
      }
    });

    it(`executes page-registered WebMCP tools through webmcp_call_tool (${runtimeCase.mode})`, async () => {
      let widgetServer: StartedHttpServer | null = null;
      let harness: E2EHarness | null = null;

      try {
        const relayPort = await getOpenPort();
        widgetServer = await startWidgetAssetServer();
        harness = await setupE2EHarness({
          runtimeCase,
          relayPort,
          widgetOrigin: widgetServer.origin,
          clientName: `webmcp-local-relay-e2e-client-${runtimeCase.mode}-call-tool`,
        });

        const listResult = await harness.client.callTool({
          name: 'webmcp_list_tools',
          arguments: {},
        });
        const listText = firstContentText(listResult);
        expect(listText).toContain(harness.expectedToolName);
        expect(listText).toContain(TEST_TOOL_NAME);

        const result = await harness.client.callTool({
          name: 'webmcp_call_tool',
          arguments: {
            name: harness.expectedToolName,
            arguments: { a: 10, b: 3 },
          },
        });

        const texts = contentTextItems(result);
        const combined = texts.join('\n');

        expect(combined).toContain('sum:13');
        expect(combined).toContain('Available tools:');
        expect(combined).toContain(harness.expectedToolName);
        expect(result.isError).toBeFalsy();

        const errorResult = await harness.client.callTool({
          name: 'webmcp_call_tool',
          arguments: { name: 'nonexistent_tool_xyz' },
        });

        const errorText = firstContentText(errorResult);
        expect(errorText).toContain('Tool "nonexistent_tool_xyz" not found');
        expect(errorText).toContain('Available tools:');
        expect(errorText).toContain(harness.expectedToolName);
        expect(errorResult.isError).toBe(true);
      } catch (error) {
        throw formatE2EError(`${runtimeCase.mode} webmcp_call_tool`, error, harness);
      } finally {
        await harness?.cleanup();
        await stopHttpServer(widgetServer?.server ?? null);
      }
    });

    it(`propagates runtime-thrown tool errors through the relay (${runtimeCase.mode})`, async () => {
      let widgetServer: StartedHttpServer | null = null;
      let harness: E2EHarness | null = null;

      try {
        const relayPort = await getOpenPort();
        widgetServer = await startWidgetAssetServer();
        harness = await setupE2EHarness({
          runtimeCase,
          relayPort,
          widgetOrigin: widgetServer.origin,
          clientName: `webmcp-local-relay-e2e-client-${runtimeCase.mode}-errors`,
        });

        const errorResult = await harness.client.callTool({
          name: 'always_fail',
          arguments: { reason: runtimeCase.mode },
        });
        expect(errorResult.isError).toBe(true);
        expect(firstContentText(errorResult)).toContain(`always_fail:${runtimeCase.mode}`);
      } catch (error) {
        throw formatE2EError(`${runtimeCase.mode} runtime-errors`, error, harness);
      } finally {
        await harness?.cleanup();
        await stopHttpServer(widgetServer?.server ?? null);
      }
    });
  }

  it('works through a second relay in client mode when port owner already exists', async () => {
    let widgetServer: StartedHttpServer | null = null;
    let ownerRelay: SpawnedRelay | null = null;
    let harness: E2EHarness | null = null;

    try {
      const relayPort = await getOpenPort();
      widgetServer = await startWidgetAssetServer();
      ownerRelay = await startRelayProcess(relayPort);

      harness = await setupE2EHarness({
        runtimeCase: RUNTIME_CASES[0],
        relayPort,
        widgetOrigin: widgetServer.origin,
        clientName: 'webmcp-local-relay-e2e-client-client-mode',
      });

      const listSourcesResult = await harness.client.callTool({
        name: 'webmcp_list_sources',
        arguments: {},
      });
      const sourcesText = firstContentText(listSourcesResult);
      expect(sourcesText).toContain('"mode": "client"');
      expect(sourcesText).not.toContain('"count": 0');
      expect(sourcesText).toContain('"toolCount"');

      const result = await harness.client.callTool({
        name: harness.expectedToolName,
        arguments: { a: 9, b: 3 },
      });
      const text = firstContentText(result);
      expect(text).toBe('sum:12');
    } catch (error) {
      throw formatE2EError('client-mode-port-owner', error, harness, ownerRelay?.logs ?? []);
    } finally {
      await harness?.cleanup();
      await ownerRelay?.stop();
      await stopHttpServer(widgetServer?.server ?? null);
    }
  });
});
