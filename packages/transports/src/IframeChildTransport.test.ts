import type { JSONRPCMessage } from '@mcp-b/webmcp-ts-sdk';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { IframeChildTransport } from './IframeChildTransport.js';

const nodeDescribe = typeof window === 'undefined' ? describe : describe.skip;

const wait = (ms = 10) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Minimal mock of the window APIs used by IframeChildTransport.
 * We install it on globalThis so the transport code sees window.
 */
function setupWindowMock() {
  const listeners = new Map<string, Set<(event: any) => void>>();
  const parentPostMessage = vi.fn();

  const mockWindow = {
    addEventListener: vi.fn((type: string, handler: (event: any) => void) => {
      if (!listeners.has(type)) {
        listeners.set(type, new Set());
      }
      listeners.get(type)!.add(handler);
    }),
    removeEventListener: vi.fn((type: string, handler: (event: any) => void) => {
      listeners.get(type)?.delete(handler);
    }),
    parent: {
      postMessage: parentPostMessage,
    },
  };

  // Make window.parent !== window (we're in an iframe)
  Object.defineProperty(mockWindow, 'parent', {
    get: () => ({ postMessage: parentPostMessage }),
  });

  (globalThis as any).window = mockWindow;

  return {
    parentPostMessage,
    dispatchMessage(event: { origin: string; data: any }) {
      const handlers = listeners.get('message');
      if (handlers) {
        for (const handler of handlers) {
          handler({ origin: event.origin, data: event.data });
        }
      }
    },
  };
}

function teardownWindowMock() {
  delete (globalThis as any).window;
}

