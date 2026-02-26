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

const TEST_TOOL_NAME = 'page_sum_real_assets';
const PACKAGE_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const REPO_ROOT = resolve(PACKAGE_DIR, '../..');
const CLI_ENTRY_PATH = resolve(PACKAGE_DIR, 'dist/cli.js');
const GLOBAL_RUNTIME_PATH = resolve(REPO_ROOT, 'packages/global/dist/index.iife.js');
const REAL_EMBED_PATH = resolve(PACKAGE_DIR, 'dist/browser/embed.js');
const REAL_WIDGET_PATH = resolve(PACKAGE_DIR, 'dist/browser/widget.html');

interface StartedHttpServer {
  server: Server;
  origin: string;
}

interface E2EHarness {
  client: Client;
  page: Page;
  relayLogs: string[];
  pageErrors: string[];
  pageConsole: string[];
  expectedToolName: string;
  cleanup: () => Promise<void>;
}

interface SpawnedRelay {
  child: ChildProcess;
  logs: string[];
  stop: () => Promise<void>;
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
    throw new Error(`Missing ${label} at ${filePath}. Run package build before E2E.`);
  }
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
  runtimeScriptRoute: string;
  runtimeMode: string;
  relayPort: number;
  widgetOrigin: string;
}): string {
  const { runtimeScriptRoute, runtimeMode, relayPort, widgetOrigin } = options;
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>WebMCP Relay Real Assets E2E Host</title>
  </head>
  <body>
    <h1>WebMCP Relay Real Assets E2E Host</h1>
    <div id="status" data-state="booting">booting</div>
    <script src="${runtimeScriptRoute}"></script>
    <script>
      (() => {
        const statusEl = document.getElementById('status');
        const runtimeMode = ${JSON.stringify(runtimeMode).replaceAll('<', '\\u003c')};
        try {
          navigator.modelContext.registerTool({
            name: ${JSON.stringify(TEST_TOOL_NAME).replaceAll('<', '\\u003c')},
            description: 'Add two numbers using real packaged embed/widget assets',
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
                structuredContent: { sum, runtimeMode, path: location.pathname, title: document.title },
              };
            },
          });
          statusEl.dataset.state = 'runtime_ready';
          statusEl.textContent = 'runtime_ready';
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
  harness: Pick<E2EHarness, 'pageErrors' | 'pageConsole' | 'relayLogs'> | null
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

async function startRelayProcess(options: {
  relayPort: number;
  widgetOrigin?: string;
}): Promise<SpawnedRelay> {
  const logs: string[] = [];
  const args = [CLI_ENTRY_PATH, '--host', '127.0.0.1', '--port', String(options.relayPort)];
  if (options.widgetOrigin) {
    args.push('--widget-origin', options.widgetOrigin);
  }
  const child = spawn(process.execPath, args, {
    cwd: PACKAGE_DIR,
    stdio: ['pipe', 'pipe', 'pipe'],
  });

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

async function setupRealAssetsHarness(options: {
  relayPort: number;
  widgetOrigin: string;
  runtimeScriptRoute: string;
  runtimeScript: string;
  runtimeMode: string;
}): Promise<E2EHarness> {
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
      if (url === options.runtimeScriptRoute) {
        sendJavaScript(response, options.runtimeScript);
        return;
      }
      if (url === '/' || url.startsWith('/index.html')) {
        sendHtml(
          response,
          buildHostPageHtml({
            runtimeScriptRoute: options.runtimeScriptRoute,
            runtimeMode: options.runtimeMode,
            relayPort: options.relayPort,
            widgetOrigin: options.widgetOrigin,
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
        String(options.relayPort),
        '--widget-origin',
        options.widgetOrigin,
      ],
      cwd: PACKAGE_DIR,
      stderr: 'pipe',
    });
    stdioTransport.stderr?.on('data', (chunk) => {
      relayLogs.push(String(chunk));
    });

    client = new Client(
      {
        name: 'webmcp-local-relay-real-assets-e2e-client',
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
    await page.waitForSelector('#status[data-state="runtime_ready"]', { timeout: 20_000 });

    const expectedToolName = sanitizeName(TEST_TOOL_NAME);
    await waitForValue(async () => {
      const toolList = await client?.listTools();
      return toolList?.tools.some((tool) => tool.name === expectedToolName) ? true : undefined;
    }, 20_000);

    return {
      client,
      page,
      relayLogs,
      pageErrors,
      pageConsole,
      expectedToolName,
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

describe('relay real-assets e2e', () => {
  it('uses packaged embed/widget assets end-to-end (server mode)', async () => {
    let widgetServer: StartedHttpServer | null = null;
    let harness: E2EHarness | null = null;

    try {
      const embedScript = readRequiredFile(REAL_EMBED_PATH, 'packaged embed.js');
      const widgetHtml = readRequiredFile(REAL_WIDGET_PATH, 'packaged widget.html');
      const runtimeScript = readRequiredFile(GLOBAL_RUNTIME_PATH, 'global runtime bundle');
      const relayPort = await getOpenPort();

      widgetServer = await startHttpServer((request, response) => {
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

      harness = await setupRealAssetsHarness({
        relayPort,
        widgetOrigin: widgetServer.origin,
        runtimeScriptRoute: '/runtime/global.iife.js',
        runtimeScript,
        runtimeMode: 'global',
      });

      const result = await harness.client.callTool({
        name: harness.expectedToolName,
        arguments: { a: 4, b: 6 },
      });
      const text = firstContentText(result);
      expect(text).toContain('sum=10');
      expect(text).toContain('runtime=global');
      expect(text).toContain('title=WebMCP Relay Real Assets E2E Host');
      expect(text).toContain('path=/');
    } catch (error) {
      throw formatE2EError('real-assets-server-mode', error, harness);
    } finally {
      await harness?.cleanup();
      await stopHttpServer(widgetServer?.server ?? null);
    }
  });

  it('works through a second relay in client mode when port owner already exists', async () => {
    let widgetServer: StartedHttpServer | null = null;
    let ownerRelay: SpawnedRelay | null = null;
    let harness: E2EHarness | null = null;

    try {
      const embedScript = readRequiredFile(REAL_EMBED_PATH, 'packaged embed.js');
      const widgetHtml = readRequiredFile(REAL_WIDGET_PATH, 'packaged widget.html');
      const runtimeScript = readRequiredFile(GLOBAL_RUNTIME_PATH, 'global runtime bundle');
      const relayPort = await getOpenPort();

      widgetServer = await startHttpServer((request, response) => {
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

      ownerRelay = await startRelayProcess({
        relayPort,
      });

      harness = await setupRealAssetsHarness({
        relayPort,
        widgetOrigin: widgetServer.origin,
        runtimeScriptRoute: '/runtime/global.iife.js',
        runtimeScript,
        runtimeMode: 'global',
      });

      const listSourcesResult = await harness.client.callTool({
        name: 'webmcp_list_sources',
        arguments: {},
      });
      expect(firstContentText(listSourcesResult)).toContain('"mode": "client"');

      const result = await harness.client.callTool({
        name: harness.expectedToolName,
        arguments: { a: 9, b: 3 },
      });
      const text = firstContentText(result);
      expect(text).toContain('sum=12');
      expect(text).toContain('runtime=global');
    } catch (error) {
      throw formatE2EError('real-assets-client-mode', error, harness);
    } finally {
      await harness?.cleanup();
      await ownerRelay?.stop();
      await stopHttpServer(widgetServer?.server ?? null);
    }
  });
});
