/**
 * Injects a hidden relay widget iframe and bridges widget messages to host tools.
 *
 * Usage:
 * `<script src=".../embed.js" data-relay-host="127.0.0.1" data-relay-port="9333"></script>`
 *
 * Add `data-debug` to enable diagnostic logging:
 * `<script src=".../embed.js" data-debug></script>`
 */
import type {
  ModelContextTestingPolyfillExtensions,
  ModelContextTestingToolInfo,
  ModelContextWithExtensions,
  ToolListItem,
} from '@mcp-b/webmcp-types';
import { isJsonObject } from './shared.js';

/** Loose JSON object — values aren't recursively typed since we just forward them. */
type JsonObject = Record<string, unknown>;

/**
 * Minimal tool shape sent to the relay widget — just name, description, and
 * a JSON-object inputSchema. Intentionally looser than ToolListItem so both
 * modelContext (ToolListItem) and modelContextTesting (string schema) can
 * be normalised into the same shape.
 */
interface RelayToolDescriptor {
  name: string;
  description?: string;
  inputSchema?: JsonObject;
}

interface ToolBridge {
  listTools: () => RelayToolDescriptor[] | Promise<RelayToolDescriptor[]>;
  invoke: (name: string, args: JsonObject) => unknown;
}

interface WidgetRequestMessage {
  requestId: string;
  type: string;
  toolName?: unknown;
  args?: unknown;
}

interface RelayConfig {
  autoConnect: boolean;
  relayHost: string;
  relayPort: string;
  relayId?: string;
  relayWorkspace?: string;
  tabId: string;
  widgetUrl: string;
  widgetOrigin: string;
}

const RELAY_IFRAME_SELECTOR = '[data-webmcp-relay]';
const TAB_ID_STORAGE_KEY = '__webmcp_relay_tab_id';
const FALLBACK_WIDGET_URL =
  'https://cdn.jsdelivr.net/npm/@mcp-b/webmcp-local-relay/dist/browser/widget.html';

let widgetWindow: Window | null = null;
let config: RelayConfig;

function getCurrentScriptElement(): HTMLScriptElement | null {
  return document.currentScript instanceof HTMLScriptElement ? document.currentScript : null;
}

const scriptEl = getCurrentScriptElement();
const DEBUG = scriptEl ? scriptEl.hasAttribute('data-debug') : false;

function debugWarn(...args: unknown[]): void {
  if (DEBUG) console.warn('[webmcp-relay-embed]', ...args);
}

