/**
 * Black-box harness for the relay: the built CLI over stdio, the built embed.js and
 * widget.html served from a CDN-like origin, a real page, and a real Chrome. Nothing
 * inside the relay or the browser is replaced.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync } from 'node:fs';
import { createServer, type IncomingHttpHeaders } from 'node:http';
import type { AddressInfo } from 'node:net';
import { homedir, tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { type Browser, chromium, type Page } from 'playwright';

const PACKAGE_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const REPO_ROOT = resolve(PACKAGE_DIR, '../..');

/** Built files under test. Run `pnpm test:e2e` to build them first. */
export const ASSETS = {
  cli: join(PACKAGE_DIR, 'dist/cli.mjs'),
  embed: join(PACKAGE_DIR, 'dist/browser/embed.js'),
  widget: join(PACKAGE_DIR, 'dist/browser/widget.html'),
  global: join(REPO_ROOT, 'packages/global/dist/index.iife.js'),
  polyfill: join(REPO_ROOT, 'packages/webmcp-polyfill/dist/index.iife.js'),
};

export function read(path: string): string {
  try {
    return readFileSync(path, 'utf8');
  } catch {
    throw new Error(`Missing ${path}. Run \`pnpm test:e2e\` to build the relay and runtimes.`);
  }
}

export async function freePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  // SAFETY: a server listening on a TCP host reports an AddressInfo.
  const { port } = server.address() as AddressInfo;
  await new Promise((done) => server.close(done));
  return port;
}

type Route = string | { body: string; type?: string; headers?: Record<string, string> };

export interface Site {
  origin: string;
  /** Request headers seen per path, newest last. */
  requests: Array<{ path: string; headers: IncomingHttpHeaders }>;
  close(): Promise<void>;
}

/** Serves fixed routes. Strings ending in `.js` are JavaScript, everything else HTML. */
export async function serve(routes: Record<string, Route>): Promise<Site> {
  const requests: Site['requests'] = [];
  const server = createServer((request, response) => {
    const path = new URL(request.url ?? '/', 'http://x').pathname;
    requests.push({ path, headers: request.headers });
    const route = routes[path];
    if (route === undefined) {
      response.writeHead(404).end('not found');
      return;
    }
    const { body, type, headers } = typeof route === 'string' ? { body: route } : route;
    response.writeHead(200, {
      'access-control-allow-origin': '*',
      'content-type': type ?? (path.endsWith('.js') ? 'text/javascript' : 'text/html'),
      ...headers,
    });
    response.end(body);
  });
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  // SAFETY: a server listening on a TCP host reports an AddressInfo.
  const { port } = server.address() as AddressInfo;
  return {
    origin: `http://127.0.0.1:${String(port)}`,
    requests,
    close: () =>
      new Promise((done) => {
        server.closeAllConnections();
        server.close(() => done());
      }),
  };
}

/** Published `@mcp-b/global` releases that pages in the wild still load. */
export const PUBLISHED_GLOBALS = ['5.1.0'] as const;

/** A file from a published npm package, downloaded once per machine. */
export function publishedFile(name: string, version: string, path: string): string {
  const dir = join(tmpdir(), 'relay-harness-packages', `${name.replace('/', '+')}@${version}`);
  if (!existsSync(join(dir, 'package'))) {
    mkdirSync(dir, { recursive: true });
    const tarball = execFileSync('npm', ['pack', `${name}@${version}`, '--silent'], { cwd: dir })
      .toString()
      .trim();
    execFileSync('tar', ['-xzf', tarball], { cwd: dir });
  }
  return read(join(dir, 'package', path));
}

/** The relay's published assets as a CDN would serve them. */
export function serveCdn(widget: Partial<Exclude<Route, string>> = {}): Promise<Site> {
  return serve({
    '/embed.js': read(ASSETS.embed),
    '/widget.html': { body: read(ASSETS.widget), ...widget },
    '/global.js': read(ASSETS.global),
    '/polyfill.js': read(ASSETS.polyfill),
    ...Object.fromEntries(
      PUBLISHED_GLOBALS.map((version) => [
        `/global@${version}.js`,
        publishedFile('@mcp-b/global', version, 'dist/index.iife.js'),
      ])
    ),
  });
}

export type Runtime =
  | 'global'
  | 'polyfill'
  | 'none'
  | `global@${(typeof PUBLISHED_GLOBALS)[number]}`;

export interface PageOptions {
  cdn: Site;
  relay: Pick<Relay, 'port' | 'id'>;
  /** Page runtime loaded before embed.js. */
  runtime?: Runtime;
  /** Inline script run after the runtime and before embed.js. */
  script?: string;
  /** Extra markup at the top of the body. */
  body?: string;
  title?: string;
  embedAttributes?: string;
}

/** A host page wired the way the README tells users to do it. */
export function hostPage({
  cdn,
  relay,
  runtime = 'global',
  script = '',
  body = '',
  title = 'Relay harness',
  embedAttributes = '',
}: PageOptions): string {
  const runtimeTag =
    runtime === 'none' ? '' : `<script src="${cdn.origin}/${runtime}.js"></script>`;
  return `<!doctype html>
<html>
  <head><meta charset="utf-8"><title>${title}</title></head>
  <body>
    ${body}
    ${runtimeTag}
    <script>${script}</script>
    <script src="${cdn.origin}/embed.js" data-relay-port="${String(relay.port)}" ${relay.id === null ? '' : `data-relay-id="${relay.id}"`} ${embedAttributes}></script>
  </body>
</html>`;
}

