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
  relayHost: string;
  relayPort: string;
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
  return {
    relayHost: script?.getAttribute('data-relay-host') || '127.0.0.1',
    relayPort: script?.getAttribute('data-relay-port') || '9333',
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
      mc.addEventListener('toolschanged', onToolsChanged);
      return true;
    } catch (error) {
      debugWarn('addEventListener threw:', error);
    }
  }
  const testing = navigator.modelContextTesting;
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

function injectRelayWidget(cfg: RelayConfig): void {
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

  const iframe = document.createElement('iframe');
  iframe.src = `${cfg.widgetUrl}?${searchParams.toString()}`;
  iframe.style.display = 'none';
  iframe.setAttribute('aria-hidden', 'true');
  iframe.setAttribute('data-webmcp-relay', '1');
  document.body.appendChild(iframe);
  widgetWindow = iframe.contentWindow;
  iframe.addEventListener('load', () => {
    widgetWindow = iframe.contentWindow;
  });
  iframe.addEventListener('error', () => {
    console.error(
      '[webmcp-relay-embed] Failed to load relay widget iframe from:',
      iframe.src,
      '-- WebMCP tools will NOT be relayed. Check network connectivity and widget URL.'
    );
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
    injectRelayWidget(config);
  } else {
    document.addEventListener('DOMContentLoaded', () => injectRelayWidget(config), { once: true });
  }

  subscribeToToolChanges();
}
