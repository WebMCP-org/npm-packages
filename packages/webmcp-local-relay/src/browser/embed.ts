/**
 * Injects a hidden relay widget iframe and bridges widget messages to host tools.
 *
 * Usage:
 * `<script src=".../embed.js" data-relay-host="127.0.0.1" data-relay-port="9333"></script>`
 *
 * Add `data-debug` to enable diagnostic logging:
 * `<script src=".../embed.js" data-debug></script>`
 *
 * Override the per-request timeout (default 60000 ms) for slow tools that
 * chain multiple API calls:
 * `<script src=".../embed.js" data-request-timeout="120000"></script>`
 */
import type { RegisteredTool, WebMcpToolObjectInput } from '@mcp-b/webmcp-ts-sdk';
import type { CallToolResult } from '@modelcontextprotocol/server';
import {
  isJsonObject,
  isMessageEnvelope,
  type MessageEnvelope,
  normalizeSerializedToolResult,
  selectRelayTools,
} from './shared.js';

type RelayToolDescriptor = Pick<
  RegisteredTool,
  'name' | 'title' | 'description' | 'inputSchema' | 'annotations'
>;

/** The widget URL plus the settings the widget's `parseConfig()` reads, by key. */
interface RelayConfig {
  autoConnect: string;
  relayHost: string;
  relayPort: string;
  relayId: string | undefined;
  relayWorkspace: string | undefined;
  requestTimeout: string | undefined;
  tabId: string;
  widgetUrl: string;
}

const RELAY_IFRAME_SELECTOR = '[data-webmcp-relay]';
const TAB_ID_STORAGE_KEY = '__webmcp_relay_tab_id';
const TOOL_SYNC_POLL_INTERVAL_MS = 2000;

let widgetWindow: Window | null = null;

const scriptEl =
  document.currentScript instanceof HTMLScriptElement ? document.currentScript : null;
const DEBUG = scriptEl ? scriptEl.hasAttribute('data-debug') : false;

function debugWarn(...args: unknown[]): void {
  if (DEBUG) console.warn('[webmcp-relay-embed]', ...args);
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

  const tabId = crypto.randomUUID();
  try {
    sessionStorage.setItem(TAB_ID_STORAGE_KEY, tabId);
  } catch (err) {
    debugWarn('sessionStorage write failed:', err);
  }

  return tabId;
}

function buildRelayConfig(script: HTMLScriptElement | null): RelayConfig {
  if (!script?.src) {
    throw new Error('The relay embed script must be loaded from a URL');
  }
  return {
    autoConnect: String(script.getAttribute('data-auto-connect') !== 'false'),
    relayHost: script.getAttribute('data-relay-host') || '127.0.0.1',
    relayPort: script.getAttribute('data-relay-port') || '9333',
    relayId: script.getAttribute('data-relay-id') || undefined,
    relayWorkspace: script.getAttribute('data-relay-workspace') || undefined,
    requestTimeout: script.getAttribute('data-request-timeout') || undefined,
    tabId: readOrCreateTabId(),
    widgetUrl: new URL('widget.html', script.src).href,
  };
}

function mapRegisteredTool(tool: RegisteredTool): RelayToolDescriptor | null {
  if (tool.inputSchema !== undefined && !isJsonObject(tool.inputSchema)) {
    console.warn(
      `[webmcp-relay-embed] Tool "${tool.name}" was not relayed because its input schema is malformed.`
    );
    return null;
  }
  const descriptor: RelayToolDescriptor = {
    name: tool.name,
    title: tool.title,
    description: tool.description,
  };
  if (tool.inputSchema !== undefined) descriptor.inputSchema = tool.inputSchema;
  if (tool.annotations !== undefined) descriptor.annotations = tool.annotations;
  return descriptor;
}

async function listRelayTools(): Promise<RelayToolDescriptor[]> {
  const descriptorContext = document.modelContext;
  if (!descriptorContext) {
    return [];
  }

  return selectRelayTools(await descriptorContext.getTools())
    .map(mapRegisteredTool)
    .filter((tool): tool is RelayToolDescriptor => tool !== null);
}

