import type { JSONRPCMessage } from '@mcp-b/webmcp-ts-sdk';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { UserScriptClientTransport } from './UserScriptClientTransport.js';
import { UserScriptServerTransport } from './UserScriptServerTransport.js';

const wait = (ms = 10) => new Promise((resolve) => setTimeout(resolve, ms));
const nodeDescribe = typeof window === 'undefined' ? describe : describe.skip;

class MockPort implements chrome.runtime.Port {
  name: string;
  sender?: chrome.runtime.MessageSender;
  onMessage: chrome.runtime.PortMessageEvent;
  onDisconnect: chrome.runtime.PortDisconnectEvent;
  postMessage = vi.fn((message: any) => {
    this.messages.push(message);
  });
  disconnect = vi.fn(() => {
    this.disconnected = true;
    for (const cb of this._disconnectListeners) {
      cb(this as unknown as chrome.runtime.Port);
    }
  });

  messages: any[] = [];
  disconnected = false;

  private readonly _messageListeners = new Set<(message: any, port: chrome.runtime.Port) => void>();
  private readonly _disconnectListeners = new Set<(port: chrome.runtime.Port) => void>();

  constructor(name: string) {
    this.name = name;

    this.onMessage = {
      addListener: (cb) => this._messageListeners.add(cb),
      removeListener: (cb) => this._messageListeners.delete(cb),
      hasListener: (cb) => this._messageListeners.has(cb),
      hasListeners: () => this._messageListeners.size > 0,
    } as chrome.runtime.PortMessageEvent;

    this.onDisconnect = {
      addListener: (cb) => this._disconnectListeners.add(cb),
      removeListener: (cb) => this._disconnectListeners.delete(cb),
      hasListener: (cb) => this._disconnectListeners.has(cb),
      hasListeners: () => this._disconnectListeners.size > 0,
    } as chrome.runtime.PortDisconnectEvent;
  }

  emitMessage(message: any) {
    for (const cb of this._messageListeners) {
      cb(message, this as unknown as chrome.runtime.Port);
    }
  }

  triggerDisconnect() {
    this.disconnect();
  }
}

const setupChromeRuntime = () => {
  const ports: MockPort[] = [];
  const connect = vi.fn(() => {
    const port = new MockPort(`port-${ports.length + 1}`);
    ports.push(port);
    return port as unknown as chrome.runtime.Port;
  });
  const sendMessage = vi.fn().mockResolvedValue(undefined);

  (globalThis as any).chrome = {
    runtime: {
      connect,
      sendMessage,
      lastError: undefined,
    },
  } satisfies typeof chrome;

  return { ports, connect, sendMessage };
};

const teardownChromeRuntime = () => {
  delete (globalThis as any).chrome;
};

nodeDescribe('UserScriptClientTransport', () => {
  afterEach(() => {
    teardownChromeRuntime();
    vi.useRealTimers();
  });

  it('connects and emits parsed messages', async () => {
    const { ports, connect } = setupChromeRuntime();
    const transport = new UserScriptClientTransport({ reconnectDelay: 5 });
    const onMessage = vi.fn();
    transport.onmessage = onMessage;

    await transport.start();
    expect(connect).toHaveBeenCalledTimes(1);

    const payload: JSONRPCMessage = { jsonrpc: '2.0', id: 1, result: { ok: true } };
    ports[0].emitMessage(payload);
    ports[0].emitMessage({ type: 'keep-alive' }); // ignored

    expect(onMessage).toHaveBeenCalledTimes(1);
    expect(onMessage).toHaveBeenCalledWith(payload);
  });

  it('propagates parse errors via onerror', async () => {
    const { ports } = setupChromeRuntime();
    const transport = new UserScriptClientTransport({ reconnectDelay: 5 });
    const onError = vi.fn();
    transport.onerror = onError;

    await transport.start();
    ports[0].emitMessage({ bad: 'data' });

    await wait();
    expect(onError).toHaveBeenCalled();
  });

  it('automatically reconnects after disconnects', async () => {
    vi.useFakeTimers();
    const { ports, connect } = setupChromeRuntime();
    const transport = new UserScriptClientTransport({
      reconnectDelay: 5,
      maxReconnectDelay: 10,
      maxReconnectAttempts: 3,
    });

    await transport.start();
    expect(connect).toHaveBeenCalledTimes(1);

    ports[0].triggerDisconnect();
    await vi.runOnlyPendingTimersAsync();

    expect(connect).toHaveBeenCalledTimes(2);
  });

  it('stops reconnecting once closed', async () => {
    vi.useFakeTimers();
    const { ports, connect } = setupChromeRuntime();
    const transport = new UserScriptClientTransport({ reconnectDelay: 5 });

    await transport.start();
    ports[0].triggerDisconnect();
    await transport.close();

    await vi.runOnlyPendingTimersAsync();
    expect(connect).toHaveBeenCalledTimes(1);
  });

  it('throws when sending before start or after close', async () => {
    setupChromeRuntime();
    const transport = new UserScriptClientTransport({ autoReconnect: false });

    await expect(
      transport.send({ jsonrpc: '2.0', method: 'missing-start', id: 1 })
    ).rejects.toThrow('Transport not started');

    await transport.start();
    await transport.close();

    await expect(transport.send({ jsonrpc: '2.0', method: 'after-close', id: 2 })).rejects.toThrow(
      'Transport not started'
    );
    expect((transport as any)._isClosed).toBe(true);
  });

  it('invokes onclose immediately when autoReconnect is disabled', async () => {
    const { ports, connect } = setupChromeRuntime();
    const transport = new UserScriptClientTransport({ autoReconnect: false });
    const onClose = vi.fn();
    transport.onclose = onClose;

    await transport.start();
    expect(connect).toHaveBeenCalledTimes(1);

    ports[0].triggerDisconnect();
    await wait();

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(connect).toHaveBeenCalledTimes(1);
  });
});