function createTabId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${String(Date.now())}_${String(Math.random()).slice(2, 10)}`;
}

function readOrCreateTabId(): string {
  try {
    const storedTabId = sessionStorage.getItem(TAB_ID_STORAGE_KEY);
    if (storedTabId) {
      return storedTabId;
    }
  } catch (err) {
    debugWarn('sessionStorage read failed, tab ID will not persist:', err);
  }

  const tabId = createTabId();
  try {
    sessionStorage.setItem(TAB_ID_STORAGE_KEY, tabId);
  } catch (err) {
    debugWarn('sessionStorage write failed:', err);
  }

  return tabId;
}

function resolveWidgetUrl(script: HTMLScriptElement | null): string {
  if (script?.src) {
    try {
      return new URL('widget.html', script.src).href;
    } catch (err) {
      debugWarn('Failed to resolve widget URL from script src, falling back to CDN:', err);
    }
  } else {
    debugWarn('Script element has no src attribute, falling back to CDN widget URL.');
  }
  return FALLBACK_WIDGET_URL;
}

function buildRelayConfig(script: HTMLScriptElement | null): RelayConfig {
  const widgetUrl = resolveWidgetUrl(script);
  const relayId = script?.getAttribute('data-relay-id') || undefined;
  const relayWorkspace = script?.getAttribute('data-relay-workspace') || undefined;
  return {
    autoConnect: script?.getAttribute('data-auto-connect') !== 'false',
    relayHost: script?.getAttribute('data-relay-host') || '127.0.0.1',
    relayPort: script?.getAttribute('data-relay-port') || '9333',
    ...(relayId ? { relayId } : {}),
    ...(relayWorkspace ? { relayWorkspace } : {}),
    tabId: readOrCreateTabId(),
    widgetUrl,
    widgetOrigin: new URL(widgetUrl).origin,
  };
}

function parseTestingSchema(rawSchema: unknown): JsonObject {
  if (typeof rawSchema !== 'string' || rawSchema.length === 0) {
    return { type: 'object', properties: {} };
  }
  try {
    const parsed: unknown = JSON.parse(rawSchema);
    return isJsonObject(parsed) ? parsed : { type: 'object', properties: {} };
  } catch (err) {
    debugWarn(
      'Tool inputSchema is not valid JSON:',
      typeof rawSchema === 'string' ? rawSchema.slice(0, 200) : rawSchema,
      err
    );
    return { type: 'object', properties: {} };
  }
}

function toInvokeArgs(value: unknown): JsonObject {
  if (isJsonObject(value)) return value;
  if (value !== undefined && value !== null) {
    debugWarn('Tool invocation args must be an object, got', typeof value);
  }
  return {};
}

function mapToolListItem(tool: ToolListItem): RelayToolDescriptor {
  return {
    name: tool.name,
    description: tool.description,
    inputSchema: tool.inputSchema,
  };
}

function mapTestingToolInfo(tool: ModelContextTestingToolInfo): RelayToolDescriptor {
  return {
    name: tool.name,
    description: tool.description,
    inputSchema: parseTestingSchema(tool.inputSchema),
  };
}

/**
 * At runtime, navigator.modelContext may be the extended BrowserMcpServer
 * (with listTools/callTool/addEventListener) installed by @mcp-b/global,
 * or the bare ModelContextCore from the native browser / polyfill.
 * We duck-type to detect the extended version.
 */
function getExtendedModelContext(): ModelContextWithExtensions | undefined {
  const mc = navigator.modelContext;
  if (
    mc &&
    typeof (mc as Partial<ModelContextWithExtensions>).listTools === 'function' &&
    typeof (mc as Partial<ModelContextWithExtensions>).callTool === 'function'
  ) {
    return mc as ModelContextWithExtensions;
  }
  return undefined;
}

function getToolBridge(): ToolBridge | null {
  const modelContext = getExtendedModelContext();
  if (modelContext) {
    return {
      listTools() {
        return modelContext.listTools().map(mapToolListItem);
      },
      invoke(name: string, args: JsonObject) {
        return modelContext.callTool({ name, arguments: args });
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
      listTools() {
        return testing.listTools().map(mapTestingToolInfo);
      },
      async invoke(name: string, args: JsonObject) {
        const serialized: string | null = await testing.executeTool(name, JSON.stringify(args));
        if (serialized === null) {
          return {
            isError: true,
            content: [{ type: 'text', text: 'Tool execution interrupted by navigation' }],
          };
        }
        let parsed: unknown;
        try {
          parsed = JSON.parse(serialized);
        } catch {
          throw new Error(
            `Testing tool returned invalid JSON: ${String(serialized).slice(0, 200)}`
          );
        }
        if (!isJsonObject(parsed)) {
          throw new Error('Testing tool response was not an object');
        }
        return parsed;
      },
    };
  }

  debugWarn('No WebMCP runtime found (navigator.modelContext or navigator.modelContextTesting).');
  return null;
}

let pushScheduled = false;

function onToolsChanged(): void {
  if (pushScheduled || !widgetWindow) return;
  pushScheduled = true;
  setTimeout(() => {
    pushScheduled = false;
    if (!widgetWindow) return;
    const bridge = getToolBridge();
    const toolsPromise = bridge ? Promise.resolve(bridge.listTools()) : Promise.resolve([]);
    toolsPromise
      .then((tools) => {
        if (!widgetWindow) return;
        widgetWindow.postMessage(
          {
            type: 'webmcp.tools.changed',
            tools: Array.isArray(tools) ? tools : [],
          },
          config.widgetOrigin
        );
      })
      .catch((err: unknown) => {
        debugWarn('Failed to push tool changes:', err);
      });
  }, 0);
}

function trySubscribe(): boolean {
  const mc = getExtendedModelContext();
  if (mc) {
    try {
      mc.addEventListener('toolchange', onToolsChanged);
      return true;
    } catch (error) {
      debugWarn('addEventListener threw:', error);
    }
  }
  const testing = navigator.modelContextTesting as
    | (typeof navigator.modelContextTesting & Partial<ModelContextTestingPolyfillExtensions>)
    | undefined;
  if (testing && typeof testing.registerToolsChangedCallback === 'function') {
    try {
      testing.registerToolsChangedCallback(onToolsChanged);
      return true;
    } catch (error) {
      debugWarn('Failed to subscribe via registerToolsChangedCallback:', error);
    }
  }
  return false;
}

function subscribeToToolChanges(): void {
  if (trySubscribe()) {
    return;
  }

  let retries = 0;
  const MAX_RETRIES = 50;
  const RETRY_INTERVAL_MS = 100;
  const retryTimer = setInterval(() => {
    retries++;
    if (trySubscribe()) {
      clearInterval(retryTimer);
      return;
    }
    if (retries >= MAX_RETRIES) {
      clearInterval(retryTimer);
      debugWarn(
        `Could not subscribe to tool changes after ${MAX_RETRIES} retries. Dynamic tool updates will not be relayed.`
      );
    }
  }, RETRY_INTERVAL_MS);
}

function respondToSource(
  source: MessageEventSource | null,
  origin: string,
  payload: Record<string, unknown>
): void {
  if (!source || typeof source !== 'object' || !('postMessage' in source)) {
    return;
  }

  (source as Window).postMessage(payload, origin);
}

function parseWidgetRequest(value: unknown): WidgetRequestMessage | null {
  if (
    !isJsonObject(value) ||
    typeof value.requestId !== 'string' ||
    typeof value.type !== 'string'
  ) {
    return null;
  }

  return {
    requestId: value.requestId,
    type: value.type,
    toolName: value.toolName,
    args: value.args,
  };
}

function handleListRequest(request: WidgetRequestMessage, event: MessageEvent): void {
  const bridge = getToolBridge();
  const toolsPromise = bridge ? Promise.resolve(bridge.listTools()) : Promise.resolve([]);

  toolsPromise
    .then((tools) => {
      respondToSource(event.source, event.origin, {
        type: 'webmcp.tools.list.response',
        requestId: request.requestId,
        tools: Array.isArray(tools) ? tools : [],
      });
    })
    .catch((error: unknown) => {
      debugWarn('Failed to list tools:', error);
      respondToSource(event.source, event.origin, {
        type: 'webmcp.tools.list.response',
        requestId: request.requestId,
        tools: [],
        error: `Failed to list tools: ${error instanceof Error ? error.message : String(error)}`,
      });
    });
}

/**
 * Monkey-patches `navigator.modelContext.elicitInput` to bridge elicitation
 * requests through the relay widget iframe to the local relay server, which
 * forwards them to the MCP client (e.g. Claude Code).
 *
 * This is the same pattern used in `@mcp-b/chrome-devtools-mcp` for CDP-based
 * elicitation forwarding. The relay widget and server handle the new
 * `elicitation-request` / `elicitation-response` message types.
 */
let elicitBridgeInstalled = false;

function installElicitBridge(widgetSource: MessageEventSource, widgetOrigin: string): void {
  if (elicitBridgeInstalled) return;

  const mc = getExtendedModelContext() as
    | (ModelContextWithExtensions & {
        elicitInput?: (
          params: Record<string, unknown>,
          options?: unknown
        ) => Promise<Record<string, unknown>>;
      })
    | undefined;
  if (!mc || typeof mc.elicitInput !== 'function') return;

  mc.elicitInput = (
    params: Record<string, unknown>,
    _options?: unknown
  ): Promise<Record<string, unknown>> => {
    const callId = createElicitCallId();
    return new Promise<Record<string, unknown>>((resolve) => {
      const handler = (event: MessageEvent): void => {
        if (event.origin !== widgetOrigin) return;
        const data = event.data as Record<string, unknown>;
        if (
          !isJsonObject(data) ||
          data.type !== 'webmcp.elicitation.response' ||
          data.callId !== callId
        ) {
          return;
        }
        window.removeEventListener('message', handler);
        resolve(
          isJsonObject(data.result)
            ? (data.result as Record<string, unknown>)
            : { action: 'decline', content: null }
        );
      };
      window.addEventListener('message', handler);

      (widgetSource as Window).postMessage(
        { type: 'webmcp.elicitation.request', callId, params },
        widgetOrigin
      );
    });
  };

  elicitBridgeInstalled = true;
  debugWarn('Elicitation bridge installed');
}

let elicitCallCounter = 0;
function createElicitCallId(): string {
  elicitCallCounter += 1;
  return `elicit_${String(Date.now())}_${String(elicitCallCounter)}`;
}

function handleInvokeRequest(request: WidgetRequestMessage, event: MessageEvent): void {
  const bridge = getToolBridge();
  if (!bridge) {
    respondToSource(event.source, event.origin, {
      type: 'webmcp.tools.invoke.error',
      requestId: request.requestId,
      error: 'No WebMCP runtime found on this page',
    });
    return;
  }

  // Install elicitation bridge before invoking the tool, so that tool
  // handlers can call elicitInput() and have it forwarded to the MCP client.
  if (event.source) {
    installElicitBridge(event.source, event.origin);
  }

  Promise.resolve(bridge.invoke(String(request.toolName ?? ''), toInvokeArgs(request.args)))
    .then((result) => {
      respondToSource(event.source, event.origin, {
        type: 'webmcp.tools.invoke.response',
        requestId: request.requestId,
        result: isJsonObject(result) ? result : {},
      });
    })
    .catch((error: unknown) => {
      respondToSource(event.source, event.origin, {
        type: 'webmcp.tools.invoke.error',
        requestId: request.requestId,
        error: String(error instanceof Error ? error.message : error),
      });
    });
}

async function injectRelayWidget(cfg: RelayConfig): Promise<void> {
  if (document.querySelector(RELAY_IFRAME_SELECTOR)) {
    return;
  }

  const searchParams = new URLSearchParams();
  searchParams.set('tabId', cfg.tabId);
  searchParams.set('hostOrigin', window.location.origin);
  const cleanUrl = new URL(window.location.href);
  cleanUrl.search = '';
  cleanUrl.hash = '';
  searchParams.set('hostUrl', cleanUrl.href);
  searchParams.set('hostTitle', document.title || '');
  searchParams.set('relayHost', cfg.relayHost);
  searchParams.set('relayPort', cfg.relayPort);
  searchParams.set('autoConnect', cfg.autoConnect ? 'true' : 'false');
  if (cfg.relayId) {
    searchParams.set('relayId', cfg.relayId);
  }
  if (cfg.relayWorkspace) {
    searchParams.set('relayWorkspace', cfg.relayWorkspace);
  }

  // Try fetch + blob URL to work around CDNs serving .html as text/plain.
  let blobUrl: string | null = null;
  try {
    const response = await fetch(cfg.widgetUrl);
    if (response.ok) {
      const html = await response.text();
      const configScript = `<script>window.__WEBMCP_RELAY_CONFIG=${JSON.stringify(Object.fromEntries(searchParams))};</script>`;
      const blob = new Blob([html.replace('</head>', `${configScript}</head>`)], {
        type: 'text/html',
      });
      blobUrl = URL.createObjectURL(blob);
      config.widgetOrigin = window.location.origin;
    }
  } catch (err) {
    debugWarn('Failed to fetch widget HTML for blob URL:', err);
  }

  const iframe = document.createElement('iframe');
  // Fallback: direct iframe src (works when widget.html is served as text/html).
  iframe.src = blobUrl ?? `${cfg.widgetUrl}?${searchParams.toString()}`;
  iframe.style.display = 'none';
  iframe.setAttribute('aria-hidden', 'true');
  iframe.setAttribute('data-webmcp-relay', '1');
  iframe.setAttribute('allow', 'loopback-network; local-network; local-network-access');
  document.body.appendChild(iframe);
  widgetWindow = iframe.contentWindow;
  iframe.addEventListener('load', () => {
    widgetWindow = iframe.contentWindow;
    if (blobUrl) {
      URL.revokeObjectURL(blobUrl);
    }
  });
  iframe.addEventListener('error', () => {
    console.error(
      '[webmcp-relay-embed] Failed to load relay widget iframe from:',
      iframe.src,
      '-- WebMCP tools will NOT be relayed. Check network connectivity and widget URL.'
    );
    if (blobUrl) {
      URL.revokeObjectURL(blobUrl);
    }
  });
}

if (!document.querySelector(RELAY_IFRAME_SELECTOR)) {
  try {
    config = buildRelayConfig(scriptEl);
  } catch (err) {
    console.error('[webmcp-relay-embed] Failed to initialize relay configuration:', err);
    throw err;
  }

  window.addEventListener('message', (event: MessageEvent) => {
    if (event.origin !== config.widgetOrigin) {
      return;
    }
    if (!widgetWindow || event.source !== widgetWindow) {
      return;
    }

    const data = event.data;
    if (isJsonObject(data) && data.type === 'webmcp.reload') {
      window.location.reload();
      return;
    }

    const request = parseWidgetRequest(event.data);
    if (!request) {
      return;
    }

    if (request.type === 'webmcp.tools.list.request') {
      handleListRequest(request, event);
      return;
    }

    if (request.type === 'webmcp.tools.invoke.request') {
      handleInvokeRequest(request, event);
    }
  });

  if (document.body) {
    void injectRelayWidget(config);
  } else {
    document.addEventListener('DOMContentLoaded', () => void injectRelayWidget(config), {
      once: true,
    });
  }

  subscribeToToolChanges();
}
