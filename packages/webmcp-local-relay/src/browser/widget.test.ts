import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ModelContext, RegisteredTool } from '@mcp-b/webmcp-types';
import { parseConfig, startWidgetRuntime } from './widgetRuntime.js';

const APP_ORIGIN = 'https://app.example.com';
let nextRelayPort = 9333;

interface RelayClient {
  close(code?: number, reason?: string): void;
  send(data: string): void;
}

interface RelayConnection {
  client: RelayClient;
  messages: unknown[];
}

interface HostWindow {
  parentPostMessage: ReturnType<typeof vi.fn>;
}

interface WidgetTestEnv {
  connections: RelayConnection[];
  hostOrigin: string;
  hostWindow: HostWindow;
  modelContext: TestModelContext;
}

interface RelayOptions {
  referrer?: string;
  search?: string;
  serverPort?: string;
  sendHelloAccepted?: boolean;
  sendHelloRejected?: { message: string; reason: string } | false;
  tools?: TestTool[];
}

interface TestTool {
  name: string;
  title?: string;
  description: string;
  inputSchema?: object;
  execute?: (input: Record<string, unknown>, signal?: AbortSignal) => unknown;
}

interface TestModelContext extends EventTarget {
  getTools(): Promise<RegisteredTool[]>;
  executeTool: NonNullable<ModelContext['executeTool']>;
  setTools(tools: TestTool[]): void;
}

const activeRelaySockets = new Set<MockWebSocket>();
let connectRelaySocket: ((socket: MockWebSocket) => void) | undefined;

class MockWebSocket extends EventTarget {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSED = 3;

  readonly url: string;
  readyState = MockWebSocket.CONNECTING;

  private onSend?: (data: string) => void;

  constructor(url: string | URL) {
    super();
    this.url = String(url);
    activeRelaySockets.add(this);
    const connect = connectRelaySocket;
    queueMicrotask(() => connect?.(this));
  }

  close(): void {
    if (this.readyState === MockWebSocket.CLOSED) return;
    this.readyState = MockWebSocket.CLOSED;
    activeRelaySockets.delete(this);
    this.dispatchEvent(new Event('close'));
  }

  send(data: string): void {
    if (this.readyState !== MockWebSocket.OPEN) throw new Error('WebSocket is not open');
    this.onSend?.(String(data));
  }

  open(onSend: (data: string) => void): void {
    if (this.readyState !== MockWebSocket.CONNECTING) return;
    this.readyState = MockWebSocket.OPEN;
    this.onSend = onSend;
  }

  receive(data: string): void {
    if (this.readyState === MockWebSocket.OPEN) {
      this.dispatchEvent(new MessageEvent('message', { data }));
    }
  }

  fail(): void {
    this.dispatchEvent(new Event('error'));
    this.close();
  }

  dispose(): void {
    this.readyState = MockWebSocket.CLOSED;
    activeRelaySockets.delete(this);
  }
}

const originalDescriptors = {
  document: Object.getOwnPropertyDescriptor(globalThis, 'document'),
  sessionStorage: Object.getOwnPropertyDescriptor(globalThis, 'sessionStorage'),
  WebSocket: Object.getOwnPropertyDescriptor(globalThis, 'WebSocket'),
  window: Object.getOwnPropertyDescriptor(globalThis, 'window'),
};

