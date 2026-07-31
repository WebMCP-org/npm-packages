import { describe, expect, it, vi } from 'vitest';

import { ExtensionServerTransport } from './ExtensionServerTransport.js';

type Listener<T extends unknown[]> = (...args: T) => void;

function createPort() {
  const messageListeners = new Set<Listener<[unknown, chrome.runtime.Port]>>();
  const disconnectListeners = new Set<Listener<[chrome.runtime.Port]>>();
  const port = {
    disconnect: vi.fn(),
    postMessage: vi.fn(),
    sender: { id: 'test-extension' },
    onMessage: {
      addListener: (listener: Listener<[unknown, chrome.runtime.Port]>) =>
        messageListeners.add(listener),
      removeListener: (listener: Listener<[unknown, chrome.runtime.Port]>) =>
        messageListeners.delete(listener),
    },
    onDisconnect: {
      addListener: (listener: Listener<[chrome.runtime.Port]>) => disconnectListeners.add(listener),
      removeListener: (listener: Listener<[chrome.runtime.Port]>) =>
        disconnectListeners.delete(listener),
    },
  } as unknown as chrome.runtime.Port;

  return {
    port,
    remoteDisconnect() {
      for (const listener of disconnectListeners) listener(port);
    },
  };
}

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
});
