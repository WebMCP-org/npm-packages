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
import { normalizeToolResponse } from '@mcp-b/webmcp-polyfill/schema';
import type {
  ChromeModelContextExtensions,
  ModelContext,
  RegisteredTool,
} from '@mcp-b/webmcp-types';
import type { CallToolResult } from '@modelcontextprotocol/server';
import { createRequestId, isJsonObject } from './shared.js';

/** Loose JSON object: values aren't recursively typed since we just forward them. */
type JsonObject = Record<string, unknown>;

interface RelayToolDescriptor {
  name: string;
  title?: string;
  description: string;
  inputSchema?: unknown;
  annotations?: RegisteredTool['annotations'];
}

interface DescriptorToolContext extends ModelContext {
  executeTool: NonNullable<ChromeModelContextExtensions['executeTool']>;
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
  requestTimeout?: string;
  tabId: string;
  widgetUrl: string;
  widgetOrigin: string;
}

const RELAY_IFRAME_SELECTOR = '[data-webmcp-relay]';
const TAB_ID_STORAGE_KEY = '__webmcp_relay_tab_id';
const TOOL_SYNC_POLL_INTERVAL_MS = 2000;
const INPUT_REQUIRED_UNSUPPORTED_MESSAGE =
  'The WebMCP local relay cannot forward MCP input_required results. Multi-round tool flows require direct McpServer registration.';

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

function readOrCreateTabId(): string {
  try {
    const storedTabId = sessionStorage.getItem(TAB_ID_STORAGE_KEY);
    if (storedTabId) {
      return storedTabId;
    }
  } catch (err) {
    debugWarn('sessionStorage read failed, tab ID will not persist:', err);
  }

  const tabId = createRequestId();
  try {
    sessionStorage.setItem(TAB_ID_STORAGE_KEY, tabId);
  } catch (err) {
    debugWarn('sessionStorage write failed:', err);
  }

  return tabId;
}

function resolveWidgetUrl(script: HTMLScriptElement | null): string {
  if (!script?.src) {
    throw new Error('The relay embed script must be loaded from a URL');
  }
  return new URL('widget.html', script.src).href;
}

function buildRelayConfig(script: HTMLScriptElement | null): RelayConfig {
  const widgetUrl = resolveWidgetUrl(script);
  const relayId = script?.getAttribute('data-relay-id') || undefined;
  const relayWorkspace = script?.getAttribute('data-relay-workspace') || undefined;
  const requestTimeout = script?.getAttribute('data-request-timeout') || undefined;
  return {
    autoConnect: script?.getAttribute('data-auto-connect') !== 'false',
    relayHost: script?.getAttribute('data-relay-host') || '127.0.0.1',
    relayPort: script?.getAttribute('data-relay-port') || '9333',
    ...(relayId ? { relayId } : {}),
    ...(relayWorkspace ? { relayWorkspace } : {}),
    ...(requestTimeout ? { requestTimeout } : {}),
    tabId: readOrCreateTabId(),
    widgetUrl,
    widgetOrigin: new URL(widgetUrl).origin,
  };
}

function toInvokeArgs(value: unknown): JsonObject {
  if (isJsonObject(value)) return value;
  if (value !== undefined && value !== null) {
    debugWarn('Tool invocation args must be an object, got', typeof value);
  }
  return {};
}

function mapRegisteredTool(tool: RegisteredTool): RelayToolDescriptor {
  return {
    name: tool.name,
    ...(tool.title === undefined ? {} : { title: tool.title }),
    description: tool.description,
    ...(tool.inputSchema === undefined
      ? {}
      : { inputSchema: JSON.parse(tool.inputSchema) as unknown }),
    ...(tool.annotations === undefined ? {} : { annotations: tool.annotations }),
  };
}