function restoreGlobal(
  key: 'document' | 'sessionStorage' | 'WebSocket' | 'window',
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
    Record<
      | 'autoConnect'
      | 'hostOrigin'
      | 'hostTitle'
      | 'hostUrl'
      | 'relayHost'
      | 'relayId'
      | 'relayPort'
      | 'relayWorkspace'
      | 'requestTimeout'
      | 'tabId',
      string
    >
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
  const parentPostMessage = vi.fn();
  return { parentPostMessage };
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

async function completeHandshake(env: WidgetTestEnv): Promise<RelayConnection> {
  const connection = await waitForConnection(env);
  await vi.waitFor(() => {
    expect(connection.messages).toHaveLength(2);
  });

  return connection;
}

function installEnvironment(options?: RelayOptions): WidgetTestEnv {
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
  const serverPort = options?.serverPort ?? relayPort;
  const hostWindow = createHostWindow();
  const modelContext = new EventTarget() as TestModelContext;
  let tools = options?.tools ?? [];
  modelContext.getTools = async () =>
    tools.map(
      (tool) =>
        ({
          ...tool,
          origin: hostOrigin,
          window: globalThis.window,
        }) as RegisteredTool
    );
  modelContext.executeTool = vi.fn(async (registered, input, options) => {
    const tool = tools.find((candidate) => candidate.name === registered.name);
    if (!tool) throw new Error(`Tool not found: ${registered.name}`);
    const result = (await tool.execute?.(input as Record<string, unknown>, options?.signal)) ?? {
      content: [{ type: 'text', text: `executed ${tool.name}` }],
    };
    return typeof result === 'string' ? result : JSON.stringify(result);
  });
  modelContext.setTools = (nextTools) => {
    tools = nextTools;
    modelContext.dispatchEvent(new Event('toolchange'));
  };

  connectRelaySocket = (socket) => {
    if (new URL(socket.url).port !== serverPort) {
      socket.close();
      return;
    }

    const connection: RelayConnection = {
      client: {
        close: () => socket.close(),
        send: (data) => socket.receive(data),
      },
      messages: [],
    };
    socket.open((data) => {
      const payload = parseWireData(data);
      connection.messages.push(payload);
      if (!payload || typeof payload !== 'object') {
        return;
      }

      const message = payload as { type?: unknown };
      if (message.type !== 'hello') {
        return;
      }

      if (options?.sendHelloRejected) {
        socket.receive(
          JSON.stringify({
            type: 'hello/rejected',
            message: options.sendHelloRejected.message,
            reason: options.sendHelloRejected.reason,
          })
        );
        return;
      }

      if (options?.sendHelloAccepted !== false) {
        socket.receive(JSON.stringify({ type: 'hello/accepted' }));
      }
    });
    connections.push(connection);
    socket.receive(
      JSON.stringify({
        type: 'server-hello',
        service: 'webmcp-local-relay',
        version: 1,
        host: '127.0.0.1',
        instanceId: `relay-${serverPort}`,
        port: Number(serverPort),
        relayId: `relay-${serverPort}`,
      })
    );
  };
  Object.defineProperty(globalThis, 'WebSocket', {
    configurable: true,
    value: MockWebSocket,
    writable: true,
  });

  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: {
      referrer: options?.referrer ?? '',
      visibilityState: 'visible',
      addEventListener: vi.fn(),
      modelContext,
    },
    writable: true,
  });

  const sessionStorageState = new Map<string, string>();
  Object.defineProperty(globalThis, 'sessionStorage', {
    configurable: true,
    value: {
      clear(): void {
        sessionStorageState.clear();
      },
      getItem(key: string): string | null {
        return sessionStorageState.get(key) ?? null;
      },
      removeItem(key: string): void {
        sessionStorageState.delete(key);
      },
      setItem(key: string, value: string): void {
        sessionStorageState.set(key, value);
      },
    },
    writable: true,
  });

  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      addEventListener: vi.fn(),
      location: { search },
      parent: {
        postMessage: hostWindow.parentPostMessage,
      },
    },
    writable: true,
  });

  return { connections, hostOrigin, hostWindow, modelContext };
}

