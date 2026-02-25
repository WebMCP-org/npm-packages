import { readFileSync } from 'node:fs';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { chromium, type Page } from 'playwright';
import { describe, expect, it } from 'vitest';

import { sanitizeName } from './naming.js';

/**
 * Stable tab identifier used by the relay handshake in this suite.
 */
const TEST_TAB_ID = 'host_tab_1';
/**
 * Tool registered by the host page and invoked through relay pathways.
 */
const TEST_TOOL_NAME = 'page_sum';
const PACKAGE_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const REPO_ROOT = resolve(PACKAGE_DIR, '../..');
const CLI_ENTRY_PATH = resolve(PACKAGE_DIR, 'dist/cli.js');

const GLOBAL_RUNTIME_PATH = resolve(REPO_ROOT, 'packages/global/dist/index.iife.js');
const POLYFILL_RUNTIME_PATH = resolve(REPO_ROOT, 'packages/webmcp-polyfill/dist/index.iife.js');

/**
 * Browser runtime variant under test.
 */
type RuntimeMode = 'global' | 'polyfill-testing';

/**
 * Runtime fixture describing which script is served for a test case.
 */
interface RuntimeCase {
  mode: RuntimeMode;
  scriptRoute: string;
  scriptPath: string;
}

/**
 * Result returned by {@link startHttpServer}.
 */