async function invokeRelayTool(name: string, args: WebMcpToolObjectInput): Promise<CallToolResult> {
  const descriptorContext = document.modelContext;
  if (!descriptorContext) {
    throw new Error('No executable WebMCP runtime found on this page');
  }

  // Current Chrome requires a RegisteredTool returned by getTools(), not a
  // name or a stale copy.
  const tool = selectRelayTools(await descriptorContext.getTools()).find(
    (candidate) => candidate.name === name
  );
  if (!tool) {
    throw new Error(`Tool not found: ${name}`);
  }

  const serialized = await descriptorContext.executeTool(tool, args);
  return normalizeSerializedToolResult(serialized);
}

function parseInvokeArgs(value: unknown): WebMcpToolObjectInput {
  if (isJsonObject(value)) return value;
  if (value !== undefined && value !== null) {
    debugWarn('Tool invocation args must be an object; using empty input');
  }
  return {};
}

let toolSyncScheduled = false;
let toolSyncRevision = 0;
let toolSyncPollTimer: ReturnType<typeof setInterval> | null = null;
let lastToolsSnapshot = '';

function serializeStableJson(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value) ?? 'undefined';
  }
  if (Array.isArray(value)) {
    return `[${value.map(serializeStableJson).join(',')}]`;
  }
  return `{${Object.entries(value)
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
    .map(([key, child]) => `${JSON.stringify(key)}:${serializeStableJson(child)}`)
    .join(',')}}`;
}

function toolsSnapshot(tools: RelayToolDescriptor[]): string {
  return tools.map(serializeStableJson).sort().join('\n');
}

function pushToolsIfChanged(): void {
  toolSyncScheduled = false;
  const revision = toolSyncRevision;

  listRelayTools()
    .then((tools) => {
      if (revision !== toolSyncRevision) return;
      const nextSnapshot = toolsSnapshot(tools);
      if (nextSnapshot === lastToolsSnapshot || !widgetWindow) return;
      lastToolsSnapshot = nextSnapshot;
      widgetWindow.postMessage({ type: 'webmcp.tools.changed', tools }, window.location.origin);
    })
    .catch((err) => {
      debugWarn('Failed to sync tool changes:', err);
    });
}

function scheduleToolSync(): void {
  toolSyncRevision++;
  if (toolSyncScheduled) return;
  toolSyncScheduled = true;
  setTimeout(pushToolsIfChanged, 0);
}

function startToolSyncPolling(): void {
  if (toolSyncPollTimer) return;
  toolSyncPollTimer = setInterval(scheduleToolSync, TOOL_SYNC_POLL_INTERVAL_MS);
}

/**
 * WebMCP may not be installed yet (or at all); the caller retries with
 * backoff and falls back to polling.
 */
function trySubscribe(): boolean {
  try {
    const modelContext = document.modelContext;
    if (!modelContext) return false;
    modelContext.addEventListener('toolchange', scheduleToolSync);
    return true;
  } catch (error) {
    debugWarn('addEventListener on modelContext threw:', error);
    return false;
  }
}

// Polling fallback: some Chromium previews miss toolchange events when an
// AbortSignal removes a tool. Polling bounds how long a stale tool can remain.
function subscribeToToolChanges(): void {
  startToolSyncPolling();
  scheduleToolSync();

  if (trySubscribe()) {
    return;
  }

  let retries = 0;
  let retryDelayMs = 100;
  const MAX_RETRIES = 40;
  const MAX_RETRY_DELAY_MS = 1000;

  const scheduleRetry = (): void => {
    setTimeout(() => {
      retries++;
      if (trySubscribe()) {
        return;
      }

      if (retries >= MAX_RETRIES) {
        debugWarn(
          `Could not subscribe to tool changes after ${MAX_RETRIES} retries. Dynamic tool updates will rely on polling.`
        );
        return;
      }

      retryDelayMs = Math.min(Math.round(retryDelayMs * 1.5), MAX_RETRY_DELAY_MS);
      scheduleRetry();
    }, retryDelayMs);
  };

  scheduleRetry();
}

function handleListRequest(source: Window, requestId: string): void {
  listRelayTools()
    .then((tools) => {
      source.postMessage(
        { type: 'webmcp.tools.list.response', requestId, tools },
        window.location.origin
      );
    })
    .catch((error) => {
      debugWarn('Failed to list tools:', error);
      source.postMessage(
        {
          type: 'webmcp.tools.list.response',
          requestId,
          tools: [],
          error: `Failed to list tools: ${error instanceof Error ? error.message : String(error)}`,
        },
        window.location.origin
      );
    });
}

