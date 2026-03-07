import { ws } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { parseConfig, parseHostMessage, startWidgetRuntime } from './widgetRuntime.js';

const relayServer = setupServer();
const APP_ORIGIN = 'https://app.example.com';
let nextRelayPort = 9333;

interface RelayClient {
  addEventListener(type: 'message', listener: (event: { data: unknown }) => void): void;
  close(code?: number, reason?: string): void;
  send(data: string): void;
}

interface RelayConnection {
  client: RelayClient;
  messages: unknown[];
}

interface HostEvent {
  data: unknown;
  origin: string;
}

interface HostWindow {
  addEventListener(type: 'message', listener: (event: HostEvent) => void): void;
  dispatchMessage(origin: string, data: unknown): void;
  parentPostMessage: ReturnType<typeof vi.fn>;
}

interface WidgetTestEnv {
  connections: RelayConnection[];
  hostOrigin: string;
  hostWindow: HostWindow;
}

const originalDescriptors = {
  document: Object.getOwnPropertyDescriptor(globalThis, 'document'),
  window: Object.getOwnPropertyDescriptor(globalThis, 'window'),
};

function restoreGlobal(
  key: 'document' | 'window',
  descriptor: PropertyDescriptor | undefined
): void {
  if (descriptor) {
    Object.defineProperty(globalThis, key, descriptor);
    return;
  }
  delete (globalThis as Record<string, unknown>)[key];
}

function parseWireData(data: unknown): unknown {
  if (typeof data !== 'string') {
    return data;
  }

  try {
    return JSON.parse(data);
  } catch {
    return data;
  }
}

function buildSearch(
  params: Partial<
    Record<'hostOrigin' | 'hostTitle' | 'hostUrl' | 'relayHost' | 'relayPort' | 'tabId', string>
  >
): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value) {
      search.set(key, value);
    }
  }
  const serialized = search.toString();
  return serialized.length > 0 ? `?${serialized}` : '';
}

function createHostWindow(): HostWindow {
  const listeners = new Set<(event: HostEvent) => void>();
  const parentPostMessage = vi.fn();

  return {
    addEventListener(type: 'message', listener: (event: HostEvent) => void): void {
      if (type === 'message') {
        listeners.add(listener);
      }
    },
    dispatchMessage(origin: string, data: unknown): void {
      for (const listener of listeners) {
        listener({ origin, data });
      }
    },
    parentPostMessage,
  };
}

function getPostedMessages(
  env: WidgetTestEnv,
  type: string
): Array<{ payload: Record<string, unknown>; targetOrigin: string }> {
  return env.hostWindow.parentPostMessage.mock.calls
    .map(([payload, targetOrigin]) => ({
      payload: payload as Record<string, unknown>,
      targetOrigin,
    }))
    .filter(({ payload }) => payload?.type === type);
}

async function waitForPostedMessage(
  env: WidgetTestEnv,
  type: string,
  index = 0
): Promise<{ payload: Record<string, unknown>; targetOrigin: string }> {
  await vi.waitFor(() => {
    expect(getPostedMessages(env, type).length).toBeGreaterThan(index);
  });

  const message = getPostedMessages(env, type)[index];
  if (!message) {
    throw new Error(`Expected posted message ${type} at index ${String(index)}`);
  }
  return message;
}

async function waitForConnection(env: WidgetTestEnv, index = 0): Promise<RelayConnection> {
  await vi.waitFor(() => {
    expect(env.connections.length).toBeGreaterThan(index);
  });

  const connection = env.connections[index];
  if (!connection) {
    throw new Error(`Expected relay connection at index ${String(index)}`);
  }
  return connection;
}

async function completeHandshake(
  env: WidgetTestEnv,
  tools: unknown[] = []
): Promise<RelayConnection> {
  const connection = await waitForConnection(env);
  const request = await waitForPostedMessage(env, 'webmcp.tools.list.request');

  env.hostWindow.dispatchMessage(env.hostOrigin, {
    requestId: request.payload.requestId,
    tools,
    type: 'webmcp.tools.list.response',
  });

  await vi.waitFor(() => {
    expect(connection.messages).toHaveLength(2);
  });

  return connection;
}

