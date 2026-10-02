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
import { isJsonObject } from './shared.js';

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

  // The blob inherits the host origin, so the widget sees the page's WebMCP tools
  // and the relay can verify the WebSocket Origin header instead of trusting a
  // client-reported value.
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
    if (event.origin !== window.location.origin || !widgetWindow || event.source !== widgetWindow) {
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
      widgetWindow.postMessage({ type: 'webmcp.connect' }, window.location.origin);
    }
  });
}
