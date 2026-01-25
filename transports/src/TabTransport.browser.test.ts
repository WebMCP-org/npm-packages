import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TabClientTransport } from './TabClientTransport.js';
import { TabServerTransport } from './TabServerTransport.js';

const isBrowserEnv = typeof window !== 'undefined' && typeof window.postMessage === 'function';
const browserDescribe = isBrowserEnv ? describe : describe.skip;

const delay = (ms = 25) => new Promise((resolve) => setTimeout(resolve, ms));

async function safeClose(transport: {
  close: () => Promise<void>;
  serverReadyPromise?: Promise<void>;
}): Promise<void> {
  try {
    await transport.close();
  } catch {
    // Close should be best-effort for tests
  }
  if ('serverReadyPromise' in transport && transport.serverReadyPromise) {
    transport.serverReadyPromise.catch(() => {});
  }
}

const uniqueChannel = (prefix: string) =>
  `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;

async function startPair(options?: { channelId?: string; requestTimeout?: number }) {
  const channelId = options?.channelId ?? uniqueChannel('pair');

  const serverTransport = new TabServerTransport({
    allowedOrigins: [window.location.origin],
    channelId,
  });

  const clientTransport = new TabClientTransport({
    targetOrigin: window.location.origin,
    channelId,
    requestTimeout: options?.requestTimeout ?? 250,
  });

  await serverTransport.start();
  await clientTransport.start();
  await clientTransport.serverReadyPromise;

  return { channelId, clientTransport, serverTransport };
}

browserDescribe('Tab transports (browser)', () => {
  describe('TabClientTransport', () => {
    let clientTransport: TabClientTransport;
    let channelId: string;

    beforeEach(() => {
      channelId = uniqueChannel('client');
      clientTransport = new TabClientTransport({
        targetOrigin: window.location.origin,
        channelId,
        requestTimeout: 150,
      });
    });

    afterEach(async () => {
      await safeClose(clientTransport);
    });

    it('throws if targetOrigin is not provided', () => {
      expect(() => {
        // @ts-expect-error testing invalid input
        new TabClientTransport({});
      }).toThrow('targetOrigin must be explicitly set for security');
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
          data: {
            channel: channelId,
            type: 'mcp',
            direction: 'server-to-client',
            payload: { jsonrpc: '2.0', result: {}, id: 99 },
          },
        })
      );

      await delay();
      expect(onMessage).not.toHaveBeenCalled();
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
      await expect(
        clientTransport.send({ jsonrpc: '2.0', method: 'after-close', id: 5 })
      ).rejects.toThrow('Transport not started');
    });
  });

  describe('TabServerTransport', () => {
    let serverTransport: TabServerTransport;
    let channelId: string;

    beforeEach(() => {
      channelId = uniqueChannel('server');
      serverTransport = new TabServerTransport({
        allowedOrigins: [window.location.origin],
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

    it('ignores messages from disallowed origins', async () => {
      const onMessage = vi.fn();
      serverTransport.onmessage = onMessage;

      await serverTransport.start();

      window.dispatchEvent(
        new MessageEvent('message', {
          origin: 'https://attacker.example',
          data: {
            channel: channelId,
            type: 'mcp',
            direction: 'client-to-server',
            payload: { jsonrpc: '2.0', method: 'attack', id: 1 },
          },
        })
      );

      await delay();
      expect(onMessage).not.toHaveBeenCalled();
    });

    it('emits onerror for invalid client payloads', async () => {
      const onError = vi.fn();
      serverTransport.onerror = onError;

      await serverTransport.start();

      window.postMessage(
        {
          channel: channelId,
          type: 'mcp',
          direction: 'client-to-server',
          payload: { foo: 'bar' },
        },
        window.location.origin
      );

      await delay();
      expect(onError).toHaveBeenCalled();
      expect(onError.mock.calls[0]?.[0]?.message).toContain('Invalid message');
    });

    it('broadcasts server ready when started', async () => {
      const readyReceived = new Promise<void>((resolve) => {
        const handler = (event: MessageEvent) => {
          if (
            event.data?.channel === channelId &&
            event.data?.payload === 'mcp-server-ready' &&
            event.data?.direction === 'server-to-client'
          ) {
            window.removeEventListener('message', handler);
            resolve();
          }
        };
        window.addEventListener('message', handler);
      });

      await serverTransport.start();
      await readyReceived;
    });

    it('invokes onclose when closed manually', async () => {
      const onClose = vi.fn();
      serverTransport.onclose = onClose;

      await serverTransport.start();
      await serverTransport.close();

      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });

  describe('Client-Server Communication', () => {
    let clientTransport: TabClientTransport;
    let serverTransport: TabServerTransport;
    let channelId: string;

    beforeEach(async () => {
      const pair = await startPair({ requestTimeout: 120 });
      ({ clientTransport, serverTransport, channelId } = pair);
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

    it('delivers client requests to the server', async () => {
      const messageReceived = new Promise<unknown>((resolve) => {
        serverTransport.onmessage = (msg) => resolve(msg);
      });

      await clientTransport.send({
        jsonrpc: '2.0',
        method: 'test/method',
        id: 1,
        params: { foo: 'bar' },
      });

      expect(await messageReceived).toEqual({
        jsonrpc: '2.0',
        method: 'test/method',
        id: 1,
        params: { foo: 'bar' },
      });
    });

    it('roundtrips responses from server to client', async () => {
      const responseReceived = new Promise<unknown>((resolve) => {
        clientTransport.onmessage = (msg) => resolve(msg);
      });

      serverTransport.onmessage = async (msg) => {
        if ('method' in msg && msg.id !== undefined) {
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

    it('clears request timeouts after responses arrive', async () => {
      const responses: unknown[] = [];
      clientTransport.onmessage = (msg) => responses.push(msg);

      await clientTransport.send({ jsonrpc: '2.0', method: 'work', id: 7 });
      await serverTransport.send({ jsonrpc: '2.0', id: 7, result: { ok: true } });

      await delay(200);
      expect(responses).toHaveLength(1);

      const activeRequests = (clientTransport as any)._activeRequests as Map<unknown, unknown>;
      expect(activeRequests?.size ?? 0).toBe(0);
    });

    it('surfaces synthesized timeout errors when server hangs', async () => {
      clientTransport.onerror = vi.fn();

      const timeoutMessage = new Promise<any>((resolve) => {
        clientTransport.onmessage = (msg) => resolve(msg);
      });

      await clientTransport.send({
        jsonrpc: '2.0',
        method: 'slow/method',
        id: 99,
      });

      const received = await timeoutMessage;
      expect(received.id).toBe(99);
      expect(received.error?.code).toBe(-32000);
      expect(received.error?.message).toContain('timeout');
    });

    it('emits interrupted responses on beforeunload', async () => {
      const seenByServer = new Promise<void>((resolve) => {
        serverTransport.onmessage = () => resolve();
      });

      const interruptedResponse = new Promise<any>((resolve) => {
        clientTransport.onmessage = (msg) => resolve(msg);
      });

      await clientTransport.send({ jsonrpc: '2.0', method: 'long/task', id: 123 });
      await seenByServer;
      window.dispatchEvent(new Event('beforeunload'));

      const received = await interruptedResponse;
      expect(received.id).toBe(123);
      expect(received.result?.content?.[0]?.text).toContain('interrupted');
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