function installEnvironment(options?: { referrer?: string; search?: string }): WidgetTestEnv {
  const connections: RelayConnection[] = [];
  const defaultRelayPort = String(nextRelayPort++);
  const search =
    options?.search ??
    buildSearch({
      hostOrigin: APP_ORIGIN,
      relayHost: '127.0.0.1',
      relayPort: defaultRelayPort,
      tabId: 'tab-1',
    });
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  const hostOrigin = params.get('hostOrigin') || APP_ORIGIN;
  const relayPort = params.get('relayPort') || defaultRelayPort;
  const hostWindow = createHostWindow();
  const relayLink = ws.link(`ws://127.0.0.1:${relayPort}`);

  relayServer.use(
    relayLink.addEventListener('connection', ({ client }) => {
      const connection: RelayConnection = { client: client as RelayClient, messages: [] };
      client.addEventListener('message', (event) => {
        connection.messages.push(parseWireData(event.data));
      });
      connections.push(connection);
    })
  );

  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: {
      referrer: options?.referrer ?? '',
    },
    writable: true,
  });

  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      addEventListener: hostWindow.addEventListener,
      location: { search },
      parent: {
        postMessage: hostWindow.parentPostMessage,
      },
    },
    writable: true,
  });

  return { connections, hostOrigin, hostWindow };
}

function startRuntime(options?: { referrer?: string; search?: string }): WidgetTestEnv {
  const env = installEnvironment(options);
  startWidgetRuntime();
  return env;
}

describe('parseConfig', () => {
  it('returns null without hostOrigin', () => {
    expect(parseConfig('')).toBeNull();
  });

  it('fills in default widget values', () => {
    const config = parseConfig(`?hostOrigin=${encodeURIComponent(APP_ORIGIN)}`);

    expect(config).toMatchObject({
      hostOrigin: APP_ORIGIN,
      hostTitle: '',
      hostUrl: APP_ORIGIN,
      wsUrl: 'ws://127.0.0.1:9333',
    });
    expect(config?.tabId).toEqual(expect.any(String));
  });

  it('preserves explicit host settings', () => {
    const config = parseConfig(
      buildSearch({
        hostOrigin: APP_ORIGIN,
        hostTitle: 'Widget Host',
        hostUrl: `${APP_ORIGIN}/tools`,
        relayHost: 'localhost',
        relayPort: '9444',
        tabId: 'tab-9',
      })
    );

    expect(config).toEqual({
      hostOrigin: APP_ORIGIN,
      hostTitle: 'Widget Host',
      hostUrl: `${APP_ORIGIN}/tools`,
      tabId: 'tab-9',
      wsUrl: 'ws://localhost:9444',
    });
  });
});

describe('parseHostMessage', () => {
  it('rejects invalid host messages', () => {
    expect(parseHostMessage(null)).toBeNull();
    expect(parseHostMessage(42)).toBeNull();
    expect(parseHostMessage({ requestId: 'req-1' })).toBeNull();
    expect(parseHostMessage({ requestId: 1, type: 'x' })).toBeNull();
  });

  it('returns valid host messages with optional payloads', () => {
    expect(
      parseHostMessage({
        error: 'boom',
        requestId: 'req-1',
        result: { ok: true },
        tools: [{ name: 'sum' }],
        type: 'webmcp.tools.invoke.response',
      })
    ).toEqual({
      error: 'boom',
      requestId: 'req-1',
      result: { ok: true },
      tools: [{ name: 'sum' }],
      type: 'webmcp.tools.invoke.response',
    });
  });
});

