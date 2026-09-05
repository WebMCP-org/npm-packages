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
  requestTimeoutMs: number;
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
  callId?: string;
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

interface RelayHelloRejectedMessage {
  type: 'hello/rejected';
  message: string;
  reason: string;
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

type RelayRuntimePhase = 'idle' | 'discovering' | 'dormant';

const RECONNECT_DELAY_MS = 500;
const DEFAULT_REQUEST_TIMEOUT_MS = 60000;
const RELAY_SERVER_HELLO_TIMEOUT_MS = 1200;
const RELAY_HELLO_TIMEOUT_MS = 1000;

/** Delay before each rediscovery attempt (ms). Running out of entries goes dormant. */
const REDISCOVERY_DELAYS_MS = [10000, 20000, 30000];
/** Heartbeat probe interval while dormant (ms). */
const DORMANT_HEARTBEAT_INTERVAL_MS = 120000;

export function parseConfig(search = window.location.search): WidgetConfig | null {
  const params = new URLSearchParams(search);

  const globalConfig = (
    globalThis as typeof globalThis & { __WEBMCP_RELAY_CONFIG?: Record<string, string> }
  ).__WEBMCP_RELAY_CONFIG;

  function getParam(key: string): string | null {
    return params.get(key) ?? globalConfig?.[key] ?? null;
  }

  const hostOrigin = getParam('hostOrigin');
  if (!hostOrigin) {
    return null;
  }

  const hostUrl = getParam('hostUrl') || hostOrigin;
  const hostTitle = getParam('hostTitle') || '';
  const tabId = getParam('tabId') || createRequestId();
  const relayHostHint = getParam('relayHost') || '127.0.0.1';
  const relayPortHintRaw = getParam('relayPort');
  const relayPortHint =
    relayPortHintRaw && relayPortHintRaw.length > 0
      ? Number(relayPortHintRaw)
      : RELAY_PORT_RANGE_START;
  const autoConnect = getParam('autoConnect') !== 'false';
  const relayId = getParam('relayId') || undefined;
  const relayWorkspace = getParam('relayWorkspace') || undefined;
  const requestTimeoutRaw = getParam('requestTimeout');
  const requestTimeoutMs =
    requestTimeoutRaw && requestTimeoutRaw.length > 0
      ? Number(requestTimeoutRaw)
      : DEFAULT_REQUEST_TIMEOUT_MS;

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

  if (!Number.isInteger(requestTimeoutMs) || requestTimeoutMs < 1) {
    console.error(
      '[webmcp-relay-widget] requestTimeout must be a positive integer (ms), got:',
      requestTimeoutRaw
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
    requestTimeoutMs,
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
    requestId: value.requestId,
    type: value.type,
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

function parseRelayHelloRejected(value: unknown): RelayHelloRejectedMessage | null {
  if (
    !isJsonObject(value) ||
    value.type !== 'hello/rejected' ||
    typeof value.message !== 'string' ||
    typeof value.reason !== 'string'
  ) {
    return null;
  }

  return {
    type: 'hello/rejected',
    message: value.message,
    reason: value.reason,
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

function clearCachedEndpoint(config: WidgetConfig): void {
  if (typeof sessionStorage === 'undefined') {
    return;
  }

  try {
    sessionStorage.removeItem(cacheKeyForConfig(config));
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
  // isLoopbackHost() accepts the bare '::1' form, which needs brackets in a URL
  // authority; `ws://::1:9333` is unparseable and makes the WebSocket ctor throw.
  const host =
    candidate.host.includes(':') && !candidate.host.startsWith('[')
      ? `[${candidate.host}]`
      : candidate.host;
  const url = `ws://${host}:${String(candidate.port)}`;

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

function runWidget(cfg: WidgetConfig): void {
  const pendingRequests = new Map<string, PendingRequest>();
  const invocationRequests = new Map<string, string>();
  let activeEndpoint: RelayEndpoint | null = null;
  let activeSocket: WebSocket | null = null;
  let helloAccepted = false;
  let helloAckTimer: ReturnType<typeof setTimeout> | null = null;
  let scheduledReconnect: ReturnType<typeof setTimeout> | null = null;
  let phase: RelayRuntimePhase = 'idle';
  let discoveryCycleCount = 0;
  let dormantHeartbeatTimer: ReturnType<typeof setInterval> | null = null;

  const takePendingRequest = (requestId: string): PendingRequest | undefined => {
    const pending = pendingRequests.get(requestId);
    if (pending) {
      clearTimeout(pending.timeoutId);
      pendingRequests.delete(requestId);
      if (pending.callId !== undefined) invocationRequests.delete(pending.callId);
    }
    return pending;
  };

  const cancelHostRequest = (requestId: string, reason: string): void => {
    const pending = takePendingRequest(requestId);
    if (!pending) return;
    if (pending.callId !== undefined) {
      window.parent.postMessage({ type: 'webmcp.tools.cancel.request', requestId }, cfg.hostOrigin);
    }
    pending.reject(new Error(reason));
  };

  const rejectPendingRequests = (reason: string): void => {
    for (const requestId of pendingRequests.keys()) cancelHostRequest(requestId, reason);
  };

  function requestHost(
    baseType: string,
    payload: Record<string, unknown>,
    callId?: string
  ): Promise<HostMessage> {
    const requestId = createRequestId();

    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        cancelHostRequest(requestId, `Host response timeout: ${baseType}`);
      }, cfg.requestTimeoutMs);

      pendingRequests.set(requestId, {
        resolve,
        reject,
        timeoutId,
        responseType: `${baseType}.response`,
        errorType: `${baseType}.error`,
        ...(callId === undefined ? {} : { callId }),
      });
      if (callId !== undefined) invocationRequests.set(callId, requestId);

      window.parent.postMessage(
        { type: `${baseType}.request`, requestId, ...payload },
        cfg.hostOrigin
      );
    });
  }

  const activateSocket = (socket: WebSocket, endpoint: RelayEndpoint): void => {
    let initialTools: unknown[] = [];

    const clearHelloAckTimer = (): void => {
      if (!helloAckTimer) {
        return;
      }
      clearTimeout(helloAckTimer);
      helloAckTimer = null;
    };

    const sendInitialTools = (): void => {
      safeSend(socket, JSON.stringify({ type: 'tools/list', tools: initialTools }));
    };

    if (scheduledReconnect) {
      clearTimeout(scheduledReconnect);
      scheduledReconnect = null;
    }

    activeEndpoint = endpoint;
    activeSocket = socket;
    discoveryCycleCount = 0;
    helloAccepted = false;
    phase = 'idle';

    socket.addEventListener('message', (event) => {
      if (activeSocket !== socket) return;
      let parsed: unknown;
      try {
        parsed = JSON.parse(String(event.data));
      } catch (parseError) {
        console.warn('[webmcp-relay-widget] Failed to parse relay message:', parseError);
        return;
      }

      const hello = parseRelayHello(parsed);
      if (hello) {
        activeEndpoint = {
          hello,
          host: endpoint.host,
          port: endpoint.port,
        };
        return;
      }

      if (isJsonObject(parsed) && parsed.type === 'hello/accepted') {
        clearHelloAckTimer();
        helloAccepted = true;
        writeCachedEndpoint(cfg, endpoint);
        sendInitialTools();
        return;
      }

      const helloRejected = parseRelayHelloRejected(parsed);
      if (helloRejected) {
        clearHelloAckTimer();
        helloAccepted = false;
        clearCachedEndpoint(cfg);
        window.parent.postMessage(
          {
            type: 'webmcp.relay.rejected',
            host: endpoint.host,
            port: endpoint.port,
            message: helloRejected.message,
            reason: helloRejected.reason,
          },
          cfg.hostOrigin
        );
        console.error(
          '[webmcp-relay-widget] Relay rejected browser hello:',
          helloRejected.reason,
          helloRejected.message
        );
        try {
          socket.close(1008, helloRejected.message);
        } catch {
          // Ignore close failures after a structured rejection.
        }
        return;
      }

      if (!isJsonObject(parsed) || typeof parsed.type !== 'string') {
        return;
      }
      const relayMessage = parsed;

      if (relayMessage.type === 'ping') {
        safeSend(socket, JSON.stringify({ type: 'pong' }));
        return;
      }

      if (relayMessage.type === 'reload') {
        window.parent.postMessage({ type: 'webmcp.reload' }, cfg.hostOrigin);
        return;
      }

      if (relayMessage.type === 'cancel') {
        if (typeof relayMessage.callId !== 'string') return;
        const requestId = invocationRequests.get(relayMessage.callId);
        if (requestId !== undefined) cancelHostRequest(requestId, 'Tool execution cancelled');
        return;
      }

      if (relayMessage.type !== 'invoke') {
        console.debug(
          '[webmcp-relay-widget] Ignoring unrecognized message type:',
          sanitizeLogText(relayMessage.type)
        );
        return;
      }

      if (typeof relayMessage.callId !== 'string' || invocationRequests.has(relayMessage.callId)) {
        return;
      }

      requestHost(
        'webmcp.tools.invoke',
        {
          toolName: relayMessage.toolName,
          args: isJsonObject(relayMessage.args) ? relayMessage.args : {},
        },
        relayMessage.callId
      )
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

        helloAccepted = false;
        activeSocket = null;
        clearHelloAckTimer();
        rejectPendingRequests('WebSocket connection lost');
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
        initialTools = Array.isArray(message.tools) ? message.tools : [];
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
        helloAckTimer = setTimeout(() => {
          helloAckTimer = null;
          if (activeSocket !== socket || socket.readyState !== WebSocket.OPEN || helloAccepted) {
            return;
          }
          console.warn('[webmcp-relay-widget] Relay did not acknowledge browser hello');
          socket.close(4000, 'Browser hello was not acknowledged');
        }, RELAY_HELLO_TIMEOUT_MS);
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
    phase = 'discovering';

    try {
      for (const candidate of buildDiscoveryCandidates(cfg)) {
        const connected = await connectToEndpoint(candidate);
        if (connected) {
          return true;
        }
      }

      return false;
    } finally {
      if (phase === 'discovering') {
        phase = 'idle';
      }
    }
  };

  const scheduleRetrySameEndpoint = (): void => {
    if (!activeEndpoint || scheduledReconnect) {
      return;
    }

    const retryEndpoint = {
      host: activeEndpoint.host,
      port: activeEndpoint.port,
    };
    const delay = Math.round(RECONNECT_DELAY_MS * (0.85 + Math.random() * 0.3));

    scheduledReconnect = setTimeout(() => {
      scheduledReconnect = null;
      void connectToEndpoint(retryEndpoint).then((connected) => {
        if (!connected) {
          scheduleRediscovery();
        }
      });
    }, delay);
  };

  /**
   * Schedules a full-range rediscovery attempt with increasing delays.
   * Once {@link REDISCOVERY_DELAYS_MS} is exhausted, transitions to dormant state.
   */
  const scheduleRediscovery = (): void => {
    if (scheduledReconnect) {
      return;
    }

    const delay = REDISCOVERY_DELAYS_MS[discoveryCycleCount];
    if (delay === undefined) {
      enterDormant();
      return;
    }

    scheduledReconnect = setTimeout(() => {
      scheduledReconnect = null;
      void discoverRelay().then((connected) => {
        if (!connected) {
          discoveryCycleCount += 1;
          scheduleRediscovery();
        }
      });
    }, delay);
  };

  const onDormantVisibilityChange = (): void => {
    if (document.visibilityState === 'visible' && phase === 'dormant') {
      wakeFromDormant();
    }
  };

  const cleanupDormantListeners = (): void => {
    document.removeEventListener('visibilitychange', onDormantVisibilityChange);
    if (dormantHeartbeatTimer !== null) {
      clearInterval(dormantHeartbeatTimer);
      dormantHeartbeatTimer = null;
    }
  };

  /**
   * Enters dormant state: stops active reconnection and relies on
   * visibilitychange events and periodic heartbeat probes to detect
   * a relay that comes online later.
   */
  const enterDormant = (): void => {
    if (phase === 'dormant') {
      return;
    }

    phase = 'dormant';

    if (scheduledReconnect) {
      clearTimeout(scheduledReconnect);
      scheduledReconnect = null;
    }

    document.addEventListener('visibilitychange', onDormantVisibilityChange);

    dormantHeartbeatTimer = setInterval(() => {
      void heartbeatProbe();
    }, DORMANT_HEARTBEAT_INTERVAL_MS);
  };

  /**
   * Lightweight probe: only checks the configured port and cached endpoint,
   * skipping a full-range discovery scan.
   */
  const heartbeatProbe = async (): Promise<void> => {
    if (phase !== 'dormant') {
      return;
    }

    const seen = new Set<string>();
    const candidates: Array<{ host: string; port: number }> = [];

    const pushCandidate = (host: string, port: number): void => {
      const key = `${host}:${String(port)}`;
      if (seen.has(key)) return;
      seen.add(key);
      candidates.push({ host, port });
    };

    if (cfg.relayPortHint !== undefined) {
      pushCandidate(cfg.relayHostHint, cfg.relayPortHint);
    }

    const cached = readCachedEndpoint(cfg);
    if (cached) {
      pushCandidate(cached.host, cached.port);
    }

    if (candidates.length === 0) {
      return;
    }

    // Transition state and remove listeners to prevent concurrent event-driven wakes.
    phase = 'discovering';
    cleanupDormantListeners();

    for (const candidate of candidates) {
      const connected = await connectToEndpoint(candidate);
      if (connected) {
        discoveryCycleCount = 0;
        return;
      }
    }

    // Probe failed; go back to dormant.
    enterDormant();
  };

  /**
   * Wakes from dormant state: cleans up listeners, resets backoff
   * counters, and runs a full-range discovery. Falls back to dormant
   * again if discovery fails.
   */
  const wakeFromDormant = (): void => {
    cleanupDormantListeners();
    discoveryCycleCount = 0;

    void discoverRelay().then((connected) => {
      if (!connected) {
        enterDormant();
      }
    });
  };

  window.addEventListener('message', (event: MessageEvent) => {
    if (event.source !== window.parent || event.origin !== cfg.hostOrigin) {
      return;
    }

    const data = event.data;
    if (isJsonObject(data) && data.type === 'webmcp.tools.changed') {
      if (activeSocket && helloAccepted) {
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
      if (phase === 'dormant') {
        wakeFromDormant();
      } else if (!activeSocket && phase !== 'discovering') {
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
      takePendingRequest(message.requestId);
      pending.resolve(message);
      return;
    }

    if (message.type === pending.errorType) {
      takePendingRequest(message.requestId);
      pending.reject(new Error(String(message.error || 'Unknown host error')));
    }
  });

  if (cfg.autoConnect) {
    void discoverRelay().then((connected) => {
      if (!connected) {
        scheduleRediscovery();
      }
    });
  }
}
