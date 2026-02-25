/**
 * WebMCP Local Relay — Embed Script
 *
 * Add this script to any page that registers WebMCP tools.
 * It injects a hidden iframe that bridges tool calls between
 * the page's navigator.modelContext and a local relay server.
 *
 * Usage:
 *   <script src="https://cdn.jsdelivr.net/npm/@mcp-b/webmcp-local-relay/dist/browser/embed.js"></script>
 *
 * Configuration (via data attributes):
 *   data-relay-host  — relay hostname (default: "127.0.0.1")
 *   data-relay-port  — relay port    (default: "9333")
 *
 * Example with custom port:
 *   <script
 *     src="https://cdn.jsdelivr.net/npm/@mcp-b/webmcp-local-relay/dist/browser/embed.js"
 *     data-relay-port="9444"
 *   ></script>
 */
(() => {
  // Idempotency — only inject one relay iframe per page.
  if (document.querySelector('[data-webmcp-relay]')) return;

  // ---------------------------------------------------------------------------
  // Configuration
  // ---------------------------------------------------------------------------

  const script = document.currentScript;
  const relayHost = script?.getAttribute('data-relay-host') || '127.0.0.1';
  const relayPort = script?.getAttribute('data-relay-port') || '9333';

  // Derive the widget URL from the same directory as this script.
  // When loaded from a CDN the widget sits next to embed.js.
  let widgetBaseUrl;
  if (script?.src) {
    try {
      widgetBaseUrl = new URL('widget.html', script.src).href;
    } catch (_e) {
      /* fall through to hardcoded default */
    }
  }
  if (!widgetBaseUrl) {
    widgetBaseUrl =
      'https://cdn.jsdelivr.net/npm/@mcp-b/webmcp-local-relay/dist/browser/widget.html';
  }

  const widgetOrigin = new URL(widgetBaseUrl).origin;

  // ---------------------------------------------------------------------------
  // Stable tab identity (survives page reloads within the same tab)
  // ---------------------------------------------------------------------------

  const STORAGE_KEY = '__webmcp_relay_tab_id';
  let tabId;
  try {
    tabId = sessionStorage.getItem(STORAGE_KEY);
  } catch (_e) {
    /* private browsing or disabled storage */
  }
  if (!tabId) {
    tabId =
      typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `${String(Date.now())}_${String(Math.random()).slice(2, 10)}`;
    try {
      sessionStorage.setItem(STORAGE_KEY, tabId);
    } catch (_e) {
      /* best effort */
    }
  }

  // ---------------------------------------------------------------------------
  // WebMCP runtime detection
  // ---------------------------------------------------------------------------

  function getToolBridge() {
    // Prefer the extensions path (listTools / callTool on modelContext).
    const mc = navigator.modelContext;
    if (mc && typeof mc.listTools === 'function' && typeof mc.callTool === 'function') {
      return {
        listTools: () =>
          mc.listTools().map((t) => ({
            name: t.name,
            description: t.description,
            inputSchema: t.inputSchema || { type: 'object', properties: {} },
          })),
        invoke: (name, args) => mc.callTool({ name: name, arguments: args || {} }),
      };
    }

    // Fallback: modelContextTesting (polyfill-only path).
    const testing = navigator.modelContextTesting;
    if (
      testing &&
      typeof testing.listTools === 'function' &&
      typeof testing.executeTool === 'function'
    ) {
      return {
        listTools: () =>
          testing.listTools().map((t) => {
            let schema = { type: 'object', properties: {} };
            if (t.inputSchema) {
              try {
                const p = JSON.parse(t.inputSchema);
                if (p && typeof p === 'object' && !Array.isArray(p)) schema = p;
              } catch (_e) {
                /* keep default */
              }
            }
            return { name: t.name, description: t.description, inputSchema: schema };
          }),
        invoke: (name, args) =>
          testing.executeTool(name, JSON.stringify(args || {})).then((serialized) => {
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
          }),
      };
    }

    return null;
  }

  // ---------------------------------------------------------------------------
  // postMessage bridge — handle requests from the widget iframe
  // ---------------------------------------------------------------------------

  window.addEventListener('message', (event) => {
    if (event.origin !== widgetOrigin) return;

    const data = event.data;
    if (!data || typeof data !== 'object' || typeof data.requestId !== 'string') return;

    const bridge = getToolBridge();

    // --- Tool listing ---
    if (data.type === 'webmcp.tools.list.request') {
      let tools = [];
      try {
        if (bridge) tools = bridge.listTools();
      } catch (_e) {
        /* runtime not ready yet */
      }
      Promise.resolve(tools)
        .then((resolved) => {
          event.source.postMessage(
            { type: 'webmcp.tools.list.response', requestId: data.requestId, tools: resolved },
            event.origin
          );
        })
        .catch(() => {
          event.source.postMessage(
            { type: 'webmcp.tools.list.response', requestId: data.requestId, tools: [] },
            event.origin
          );
        });
      return;
    }

    // --- Tool invocation ---
    if (data.type === 'webmcp.tools.invoke.request') {
      if (!bridge) {
        event.source.postMessage(
          {
            type: 'webmcp.tools.invoke.error',
            requestId: data.requestId,
            error: 'No WebMCP runtime found on this page',
          },
          event.origin
        );
        return;
      }
      Promise.resolve()
        .then(() => bridge.invoke(String(data.toolName || ''), data.args || {}))
        .then((result) => {
          event.source.postMessage(
            { type: 'webmcp.tools.invoke.response', requestId: data.requestId, result: result },
            event.origin
          );
        })
        .catch((error) => {
          event.source.postMessage(
            {
              type: 'webmcp.tools.invoke.error',
              requestId: data.requestId,
              error: String(error?.message ? error.message : error),
            },
            event.origin
          );
        });
    }
  });

  // ---------------------------------------------------------------------------
  // Inject hidden widget iframe
  // ---------------------------------------------------------------------------

  function injectIframe() {
    // Re-check in case another instance raced.
    if (document.querySelector('[data-webmcp-relay]')) return;

    const params = new URLSearchParams();
    params.set('tabId', tabId);
    params.set('hostOrigin', window.location.origin);
    params.set('hostUrl', window.location.href);
    params.set('hostTitle', document.title || '');
    params.set('relayHost', relayHost);
    params.set('relayPort', relayPort);

    const iframe = document.createElement('iframe');
    iframe.src = `${widgetBaseUrl}?${params.toString()}`;
    iframe.style.display = 'none';
    iframe.setAttribute('aria-hidden', 'true');
    iframe.setAttribute('data-webmcp-relay', '1');
    document.body.appendChild(iframe);
  }

  if (document.body) {
    injectIframe();
  } else {
    document.addEventListener('DOMContentLoaded', injectIframe);
  }
})();