describe('widget runtime', () => {
  beforeAll(() => {
    relayServer.listen();
  });

  afterAll(() => {
    relayServer.close();
  });

  beforeEach(() => {
    vi.useRealTimers();
  });

  afterEach(() => {
    relayServer.resetHandlers();
    vi.restoreAllMocks();
    restoreGlobal('document', originalDescriptors.document);
    restoreGlobal('window', originalDescriptors.window);
  });

  it('warns and does not start when hostOrigin is missing', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const env = startRuntime({ search: '' });

    expect(warn).toHaveBeenCalledWith(
      '[webmcp-relay-widget] Missing required hostOrigin parameter. Widget will not start.'
    );
    expect(env.connections).toHaveLength(0);
    expect(env.hostWindow.parentPostMessage).not.toHaveBeenCalled();
  });

  it('rejects non-loopback relay hosts during startup', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const env = startRuntime({
      search: buildSearch({
        hostOrigin: APP_ORIGIN,
        relayHost: 'example.com',
      }),
    });

    expect(error).toHaveBeenCalledWith(
      '[webmcp-relay-widget] relayHost must be a loopback address, got:',
      'example.com'
    );
    expect(warn).toHaveBeenCalledWith(
      '[webmcp-relay-widget] Missing required hostOrigin parameter. Widget will not start.'
    );
    expect(env.connections).toHaveLength(0);
  });

  it('handshakes with the host and forwards tool changes after hello', async () => {
    const env = startRuntime({ referrer: 'https://referrer.example/page' });

    const request = await waitForPostedMessage(env, 'webmcp.tools.list.request');
    expect(request.targetOrigin).toBe(APP_ORIGIN);

    env.hostWindow.dispatchMessage(APP_ORIGIN, 42);
    env.hostWindow.dispatchMessage('https://evil.example.com', {
      tools: [{ name: 'wrong-origin' }],
      type: 'webmcp.tools.changed',
    });
    env.hostWindow.dispatchMessage(APP_ORIGIN, {
      tools: [{ name: 'pre-hello' }],
      type: 'webmcp.tools.changed',
    });

    const connection = await waitForConnection(env);
    await Promise.resolve();
    expect(connection.messages).toEqual([]);

    env.hostWindow.dispatchMessage(APP_ORIGIN, {
      requestId: request.payload.requestId,
      tools: [{ name: 'sum', description: 'Adds numbers' }],
      type: 'webmcp.tools.list.response',
    });

    await vi.waitFor(() => {
      expect(connection.messages).toHaveLength(2);
    });

    expect(connection.messages[0]).toMatchObject({
      origin: APP_ORIGIN,
      title: 'https://referrer.example/page',
      type: 'hello',
      url: APP_ORIGIN,
    });
    expect(connection.messages[1]).toEqual({
      tools: [{ description: 'Adds numbers', name: 'sum' }],
      type: 'tools/list',
    });

    env.hostWindow.dispatchMessage(APP_ORIGIN, {
      tools: 'not-an-array',
      type: 'webmcp.tools.changed',
    });

    await vi.waitFor(() => {
      expect(connection.messages).toHaveLength(3);
    });

    expect(connection.messages[2]).toEqual({
      tools: [],
      type: 'tools/changed',
    });
  });

  it('falls back to Unknown page when no title or referrer is available', async () => {
    const env = startRuntime();
    const connection = await completeHandshake(env);

    expect(connection.messages[0]).toMatchObject({
      title: 'Unknown page',
      type: 'hello',
    });
  });

  it('handles relay ping, reload, parse failures, and sanitized debug logging', async () => {
    const debug = vi.spyOn(console, 'debug').mockImplementation(() => {});
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const env = startRuntime();
    const connection = await waitForConnection(env);

    connection.client.send('{');
    await vi.waitFor(() => {
      expect(warn).toHaveBeenCalledWith(
        '[webmcp-relay-widget] Failed to parse relay message:',
        expect.any(SyntaxError)
      );
    });

    connection.client.send(JSON.stringify(42));
    await vi.waitFor(() => {
      expect(debug).toHaveBeenCalledWith(
        '[webmcp-relay-widget] Ignoring non-object or untyped relay message'
      );
    });

    connection.client.send(JSON.stringify({ type: 'ping' }));
    await vi.waitFor(() => {
      expect(connection.messages).toContainEqual({ type: 'pong' });
    });

    connection.client.send(JSON.stringify({ type: 'reload' }));
    await vi.waitFor(() => {
      expect(getPostedMessages(env, 'webmcp.reload')).toHaveLength(1);
    });

    connection.client.send(JSON.stringify({ type: 'invoke\r\nforged-log-line' }));
    await vi.waitFor(() => {
      expect(debug).toHaveBeenCalledWith(
        '[webmcp-relay-widget] Ignoring unrecognized message type:',
        'invokeforged-log-line'
      );
    });
  });

  it('invokes host tools and forwards successful results back to the relay', async () => {
    const env = startRuntime({
      search: buildSearch({
        hostOrigin: APP_ORIGIN,
        hostTitle: 'Widget Host',
        hostUrl: `${APP_ORIGIN}/tools`,
        relayHost: '127.0.0.1',
        relayPort: '9333',
        tabId: 'tab-9',
      }),
    });

    const connection = await completeHandshake(env);

    expect(connection.messages[0]).toMatchObject({
      origin: APP_ORIGIN,
      tabId: 'tab-9',
      title: 'Widget Host',
      type: 'hello',
      url: `${APP_ORIGIN}/tools`,
    });

    connection.client.send(
      JSON.stringify({
        args: { a: 1, b: 2 },
        callId: 'call-1',
        toolName: 'sum',
        type: 'invoke',
      })
    );

    const invokeRequest = await waitForPostedMessage(env, 'webmcp.tools.invoke.request');
    expect(invokeRequest.targetOrigin).toBe(APP_ORIGIN);
    expect(invokeRequest.payload).toMatchObject({
      args: { a: 1, b: 2 },
      toolName: 'sum',
      type: 'webmcp.tools.invoke.request',
    });

    env.hostWindow.dispatchMessage(APP_ORIGIN, {
      requestId: invokeRequest.payload.requestId,
      result: {
        content: [{ text: 'sum:3', type: 'text' }],
      },
      type: 'webmcp.tools.invoke.response',
    });

    await vi.waitFor(() => {
      expect(connection.messages).toContainEqual({
        callId: 'call-1',
        result: {
          content: [{ text: 'sum:3', type: 'text' }],
        },
        type: 'result',
      });
    });
  });

  it('normalizes invoke errors and non-object args into relay error results', async () => {
    const env = startRuntime();
    const connection = await completeHandshake(env);

    connection.client.send(
      JSON.stringify({
        args: ['not-an-object'],
        callId: 'call-2',
        toolName: 'sum',
        type: 'invoke',
      })
    );

    const invokeRequest = await waitForPostedMessage(env, 'webmcp.tools.invoke.request');
    expect(invokeRequest.payload.args).toEqual({});

    env.hostWindow.dispatchMessage(APP_ORIGIN, {
      requestId: invokeRequest.payload.requestId,
      type: 'webmcp.tools.invoke.error',
    });

    await vi.waitFor(() => {
      expect(connection.messages).toContainEqual({
        callId: 'call-2',
        result: {
          content: [{ text: 'Unknown host error', type: 'text' }],
          isError: true,
        },
        type: 'result',
      });
    });
  });

  it('reconnects after handshake failures and closed pending invocations', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const env = startRuntime();

    const firstListRequest = await waitForPostedMessage(env, 'webmcp.tools.list.request');
    env.hostWindow.dispatchMessage(APP_ORIGIN, {
      error: 'list failed',
      requestId: firstListRequest.payload.requestId,
      type: 'webmcp.tools.list.error',
    });

    await vi.waitFor(
      () => {
        expect(warn).toHaveBeenCalledWith(
          '[webmcp-relay-widget] Hello handshake failed:',
          expect.any(Error)
        );
      },
      { timeout: 1500 }
    );

    const secondConnection = await waitForConnection(env, 1);
    const secondListRequest = await waitForPostedMessage(env, 'webmcp.tools.list.request', 1);

    env.hostWindow.dispatchMessage(APP_ORIGIN, {
      requestId: secondListRequest.payload.requestId,
      tools: [],
      type: 'webmcp.tools.list.response',
    });

    await vi.waitFor(() => {
      expect(secondConnection.messages).toHaveLength(2);
    });

    secondConnection.client.send(
      JSON.stringify({
        args: {},
        callId: 'call-pending',
        toolName: 'slow',
        type: 'invoke',
      })
    );

    await waitForPostedMessage(env, 'webmcp.tools.invoke.request');
    secondConnection.client.close();

    await waitForConnection(env, 2);
    await waitForPostedMessage(env, 'webmcp.tools.list.request', 2);
  });

  it('starts without emitting websocket warnings during a healthy connection', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const env = startRuntime();

    await waitForConnection(env);

    expect(warn).toHaveBeenCalledTimes(0);
  });
});
