import { PassThrough } from 'node:stream';
import { type JSONRPCMessage, serializeMessage } from '@mcp-b/webmcp-ts-sdk';
import { describe, expect, it, vi } from 'vitest';
import { NativeClientTransport } from './NativeClientTransport.js';
import { NativeServerTransport } from './NativeServerTransport.js';

const wait = (ms = 10) => new Promise((resolve) => setTimeout(resolve, ms));
const nodeDescribe = typeof window === 'undefined' ? describe : describe.skip;

class MockPort implements chrome.runtime.Port {
  name = 'mock-port';
  sender?: chrome.runtime.MessageSender;
  onMessage: chrome.runtime.PortMessageEvent;
  onDisconnect: chrome.runtime.PortDisconnectEvent;
  disconnected = false;
  messages: any[] = [];

  private readonly _messageListeners = new Set<(message: any, port: chrome.runtime.Port) => void>();
  private readonly _disconnectListeners = new Set<(port: chrome.runtime.Port) => void>();

  constructor() {
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

  postMessage = vi.fn((message: any) => {
    this.messages.push(message);
  });

  disconnect = vi.fn(() => {
    this.disconnected = true;
    for (const cb of this._disconnectListeners) {
      cb(this as unknown as chrome.runtime.Port);
    }
  });

  emitMessage(message: any) {
    for (const cb of this._messageListeners) {
      cb(message, this as unknown as chrome.runtime.Port);
    }
  }

  triggerDisconnect() {
    this.disconnect();
  }
}

const createMessageBuffer = (message: JSONRPCMessage) => Buffer.from(serializeMessage(message));

nodeDescribe('NativeClientTransport', () => {
  it('emits parsed messages read from stdin', async () => {
    const stdin = new PassThrough();
    const stdout = new PassThrough();
    const transport = new NativeClientTransport(stdin, stdout);

    const received = new Promise<JSONRPCMessage>((resolve) => {
      transport.onmessage = (msg) => resolve(msg);
    });

    await transport.start();
    stdin.write(
      createMessageBuffer({
        jsonrpc: '2.0',
        method: 'ping',
        id: 1,
      })
    );

    expect(await received).toEqual({ jsonrpc: '2.0', method: 'ping', id: 1 });
    await transport.close();
  });

  it('throws if started twice', async () => {
    const transport = new NativeClientTransport(new PassThrough(), new PassThrough());
    await transport.start();

    await expect(transport.start()).rejects.toThrow('already started');
    await transport.close();
  });

  it('surfaces parse failures via onerror', async () => {
    const stdin = new PassThrough();
    const stdout = new PassThrough();
    const transport = new NativeClientTransport(stdin, stdout);
    const onError = vi.fn();
    transport.onerror = onError;

    const mockBuffer = {
      append: vi.fn(),
      readMessage: vi
        .fn()
        .mockImplementationOnce(() => {
          throw new Error('parse failure');
        })
        .mockImplementation(() => null),
      clear: vi.fn(),
    };
    (transport as any)._readBuffer = mockBuffer;

    await transport.start();
    stdin.write(Buffer.from('not-a-valid-message'));

    await wait();
    expect(onError).toHaveBeenCalled();
    await transport.close();
  });

  it('waits for drain when stdout backpressures', async () => {
    const stdin = new PassThrough();
    const stdout = new PassThrough();
    const transport = new NativeClientTransport(stdin, stdout);

    await transport.start();

    let resolved = false;
    const writeSpy = vi.spyOn(stdout, 'write').mockImplementation((_chunk, _enc, cb) => {
      if (typeof _enc === 'function') {
        _enc();
      } else if (typeof cb === 'function') {
        cb();
      }
      return false;
    });

    const sendPromise = transport.send({ jsonrpc: '2.0', id: 9, result: { ok: true } }).then(() => {
      resolved = true;
    });

    await wait(5);
    expect(writeSpy).toHaveBeenCalled();
    expect(resolved).toBe(false);

    stdout.emit('drain');
    await sendPromise;
    expect(resolved).toBe(true);
    await transport.close();
  });

  it('only pauses stdin when it owns the data listener', async () => {
    const sharedStdin = new PassThrough();
    const stdout = new PassThrough();
    const sharedListener = vi.fn();
    sharedStdin.on('data', sharedListener);

    const transport = new NativeClientTransport(sharedStdin, stdout);
    await transport.start();
    await transport.close();

    expect(sharedStdin.listenerCount('data')).toBe(1);
    expect(sharedStdin.isPaused()).toBe(false);

    const soloStdin = new PassThrough();
    const soloTransport = new NativeClientTransport(soloStdin, stdout);
    await soloTransport.start();
    await soloTransport.close();

    expect(soloStdin.isPaused()).toBe(true);
  });
});

nodeDescribe('NativeServerTransport', () => {
  it('parses incoming messages and forwards them to onmessage', async () => {
    const port = new MockPort();
    const transport = new NativeServerTransport(port as unknown as chrome.runtime.Port);
    const onMessage = vi.fn();
    transport.onmessage = onMessage;

    await transport.start();

    port.emitMessage({ jsonrpc: '2.0', method: 'hello', id: 2 });
    expect(onMessage).toHaveBeenCalledWith({ jsonrpc: '2.0', method: 'hello', id: 2 });
    await transport.close();
  });

  it('propagates parse errors from invalid payloads', async () => {
    const port = new MockPort();
    const transport = new NativeServerTransport(port as unknown as chrome.runtime.Port);
    const onError = vi.fn();
    transport.onerror = onError;

    await transport.start();
    port.emitMessage({ bad: 'payload' });

    await wait();
    expect(onError).toHaveBeenCalled();
    await transport.close();
  });

  it('throws when sending before start', async () => {
    const transport = new NativeServerTransport(new MockPort() as unknown as chrome.runtime.Port);
    await expect(transport.send({ jsonrpc: '2.0', id: 1, result: { ok: true } })).rejects.toThrow(
      'Transport not started'
    );
  });

  it('sends via the port and cleans up listeners on close', async () => {
    const port = new MockPort();
    const transport = new NativeServerTransport(port as unknown as chrome.runtime.Port);

    await transport.start();
    await transport.send({ jsonrpc: '2.0', id: 1, result: { ok: true } });
    expect(port.postMessage).toHaveBeenCalledWith({ jsonrpc: '2.0', id: 1, result: { ok: true } });

    await transport.close();
    expect(port.onMessage.hasListeners()).toBe(false);
    expect(port.onDisconnect.hasListeners()).toBe(false);
  });

  it('fires onclose when the port disconnects', async () => {
    const port = new MockPort();
    const transport = new NativeServerTransport(port as unknown as chrome.runtime.Port);
    const onClose = vi.fn();
    transport.onclose = onClose;

    await transport.start();
    port.triggerDisconnect();

    expect(onClose).toHaveBeenCalledTimes(1);
    await transport.close();
  });

  it('throws if started twice', async () => {
    const transport = new NativeServerTransport(new MockPort() as unknown as chrome.runtime.Port);
    await transport.start();
    await expect(transport.start()).rejects.toThrow('already started');
    await transport.close();
  });
});
