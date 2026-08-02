import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { IframeChildTransport } from './IframeChildTransport.js';
import { IframeParentTransport } from './IframeParentTransport.js';
import { TabClientTransport } from './TabClientTransport.js';
import { TabServerTransport } from './TabServerTransport.js';

const delay = (ms = 25) => new Promise((resolve) => setTimeout(resolve, ms));

async function safeClose(transport: {
  close: () => Promise<void>;
  serverReadyPromise?: Promise<void>;
}): Promise<void> {
  if ('serverReadyPromise' in transport && transport.serverReadyPromise) {
    void transport.serverReadyPromise.catch(() => {});
  }
  await transport.close();
}

const uniqueChannel = (prefix: string) =>
  `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;

function captureServerPayloads(channelId: string): {
  payloads: unknown[];
  stop: () => void;
} {
  const payloads: unknown[] = [];

  const handler = (event: MessageEvent) => {
    if (event.origin !== window.location.origin || event.source !== window) return;

    if (
      event.data?.channel === channelId &&
      event.data?.type === 'mcp' &&
      event.data?.direction === 'server-to-client'
    ) {
      payloads.push(event.data.payload);
    }
  };

  window.addEventListener('message', handler);

  return {
    payloads,
    stop: () => window.removeEventListener('message', handler),
  };
}

async function startPair(options?: { channelId?: string }) {
  const channelId = options?.channelId ?? uniqueChannel('pair');

  const serverTransport = new TabServerTransport({
    allowedOrigins: [window.location.origin],
    channelId,
  });

  const clientTransport = new TabClientTransport({
    targetOrigin: window.location.origin,
    channelId,
  });

  await serverTransport.start();
  await clientTransport.start();
  await clientTransport.serverReadyPromise;

  return { channelId, clientTransport, serverTransport };
}

describe('Tab transports (browser)', () => {
  describe('IframeParentTransport', () => {
    it('requires an explicit target origin', () => {
      expect(() => {
        // @ts-expect-error testing the JavaScript caller boundary
        new IframeParentTransport({ iframe: document.createElement('iframe') });
      }).toThrow('targetOrigin must be explicitly set');
    });

    it('accepts an explicit wildcard origin only from its iframe window', async () => {
      const iframe = document.createElement('iframe');
      document.body.append(iframe);
      const channelId = uniqueChannel('iframe-parent');
      const transport = new IframeParentTransport({ iframe, targetOrigin: '*', channelId });
      const onClose = vi.fn();
      transport.onclose = onClose;

      try {
        await transport.start();

        window.dispatchEvent(
          new MessageEvent('message', {
            origin: 'https://child.example',
            source: window,
            data: {
              channel: channelId,
              type: 'mcp',
              direction: 'server-to-client',
              payload: 'mcp-server-ready',
            },
          })
        );
        await delay();

        let ready = false;
        void transport.serverReadyPromise.then(() => {
          ready = true;
        });
        await delay();
        expect(ready).toBe(false);

        window.dispatchEvent(
          new MessageEvent('message', {
            origin: 'https://child.example',
            source: iframe.contentWindow,
            data: {
              channel: channelId,
              type: 'mcp',
              direction: 'server-to-client',
              payload: 'mcp-server-ready',
            },
          })
        );

        await expect(transport.serverReadyPromise).resolves.toBeUndefined();
        await transport.close();
        await transport.close();
        expect(onClose).toHaveBeenCalledOnce();
        await expect(transport.start()).rejects.toThrow('cannot be restarted');
      } finally {
        await safeClose(transport);
        iframe.remove();
      }
    });
  });

  describe('IframeChildTransport', () => {
    it('accepts messages only from its parent and snapshotted origins', async () => {
      const iframe = document.createElement('iframe');
      document.body.append(iframe);
      const channelId = uniqueChannel('iframe-child');
      const allowedOrigins = [window.location.origin];
      const transport = new IframeChildTransport({ allowedOrigins, channelId });
      const onMessage = vi.fn();
      const onClose = vi.fn();
      transport.onmessage = onMessage;
      transport.onclose = onClose;

      try {
        await transport.start();
        const data = {
          channel: channelId,
          type: 'mcp',
          direction: 'client-to-server',
          payload: { jsonrpc: '2.0', method: 'tools/list', id: 1 },
        };

        window.dispatchEvent(
          new MessageEvent('message', {
            origin: window.location.origin,
            source: iframe.contentWindow,
            data,
          })
        );
        expect(onMessage).not.toHaveBeenCalled();

        window.dispatchEvent(
          new MessageEvent('message', {
            origin: window.location.origin,
            source: window.parent,
            data,
          })
        );
        expect(onMessage).toHaveBeenCalledTimes(1);

        allowedOrigins.push('https://attacker.example');
        window.dispatchEvent(
          new MessageEvent('message', {
            origin: 'https://attacker.example',
            source: window.parent,
            data,
          })
        );
        expect(onMessage).toHaveBeenCalledTimes(1);

        await transport.close();
        await transport.close();
        expect(onClose).toHaveBeenCalledOnce();
        await expect(transport.start()).rejects.toThrow('cannot be restarted');
      } finally {
        await safeClose(transport);
        iframe.remove();
      }
    });

    it('accepts an explicit wildcard origin from its parent', async () => {
      const channelId = uniqueChannel('iframe-child-wildcard');
      const transport = new IframeChildTransport({ allowedOrigins: ['*'], channelId });
      const onMessage = vi.fn();
      transport.onmessage = onMessage;

      try {
        await transport.start();
        window.dispatchEvent(
          new MessageEvent('message', {
            origin: 'https://unlisted.example',
            source: window.parent,
            data: {
              channel: channelId,
              type: 'mcp',
              direction: 'client-to-server',
              payload: { jsonrpc: '2.0', method: 'tools/list', id: 1 },
            },
          })
        );

        expect(onMessage).toHaveBeenCalledOnce();
      } finally {
        await safeClose(transport);
      }
    });
  });

  describe('TabClientTransport', () => {
    let clientTransport: TabClientTransport;
    let channelId: string;

    beforeEach(() => {
      channelId = uniqueChannel('client');
      clientTransport = new TabClientTransport({
        targetOrigin: window.location.origin,
        channelId,
      });
    });

    afterEach(async () => {
      await safeClose(clientTransport);
    });

    it('requires an explicit target origin', () => {
      expect(() => {
        // @ts-expect-error testing the JavaScript caller boundary
        new TabClientTransport({});
      }).toThrow('targetOrigin must be explicitly set');
    });

    it('rejects sends before start', async () => {
      await expect(clientTransport.send({ jsonrpc: '2.0', method: 'test', id: 1 })).rejects.toThrow(
        'Transport not started'
      );
    });

    it('rejects serverReadyPromise when closed before handshake', async () => {
      const ready = clientTransport.serverReadyPromise;
      await clientTransport.start();
      await clientTransport.close();

      await expect(ready).rejects.toThrow('Transport closed before server ready');
    });

    it('ignores messages from other origins', async () => {
      const onMessage = vi.fn();
      clientTransport.onmessage = onMessage;

      await clientTransport.start();

      window.dispatchEvent(
        new MessageEvent('message', {
          origin: 'https://malicious.example',
          source: window,
          data: {
            channel: channelId,
            type: 'mcp',
            direction: 'server-to-client',
            payload: { jsonrpc: '2.0', result: {}, id: 99 },
          },
        })
      );

      expect(onMessage).not.toHaveBeenCalled();
    });

    it('accepts messages from any origin when targetOrigin is wildcard', async () => {
      const wildcardTransport = new TabClientTransport({
        targetOrigin: '*',
        channelId,
      });
      const iframe = document.createElement('iframe');
      document.body.append(iframe);
      const onMessage = vi.fn();
      wildcardTransport.onmessage = onMessage;

      try {
        await wildcardTransport.start();
        const data = {
          channel: channelId,
          type: 'mcp',
          direction: 'server-to-client',
          payload: { jsonrpc: '2.0', result: { ok: true }, id: 99 },
        };

        window.dispatchEvent(
          new MessageEvent('message', {
            origin: 'https://malicious.example',
            source: iframe.contentWindow,
            data,
          })
        );
        expect(onMessage).not.toHaveBeenCalled();

        window.dispatchEvent(
          new MessageEvent('message', {
            origin: 'https://malicious.example',
            source: window,
            data,
          })
        );
        expect(onMessage).toHaveBeenCalledTimes(1);
      } finally {
        await safeClose(wildcardTransport);
        iframe.remove();
      }
    });

    it('ignores messages with wrong direction', async () => {
      const onMessage = vi.fn();
      clientTransport.onmessage = onMessage;

      await clientTransport.start();

      window.postMessage(
        {
          channel: channelId,
          type: 'mcp',
          direction: 'client-to-server',
          payload: { jsonrpc: '2.0', result: {}, id: 1 },
        },
        window.location.origin
      );

      await delay();
      expect(onMessage).not.toHaveBeenCalled();
    });

    it('emits onerror for invalid JSON-RPC payloads', async () => {
      const onError = vi.fn();
      clientTransport.onerror = onError;

      await clientTransport.start();

      window.postMessage(
        {
          channel: channelId,
          type: 'mcp',
          direction: 'server-to-client',
          payload: { bad: 'payload' },
        },
        window.location.origin
      );

      await delay();
      expect(onError).toHaveBeenCalled();
      expect(onError.mock.calls[0]?.[0]?.message).toContain('Invalid message');
    });

    it('closes when receiving server-stopped signal', async () => {
      const onClose = vi.fn();
      clientTransport.onclose = onClose;

      await clientTransport.start();

      // Catch expected rejection when server-stopped causes close before handshake
      clientTransport.serverReadyPromise.catch(() => {});

      window.postMessage(
        {
          channel: channelId,
          type: 'mcp',
          direction: 'server-to-client',
          payload: 'mcp-server-stopped',
        },
        window.location.origin
      );

      await delay();
      expect(onClose).toHaveBeenCalledTimes(1);
      await clientTransport.close();
      expect(onClose).toHaveBeenCalledTimes(1);
      await expect(clientTransport.start()).rejects.toThrow('cannot be restarted');
      await expect(
        clientTransport.send({ jsonrpc: '2.0', method: 'after-close', id: 5 })
      ).rejects.toThrow('Transport is closed');
    });
  });

  describe('TabServerTransport', () => {
    let serverTransport: TabServerTransport;
    let channelId: string;
    let allowedOrigins: string[];

    beforeEach(() => {
      channelId = uniqueChannel('server');
      allowedOrigins = [window.location.origin];
      serverTransport = new TabServerTransport({
        allowedOrigins,
        channelId,
      });
    });

    afterEach(async () => {
      await safeClose(serverTransport);
    });

    it('throws if allowed origins are missing', () => {
      expect(() => {
        // @ts-expect-error testing invalid input
        new TabServerTransport({});
      }).toThrow('At least one allowed origin must be specified');
    });

    it('throws if started twice', async () => {
      await serverTransport.start();
      await expect(serverTransport.start()).rejects.toThrow('Transport already started');
    });

    it('snapshots allowed origins and ignores later mutations', async () => {
      const onMessage = vi.fn();
      serverTransport.onmessage = onMessage;

      await serverTransport.start();
      allowedOrigins.push('https://attacker.example');

      window.dispatchEvent(
        new MessageEvent('message', {
          origin: 'https://attacker.example',
          source: window,
          data: {
            channel: channelId,
            type: 'mcp',
            direction: 'client-to-server',
            payload: { jsonrpc: '2.0', method: 'attack', id: 1 },
          },
        })
      );

      expect(onMessage).not.toHaveBeenCalled();
    });

    it('accepts allowed-origin messages only from the same window', async () => {
      const iframe = document.createElement('iframe');
      document.body.append(iframe);
      const onMessage = vi.fn();
      serverTransport.onmessage = onMessage;

      try {
        await serverTransport.start();
        const data = {
          channel: channelId,
          type: 'mcp',
          direction: 'client-to-server',
          payload: { jsonrpc: '2.0', method: 'tools/list', id: 1 },
        };

        window.dispatchEvent(
          new MessageEvent('message', {
            origin: window.location.origin,
            source: iframe.contentWindow,
            data,
          })
        );
        expect(onMessage).not.toHaveBeenCalled();

        window.dispatchEvent(
          new MessageEvent('message', {
            origin: window.location.origin,
            source: window,
            data,
          })
        );
        expect(onMessage).toHaveBeenCalledTimes(1);
      } finally {
        iframe.remove();
      }
    });

    it('emits onerror for invalid client payloads', async () => {
      const onError = vi.fn();
      serverTransport.onerror = onError;

      await serverTransport.start();

      window.dispatchEvent(
        new MessageEvent('message', {
          origin: window.location.origin,
          source: window,
          data: {
            channel: channelId,
            type: 'mcp',
            direction: 'client-to-server',
            payload: { foo: 'bar' },
          },
        })
      );

      expect(onError).toHaveBeenCalled();
      expect(onError.mock.calls[0]?.[0]?.message).toContain('Invalid message');
    });

    it('responds to allowed cross-origin ready checks', async () => {
      const crossOrigin = 'https://app.usechar.ai';
      const crossOriginChannel = uniqueChannel('cross-origin-ready');
      const transport = new TabServerTransport({
        allowedOrigins: [crossOrigin],
        channelId: crossOriginChannel,
      });
      const captured = captureServerPayloads(crossOriginChannel);

      try {
        await transport.start();
        await delay();
        captured.payloads.length = 0;

        window.dispatchEvent(
          new MessageEvent('message', {
            origin: crossOrigin,
            source: window,
            data: {
              channel: crossOriginChannel,
              type: 'mcp',
              direction: 'client-to-server',
              payload: 'mcp-check-ready',
            },
          })
        );

        await delay();

        expect(captured.payloads).toContain('mcp-server-ready');
      } finally {
        captured.stop();
        await safeClose(transport);
      }
    });

    it('does not let a later client origin break an earlier response', async () => {
      const crossOrigin = 'https://app.usechar.ai';
      const raceChannel = uniqueChannel('origin-race');
      const transport = new TabServerTransport({
        allowedOrigins: [window.location.origin, crossOrigin],
        channelId: raceChannel,
      });
      const captured = captureServerPayloads(raceChannel);

      try {
        await transport.start();
        await delay();
        captured.payloads.length = 0;

        window.postMessage(
          {
            channel: raceChannel,
            type: 'mcp',
            direction: 'client-to-server',
            payload: {
              jsonrpc: '2.0',
              method: 'tool/run',
              id: 1,
            },
          },
          window.location.origin
        );

        await delay();

        window.dispatchEvent(
          new MessageEvent('message', {
            origin: crossOrigin,
            source: window,
            data: {
              channel: raceChannel,
              type: 'mcp',
              direction: 'client-to-server',
              payload: 'mcp-check-ready',
            },
          })
        );

        await delay();
        captured.payloads.length = 0;

        await transport.send({
          jsonrpc: '2.0',
          id: 1,
          result: { ok: true },
        });

        await delay();

        expect(captured.payloads).toContainEqual({
          jsonrpc: '2.0',
          id: 1,
          result: { ok: true },
        });
      } finally {
        captured.stop();
        await safeClose(transport);
      }
    });

    it('invokes onclose when closed manually', async () => {
      const onClose = vi.fn();
      serverTransport.onclose = onClose;

      await serverTransport.start();
      await serverTransport.close();
      await serverTransport.close();

      expect(onClose).toHaveBeenCalledTimes(1);
      await expect(serverTransport.start()).rejects.toThrow('cannot be restarted');
    });
  });

  describe('Client-Server Communication', () => {
    let clientTransport: TabClientTransport;
    let serverTransport: TabServerTransport;

    beforeEach(async () => {
      const pair = await startPair();
      ({ clientTransport, serverTransport } = pair);
    });

    afterEach(async () => {
      await safeClose(clientTransport);
      await safeClose(serverTransport);
    });

    it('resolves serverReady when server starts after client', async () => {
      const delayedChannel = uniqueChannel('handshake');
      const client = new TabClientTransport({
        targetOrigin: window.location.origin,
        channelId: delayedChannel,
      });

      await client.start();
      const readyPromise = client.serverReadyPromise;

      const server = new TabServerTransport({
        allowedOrigins: [window.location.origin],
        channelId: delayedChannel,
      });
      await server.start();

      await expect(readyPromise).resolves.toBeUndefined();
      await safeClose(client);
      await safeClose(server);
    });

    it('roundtrips responses from server to client', async () => {
      const responseReceived = new Promise<unknown>((resolve) => {
        clientTransport.onmessage = (msg) => resolve(msg);
      });

      serverTransport.onmessage = async (msg) => {
        if ('method' in msg && 'id' in msg) {
          await serverTransport.send({
            jsonrpc: '2.0',
            id: msg.id,
            result: { success: true },
          });
        }
      };

      await clientTransport.send({
        jsonrpc: '2.0',
        method: 'test/method',
        id: 42,
      });

      expect(await responseReceived).toEqual({
        jsonrpc: '2.0',
        id: 42,
        result: { success: true },
      });
    });
  });

  describe('Channel Isolation', () => {
    it('keeps messages scoped to their channel', async () => {
      const server1 = new TabServerTransport({
        allowedOrigins: [window.location.origin],
        channelId: 'channel-1',
      });

      const server2 = new TabServerTransport({
        allowedOrigins: [window.location.origin],
        channelId: 'channel-2',
      });

      const client1 = new TabClientTransport({
        targetOrigin: window.location.origin,
        channelId: 'channel-1',
      });

      await server1.start();
      await server2.start();
      await client1.start();

      const server1Messages: unknown[] = [];
      const server2Messages: unknown[] = [];

      server1.onmessage = (msg) => server1Messages.push(msg);
      server2.onmessage = (msg) => server2Messages.push(msg);

      await client1.serverReadyPromise;

      await client1.send({
        jsonrpc: '2.0',
        method: 'test',
        id: 1,
      });

      await delay(60);

      expect(server1Messages.length).toBe(1);
      expect(server2Messages.length).toBe(0);

      await safeClose(client1);
      await safeClose(server1);
      await safeClose(server2);
    });
  });
});
