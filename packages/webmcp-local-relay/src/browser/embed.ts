/**
 * Injects the hidden relay widget iframe.
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
import { createRequestId, isJsonObject } from './shared.js';

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

  // The blob inherits the host origin for frame access and the WebSocket Origin header.
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
    if (event.origin !== config.widgetOrigin || !widgetWindow || event.source !== widgetWindow) {
      return;
    }
    if (isJsonObject(event.data) && event.data.type === 'webmcp.reload') {
      window.location.reload();
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

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && widgetWindow) {
      widgetWindow.postMessage({ type: 'webmcp.connect' }, config.widgetOrigin);
    }
  });
}