/** Arguments the harness passes to tools. `webmcp_call_tool` nests the page tool's arguments. */
export type ToolArgs = Record<string, string | Record<string, string>>;

/** The `webmcp_list_sources` reply. `mode` is only set on a relay in client mode. */
export interface Sources {
  mode?: 'client';
  count: number;
  sources: Array<{ tabId: string; toolCount: number; title: string }>;
}

export interface Relay {
  client: Client;
  /**
   * Relay id the widget must match, so pages never attach to another relay on this machine.
   * Null for relays started without one, such as published versions that predate the flag.
   */
  id: string | null;
  port: number;
  /** Process id of the relay; for a published version, of npx. */
  pid: number;
  logs: string[];
  /** Public names of the page tools, sorted, without the relay's own `webmcp_*` tools. */
  pageTools(): Promise<string[]>;
  /** Calls a tool and returns its first text block. Throws on `isError`. */
  call(name: string, args?: ToolArgs): Promise<string>;
  /** Pages connected to this relay, or to the relay it joined. */
  sources(): Promise<Sources>;
  close(): Promise<void>;
}

/**
 * Spawns the built CLI with an isolated HOME and connects an MCP client over stdio.
 * Every relay in one test shares `id`; pass the same `port` to start a second relay.
 */
export async function startRelay(
  options: {
    port?: number;
    id?: string | null;
    args?: string[];
    /** A published version run through npx instead of the built CLI. */
    version?: string;
  } = {}
): Promise<Relay> {
  const port = options.port ?? (await freePort());
  const id = options.id === undefined ? `harness-${String(port)}` : options.id;
  const logs: string[] = [];
  const [command, ...cli] = options.version
    ? ['npx', '--yes', `@mcp-b/webmcp-local-relay@${options.version}`]
    : [process.execPath, ASSETS.cli];
  const transport = new StdioClientTransport({
    command,
    args: [
      ...cli,
      '--port',
      String(port),
      ...(id === null ? [] : ['--relay-id', id]),
      ...(options.args ?? []),
    ],
    // Published relays write ~/.webmcp, so HOME is a throwaway. npx keeps the real cache.
    env: {
      ...Object.fromEntries(
        Object.entries(process.env).flatMap(([key, value]) =>
          value === undefined ? [] : [[key, value]]
        )
      ),
      HOME: mkdtempSync(join(tmpdir(), 'relay-home-')),
      npm_config_cache: process.env.npm_config_cache ?? join(homedir(), '.npm'),
    },
    stderr: 'pipe',
  });
  transport.stderr?.on('data', (chunk: Buffer) => logs.push(String(chunk)));
  const client = new Client({ name: 'relay-harness', version: '1.0.0' });
  await client.connect(transport).catch((error: Error) => {
    throw new Error(`Relay on ${String(port)} did not start: ${error.message}\n${logs.join('')}`);
  });

  const call = async (name: string, args: ToolArgs = {}): Promise<string> => {
    const result = await client.callTool({ name, arguments: args });
    const text = result.content.find((block) => block.type === 'text')?.text ?? '';
    if (result.isError) throw new Error(`${name} failed: ${text}`);
    return text;
  };

  return {
    client,
    id,
    port,
    // SAFETY: the transport has spawned the process once connect() resolved.
    pid: transport.pid as number,
    logs,
    call,
    sources: async (): Promise<Sources> => JSON.parse(await call('webmcp_list_sources')),
    pageTools: async () =>
      (await client.listTools()).tools
        .map((tool) => tool.name)
        .filter((name) => !name.startsWith('webmcp_'))
        .sort(),
    close: () => client.close(),
  };
}

/** Set `WEBMCP_NATIVE=1` with `CHROME_BIN` pointing at Chrome 155+ to run on native WebMCP. */
export const NATIVE = process.env.WEBMCP_NATIVE === '1';

export async function launchBrowser(): Promise<Browser> {
  const { PLAYWRIGHT_CHROMIUM_CHANNEL: channel, CHROME_BIN: executablePath } = process.env;
  return chromium.launch({
    ...(channel ? { channel } : {}),
    ...(executablePath ? { executablePath } : {}),
    // Same flags as e2e/chrome-executable.ts.
    args: NATIVE
      ? [
          '--enable-experimental-web-platform-features',
          '--enable-features=WebMCPTesting,DevToolsWebMCPSupport',
        ]
      : [],
  });
}

const pageLogs = new WeakMap<Page, string[]>();

/** Opens a page and keeps its console and errors for failure messages. */
export async function openPage(browser: Browser, url: string): Promise<Page> {
  const page = await browser.newPage();
  const log: string[] = [];
  page.on('console', (message) => log.push(`${message.type()}: ${message.text()}`));
  page.on('pageerror', (error) => log.push(`pageerror: ${error.message}`));
  pageLogs.set(page, log);
  await page.goto(url);
  return page;
}

export function pageLog(page: Page): string {
  return (pageLogs.get(page) ?? []).join('\n');
}