nodeDescribe('UserScriptServerTransport', () => {
  afterEach(() => {
    teardownChromeRuntime();
    vi.useRealTimers();
  });

  it('responds to ping and forwards JSON-RPC messages', async () => {
    const port = new MockPort('server');
    (globalThis as any).chrome = { runtime: { lastError: undefined } } as typeof chrome;

    const transport = new UserScriptServerTransport(port as unknown as chrome.runtime.Port, {
      keepAlive: false,
    });

    const onMessage = vi.fn();
    transport.onmessage = onMessage;

    await transport.start();

    port.emitMessage({ jsonrpc: '2.0', method: 'hello', id: 1 });
    port.emitMessage({ type: 'ping' });

    expect(onMessage).toHaveBeenCalledWith({ jsonrpc: '2.0', method: 'hello', id: 1 });
    expect(port.postMessage).toHaveBeenCalledWith({ type: 'pong' });
  });

  it('sends keep-alive pings on the configured interval', async () => {
    vi.useFakeTimers();
    const port = new MockPort('keepalive');
    (globalThis as any).chrome = { runtime: { lastError: undefined } } as typeof chrome;

    const transport = new UserScriptServerTransport(port as unknown as chrome.runtime.Port, {
      keepAlive: true,
      keepAliveInterval: 5,
    });

    await transport.start();
    await vi.advanceTimersByTimeAsync(20);

    const keepAliveMessages = port.postMessage.mock.calls.filter(
      ([msg]) => (msg as any).type === 'keep-alive'
    );
    expect(keepAliveMessages.length).toBeGreaterThan(0);

    await transport.close();
    await vi.advanceTimersByTimeAsync(20);

    const afterCloseMessages = port.postMessage.mock.calls.filter(
      ([msg]) => (msg as any).type === 'keep-alive'
    );
    expect(afterCloseMessages.length).toBe(keepAliveMessages.length);
  });

  it('throws when sending before start', async () => {
    const port = new MockPort('server');
    (globalThis as any).chrome = { runtime: { lastError: undefined } } as typeof chrome;

    const transport = new UserScriptServerTransport(port as unknown as chrome.runtime.Port);

    await expect(transport.send({ jsonrpc: '2.0', id: 2, result: { ok: true } })).rejects.toThrow(
      'Transport not started'
    );
  });

  it('raises a disconnect error when chrome reports a failure', async () => {
    const port = new MockPort('disconnect');
    (globalThis as any).chrome = { runtime: { lastError: { message: 'gone' } } } as typeof chrome;

    const transport = new UserScriptServerTransport(port as unknown as chrome.runtime.Port, {
      keepAlive: false,
    });
    const onClose = vi.fn();
    transport.onclose = onClose;

    port.postMessage.mockImplementation(() => {
      throw new Error('boom');
    });

    await transport.start();

    await expect(transport.send({ jsonrpc: '2.0', id: 5, result: { ok: true } })).rejects.toThrow(
      'Client disconnected'
    );
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('fires onclose when the port disconnects', async () => {
    const port = new MockPort('server');
    (globalThis as any).chrome = { runtime: { lastError: undefined } } as typeof chrome;

    const transport = new UserScriptServerTransport(port as unknown as chrome.runtime.Port, {
      keepAlive: false,
    });
    const onClose = vi.fn();
    transport.onclose = onClose;

    await transport.start();
    port.triggerDisconnect();

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