function startRuntime(options?: RelayOptions): WidgetTestEnv {
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
      autoConnect: true,
      hostOrigin: APP_ORIGIN,
      hostTitle: '',
      hostUrl: APP_ORIGIN,
      relayHostHint: '127.0.0.1',
      relayPortHint: 9333,
      requestTimeoutMs: 60000,
    });
    expect(config?.tabId).toEqual(expect.any(String));
  });

  it('parses an explicit requestTimeout from URL params', () => {
    const config = parseConfig(
      buildSearch({
        hostOrigin: APP_ORIGIN,
        requestTimeout: '120000',
      })
    );

    expect(config).toMatchObject({ requestTimeoutMs: 120000 });
  });

  it('reads requestTimeout from __WEBMCP_RELAY_CONFIG global', () => {
    const g = globalThis as typeof globalThis & {
      __WEBMCP_RELAY_CONFIG?: Record<string, string>;
    };
    g.__WEBMCP_RELAY_CONFIG = {
      hostOrigin: APP_ORIGIN,
      requestTimeout: '90000',
    };

    try {
      expect(parseConfig('')).toMatchObject({ requestTimeoutMs: 90000 });
    } finally {
      delete g.__WEBMCP_RELAY_CONFIG;
    }
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

    expect(config).toMatchObject({
      autoConnect: true,
      hostOrigin: APP_ORIGIN,
      hostTitle: 'Widget Host',
      hostUrl: `${APP_ORIGIN}/tools`,
      relayHostHint: 'localhost',
      relayPortHint: 9444,
      tabId: 'tab-9',
    });
  });

  it('reads config from __WEBMCP_RELAY_CONFIG global when URL params are empty', () => {
    const g = globalThis as typeof globalThis & {
      __WEBMCP_RELAY_CONFIG?: Record<string, string>;
    };
    g.__WEBMCP_RELAY_CONFIG = {
      hostOrigin: APP_ORIGIN,
      hostTitle: 'Blob Widget',
      hostUrl: `${APP_ORIGIN}/blob`,
      relayHost: '127.0.0.1',
      relayPort: '9333',
      tabId: 'blob-tab-1',
      autoConnect: 'true',
    };

    try {
      const config = parseConfig('');

      expect(config).toMatchObject({
        autoConnect: true,
        hostOrigin: APP_ORIGIN,
        hostTitle: 'Blob Widget',
        hostUrl: `${APP_ORIGIN}/blob`,
        relayHostHint: '127.0.0.1',
        relayPortHint: 9333,
        tabId: 'blob-tab-1',
      });
    } finally {
      delete g.__WEBMCP_RELAY_CONFIG;
    }
  });

  it('prefers URL params over __WEBMCP_RELAY_CONFIG global', () => {
    const g = globalThis as typeof globalThis & {
      __WEBMCP_RELAY_CONFIG?: Record<string, string>;
    };
    g.__WEBMCP_RELAY_CONFIG = {
      hostOrigin: 'https://global.example.com',
      hostTitle: 'From Global',
      relayHost: '127.0.0.1',
      relayPort: '9444',
      tabId: 'global-tab',
    };

    try {
      const config = parseConfig(
        buildSearch({
          hostOrigin: APP_ORIGIN,
          hostTitle: 'From URL',
          relayHost: '127.0.0.1',
          relayPort: '9333',
          tabId: 'url-tab',
        })
      );

      expect(config).toMatchObject({
        hostOrigin: APP_ORIGIN,
        hostTitle: 'From URL',
        relayPortHint: 9333,
        tabId: 'url-tab',
      });
    } finally {
      delete g.__WEBMCP_RELAY_CONFIG;
    }
  });
});

