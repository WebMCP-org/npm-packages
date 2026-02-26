/**
 * Injects a hidden relay widget iframe and bridges widget messages to host tools.
 *
 * Usage:
 * `<script src=".../embed.js" data-relay-host="127.0.0.1" data-relay-port="9333"></script>`
 *
 * @typedef {{ [key: string]: unknown }} JsonObject
 * @typedef {{ name: string; description?: string; inputSchema?: JsonObject }} ToolDescriptor
 * @typedef {{ isError?: boolean; content?: Array<{ type: string; text: string }>; [key: string]: unknown }} ToolInvokeResult
 * @typedef {{ listTools: () => ToolDescriptor[] | Promise<ToolDescriptor[]>; invoke: (name: string, args: JsonObject) => ToolInvokeResult | Promise<ToolInvokeResult> }} ToolBridge
 * @typedef {{ requestId: string; type: string; toolName?: unknown; args?: unknown }} WidgetRequestMessage
 * @typedef {{ relayHost: string; relayPort: string; tabId: string; widgetUrl: string; widgetOrigin: string }} RelayConfig
 */
(function initializeWebMcpRelayEmbed() {
  const RELAY_IFRAME_SELECTOR = '[data-webmcp-relay]';
  const TAB_ID_STORAGE_KEY = '__webmcp_relay_tab_id';
  const FALLBACK_WIDGET_URL =
    'https://cdn.jsdelivr.net/npm/@mcp-b/webmcp-local-relay/dist/browser/widget.html';

  /** @type {Window | null} */
  var widgetWindow = null;

  /**
   * @returns {HTMLScriptElement | null}
   */
  function getCurrentScriptElement() {
    return document.currentScript instanceof HTMLScriptElement ? document.currentScript : null;
  }

  /**
   * @param {unknown} value
   * @returns {value is JsonObject}
   */
  function isJsonObject(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
  }

  /**
   * @returns {string}
   */
  function createTabId() {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
    return `${String(Date.now())}_${String(Math.random()).slice(2, 10)}`;
  }

  /**
   * @returns {string}
   */
  function readOrCreateTabId() {
    try {
      const storedTabId = sessionStorage.getItem(TAB_ID_STORAGE_KEY);
      if (storedTabId) {
        return storedTabId;
      }
    } catch (err) {
      console.warn(
        '[webmcp-relay-embed] sessionStorage read failed, tab ID will not persist:',
        err
      );
    }

    const tabId = createTabId();
    try {
      sessionStorage.setItem(TAB_ID_STORAGE_KEY, tabId);
    } catch (err) {
      console.warn('[webmcp-relay-embed] sessionStorage write failed:', err);
    }

    return tabId;
  }

  /**
   * @param {HTMLScriptElement | null} script
   * @returns {string}
   */
  function resolveWidgetUrl(script) {
    if (script?.src) {
      try {
        return new URL('widget.html', script.src).href;
      } catch (err) {
        console.warn(
          '[webmcp-relay-embed] Failed to resolve widget URL from script src, falling back to CDN:',
          err
        );
      }
    }
    return FALLBACK_WIDGET_URL;
  }

  /**
   * @param {HTMLScriptElement | null} script
   * @returns {RelayConfig}
   */
  function buildRelayConfig(script) {
    const widgetUrl = resolveWidgetUrl(script);
    return {
      relayHost: script?.getAttribute('data-relay-host') || '127.0.0.1',
      relayPort: script?.getAttribute('data-relay-port') || '9333',
      tabId: readOrCreateTabId(),
      widgetUrl,
      widgetOrigin: new URL(widgetUrl).origin,
    };
  }

  /**
   * @param {unknown} rawSchema
   * @returns {JsonObject}
   */
  function parseTestingSchema(rawSchema) {
    if (typeof rawSchema !== 'string' || rawSchema.length === 0) {
      return { type: 'object', properties: {} };
    }
    try {
      const parsed = JSON.parse(rawSchema);
      return isJsonObject(parsed) ? parsed : { type: 'object', properties: {} };
    } catch (err) {
      console.warn(
        '[webmcp-relay-embed] Failed to parse tool inputSchema, using permissive default:',
        err
      );
      return { type: 'object', properties: {} };
    }
  }

  /**
   * @param {unknown} value
   * @returns {JsonObject}
   */
  function toInvokeArgs(value) {
    return isJsonObject(value) ? value : {};
  }

  /**
   * @returns {ToolBridge | null}
   */
  function getToolBridge() {
    const modelContext = navigator.modelContext;
    if (
      modelContext &&
      typeof modelContext.listTools === 'function' &&
      typeof modelContext.callTool === 'function'
    ) {
      return {
        listTools() {
          return modelContext.listTools().map((tool) => ({
            name: tool.name,
            description: tool.description,
            inputSchema: isJsonObject(tool.inputSchema)
              ? tool.inputSchema
              : { type: 'object', properties: {} },
          }));
        },
        invoke(name, args) {
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
          return testing.listTools().map((tool) => ({
            name: tool.name,
            description: tool.description,
            inputSchema: parseTestingSchema(tool.inputSchema),
          }));
        },
        async invoke(name, args) {
          const serialized = await testing.executeTool(name, JSON.stringify(args));
          if (serialized === null) {
            return {
              isError: true,
              content: [{ type: 'text', text: 'Tool execution interrupted by navigation' }],
            };
          }
          const parsed = JSON.parse(serialized);
          if (!isJsonObject(parsed)) {
            throw new Error('Testing tool response was not an object');
          }
          return parsed;
        },
      };
    }

    return null;
  }

  var pushScheduled = false;

  /**
   * Coalesced handler for tool change events.
   * Uses flag + setTimeout(0) to batch rapid registrations into a single push.
   */
  function onToolsChanged() {
    if (pushScheduled || !widgetWindow) return;
    pushScheduled = true;
    setTimeout(function pushToolsChangedToWidget() {
      pushScheduled = false;
      if (!widgetWindow) return;
      var bridge = getToolBridge();
      var toolsPromise = bridge ? Promise.resolve(bridge.listTools()) : Promise.resolve([]);
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
        .catch((err) => {
          console.warn('[webmcp-relay-embed] Failed to push tool changes:', err);
        });
    }, 0);
  }

  /**
   * Subscribes to modelContext tool change events.
   * Tries addEventListener first (future native EventTarget support),
   * falls back to registerToolsChangedCallback on modelContextTesting.
   */
  function subscribeToToolChanges() {
    var mc = navigator.modelContext;
    if (mc && typeof mc.addEventListener === 'function') {
      try {
        mc.addEventListener('toolschanged', onToolsChanged);
        return;
      } catch (_e) {
        /* BrowserMcpServer doesn't extend EventTarget — fall through */
      }
    }
    var testing = navigator.modelContextTesting;
    if (testing && typeof testing.registerToolsChangedCallback === 'function') {
      try {
        testing.registerToolsChangedCallback(onToolsChanged);
      } catch (e) {
        console.warn('[webmcp-relay-embed] Failed to subscribe to tool changes:', e);
      }
    }
  }

  /**
   * @param {MessageEventSource | null} source
   * @param {string} origin
   * @param {JsonObject} payload
   */
  function respondToSource(source, origin, payload) {
    if (!source || typeof source !== 'object' || !('postMessage' in source)) {
      return;
    }

    const postMessage = source.postMessage;
    if (typeof postMessage !== 'function') {
      return;
    }

    postMessage.call(source, payload, origin);
  }

  /**
   * @param {unknown} value
   * @returns {WidgetRequestMessage | null}
   */
  function parseWidgetRequest(value) {
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

  /**
   * @param {WidgetRequestMessage} request
   * @param {MessageEvent} event
   */
  function handleListRequest(request, event) {
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
      .catch((error) => {
        console.warn('[webmcp-relay-embed] Failed to list tools:', error);
        respondToSource(event.source, event.origin, {
          type: 'webmcp.tools.list.response',
          requestId: request.requestId,
          tools: [],
        });
      });
  }

  /**
   * @param {WidgetRequestMessage} request
   * @param {MessageEvent} event
   */
  function handleInvokeRequest(request, event) {
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
      .catch((error) => {
        respondToSource(event.source, event.origin, {
          type: 'webmcp.tools.invoke.error',
          requestId: request.requestId,
          error: String(error instanceof Error ? error.message : error),
        });
      });
  }

  /**
   * @param {RelayConfig} config
   */
  function injectRelayWidget(config) {
    if (document.querySelector(RELAY_IFRAME_SELECTOR)) {
      return;
    }

    const searchParams = new URLSearchParams();
    searchParams.set('tabId', config.tabId);
    searchParams.set('hostOrigin', window.location.origin);
    searchParams.set('hostUrl', window.location.href);
    searchParams.set('hostTitle', document.title || '');
    searchParams.set('relayHost', config.relayHost);
    searchParams.set('relayPort', config.relayPort);

    const iframe = document.createElement('iframe');
    iframe.src = `${config.widgetUrl}?${searchParams.toString()}`;
    iframe.style.display = 'none';
    iframe.setAttribute('aria-hidden', 'true');
    iframe.setAttribute('data-webmcp-relay', '1');
    document.body.appendChild(iframe);
    iframe.addEventListener('load', () => {
      widgetWindow = iframe.contentWindow;
    });
  }

  if (document.querySelector(RELAY_IFRAME_SELECTOR)) {
    return;
  }

  const config = buildRelayConfig(getCurrentScriptElement());

  window.addEventListener('message', (event) => {
    if (event.origin !== config.widgetOrigin) {
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
})();
