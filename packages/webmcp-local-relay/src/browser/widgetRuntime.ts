/**
 * Relay widget runtime. Runs inside a hidden iframe and proxies tool messages
 * between the host page (`postMessage`) and the local relay WebSocket.
 *
 * Security: The iframe boundary provides origin isolation. All postMessage
 * exchanges validate `event.origin` against the host page's origin.
 */
import {
  buildRelayEndpointCacheKey,
  createRequestId,
  isJsonObject,
  isLoopbackHost,
  RELAY_BROWSER_PROTOCOL,
  RELAY_DISCOVERY_PROTOCOL,
  RELAY_PORT_RANGE_END,
  RELAY_PORT_RANGE_START,
  safeSend,
  sanitizeLogText,
} from './shared.js';

export interface WidgetConfig {
  autoConnect: boolean;
  hostOrigin: string;
  hostTitle: string;
  hostUrl: string;
  relayHostHint: string;
  relayId?: string;
  relayPortHint?: number;
  relayWorkspace?: string;
  tabId: string;
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

interface RelayHelloMessage {
  type: 'server-hello';
  service: 'webmcp-local-relay';
  version: 1;
  host: string;
  instanceId: string;
  label?: string;
  port: number;
  relayId?: string;
  workspace?: string;
}

interface RelayEndpoint {
  hello: RelayHelloMessage;
  host: string;
  port: number;
}

interface CachedRelayEndpoint {
  host: string;
  port: number;
}

type RelayRuntimeState =
  | 'idle'
  | 'discovering'
  | 'connected'
  | 'retry-same-endpoint'
  | 'rediscover';

const RECONNECT_INITIAL_DELAY_MS = 500;
const RECONNECT_MAX_DELAY_MS = 3000;
const REQUEST_TIMEOUT_MS = 10000;
const RELAY_SERVER_HELLO_TIMEOUT_MS = 1200;
const MAX_ENDPOINT_FAILURES_BEFORE_REDISCOVERY = 5;

export function parseConfig(search = window.location.search): WidgetConfig | null {
  const params = new URLSearchParams(search);
  const hostOrigin = params.get('hostOrigin');
  if (!hostOrigin) {
    return null;
  }

  const hostUrl = params.get('hostUrl') || hostOrigin;
  const hostTitle = params.get('hostTitle') || '';
  const tabId = params.get('tabId') || createRequestId();
  const relayHostHint = params.get('relayHost') || '127.0.0.1';
  const relayPortHintRaw = params.get('relayPort');
  const relayPortHint =
    relayPortHintRaw && relayPortHintRaw.length > 0 ? Number.parseInt(relayPortHintRaw, 10) : 9333;
  const autoConnect = params.get('autoConnect') !== 'false';
  const relayId = params.get('relayId') || undefined;
  const relayWorkspace = params.get('relayWorkspace') || undefined;

  if (!isLoopbackHost(relayHostHint)) {
    console.error(
      '[webmcp-relay-widget] relayHost must be a loopback address, got:',
      relayHostHint
    );
    return null;
  }

  if (!Number.isInteger(relayPortHint) || relayPortHint < 1 || relayPortHint > 65535) {
    console.error(
      '[webmcp-relay-widget] relayPort must be an integer between 1 and 65535, got:',
      relayPortHintRaw
    );
    return null;
  }

  return {
    autoConnect,
    hostOrigin,
    hostTitle,
    hostUrl,
    relayHostHint,
    relayPortHint,
    ...(relayId ? { relayId } : {}),
    ...(relayWorkspace ? { relayWorkspace } : {}),
    tabId,
  };
}

export function parseHostMessage(value: unknown): HostMessage | null {
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

export function startWidgetRuntime(): void {
  const config = parseConfig();
  if (!config) {
    console.warn(
      '[webmcp-relay-widget] Missing required hostOrigin parameter. Widget will not start.'
    );
    return;
  }

  runWidget(config);
}

function parseRelayHello(value: unknown): RelayHelloMessage | null {
  if (!isJsonObject(value) || value.type !== 'server-hello') {
    return null;
  }

  if (
    value.service !== 'webmcp-local-relay' ||
    value.version !== 1 ||
    typeof value.host !== 'string' ||
    typeof value.instanceId !== 'string' ||
    typeof value.port !== 'number'
  ) {
    return null;
  }

  return {
    type: 'server-hello',
    service: 'webmcp-local-relay',
    version: 1,
    host: value.host,
    instanceId: value.instanceId,
    port: value.port,
    ...(typeof value.label === 'string' ? { label: value.label } : {}),
    ...(typeof value.relayId === 'string' ? { relayId: value.relayId } : {}),
    ...(typeof value.workspace === 'string' ? { workspace: value.workspace } : {}),
  };
}

function cacheKeyForConfig(config: WidgetConfig): string {
  return buildRelayEndpointCacheKey({
    hostOrigin: config.hostOrigin,
    ...(config.relayId ? { relayId: config.relayId } : {}),
    ...(config.relayWorkspace ? { workspace: config.relayWorkspace } : {}),
  });
}

function readCachedEndpoint(config: WidgetConfig): CachedRelayEndpoint | null {
  if (typeof sessionStorage === 'undefined') {
    return null;
  }

  try {
    const raw = sessionStorage.getItem(cacheKeyForConfig(config));
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as Partial<CachedRelayEndpoint>;
    if (
      typeof parsed.host !== 'string' ||
      parsed.host.length === 0 ||
      typeof parsed.port !== 'number' ||
      !Number.isInteger(parsed.port) ||
      parsed.port < 1 ||
      parsed.port > 65535
    ) {
      return null;
    }

    return {
      host: parsed.host,
      port: parsed.port,
    };
  } catch {
    return null;
  }
}

function writeCachedEndpoint(config: WidgetConfig, endpoint: RelayEndpoint): void {
  if (typeof sessionStorage === 'undefined') {
    return;
  }

  try {
    sessionStorage.setItem(
      cacheKeyForConfig(config),
      JSON.stringify({
        host: endpoint.host,
        port: endpoint.port,
      })
    );
  } catch {
    // Ignore sessionStorage failures in sandboxed/private browsing contexts.
  }
}

function buildDiscoveryCandidates(config: WidgetConfig): Array<{ host: string; port: number }> {
  const cached = readCachedEndpoint(config);
  const seen = new Set<string>();
  const candidates: Array<{ host: string; port: number }> = [];

  const pushCandidate = (host: string, port: number): void => {
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      return;
    }
    const key = `${host}:${String(port)}`;
    if (seen.has(key)) {
      return;
    }
    seen.add(key);
    candidates.push({ host, port });
  };

  if (config.relayPortHint !== undefined) {
    pushCandidate(config.relayHostHint, config.relayPortHint);
  }

  if (cached) {
    pushCandidate(cached.host, cached.port);
  }

  for (const host of ['127.0.0.1', '[::1]']) {
    for (let port = RELAY_PORT_RANGE_START; port <= RELAY_PORT_RANGE_END; port += 1) {
      pushCandidate(host, port);
    }
  }

  return candidates;
}

async function probeRelayEndpoint(candidate: {
  host: string;
  port: number;
}): Promise<{ endpoint: RelayEndpoint; socket: WebSocket } | null> {
  const url = `ws://${candidate.host}:${String(candidate.port)}`;

  return new Promise((resolve) => {
    let settled = false;

    const socket = new WebSocket(url, [RELAY_DISCOVERY_PROTOCOL, RELAY_BROWSER_PROTOCOL]);

    const settle = (result: { endpoint: RelayEndpoint; socket: WebSocket } | null): void => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeoutId);
      socket.removeEventListener('close', onClose);
      socket.removeEventListener('error', onError);
      socket.removeEventListener('message', onMessage);
      if (result === null) {
        try {
          socket.close();
        } catch {
          // Ignore close failures during probing.
        }
      }
      resolve(result);
    };

    const onError = () => {
      settle(null);
    };

    const onClose = () => {
      settle(null);
    };

    const onMessage = (event: MessageEvent) => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(String(event.data));
      } catch {
        return;
      }

