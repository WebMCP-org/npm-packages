import { afterEach, describe, expect, it, vi } from 'vitest';

import { ExtensionClientTransport } from './ExtensionClientTransport.js';

type Listener<T extends unknown[]> = (...args: T) => void;

function createPort() {
  const messageListeners = new Set<Listener<[unknown]>>();
  const disconnectListeners = new Set<Listener<[]>>();
  const disconnect = vi.fn(() => {
    for (const listener of disconnectListeners) listener();
  });

  const port = {
    disconnect,
    postMessage: vi.fn(),
    onMessage: {
      addListener: (listener: Listener<[unknown]>) => messageListeners.add(listener),
      removeListener: (listener: Listener<[unknown]>) => messageListeners.delete(listener),
    },
    onDisconnect: {
      addListener: (listener: Listener<[]>) => disconnectListeners.add(listener),
      removeListener: (listener: Listener<[]>) => disconnectListeners.delete(listener),
    },
  } as unknown as chrome.runtime.Port;

  return {
    port,
    disconnect,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('ExtensionClientTransport', () => {
  it('closes the MCP session when the extension port disconnects', async () => {
    const connectedPort = createPort();
    const connect = vi.fn().mockReturnValue(connectedPort.port);

    vi.stubGlobal('chrome', {
      runtime: {
        connect,
        lastError: undefined,
      },
    });

    const transport = new ExtensionClientTransport();
    const onclose = vi.fn();
    transport.onclose = onclose;

    await transport.start();
    connectedPort.disconnect();

    expect(onclose).toHaveBeenCalledOnce();
    expect(connect).toHaveBeenCalledOnce();
    await expect(transport.send({ jsonrpc: '2.0', id: 1, method: 'tools/list' })).rejects.toThrow(
      'Transport is closed'
    );
    await expect(transport.start()).rejects.toThrow('cannot be restarted');
    await transport.close();
    expect(onclose).toHaveBeenCalledOnce();
  });

  it('emits one close event when closed manually', async () => {
    const connectedPort = createPort();
    vi.stubGlobal('chrome', {
      runtime: {
        connect: vi.fn().mockReturnValue(connectedPort.port),
        lastError: undefined,
      },
    });
    const transport = new ExtensionClientTransport();
    const onclose = vi.fn();
    transport.onclose = onclose;

    await transport.start();
    await transport.close();

    expect(connectedPort.disconnect).toHaveBeenCalledOnce();
    expect(onclose).toHaveBeenCalledOnce();
  });
});
