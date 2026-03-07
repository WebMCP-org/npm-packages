/**
 * Relay widget runtime. Runs inside a hidden iframe and proxies tool messages
 * between the host page (`postMessage`) and the local relay WebSocket.
 *
 * Security: The iframe boundary provides origin isolation. All postMessage
 * exchanges validate `event.origin` against the host page's origin.
 */
import {
  createRequestId,
  isJsonObject,
  isLoopbackHost,
  safeSend,
  sanitizeLogText,
} from './shared.js';

interface WidgetConfig {
  hostOrigin: string;
  hostUrl: string;
  hostTitle: string;
  tabId: string;
  wsUrl: string;
}

interface HostMessage {
  requestId: string;
  type: string;
  tools?: unknown;
  result?: unknown;
  error?: unknown;
}

interface PendingRequest {
  resolve: (value: HostMessage) => void;
  reject: (reason: Error) => void;
  timeoutId: ReturnType<typeof setTimeout>;
  responseType: string;
  errorType: string;
}

const RECONNECT_INITIAL_DELAY_MS = 500;
const RECONNECT_MAX_DELAY_MS = 3000;
const RECONNECT_MAX_ATTEMPTS = 100;
const REQUEST_TIMEOUT_MS = 10000;

function parseConfig(): WidgetConfig | null {
  const params = new URLSearchParams(window.location.search);
  const hostOrigin = params.get('hostOrigin');
  if (!hostOrigin) {
    return null;
  }

  const hostUrl = params.get('hostUrl') || hostOrigin;
  const hostTitle = params.get('hostTitle') || '';
  const tabId = params.get('tabId') || createRequestId();
  const relayHost = params.get('relayHost') || '127.0.0.1';
  const relayPort = params.get('relayPort') || '9333';

  if (!isLoopbackHost(relayHost)) {
    console.error('[webmcp-relay-widget] relayHost must be a loopback address, got:', relayHost);
    return null;
  }

  return { hostOrigin, hostUrl, hostTitle, tabId, wsUrl: `ws://${relayHost}:${relayPort}` };
}

function parseHostMessage(value: unknown): HostMessage | null {
  if (
    !isJsonObject(value) ||
    typeof value.requestId !== 'string' ||
    typeof value.type !== 'string'
  ) {
    return null;
  }
  return {
    requestId: value.requestId as string,
    type: value.type as string,
    tools: value.tools,
    result: value.result,
    error: value.error,
  };
}

const config = parseConfig();
if (!config) {
  console.warn(
    '[webmcp-relay-widget] Missing required hostOrigin parameter. Widget will not start.'
  );
} else {
  runWidget(config);
}