function normalizeSerializedToolResult(serialized: string | null): CallToolResult {
  if (serialized === null) {
    return {
      isError: true,
      content: [{ type: 'text', text: 'Tool execution interrupted by navigation' }],
    };
  }

  let rawResult: unknown;
  try {
    rawResult = JSON.parse(serialized);
  } catch {
    // Chrome returns callback strings directly rather than JSON-quoting them.
    rawResult = serialized;
  }

  if (isJsonObject(rawResult) && rawResult.resultType === 'input_required') {
    return {
      isError: true,
      content: [{ type: 'text', text: INPUT_REQUIRED_UNSUPPORTED_MESSAGE }],
    };
  }

  return normalizeToolResponse(rawResult);
}

function hasDescriptorToolApi(
  modelContext: ModelContext | undefined
): modelContext is DescriptorToolContext {
  return Boolean(
    modelContext && 'executeTool' in modelContext && typeof modelContext.executeTool === 'function'
  );
}

function getDocumentDescriptorContext(): DescriptorToolContext | undefined {
  const modelContext: ModelContext | undefined = document.modelContext;
  return hasDescriptorToolApi(modelContext) ? modelContext : undefined;
}

async function listRelayTools(): Promise<RelayToolDescriptor[]> {
  const descriptorContext = getDocumentDescriptorContext();
  if (!descriptorContext) {
    return [];
  }

  return (await descriptorContext.getTools()).map(mapRegisteredTool);
}

async function invokeRelayTool(name: string, args: JsonObject): Promise<CallToolResult> {
  const descriptorContext = getDocumentDescriptorContext();
  if (!descriptorContext) {
    throw new Error('No executable WebMCP runtime found on this page');
  }

  // Current Chrome requires a RegisteredTool returned by getTools(), not a
  // name or a stale copy.
  const tool = (await descriptorContext.getTools()).find((candidate) => candidate.name === name);
  if (!tool) {
    throw new Error(`Tool not found: ${name}`);
  }

  const serialized = await descriptorContext.executeTool(tool, JSON.stringify(args));
  return normalizeSerializedToolResult(serialized);
}

let toolSyncScheduled = false;
let toolSyncRevision = 0;
let toolSyncPollTimer: ReturnType<typeof setInterval> | null = null;
let lastToolsSnapshot = '';

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value) ?? 'undefined';
  }
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`;
  }
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(object[key])}`)
    .join(',')}}`;
}

function toolsSnapshot(tools: RelayToolDescriptor[]): string {
  return tools.map(stableStringify).sort().join('\n');
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
      widgetWindow.postMessage({ type: 'webmcp.tools.changed', tools }, config.widgetOrigin);
    })
    .catch((err: unknown) => {
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

function trySubscribe(): boolean {
  try {
    document.modelContext.addEventListener('toolchange', scheduleToolSync);
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
  listRelayTools()
    .then((tools) => {
      respondToSource(event.source, event.origin, {
        type: 'webmcp.tools.list.response',
        requestId: request.requestId,
        tools,
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
  if (!getDocumentDescriptorContext()) {
    respondToSource(event.source, event.origin, {
      type: 'webmcp.tools.invoke.error',
      requestId: request.requestId,
      error: 'No executable WebMCP runtime found on this page',
    });
    return;
  }

  invokeRelayTool(String(request.toolName ?? ''), toInvokeArgs(request.args))
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
  if (cfg.requestTimeout) {
    searchParams.set('requestTimeout', cfg.requestTimeout);
  }

  // The blob inherits the host origin, allowing the relay to verify the
  // WebSocket Origin header instead of trusting a client-reported value.
  const response = await fetch(cfg.widgetUrl);
  if (!response.ok) {
    throw new Error(`Widget HTML request failed with status ${String(response.status)}`);
  }
  const html = await response.text();
  const configScript = `<script>window.__WEBMCP_RELAY_CONFIG=${JSON.stringify(Object.fromEntries(searchParams))};</script>`;
  const blobUrl = URL.createObjectURL(
    new Blob([html.replace('</head>', `${configScript}</head>`)], { type: 'text/html' })
  );
  cfg.widgetOrigin = window.location.origin;

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
      widgetWindow.postMessage({ type: 'webmcp.connect' }, config.widgetOrigin);
    }
  });
}