describe('widget runtime', () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  afterEach(() => {
    for (const socket of activeRelaySockets) socket.dispose();
    connectRelaySocket = undefined;
    vi.restoreAllMocks();
    restoreGlobal('document', originalDescriptors.document);
    restoreGlobal('sessionStorage', originalDescriptors.sessionStorage);
    restoreGlobal('WebSocket', originalDescriptors.WebSocket);
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

  it.each([['abc'], ['0'], ['-1']])(
    'rejects non-positive-integer requestTimeout %s during startup',
    (invalid) => {
      const error = vi.spyOn(console, 'error').mockImplementation(() => {});
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const env = startRuntime({
        search: buildSearch({
          hostOrigin: APP_ORIGIN,
          requestTimeout: invalid,
        }),
      });

      expect(error).toHaveBeenCalledWith(
        '[webmcp-relay-widget] requestTimeout must be a positive integer (ms), got:',
        invalid
      );
      expect(warn).toHaveBeenCalledWith(
        '[webmcp-relay-widget] Missing required hostOrigin parameter. Widget will not start.'
      );
      expect(env.connections).toHaveLength(0);
    }
  );

  it('discovers the next relay port when the hinted port is not a relay', async () => {
    const env = startRuntime({
      search: buildSearch({
        hostOrigin: APP_ORIGIN,
        relayHost: '127.0.0.1',
        relayPort: '9333',
        tabId: 'tab-1',
      }),
      serverPort: '9334',
    });

    const connection = await completeHandshake(env);

    expect(env.connections).toHaveLength(1);
    expect(connection.messages[0]).toMatchObject({
      origin: APP_ORIGIN,
      type: 'hello',
    });
  });

  it('publishes tools and tool changes from the WebMCP frame context', async () => {
    const env = startRuntime({
      referrer: 'https://referrer.example/page',
      tools: [{ name: 'before', description: 'Initial tool' }],
    });
    const connection = await completeHandshake(env);

    expect(connection.messages[0]).toMatchObject({
      origin: APP_ORIGIN,
      title: 'https://referrer.example/page',
      type: 'hello',
      url: APP_ORIGIN,
    });
    expect(connection.messages[1]).toEqual({
      tools: [{ name: 'before', description: 'Initial tool' }],
      type: 'tools/list',
    });

    env.modelContext.setTools([{ name: 'after', description: 'Updated tool' }]);
    await vi.waitFor(() => {
      expect(connection.messages[2]).toEqual({
        tools: [{ name: 'after', description: 'Updated tool' }],
        type: 'tools/changed',
      });
    });
  });

  it('uses the latest tool snapshot when tools change before hello is accepted', async () => {
    const env = startRuntime({
      sendHelloAccepted: false,
      tools: [{ name: 'old', description: 'Old snapshot' }],
    });
    const connection = await waitForConnection(env);

    await vi.waitFor(() => expect(connection.messages).toHaveLength(1));
    env.modelContext.setTools([
      { name: 'echo', description: 'Latest snapshot' },
      { name: 'sum', description: 'Add numbers' },
    ]);
    connection.client.send(JSON.stringify({ type: 'hello/accepted' }));

    await vi.waitFor(() => expect(connection.messages).toHaveLength(2));
    expect(connection.messages[1]).toEqual({
      tools: [
        { name: 'echo', description: 'Latest snapshot' },
        { name: 'sum', description: 'Add numbers' },
      ],
      type: 'tools/list',
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

  it('executes frame tools directly and forwards their result to the relay', async () => {
    const env = startRuntime({
      search: buildSearch({
        hostOrigin: APP_ORIGIN,
        hostTitle: 'Widget Host',
        hostUrl: `${APP_ORIGIN}/tools`,
        relayHost: '127.0.0.1',
        relayPort: '9333',
        tabId: 'tab-9',
      }),
      tools: [
        {
          name: 'sum',
          title: 'Add numbers',
          description: 'Adds numbers',
          execute: ({ a, b }) => ({
            content: [{ type: 'text', text: `sum:${String(Number(a) + Number(b))}` }],
          }),
        },
      ],
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

    await vi.waitFor(() => {
      expect(connection.messages).toContainEqual({
        callId: 'call-1',
        result: { content: [{ type: 'text', text: 'sum:3' }] },
        type: 'result',
      });
    });
    expect(env.modelContext.executeTool).toHaveBeenCalled();
  });

  it('normalizes invalid arguments and execution errors into relay results', async () => {
    const env = startRuntime({
      tools: [
        {
          name: 'echo',
          description: 'Echo input',
          execute: (input) => ({
            content: [{ type: 'text', text: JSON.stringify(input) }],
          }),
        },
        {
          name: 'fail',
          description: 'Fail',
          execute: () => {
            throw new Error('tool failed');
          },
        },
      ],
    });
    const connection = await completeHandshake(env);

    connection.client.send(
      JSON.stringify({
        args: ['not-an-object'],
        callId: 'call-invalid-args',
        toolName: 'echo',
        type: 'invoke',
      })
    );
    connection.client.send(
      JSON.stringify({
        args: {},
        callId: 'call-fail',
        toolName: 'fail',
        type: 'invoke',
      })
    );

    await vi.waitFor(() => {
      expect(connection.messages).toContainEqual({
        callId: 'call-invalid-args',
        result: { content: [{ type: 'text', text: '{}' }] },
        type: 'result',
      });
      expect(connection.messages).toContainEqual({
        callId: 'call-fail',
        result: { content: [{ type: 'text', text: 'tool failed' }], isError: true },
        type: 'result',
      });
    });
  });

  it('aborts tool execution when the configured timeout expires', async () => {
    let executionSignal: AbortSignal | undefined;
    const env = startRuntime({
      search: buildSearch({
        hostOrigin: APP_ORIGIN,
        requestTimeout: '20',
      }),
      tools: [
        {
          name: 'slow',
          description: 'Wait until aborted',
          execute: (_input, signal) => {
            executionSignal = signal;
            return new Promise((resolve) => {
              signal?.addEventListener('abort', () => resolve({ content: [] }), { once: true });
            });
          },
        },
      ],
    });
    const connection = await completeHandshake(env);

    connection.client.send(
      JSON.stringify({ args: {}, callId: 'call-timeout', toolName: 'slow', type: 'invoke' })
    );

    await vi.waitFor(() => {
      expect(connection.messages).toContainEqual({
        callId: 'call-timeout',
        result: {
          content: [{ type: 'text', text: 'Tool execution timed out' }],
          isError: true,
        },
        type: 'result',
      });
    });
    expect(executionSignal?.aborted).toBe(true);
  });

  it('reconnects to the relay after the socket closes', async () => {
    const env = startRuntime();
    const first = await completeHandshake(env);

    first.client.close();
    const second = await waitForConnection(env, 1);
    await vi.waitFor(() => expect(second.messages).toHaveLength(2));
    expect(second.messages[0]).toMatchObject({ type: 'hello' });
  });

  it('surfaces structured hello rejection before the socket closes', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const env = startRuntime({
      sendHelloRejected: {
        message: 'Host page origin is not allowed by this relay.',
        reason: 'host-origin-not-allowed',
      },
    });

    const connection = await waitForConnection(env);
    await vi.waitFor(() => {
      expect(error).toHaveBeenCalledWith(
        '[webmcp-relay-widget] Relay rejected browser hello:',
        'host-origin-not-allowed',
        'Host page origin is not allowed by this relay.'
      );
    });

    expect(connection.messages[0]).toMatchObject({
      origin: APP_ORIGIN,
      type: 'hello',
    });
    expect(env.hostWindow.parentPostMessage).not.toHaveBeenCalled();
  });

  it('does not publish tools until the relay acknowledges hello', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const env = startRuntime({
      sendHelloAccepted: false,
      tools: [{ name: 'sum', description: 'Adds numbers' }],
    });
    const connection = await waitForConnection(env);

    await vi.waitFor(() => expect(connection.messages).toHaveLength(1));
    await vi.waitFor(
      () => {
        expect(warn).toHaveBeenCalledWith(
          '[webmcp-relay-widget] Relay did not acknowledge browser hello'
        );
      },
      { timeout: 1500 }
    );

    expect(connection.messages).toHaveLength(1);
    expect(connection.messages[0]).toMatchObject({
      origin: APP_ORIGIN,
      type: 'hello',
    });
  });

  it('starts without emitting websocket warnings during a healthy connection', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const env = startRuntime();

    await completeHandshake(env);

    expect(warn).toHaveBeenCalledTimes(0);
  });
});

describe('dormant reconnection', () => {
  type Listener = (event: unknown) => void;

  let savedWebSocket: typeof WebSocket;
  let wsUrls: string[];

  interface DormantEnv {
    docListeners: Map<string, Set<Listener>>;
    winListeners: Map<string, Set<Listener>>;
    setVisibility: (v: DocumentVisibilityState) => void;
    fireDocEvent: (type: string) => void;
    fireWinEvent: (type: string) => void;
  }

  function setupDormantEnv(port = 9333): DormantEnv {
    wsUrls = [];
    const docListeners = new Map<string, Set<Listener>>();
    const winListeners = new Map<string, Set<Listener>>();
    let vis: DocumentVisibilityState = 'visible';

    Object.defineProperty(globalThis, 'document', {
      configurable: true,
      writable: true,
      value: {
        referrer: '',
        get visibilityState() {
          return vis;
        },
        addEventListener(t: string, fn: Listener) {
          if (!docListeners.has(t)) docListeners.set(t, new Set());
          docListeners.get(t)!.add(fn);
        },
        removeEventListener(t: string, fn: Listener) {
          docListeners.get(t)?.delete(fn);
        },
      },
    });

    const store = new Map<string, string>();
    Object.defineProperty(globalThis, 'sessionStorage', {
      configurable: true,
      writable: true,
      value: {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => store.set(k, v),
        removeItem: (k: string) => store.delete(k),
        clear: () => store.clear(),
      },
    });

    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      writable: true,
      value: {
        addEventListener(t: string, fn: Listener) {
          if (!winListeners.has(t)) winListeners.set(t, new Set());
          winListeners.get(t)!.add(fn);
        },
        removeEventListener(t: string, fn: Listener) {
          winListeners.get(t)?.delete(fn);
        },
        location: {
          search: buildSearch({
            hostOrigin: APP_ORIGIN,
            relayHost: '127.0.0.1',
            relayPort: String(port),
            tabId: 'tab-dormant',
          }),
        },
        parent: { postMessage: vi.fn() },
      },
    });

    return {
      docListeners,
      winListeners,
      setVisibility(v: DocumentVisibilityState) {
        vis = v;
      },
      fireDocEvent(type: string) {
        for (const fn of docListeners.get(type) ?? []) fn(new Event(type));
      },
      fireWinEvent(type: string) {
        for (const fn of winListeners.get(type) ?? []) fn(new Event(type));
      },
    };
  }

  async function fastForwardToDormant(): Promise<void> {
    startWidgetRuntime();
    await vi.advanceTimersByTimeAsync(70000);
  }

  beforeEach(() => {
    vi.useFakeTimers();
    savedWebSocket = globalThis.WebSocket;
    connectRelaySocket = (socket) => {
      wsUrls.push(socket.url);
      socket.fail();
    };
    globalThis.WebSocket = MockWebSocket as unknown as typeof WebSocket;
  });

  afterEach(() => {
    for (const socket of activeRelaySockets) socket.dispose();
    connectRelaySocket = undefined;
    globalThis.WebSocket = savedWebSocket;
    vi.useRealTimers();
    vi.restoreAllMocks();
    restoreGlobal('document', originalDescriptors.document);
    restoreGlobal('sessionStorage', originalDescriptors.sessionStorage);
    restoreGlobal('window', originalDescriptors.window);
  });

  it('enters dormant after 3 failed rediscovery cycles and stops connections', async () => {
    setupDormantEnv();
    await fastForwardToDormant();

    wsUrls.length = 0;
    await vi.advanceTimersByTimeAsync(60000);
    expect(wsUrls).toHaveLength(0);
  });

  it('registers visibilitychange listener in dormant state', async () => {
    const env = setupDormantEnv();
    await fastForwardToDormant();

    expect(env.docListeners.get('visibilitychange')?.size).toBe(1);
  });

  it('heartbeat only probes configured port, not full range', async () => {
    setupDormantEnv(9333);
    await fastForwardToDormant();

    wsUrls.length = 0;
    await vi.advanceTimersByTimeAsync(120000);

    expect(wsUrls.length).toBeGreaterThan(0);
    expect(wsUrls.length).toBeLessThanOrEqual(2);
    expect(wsUrls[0]).toContain('9333');
  });

  it('wakes from dormant on visibilitychange and re-enters dormant on failure', async () => {
    const env = setupDormantEnv();
    await fastForwardToDormant();

    wsUrls.length = 0;
    env.setVisibility('visible');
    env.fireDocEvent('visibilitychange');
    await vi.advanceTimersByTimeAsync(500);

    expect(wsUrls.length).toBeGreaterThan(2);
    expect(env.docListeners.get('visibilitychange')?.size).toBe(1);
  });

  it('wakes from dormant on webmcp.connect message', async () => {
    const env = setupDormantEnv();
    await fastForwardToDormant();

    wsUrls.length = 0;
    for (const fn of env.winListeners.get('message') ?? []) {
      (fn as (event: { origin: string; data: unknown; source: unknown }) => void)({
        origin: APP_ORIGIN,
        data: { type: 'webmcp.connect' },
        source: (globalThis.window as Window).parent,
      });
    }
    await vi.advanceTimersByTimeAsync(500);

    expect(wsUrls.length).toBeGreaterThan(2);
  });

  it('does not duplicate listeners when re-entering dormant after wake failure', async () => {
    const env = setupDormantEnv();
    await fastForwardToDormant();

    env.setVisibility('visible');
    env.fireDocEvent('visibilitychange');
    await vi.advanceTimersByTimeAsync(500);

    env.setVisibility('hidden');
    env.setVisibility('visible');
    env.fireDocEvent('visibilitychange');
    await vi.advanceTimersByTimeAsync(500);

    expect(env.docListeners.get('visibilitychange')?.size).toBe(1);
  });
});