function runWidget(cfg: WidgetConfig): void {
  const pendingRequests = new Map<string, PendingRequest>();
  let reconnectDelayMs = RECONNECT_INITIAL_DELAY_MS;
  let reconnectAttempts = 0;
  let activeSocket: WebSocket | null = null;
  let helloSent = false;

  window.addEventListener('message', (event: MessageEvent) => {
    if (event.origin !== cfg.hostOrigin) {
      return;
    }

    const data = event.data;
    if (isJsonObject(data) && data.type === 'webmcp.tools.changed') {
      if (activeSocket && helloSent) {
        safeSend(
          activeSocket,
          JSON.stringify({
            type: 'tools/changed',
            tools: Array.isArray(data.tools) ? data.tools : [],
          })
        );
      }
      return;
    }

    const message = parseHostMessage(data);
    if (!message) {
      return;
    }

    const pending = pendingRequests.get(message.requestId);
    if (!pending) {
      return;
    }

    if (message.type === pending.responseType) {
      clearTimeout(pending.timeoutId);
      pendingRequests.delete(message.requestId);
      pending.resolve(message);
      return;
    }

    if (message.type === pending.errorType) {
      clearTimeout(pending.timeoutId);
      pendingRequests.delete(message.requestId);
      pending.reject(new Error(String(message.error || 'Unknown host error')));
    }
  });

  function requestHost(baseType: string, payload: Record<string, unknown>): Promise<HostMessage> {
    const requestId = createRequestId();

    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        pendingRequests.delete(requestId);
        reject(new Error(`Host response timeout: ${baseType}`));
      }, REQUEST_TIMEOUT_MS);

      pendingRequests.set(requestId, {
        resolve,
        reject,
        timeoutId,
        responseType: `${baseType}.response`,
        errorType: `${baseType}.error`,
      });

      window.parent.postMessage(
        { type: `${baseType}.request`, requestId, ...payload },
        cfg.hostOrigin
      );
    });
  }

  function sendHelloAndTools(socket: WebSocket): void {
    requestHost('webmcp.tools.list', {})
      .then((message) => {
        const tools = Array.isArray(message.tools) ? message.tools : [];
        safeSend(
          socket,
          JSON.stringify({
            type: 'hello',
            tabId: cfg.tabId,
            origin: cfg.hostOrigin,
            url: cfg.hostUrl,
            title: cfg.hostTitle || document.referrer || 'Unknown page',
          })
        );
        safeSend(socket, JSON.stringify({ type: 'tools/list', tools }));
        helloSent = true;
      })
      .catch((error) => {
        console.warn('[webmcp-relay-widget] Hello handshake failed:', error);
        socket.close();
      });
  }

  function handleRelayMessage(socket: WebSocket, rawMessage: unknown): void {
    let relayMessage: Record<string, unknown>;
    try {
      relayMessage = JSON.parse(String(rawMessage)) as Record<string, unknown>;
    } catch (parseError) {
      console.warn('[webmcp-relay-widget] Failed to parse relay message:', parseError);
      return;
    }

    if (!isJsonObject(relayMessage) || typeof relayMessage.type !== 'string') {
      console.debug('[webmcp-relay-widget] Ignoring non-object or untyped relay message');
      return;
    }

    if (relayMessage.type === 'ping') {
      safeSend(socket, JSON.stringify({ type: 'pong' }));
      return;
    }

    if (relayMessage.type === 'reload') {
      window.parent.postMessage({ type: 'webmcp.reload' }, cfg.hostOrigin);
      return;
    }

    if (relayMessage.type !== 'invoke') {
      console.debug(
        '[webmcp-relay-widget] Ignoring unrecognized message type:',
        sanitizeLogText(relayMessage.type)
      );
      return;
    }

    requestHost('webmcp.tools.invoke', {
      toolName: relayMessage.toolName,
      args: isJsonObject(relayMessage.args) ? relayMessage.args : {},
    })
      .then((hostResponse) => {
        safeSend(
          socket,
          JSON.stringify({
            type: 'result',
            callId: relayMessage.callId,
            result: hostResponse.result,
          })
        );
      })
      .catch((error: unknown) => {
        safeSend(
          socket,
          JSON.stringify({
            type: 'result',
            callId: relayMessage.callId,
            result: {
              isError: true,
              content: [
                {
                  type: 'text',
                  text: String(error instanceof Error ? error.message : error),
                },
              ],
            },
          })
        );
      });
  }

  function connect(): void {
    const socket = new WebSocket(cfg.wsUrl);
    activeSocket = socket;

    socket.addEventListener('open', () => {
      reconnectDelayMs = RECONNECT_INITIAL_DELAY_MS;
      reconnectAttempts = 0;
      sendHelloAndTools(socket);
    });

    socket.addEventListener('message', (event) => {
      handleRelayMessage(socket, event.data);
    });

    socket.addEventListener('close', () => {
      helloSent = false;
      activeSocket = null;

      for (const [requestId, pending] of pendingRequests) {
        clearTimeout(pending.timeoutId);
        pendingRequests.delete(requestId);
        pending.reject(new Error('WebSocket connection lost'));
      }

      reconnectAttempts++;
      if (reconnectAttempts >= RECONNECT_MAX_ATTEMPTS) {
        console.error(
          `[webmcp-relay-widget] Giving up reconnection after ${reconnectAttempts} attempts. Is the relay server running at ${cfg.wsUrl}?`
        );
        return;
      }
      if (reconnectAttempts % 10 === 0) {
        console.warn(
          `[webmcp-relay-widget] Still reconnecting after ${reconnectAttempts} attempts (delay: ${reconnectDelayMs}ms)`
        );
      }
      setTimeout(connect, reconnectDelayMs);
      reconnectDelayMs = Math.min(reconnectDelayMs * 1.5, RECONNECT_MAX_DELAY_MS);
    });

    socket.addEventListener('error', (event) => {
      console.warn('[webmcp-relay-widget] WebSocket error:', event);
      try {
        socket.close();
      } catch (closeErr) {
        console.warn('[webmcp-relay-widget] Error closing socket after error:', closeErr);
      }
    });
  }

  connect();
}