      const hello = parseRelayHello(parsed);
      if (!hello) {
        return;
      }

      settle({
        endpoint: {
          hello,
          host: candidate.host,
          port: candidate.port,
        },
        socket,
      });
    };

    const timeoutId = setTimeout(() => {
      settle(null);
    }, RELAY_SERVER_HELLO_TIMEOUT_MS);

    socket.addEventListener('close', onClose, { once: true });
    socket.addEventListener('error', onError, { once: true });
    socket.addEventListener('message', onMessage);
  });
}

export function runWidget(cfg: WidgetConfig): void {
  const pendingRequests = new Map<string, PendingRequest>();
  let activeEndpoint: RelayEndpoint | null = null;
  let activeSocket: WebSocket | null = null;
  let consecutiveEndpointFailures = 0;
  let helloSent = false;
  let reconnectDelayMs = RECONNECT_INITIAL_DELAY_MS;
  let scheduledReconnect: ReturnType<typeof setTimeout> | null = null;
  let state: RelayRuntimeState = 'idle';

  const rejectPendingRequests = (reason: string): void => {
    for (const [requestId, pending] of pendingRequests) {
      clearTimeout(pending.timeoutId);
      pendingRequests.delete(requestId);
      pending.reject(new Error(reason));
    }
  };

  const setState = (nextState: RelayRuntimeState): void => {
    state = nextState;
  };

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

  const activateSocket = (socket: WebSocket, endpoint: RelayEndpoint): void => {
    if (scheduledReconnect) {
      clearTimeout(scheduledReconnect);
      scheduledReconnect = null;
    }

    activeEndpoint = endpoint;
    activeSocket = socket;
    reconnectDelayMs = RECONNECT_INITIAL_DELAY_MS;
    helloSent = false;
    setState('connected');
    writeCachedEndpoint(cfg, endpoint);

    socket.addEventListener('message', (event) => {
      let relayMessage: Record<string, unknown>;
      try {
        relayMessage = JSON.parse(String(event.data)) as Record<string, unknown>;
      } catch (parseError) {
        console.warn('[webmcp-relay-widget] Failed to parse relay message:', parseError);
        return;
      }

      const hello = parseRelayHello(relayMessage);
      if (hello) {
        activeEndpoint = {
          hello,
          host: endpoint.host,
          port: endpoint.port,
        };
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

      if (typeof relayMessage.toolName !== 'string' || !relayMessage.toolName) {
        console.warn('[webmcp-relay-widget] Ignoring invoke with invalid toolName');
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
    });

    socket.addEventListener(
      'close',
      () => {
        if (activeSocket !== socket) {
          return;
        }

        helloSent = false;
        activeSocket = null;
        rejectPendingRequests('WebSocket connection lost');
        consecutiveEndpointFailures += 1;

        if (consecutiveEndpointFailures >= MAX_ENDPOINT_FAILURES_BEFORE_REDISCOVERY) {
          consecutiveEndpointFailures = 0;
          scheduleRediscovery();
          return;
        }

        scheduleRetrySameEndpoint();
      },
      { once: true }
    );

    socket.addEventListener('error', (event) => {
      console.warn('[webmcp-relay-widget] WebSocket error:', event);
      try {
        socket.close();
      } catch (closeErr) {
        console.warn('[webmcp-relay-widget] Error closing socket after error:', closeErr);
      }
    });

    requestHost('webmcp.tools.list', {})
      .then((message) => {
        const tools = Array.isArray(message.tools) ? message.tools : [];
        safeSend(
          socket,
          JSON.stringify({
            type: 'hello',
            tabId: cfg.tabId,
            origin: cfg.hostOrigin,
            title: cfg.hostTitle || document.referrer || 'Unknown page',
            url: cfg.hostUrl,
          })
        );
        safeSend(socket, JSON.stringify({ type: 'tools/list', tools }));
        helloSent = true;
      })
      .catch((error) => {
        console.warn('[webmcp-relay-widget] Hello handshake failed:', error);
        try {
          socket.close();
        } catch {
          // Ignore close failures after handshake setup errors.
        }
      });
  };

  const connectToEndpoint = async (
    endpoint: { host: string; port: number } | RelayEndpoint
  ): Promise<boolean> => {
    const probed = await probeRelayEndpoint({
      host: endpoint.host,
      port: endpoint.port,
    });

    if (!probed) {
      return false;
    }

    const selectedEndpoint = probed.endpoint;
    if (cfg.relayId && selectedEndpoint.hello.relayId !== cfg.relayId) {
      probed.socket.close();
      return false;
    }
    if (cfg.relayWorkspace && selectedEndpoint.hello.workspace !== cfg.relayWorkspace) {
      probed.socket.close();
      return false;
    }

    activateSocket(probed.socket, selectedEndpoint);
    return true;
  };

  const discoverRelay = async (): Promise<boolean> => {
    setState('discovering');

    for (const candidate of buildDiscoveryCandidates(cfg)) {
      const connected = await connectToEndpoint(candidate);
      if (connected) {
        consecutiveEndpointFailures = 0;
        return true;
      }
    }

    return false;
  };

  const scheduleRetrySameEndpoint = (): void => {
    if (!activeEndpoint || scheduledReconnect) {
      return;
    }

    setState('retry-same-endpoint');
    const retryEndpoint = {
      host: activeEndpoint.host,
      port: activeEndpoint.port,
    };
    const delay = Math.min(
      RECONNECT_MAX_DELAY_MS,
      Math.round(reconnectDelayMs * (0.85 + Math.random() * 0.3))
    );
    reconnectDelayMs = Math.min(Math.round(reconnectDelayMs * 1.5), RECONNECT_MAX_DELAY_MS);

    scheduledReconnect = setTimeout(() => {
      scheduledReconnect = null;
      void connectToEndpoint(retryEndpoint).then((connected) => {
        if (connected) {
          consecutiveEndpointFailures = 0;
          return;
        }

        if (consecutiveEndpointFailures >= MAX_ENDPOINT_FAILURES_BEFORE_REDISCOVERY) {
          consecutiveEndpointFailures = 0;
          scheduleRediscovery();
          return;
        }

        scheduleRetrySameEndpoint();
      });
    }, delay);
  };

  const scheduleRediscovery = (): void => {
    if (scheduledReconnect) {
      return;
    }

    setState('rediscover');
    const delay = Math.min(
      RECONNECT_MAX_DELAY_MS,
      Math.round(reconnectDelayMs * (0.85 + Math.random() * 0.3))
    );
    reconnectDelayMs = Math.min(Math.round(reconnectDelayMs * 1.5), RECONNECT_MAX_DELAY_MS);

    scheduledReconnect = setTimeout(() => {
      scheduledReconnect = null;
      void discoverRelay().then((connected) => {
        if (!connected) {
          scheduleRediscovery();
        }
      });
    }, delay);
  };

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

    if (isJsonObject(data) && data.type === 'webmcp.connect') {
      if (!activeSocket && state !== 'discovering') {
        void discoverRelay();
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

  if (cfg.autoConnect) {
    void discoverRelay().then((connected) => {
      if (!connected) {
        scheduleRediscovery();
      }
    });
  } else {
    setState('idle');
  }
}