nodeDescribe('IframeChildTransport', () => {
  let mock: ReturnType<typeof setupWindowMock>;

  beforeEach(() => {
    mock = setupWindowMock();
  });

  afterEach(() => {
    teardownWindowMock();
  });

  it('throws if allowed origins are missing', () => {
    expect(() => {
      // @ts-expect-error testing invalid input
      new IframeChildTransport({});
    }).toThrow('At least one allowed origin must be specified');
  });

  it('throws if started twice', async () => {
    const transport = new IframeChildTransport({ allowedOrigins: ['https://parent.com'] });
    await transport.start();
    await expect(transport.start()).rejects.toThrow('Transport already started');
    await transport.close();
  });

  it('throws when sending before start', async () => {
    const transport = new IframeChildTransport({ allowedOrigins: ['https://parent.com'] });
    await expect(transport.send({ jsonrpc: '2.0', method: 'test', id: 1 })).rejects.toThrow(
      'Transport not started'
    );
  });

  it('buffers messages sent before client connects', async () => {
    const transport = new IframeChildTransport({
      allowedOrigins: ['https://parent.com'],
      channelId: 'test-channel',
    });

    await transport.start();

    // Reset calls from broadcastServerReady
    mock.parentPostMessage.mockClear();

    const msg1: JSONRPCMessage = { jsonrpc: '2.0', method: 'notifications/tools/list_changed' };
    const msg2: JSONRPCMessage = { jsonrpc: '2.0', method: 'notifications/resources/list_changed' };

    // Send messages before client has connected
    await transport.send(msg1);
    await transport.send(msg2);

    // No messages sent to parent yet (buffered)
    expect(mock.parentPostMessage).not.toHaveBeenCalled();

    // Simulate client connecting via mcp-check-ready
    mock.dispatchMessage({
      origin: 'https://parent.com',
      data: {
        channel: 'test-channel',
        type: 'mcp',
        direction: 'client-to-server',
        payload: 'mcp-check-ready',
      },
    });

    // Buffered messages should now be flushed plus the server-ready response
    // server-ready + msg1 + msg2 = 3 calls
    const payloads = mock.parentPostMessage.mock.calls.map((call) => call[0]?.payload);
    expect(payloads).toContain('mcp-server-ready');
    expect(payloads).toContainEqual(msg1);
    expect(payloads).toContainEqual(msg2);

    await transport.close();
  });

  it('sends messages directly when client is already connected', async () => {
    const transport = new IframeChildTransport({
      allowedOrigins: ['https://parent.com'],
      channelId: 'test-channel',
    });

    await transport.start();

    // Simulate client connecting
    mock.dispatchMessage({
      origin: 'https://parent.com',
      data: {
        channel: 'test-channel',
        type: 'mcp',
        direction: 'client-to-server',
        payload: 'mcp-check-ready',
      },
    });

    mock.parentPostMessage.mockClear();

    const msg: JSONRPCMessage = { jsonrpc: '2.0', method: 'test', id: 1 };
    await transport.send(msg);

    expect(mock.parentPostMessage).toHaveBeenCalledWith(
      {
        channel: 'test-channel',
        type: 'mcp',
        direction: 'server-to-client',
        payload: msg,
      },
      'https://parent.com'
    );

    await transport.close();
  });

  it('flushes buffered messages when first JSONRPC message arrives from client', async () => {
    const transport = new IframeChildTransport({
      allowedOrigins: ['https://parent.com'],
      channelId: 'test-channel',
    });

    await transport.start();
    mock.parentPostMessage.mockClear();

    const bufferedMsg: JSONRPCMessage = {
      jsonrpc: '2.0',
      method: 'notifications/tools/list_changed',
    };
    await transport.send(bufferedMsg);

    expect(mock.parentPostMessage).not.toHaveBeenCalled();

    // Simulate client sending a JSONRPC message (not mcp-check-ready)
    mock.dispatchMessage({
      origin: 'https://parent.com',
      data: {
        channel: 'test-channel',
        type: 'mcp',
        direction: 'client-to-server',
        payload: { jsonrpc: '2.0', method: 'initialize', id: 1 },
      },
    });

    const payloads = mock.parentPostMessage.mock.calls.map((call) => call[0]?.payload);
    expect(payloads).toContainEqual(bufferedMsg);

    await transport.close();
  });

  it('clears pending messages on close', async () => {
    const transport = new IframeChildTransport({
      allowedOrigins: ['https://parent.com'],
      channelId: 'test-channel',
    });

    await transport.start();

    await transport.send({ jsonrpc: '2.0', method: 'notifications/tools/list_changed' });
    await transport.send({ jsonrpc: '2.0', method: 'notifications/resources/list_changed' });

    expect((transport as any)._pendingMessages).toHaveLength(2);

    await transport.close();

    expect((transport as any)._pendingMessages).toHaveLength(0);
  });

  it('does not flush more than once for subsequent messages after connection', async () => {
    const transport = new IframeChildTransport({
      allowedOrigins: ['https://parent.com'],
      channelId: 'test-channel',
    });

    await transport.start();
    mock.parentPostMessage.mockClear();

    const bufferedMsg: JSONRPCMessage = {
      jsonrpc: '2.0',
      method: 'notifications/tools/list_changed',
    };
    await transport.send(bufferedMsg);

    // First client message - triggers flush
    mock.dispatchMessage({
      origin: 'https://parent.com',
      data: {
        channel: 'test-channel',
        type: 'mcp',
        direction: 'client-to-server',
        payload: 'mcp-check-ready',
      },
    });

    const callCountAfterFlush = mock.parentPostMessage.mock.calls.length;

    // Second client message - should NOT trigger another flush
    mock.dispatchMessage({
      origin: 'https://parent.com',
      data: {
        channel: 'test-channel',
        type: 'mcp',
        direction: 'client-to-server',
        payload: { jsonrpc: '2.0', method: 'tools/list', id: 2 },
      },
    });

    // Only the new message processing, no additional flush
    expect(mock.parentPostMessage.mock.calls.length).toBe(callCountAfterFlush);

    await transport.close();
  });

  it('ignores messages from disallowed origins', async () => {
    const transport = new IframeChildTransport({
      allowedOrigins: ['https://parent.com'],
      channelId: 'test-channel',
    });
    const onMessage = vi.fn();
    transport.onmessage = onMessage;

    await transport.start();

    mock.dispatchMessage({
      origin: 'https://attacker.com',
      data: {
        channel: 'test-channel',
        type: 'mcp',
        direction: 'client-to-server',
        payload: { jsonrpc: '2.0', method: 'attack', id: 1 },
      },
    });

    await wait();
    expect(onMessage).not.toHaveBeenCalled();
    await transport.close();
  });

  it('invokes onclose when closed', async () => {
    const transport = new IframeChildTransport({ allowedOrigins: ['https://parent.com'] });
    const onClose = vi.fn();
    transport.onclose = onClose;

    await transport.start();
    await transport.close();

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