function handleInvokeRequest(source: Window, request: MessageEnvelope): void {
  const { requestId } = request;
  invokeRelayTool(String(request.toolName ?? ''), parseInvokeArgs(request.args))
    .then((result) => {
      source.postMessage(
        { type: 'webmcp.tools.invoke.response', requestId, result },
        window.location.origin
      );
    })
    .catch((error) => {
      source.postMessage(
        {
          type: 'webmcp.tools.invoke.error',
          requestId,
          error: String(error instanceof Error ? error.message : error),
        },
        window.location.origin
      );
    });
}

async function injectRelayWidget({ widgetUrl, ...widgetConfig }: RelayConfig): Promise<void> {
  if (document.querySelector(RELAY_IFRAME_SELECTOR)) {
    return;
  }

  const hostUrl = new URL(window.location.href);
  hostUrl.search = '';
  hostUrl.hash = '';
  // Escaping `<` keeps page-controlled text, such as the title, inside the script element.
  const configJson = JSON.stringify({
    ...widgetConfig,
    hostOrigin: window.location.origin,
    hostUrl: hostUrl.href,
    hostTitle: document.title,
  }).replace(/</g, '\\u003c');

  // The blob inherits the host origin, allowing the relay to verify the
  // WebSocket Origin header instead of trusting a client-reported value.
  const response = await fetch(widgetUrl);
  if (!response.ok) {
    throw new Error(`Widget HTML request failed with status ${String(response.status)}`);
  }
  const html = await response.text();
  const configScript = `<script>window.__WEBMCP_RELAY_CONFIG=${configJson};</script>`;
  // A replacer function inserts the config literally; a replacement string would expand `$'`.
  const blobUrl = URL.createObjectURL(
    new Blob([html.replace('</head>', () => `${configScript}</head>`)], { type: 'text/html' })
  );

  const iframe = document.createElement('iframe');
  iframe.src = blobUrl;
  iframe.style.display = 'none';
  iframe.setAttribute('aria-hidden', 'true');
  iframe.setAttribute('data-webmcp-relay', '1');
  iframe.setAttribute('allow', 'loopback-network; local-network; local-network-access');
  document.body.appendChild(iframe);
  widgetWindow = iframe.contentWindow;
  iframe.addEventListener('load', () => {
    widgetWindow = iframe.contentWindow;
    URL.revokeObjectURL(blobUrl);
  });
  iframe.addEventListener('error', () => {
    console.error(
      '[webmcp-relay-embed] Failed to load relay widget iframe from:',
      iframe.src,
      '-- WebMCP tools will NOT be relayed. Check network connectivity and widget URL.'
    );
    URL.revokeObjectURL(blobUrl);
  });
}

if (!document.querySelector(RELAY_IFRAME_SELECTOR)) {
  let config: RelayConfig;
  try {
    config = buildRelayConfig(scriptEl);
  } catch (err) {
    console.error('[webmcp-relay-embed] Failed to initialize relay configuration:', err);
    throw err;
  }

  window.addEventListener('message', (event: MessageEvent) => {
    const source = widgetWindow;
    if (event.origin !== window.location.origin || !source || event.source !== source) {
      return;
    }

    const data = event.data;
    if (isJsonObject(data) && data.type === 'webmcp.reload') {
      window.location.reload();
      return;
    }
    if (!isMessageEnvelope(data)) {
      return;
    }

    if (data.type === 'webmcp.tools.list.request') {
      handleListRequest(source, data.requestId);
    } else if (data.type === 'webmcp.tools.invoke.request') {
      handleInvokeRequest(source, data);
    }
  });

  const launchWidget = (): void => {
    injectRelayWidget(config).catch((err) => {
      console.error('[webmcp-relay-embed] Failed to inject relay widget:', err);
    });
  };
  if (document.body) {
    launchWidget();
  } else {
    document.addEventListener('DOMContentLoaded', launchWidget, { once: true });
  }

  subscribeToToolChanges();

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && widgetWindow) {
      widgetWindow.postMessage({ type: 'webmcp.connect' }, window.location.origin);
    }
  });
}