interface StartedHttpServer {
  server: Server;
  origin: string;
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

/**
 * Serializes values for safe embedding in inline script blocks.
 */
function jsonForInlineScript(value: unknown): string {
  return JSON.stringify(value).replaceAll('<', '\\u003c');
}

/**
 * Sends an HTML response with UTF-8 content type.
 */
function sendHtml(response: ServerResponse, html: string): void {
  response.statusCode = 200;
  response.setHeader('content-type', 'text/html; charset=utf-8');
  response.end(html);
}

/**
 * Sends a JavaScript response with UTF-8 content type.
 */
function sendJavaScript(response: ServerResponse, script: string): void {
  response.statusCode = 200;
  response.setHeader('content-type', 'application/javascript; charset=utf-8');
  response.end(script);
}

/**
 * Reads a prebuilt runtime bundle or throws a build hint.
 */
function readRuntimeScriptOrThrow(filePath: string): string {
  try {
    return readFileSync(filePath, 'utf8');
  } catch {
    throw new Error(
      `Missing runtime bundle at ${filePath}. Build required runtime packages before test:e2e.`
    );
  }
}

/**
 * Starts an ephemeral HTTP server and returns its local origin.
 */
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

/**
 * Closes an HTTP server instance when present.
 */
async function stopHttpServer(server: Server | null): Promise<void> {
  if (!server) {
    return;
  }

  await new Promise<void>((resolvePromise) => {
    server.close(() => resolvePromise());
  });
}

/**
 * Reserves and releases an ephemeral localhost port.
 */
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

/**
 * Polls until `fn` returns a defined value or timeout elapses.
 */
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

/**
 * Builds the host test page that registers a tool and bridges widget messages.
 */
function buildHostPageHtml(options: {
  widgetOrigin: string;
  runtimeScriptRoute: string;
  runtimeMode: RuntimeMode;
}): string {
  const { widgetOrigin, runtimeScriptRoute, runtimeMode } = options;

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
    <script src="${widgetOrigin}/embed.js"></script>
    <script>
      (() => {
        const widgetOrigin = ${jsonForInlineScript(widgetOrigin)};
        const runtimeMode = ${jsonForInlineScript(runtimeMode)};
        const statusEl = document.getElementById('status');

        function parseTestingInputSchema(rawInputSchema) {
          if (!rawInputSchema) {
            return { type: 'object', properties: {} };
          }

          try {
            const parsed = JSON.parse(rawInputSchema);
            if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
              return parsed;
            }
          } catch {
          }

          return { type: 'object', properties: {} };
        }

        function getToolBridge() {
          const modelContext = navigator.modelContext;
          if (
            modelContext &&
            typeof modelContext.listTools === 'function' &&
            typeof modelContext.callTool === 'function'
          ) {
            return {
              mode: 'modelContextExtensions',
              listTools: async () => {
                return modelContext.listTools().map((tool) => ({
                  name: tool.name,
                  description: tool.description,
                  inputSchema: tool.inputSchema ?? { type: 'object', properties: {} },
                }));
              },
              invoke: async (toolName, args) => {
                return modelContext.callTool({
                  name: toolName,
                  arguments: args ?? {},
                });
              },
            };
          }

          const testing = navigator.modelContextTesting;
          if (
            testing &&
            typeof testing.listTools === 'function' &&
            typeof testing.executeTool === 'function'
          ) {
            return {
              mode: 'modelContextTesting',
              listTools: async () => {
                return testing.listTools().map((tool) => ({
                  name: tool.name,
                  description: tool.description,
                  inputSchema: parseTestingInputSchema(tool.inputSchema),
                }));
              },
              invoke: async (toolName, args) => {
                const serialized = await testing.executeTool(toolName, JSON.stringify(args ?? {}));
                if (serialized === null) {
                  return {
                    isError: true,
                    content: [{ type: 'text', text: 'Tool execution interrupted by navigation' }],
                  };
                }

                const parsed = JSON.parse(serialized);
                if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
                  throw new Error('Testing tool response was not an object');
                }

                return parsed;
              },
            };
          }

          throw new Error(
            'No supported WebMCP runtime found. Install @mcp-b/global or @mcp-b/webmcp-polyfill.',
          );
        }

        try {
          navigator.modelContext.registerTool({
            name: ${jsonForInlineScript(TEST_TOOL_NAME)},
            description: 'Add two numbers in host-page context',
            inputSchema: {
              type: 'object',
              properties: {
                a: { type: 'number' },
                b: { type: 'number' },
              },
            },
            execute: async (args) => {
              const a = Number(args?.a ?? 0);
              const b = Number(args?.b ?? 0);
              const sum = a + b;
              return {
                content: [
                  {
                    type: 'text',
                    text: \`sum=\${sum};runtime=\${runtimeMode};title=\${document.title};path=\${location.pathname}\`,
                  },
                ],
                structuredContent: {
                  sum,
                  runtimeMode,
                  title: document.title,
                  path: location.pathname,
                  href: location.href,
                },
              };
            },
          });

          statusEl.dataset.state = 'runtime_ready';
          statusEl.textContent = 'runtime ready';
        } catch (error) {
          statusEl.dataset.state = 'runtime_error';
          statusEl.textContent = String(error instanceof Error ? error.message : error);
          throw error;
        }

        window.addEventListener('message', async (event) => {
          if (event.origin !== widgetOrigin) {
            return;
          }

          const data = event.data;
          if (!data || typeof data !== 'object') {
            return;
          }

          try {
            const toolBridge = getToolBridge();

            if (data.type === 'webmcp.tools.list.request') {
              const tools = await toolBridge.listTools();
              statusEl.dataset.state = 'tool_list_requested';
              statusEl.textContent = 'tool list requested';

              event.source?.postMessage(
                {
                  type: 'webmcp.tools.list.response',
                  requestId: data.requestId,
                  mode: toolBridge.mode,
                  tools,
                },
                event.origin,
              );
              return;
            }

            if (data.type !== 'webmcp.tools.invoke.request') {
              return;
            }

            const result = await toolBridge.invoke(String(data.toolName ?? ''), data.args ?? {});
            event.source?.postMessage(
              {
                type: 'webmcp.tools.invoke.response',
                requestId: data.requestId,
                mode: toolBridge.mode,
                result,
              },
              event.origin,
            );
          } catch (error) {
            event.source?.postMessage(
              {
                type: 'webmcp.tools.invoke.error',
                requestId: data.requestId,
                error: String(error instanceof Error ? error.message : error),
              },
              event.origin,
            );
          }
        });
      })();
    </script>
  </body>
</html>`;
}

/**
 * Builds the embed script served by the widget test server.
 */
function buildEmbedScript(widgetOrigin: string, relayPort: number): string {
  return `(() => {
  const iframe = document.createElement('iframe');
  const params = new URLSearchParams();
  params.set('relayPort', ${JSON.stringify(String(relayPort))});
  params.set('tabId', ${jsonForInlineScript(TEST_TAB_ID)});
  params.set('hostOrigin', window.location.origin);
  params.set('hostUrl', window.location.href);

  iframe.src = ${jsonForInlineScript(`${widgetOrigin}/widget.html`)} + '?' + params.toString();
  iframe.style.display = 'none';
  iframe.setAttribute('aria-hidden', 'true');
  iframe.setAttribute('data-webmcp-relay', '1');

  document.body.appendChild(iframe);
})();`;
}

/**
 * Builds a widget page that connects host postMessage and relay WebSocket.
 */
function buildWidgetPageHtml(): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>WebMCP Relay E2E Widget</title>
  </head>
  <body>
    <script>
      (() => {
        const params = new URLSearchParams(window.location.search);
        const relayPort = Number(params.get('relayPort'));
        const hostOrigin = params.get('hostOrigin');
        const hostUrl = params.get('hostUrl') || hostOrigin || '';
        const tabId = params.get('tabId') || ${jsonForInlineScript(TEST_TAB_ID)};

        if (!relayPort || !hostOrigin) {
          return;
        }

        const pending = new Map();

        window.addEventListener('message', (event) => {
          if (event.origin !== hostOrigin) {
            return;
          }

          const data = event.data;
          if (!data || typeof data !== 'object' || typeof data.requestId !== 'string') {
            return;
          }

          const requestState = pending.get(data.requestId);
          if (!requestState) {
            return;
          }

          if (data.type === requestState.responseType) {
            clearTimeout(requestState.timeoutId);
            pending.delete(data.requestId);
            requestState.resolve(data);
            return;
          }

          if (data.type === requestState.errorType) {
            clearTimeout(requestState.timeoutId);
            pending.delete(data.requestId);
            requestState.reject(new Error(String(data.error ?? 'Unknown host error')));
          }
        });

        function requestHost(baseType, payload) {
          const requestId = crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random());

          return new Promise((resolve, reject) => {
            const timeoutId = setTimeout(() => {
              pending.delete(requestId);
              reject(new Error('Timed out waiting for host response: ' + baseType));
            }, 5000);

            pending.set(requestId, {
              resolve,
              reject,
              timeoutId,
              responseType: baseType + '.response',
              errorType: baseType + '.error',
            });

            window.parent.postMessage(
              {
                type: baseType + '.request',
                requestId,
                ...payload,
              },
              hostOrigin,
            );
          });
        }

        const wsUrl = 'ws://127.0.0.1:' + relayPort;

        function connect() {
          const ws = new WebSocket(wsUrl);

          ws.addEventListener('open', async () => {
            try {
              const listResponse = await requestHost('webmcp.tools.list', {});
              const tools = Array.isArray(listResponse.tools) ? listResponse.tools : [];

              ws.send(
                JSON.stringify({
                  type: 'hello',
                  tabId,
                  origin: hostOrigin,
                  url: hostUrl,
                  title: 'Host relay widget',
                }),
              );
              ws.send(JSON.stringify({ type: 'tools/list', tools }));
            } catch {
              ws.close();
            }
          });

          ws.addEventListener('message', async (event) => {
            let message;
            try {
              message = JSON.parse(event.data);
            } catch {
              return;
            }

            if (message.type === 'ping') {
              ws.send(JSON.stringify({ type: 'pong' }));
              return;
            }

            if (message.type !== 'invoke') {
              return;
            }

            try {
              const invokeResponse = await requestHost('webmcp.tools.invoke', {
                toolName: message.toolName,
                args: message.args ?? {},
              });

              ws.send(
                JSON.stringify({
                  type: 'result',
                  callId: message.callId,
                  result: invokeResponse.result,
                }),
              );
            } catch (error) {
              ws.send(
                JSON.stringify({
                  type: 'result',
                  callId: message.callId,
                  result: {
                    isError: true,
                    content: [
                      {
                        type: 'text',
                        text: String(error instanceof Error ? error.message : error),
                      },
                    ],
                  },
                }),
              );
            }
          });

          ws.addEventListener('close', () => {
            setTimeout(connect, 350);
          });

          ws.addEventListener('error', () => {
            try {
              ws.close();
            } catch {
            }
          });
        }

        connect();
      })();
    </script>
  </body>
</html>`;
}

/**
 * Allocated resources and diagnostics for a single E2E run.
 */
interface E2EHarness {
  client: Client;
  page: Page;
  expectedToolName: string;
  hostOrigin: string;
  relayLogs: string[];
  pageErrors: string[];
  pageConsole: string[];
  cleanup: () => Promise<void>;
}

/**
 * Bootstraps servers, browser page, relay client, and expected dynamic tool state.
 */
async function setupE2EHarness(runtimeCase: RuntimeCase): Promise<E2EHarness> {
  const relayPort = await getOpenPort();
  const runtimeScript = readRuntimeScriptOrThrow(runtimeCase.scriptPath);

  const relayLogs: string[] = [];
  const pageErrors: string[] = [];
  const pageConsole: string[] = [];

  const widget = await startHttpServer((request, response) => {
    const url = request.url ?? '/';
    if (url.startsWith('/embed.js')) {
      sendJavaScript(response, buildEmbedScript(widget.origin, relayPort));
      return;
    }
    if (url.startsWith('/widget.html')) {
      sendHtml(response, buildWidgetPageHtml());
      return;
    }

    response.statusCode = 404;
    response.end('not found');
  });

  const host = await startHttpServer((request, response) => {
    const url = request.url ?? '/';
    if (url === runtimeCase.scriptRoute) {
      sendJavaScript(response, runtimeScript);
      return;
    }
    if (url === '/' || url.startsWith('/index.html')) {
      sendHtml(
        response,
        buildHostPageHtml({
          widgetOrigin: widget.origin,
          runtimeScriptRoute: runtimeCase.scriptRoute,
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
      widget.origin,
    ],
    cwd: PACKAGE_DIR,
    stderr: 'pipe',
  });
  stdioTransport.stderr?.on('data', (chunk) => {
    relayLogs.push(String(chunk));
  });

  const client = new Client(
    {
      name: 'webmcp-local-relay-e2e-client',
      version: '1.0.0',
    },
    {
      capabilities: {},
    }
  );
  await client.connect(stdioTransport);

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  page.on('pageerror', (runtimeError) => {
    pageErrors.push(runtimeError.message);
  });
  page.on('console', (message) => {
    pageConsole.push(`${message.type()}: ${message.text()}`);
  });
  await page.goto(`${host.origin}/`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(
    () => {
      const state = document.querySelector('#status')?.getAttribute('data-state');
      return state === 'runtime_ready' || state === 'tool_list_requested';
    },
    undefined,
    {
      timeout: 20_000,
    }
  );
  await page.waitForSelector('#status[data-state="tool_list_requested"]', {
    timeout: 20_000,
  });

  const expectedToolName = sanitizeName(TEST_TOOL_NAME);

  await waitForValue(async () => {
    const toolList = await client.listTools();
    return toolList.tools.some((tool) => tool.name === expectedToolName) ? true : undefined;
  }, 20_000);

  return {
    client,
    page,
    expectedToolName,
    hostOrigin: host.origin,
    relayLogs,
    pageErrors,
    pageConsole,
    cleanup: async () => {
      await client.close();
      await browser.close();
      await stopHttpServer(host.server);
      await stopHttpServer(widget.server);
    },
  };
}

/**
 * Creates a diagnostic-rich error with browser and relay logs.
 */
function formatE2EError(
  label: string,
  error: unknown,
  harness: Pick<E2EHarness, 'page' | 'pageErrors' | 'pageConsole' | 'relayLogs'> | null
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
      harness.pageErrors.join('\n'),
      '',
      '[page console]',
      harness.pageConsole.join('\n'),
      '',
      '[relay stderr]',
      harness.relayLogs.join(''),
    ].join('\n')
  );
}

describe('relay e2e', () => {
  for (const runtimeCase of RUNTIME_CASES) {
    it(`executes page-registered WebMCP tools through dynamic tool (${runtimeCase.mode})`, async () => {
      let harness: E2EHarness | null = null;

      try {
        harness = await setupE2EHarness(runtimeCase);

        const result = await harness.client.callTool({
          name: harness.expectedToolName,
          arguments: { a: 2, b: 5 },
        });

        const text = (result.content?.[0] as { text?: string } | undefined)?.text ?? '';
        expect(text).toContain('sum=7');
        expect(text).toContain(`runtime=${runtimeCase.mode}`);
        expect(text).toContain('title=WebMCP Relay E2E Host');
        expect(text).toContain('path=/');
      } catch (error) {
        throw formatE2EError(runtimeCase.mode, error, harness);
      } finally {
        await harness?.cleanup();
      }
    });

    it(`executes page-registered WebMCP tools through webmcp_call_tool (${runtimeCase.mode})`, async () => {
      let harness: E2EHarness | null = null;

      try {
        harness = await setupE2EHarness(runtimeCase);

        const listResult = await harness.client.callTool({
          name: 'webmcp_list_tools',
          arguments: {},
        });
        const listText = (listResult.content?.[0] as { text?: string } | undefined)?.text ?? '';
        expect(listText).toContain(harness.expectedToolName);
        expect(listText).toContain(TEST_TOOL_NAME);

        const result = await harness.client.callTool({
          name: 'webmcp_call_tool',
          arguments: {
            name: harness.expectedToolName,
            arguments: { a: 10, b: 3 },
          },
        });

        const texts = (result.content as { type: string; text: string }[]).map((c) => c.text);
        const combined = texts.join('\n');

        expect(combined).toContain('sum=13');
        expect(combined).toContain(`runtime=${runtimeCase.mode}`);
        expect(combined).toContain('Available tools:');
        expect(combined).toContain(harness.expectedToolName);
        expect(result.isError).toBeFalsy();

        const errorResult = await harness.client.callTool({
          name: 'webmcp_call_tool',
          arguments: { name: 'nonexistent_tool_xyz' },
        });

        const errorText = (errorResult.content?.[0] as { text?: string } | undefined)?.text ?? '';
        expect(errorText).toContain('Tool "nonexistent_tool_xyz" not found');
        expect(errorText).toContain('Available tools:');
        expect(errorText).toContain(harness.expectedToolName);
        expect(errorResult.isError).toBe(true);
      } catch (error) {
        throw formatE2EError(`${runtimeCase.mode} webmcp_call_tool`, error, harness);
      } finally {
        await harness?.cleanup();
      }
    });
  }
});
