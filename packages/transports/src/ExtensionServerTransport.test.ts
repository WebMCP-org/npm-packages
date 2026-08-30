import { afterEach, describe, expect, it, vi } from 'vitest';

import { type ExtensionPort, ExtensionServerTransport } from './ExtensionServerTransport.js';

type Listener<T extends unknown[]> = (...args: T) => void;

function createPort() {
  const messageListeners = new Set<Listener<[unknown]>>();
  const disconnectListeners = new Set<Listener<[]>>();
  const port = {
    disconnect: vi.fn(),
    postMessage: vi.fn(),
    onMessage: {
      addListener: (listener: Listener<[unknown]>) => messageListeners.add(listener),
      removeListener: (listener: Listener<[unknown]>) => messageListeners.delete(listener),
    },
    onDisconnect: {
      addListener: (listener: Listener<[]>) => disconnectListeners.add(listener),
      removeListener: (listener: Listener<[]>) => disconnectListeners.delete(listener),
    },
  } satisfies ExtensionPort;

  return {
    port,
    remoteDisconnect() {
      for (const listener of disconnectListeners) listener();
    },
  };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('ExtensionServerTransport', () => {
  it('becomes terminal when the client port disconnects', async () => {
    const connectedPort = createPort();
    const transport = new ExtensionServerTransport(connectedPort.port, { keepAlive: false });
    const onclose = vi.fn();
    transport.onclose = onclose;

    await transport.start();
    expect(transport.getConnectionInfo().isConnected).toBe(true);

    connectedPort.remoteDisconnect();

    expect(transport.getConnectionInfo().isConnected).toBe(false);
    expect(onclose).toHaveBeenCalledOnce();
    await expect(transport.send({ jsonrpc: '2.0', id: 1, method: 'tools/list' })).rejects.toThrow(
      'Transport is closed'
    );
    await expect(transport.start()).rejects.toThrow('cannot be restarted');

    await transport.close();
    expect(onclose).toHaveBeenCalledOnce();
    expect(connectedPort.port.disconnect).not.toHaveBeenCalled();
  });

  it('emits one close event when closed manually more than once', async () => {
    const connectedPort = createPort();
    const transport = new ExtensionServerTransport(connectedPort.port, { keepAlive: false });
    const onclose = vi.fn();
    transport.onclose = onclose;

    await transport.start();
    await transport.close();
    await transport.close();

    expect(transport.getConnectionInfo().isConnected).toBe(false);
    expect(connectedPort.port.disconnect).toHaveBeenCalledOnce();
    expect(onclose).toHaveBeenCalledOnce();
  });

  it('sends the default keep-alive every 25 seconds', async () => {
    vi.useFakeTimers();
    const connectedPort = createPort();
    const transport = new ExtensionServerTransport(connectedPort.port);

    await transport.start();
    await vi.advanceTimersByTimeAsync(24_999);
    expect(connectedPort.port.postMessage).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(connectedPort.port.postMessage).toHaveBeenCalledWith({
      type: 'keep-alive',
      timestamp: expect.any(Number),
    });
    await transport.close();
  });
});
