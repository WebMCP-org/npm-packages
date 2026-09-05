import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer as createNetServer, type Socket } from 'node:net';

import { describe, expect, it, vi } from 'vitest';
import WebSocket from 'ws';

import { RelayBridgeServer } from './bridgeServer.js';

// The relay caches its chosen port in ~/.webmcp/relay-port.json by default;
// tests must never touch the developer's real home directory. mkdtemp gives a
// 0700 directory with an unpredictable name, so this is not a temp-file race.
const persistPath = join(mkdtempSync(join(tmpdir(), 'webmcp-relay-test-')), 'relay-port.json');

/**
 * Polls until a value is available or times out.
 */
function waitFor<T>(fn: () => T | undefined, timeoutMs = 2000): Promise<T> {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const timer = setInterval(() => {
      const value = fn();
      if (value !== undefined) {
        clearInterval(timer);
        resolve(value);
        return;
      }
      if (Date.now() - started > timeoutMs) {
        clearInterval(timer);
        reject(new Error('Timed out waiting for condition'));
      }
    }, 20);
  });
}

/**
 * Connects a browser socket and registers hello + initial tools.
 */
function connectAndRegister(
  bridge: RelayBridgeServer,
  options: {
    tabId: string;
    url: string;
    tools: { name: string; description?: string }[];
    origin?: string;
  }
): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${bridge.port}`);
    ws.once('open', () => {
      ws.send(
        JSON.stringify({
          type: 'hello',
          tabId: options.tabId,
          url: options.url,
          origin: options.origin ?? new URL(options.url).origin,
        })
      );
      ws.send(JSON.stringify({ type: 'tools/list', tools: options.tools }));
      resolve(ws);
    });
    ws.once('error', reject);
  });
}

async function occupyTcpPort(port: number): Promise<{ close: () => Promise<void> }> {
  const server = createNetServer();
  const sockets = new Set<Socket>();
  server.on('connection', (socket) => {
    sockets.add(socket);
    socket.on('close', () => {
      sockets.delete(socket);
    });
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => resolve());
  });

  return {
    close: () =>
      new Promise<void>((resolve) => {
        for (const socket of sockets) {
          socket.destroy();
        }
        server.close(() => resolve());
      }),
  };
}

async function getOpenPort(): Promise<number> {
  const server = createNetServer();
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve());
  });

  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('Expected an address info result');
  }

  const port = address.port;
  await new Promise<void>((resolve) => {
    server.close(() => resolve());
  });

  return port;
}

describe('RelayBridgeServer', () => {
  it.each(['server', 'client'] as const)(
    'cancels only the pending invocation in %s mode',
    async (mode) => {
      const server = new RelayBridgeServer({ host: '127.0.0.1', port: 0, allowedOrigins: ['*'] });
      let client: RelayBridgeServer | undefined;
      try {
        await server.start();
        const ws = await connectAndRegister(server, {
          tabId: 'tab-cancel',
          url: 'https://example.com',
          tools: [{ name: 'echo' }],
        });
        const messages: Array<{ type: string; callId: string }> = [];
        ws.on('message', (raw) => messages.push(JSON.parse(String(raw))));
        const toolName = await waitFor(() => server.registry.listTools()[0]?.name);
        if (mode === 'client') {
          client = new RelayBridgeServer({
            host: '127.0.0.1',
            port: server.port,
            allowedOrigins: ['*'],
            persistPath,
          });
          await client.start();
        }
        const bridge = client ?? server;
        const reason = { code: 'caller-stopped' };
        await expect(
          bridge.invokeTool(toolName, {}, { signal: AbortSignal.abort(reason) })
        ).rejects.toBe(reason);

        const controller = new AbortController();
        const cancelled = bridge.invokeTool(toolName, {}, { signal: controller.signal });
        const rejected = expect(cancelled).rejects.toBe(reason);
        const first = await waitFor(() => messages.find((message) => message.type === 'invoke'));
        expect(messages.filter((message) => message.type === 'invoke')).toHaveLength(1);
        controller.abort(reason);
        await rejected;
        await waitFor(() => messages.find((message) => message.type === 'cancel'));
        expect(messages.filter((message) => message.type === 'cancel')).toEqual([
          { type: 'cancel', callId: first.callId },
        ]);

        const completedController = new AbortController();
        const removeListener = vi.spyOn(completedController.signal, 'removeEventListener');
        const completed = bridge.invokeTool(toolName, {}, { signal: completedController.signal });
        const second = await waitFor(() =>
          messages.find((message) => message.type === 'invoke' && message.callId !== first.callId)
        );
        for (const [callId, text] of [
          [first.callId, 'late'],
          [second.callId, 'fresh'],
        ]) {
          ws.send(
            JSON.stringify({
              type: 'result',
              callId,
              result: { content: [{ type: 'text', text }] },
            })
          );
        }
        await expect(completed).resolves.toMatchObject({
          content: [{ type: 'text', text: 'fresh' }],
        });
        expect(removeListener).toHaveBeenCalledWith('abort', expect.any(Function));
        ws.close();
      } finally {
        await client?.stop();
        await server.stop();
      }
    }
  );

  it('rejects invokeTool when no provider exists for the tool name', async () => {
    const bridge = new RelayBridgeServer({
      host: '127.0.0.1',
      port: 0,
      allowedOrigins: ['*'],
    });

    try {
      await bridge.start();
      await expect(bridge.invokeTool('webmcp_example_tabtab_1_missing_tool', {})).rejects.toThrow(
        /No active browser source provides tool/
      );
    } finally {
      await bridge.stop();
    }
  });

  it('forwards invoke -> result over websocket', async () => {
    const bridge = new RelayBridgeServer({
      host: '127.0.0.1',
      port: 0,
      allowedOrigins: ['*'],
      invokeTimeoutMs: 500,
    });

    try {
      await bridge.start();

      const ws = await connectAndRegister(bridge, {
        tabId: 'tab-1',
        url: 'https://example.com',
        tools: [{ name: 'echo', description: 'Echo tool' }],
      });

      const toolName = await waitFor(() => bridge.registry.listTools()[0]?.name);

      ws.on('message', (raw) => {
        const msg = JSON.parse(String(raw));
        if (msg.type !== 'invoke') return;

        ws.send(
          JSON.stringify({
            type: 'result',
            callId: msg.callId,
            result: {
              content: [{ type: 'text', text: `Echo:${msg.args?.message ?? ''}` }],
            },
          })
        );
      });

      const result = await bridge.invokeTool(toolName, { message: 'hello' });
      const text = (result.content?.[0] as { text?: string } | undefined)?.text;

      expect(text).toBe('Echo:hello');

      ws.close();
    } finally {
      await bridge.stop();
    }
  });

  it.each(['server', 'client'] as const)(
    'cancels browser execution after a %s timeout',
    async (mode) => {
      const bridge = new RelayBridgeServer({
        host: '127.0.0.1',
        port: 0,
        allowedOrigins: ['*'],
        invokeTimeoutMs: mode === 'server' ? 50 : 2000,
      });
      let client: RelayBridgeServer | undefined;

      try {
        await bridge.start();

        const ws = await connectAndRegister(bridge, {
          tabId: 'tab-1',
          url: 'https://example.com',
          tools: [{ name: 'slow_tool' }],
        });

        const toolName = await waitFor(() => bridge.registry.listTools()[0]?.name);
        const messages: Array<{ type: string; callId: string }> = [];
        ws.on('message', (raw) => messages.push(JSON.parse(String(raw))));
        if (mode === 'client') {
          client = new RelayBridgeServer({
            host: '127.0.0.1',
            port: bridge.port,
            allowedOrigins: ['*'],
            persistPath,
            invokeTimeoutMs: 50,
          });
          await client.start();
        }

        await expect((client ?? bridge).invokeTool(toolName, {})).rejects.toThrow(/timed out/i);
        const cancel = await waitFor(() => messages.find((message) => message.type === 'cancel'));
        expect(cancel.callId).toBe(messages.find((message) => message.type === 'invoke')?.callId);

        ws.close();
      } finally {
        await client?.stop();
        await bridge.stop();
      }
    }
  );

  it('rejects hello with disallowed host page origin', async () => {
    const bridge = new RelayBridgeServer({
      host: '127.0.0.1',
      port: 0,
      allowedOrigins: ['https://trusted.example.com'],
    });

    try {
      await bridge.start();

      const ws = new WebSocket(`ws://127.0.0.1:${bridge.port}`);
      await new Promise<void>((resolve, reject) => {
        ws.once('open', () => resolve());
        ws.once('error', reject);
      });

      ws.send(
        JSON.stringify({
          type: 'hello',
          tabId: 'tab-1',
          origin: 'https://evil.example.com',
        })
      );

      const rejection = await new Promise<Record<string, unknown>>((resolve, reject) => {
        ws.on('message', (raw) => {
          const message = JSON.parse(String(raw)) as Record<string, unknown>;
          if (message.type === 'hello/rejected') {
            resolve(message);
          }
        });
        ws.on('error', reject);
      });

      const closeCode = await new Promise<number>((resolve) => {
        ws.on('close', (code) => resolve(code));
      });

      expect(rejection).toMatchObject({
        type: 'hello/rejected',
        reason: 'host-origin-not-allowed',
      });
      expect(closeCode).toBe(1008);
    } finally {
      await bridge.stop();
    }
  });

  it('acknowledges hello before accepting tools from an allowed source', async () => {
    const bridge = new RelayBridgeServer({
      host: '127.0.0.1',
      port: 0,
      allowedOrigins: ['https://trusted.example.com'],
    });

    try {
      await bridge.start();

      const ws = new WebSocket(`ws://127.0.0.1:${bridge.port}`);
      const messages: Array<Record<string, unknown>> = [];
      await new Promise<void>((resolve, reject) => {
        ws.on('message', (raw) => {
          messages.push(JSON.parse(String(raw)) as Record<string, unknown>);
          if (
            messages.some((message) => message.type === 'server-hello') &&
            messages.some((message) => message.type === 'hello/accepted')
          ) {
            resolve();
          }
        });
        ws.once('open', () => {
          ws.send(
            JSON.stringify({
              type: 'hello',
              tabId: 'tab-1',
              origin: 'https://trusted.example.com',
            })
          );
        });
        ws.once('error', reject);
      });

      expect(messages.map((message) => message.type)).toContain('server-hello');
      expect(messages.map((message) => message.type)).toContain('hello/accepted');

      ws.close();
    } finally {
      await bridge.stop();
    }
  });

  it('sends server-hello immediately on connect', async () => {
    const bridge = new RelayBridgeServer({
      host: '127.0.0.1',
      port: 0,
      allowedOrigins: ['*'],
      label: 'Desktop Relay',
      workspace: 'default',
    });

    try {
      await bridge.start();

      const ws = new WebSocket(`ws://127.0.0.1:${bridge.port}`, ['webmcp-discovery.v1']);
      const message = await new Promise<Record<string, unknown>>((resolve, reject) => {
        ws.once('message', (raw) => resolve(JSON.parse(String(raw)) as Record<string, unknown>));
        ws.once('error', reject);
      });

      expect(message).toMatchObject({
        type: 'server-hello',
        service: 'webmcp-local-relay',
        version: 1,
        host: '127.0.0.1',
        label: 'Desktop Relay',
        port: bridge.port,
        workspace: 'default',
      });

      ws.close();
    } finally {
      await bridge.stop();
    }
  });

  it('allows hello with explicitly allowed host page origin', async () => {
    const bridge = new RelayBridgeServer({
      host: '127.0.0.1',
      port: 0,
      allowedOrigins: ['https://trusted.example.com'],
    });

    try {
      await bridge.start();

      const ws = await connectAndRegister(bridge, {
        tabId: 'tab-1',
        url: 'https://trusted.example.com/page',
        origin: 'https://trusted.example.com',
        tools: [{ name: 'test_tool' }],
      });

      const toolName = await waitFor(() => bridge.registry.listTools()[0]?.name);
      expect(toolName).toBeDefined();

      ws.close();
    } finally {
      await bridge.stop();
    }
  });

  it('rejects pending invocations when the socket disconnects', async () => {
    const bridge = new RelayBridgeServer({
      host: '127.0.0.1',
      port: 0,
      allowedOrigins: ['*'],
      invokeTimeoutMs: 5000,
    });

    try {
      await bridge.start();

      const ws = await connectAndRegister(bridge, {
        tabId: 'tab-1',
        url: 'https://example.com',
        tools: [{ name: 'hang_tool' }],
      });

      const toolName = await waitFor(() => bridge.registry.listTools()[0]?.name);

      const invokePromise = bridge.invokeTool(toolName, {});

      await new Promise((resolve) => setTimeout(resolve, 50));
      ws.close();

      await expect(invokePromise).rejects.toThrow(/disconnected during invocation/i);
    } finally {
      await bridge.stop();
    }
  });

  it('rejects pending invocations when the bridge stops', async () => {
    const bridge = new RelayBridgeServer({
      host: '127.0.0.1',
      port: 0,
      allowedOrigins: ['*'],
      invokeTimeoutMs: 5000,
    });

    await bridge.start();

    const ws = await connectAndRegister(bridge, {
      tabId: 'tab-1',
      url: 'https://example.com',
      tools: [{ name: 'hang_tool' }],
    });

    const toolName = await waitFor(() => bridge.registry.listTools()[0]?.name);
    const invokePromise = bridge.invokeTool(toolName, {});
    const rejected = expect(invokePromise).rejects.toThrow(
      /Relay server stopped before tool invocation completed/i
    );

    await bridge.stop();
    await rejected;
    expect(bridge.registry.listSources()).toEqual([]);
    expect(bridge.registry.listTools()).toEqual([]);

    await bridge.start();
    try {
      expect(bridge.registry.listTools()).toEqual([]);
      await expect(bridge.invokeTool(toolName, {})).rejects.toThrow('No active browser source');
    } finally {
      await bridge.stop();
    }
    ws.close();
  });

  it.each([
    ['malformed content blocks', { content: [42, null] }],
    ['null', null],
    ['a bare string', 'just a string'],
  ])('wraps %s returned by a tool as an MCP error', async (_case, badResult) => {
    const bridge = new RelayBridgeServer({
      host: '127.0.0.1',
      port: 0,
      allowedOrigins: ['*'],
      invokeTimeoutMs: 500,
    });

    try {
      await bridge.start();

      const ws = await connectAndRegister(bridge, {
        tabId: 'tab-1',
        url: 'https://example.com',
        tools: [{ name: 'bad_result_tool' }],
      });

      ws.on('message', (raw) => {
        const msg = JSON.parse(String(raw));
        if (msg.type !== 'invoke') {
          return;
        }

        ws.send(JSON.stringify({ type: 'result', callId: msg.callId, result: badResult }));
      });

      const toolName = await waitFor(() => bridge.registry.listTools()[0]?.name);
      const result = await bridge.invokeTool(toolName, {});

      expect(result.isError).toBe(true);
      const text = (result.content?.[0] as { text?: string } | undefined)?.text ?? '';
      expect(text).toMatch(/Tool returned an invalid result/i);

      ws.close();
    } finally {
      await bridge.stop();
    }
  });

  it('is idempotent when start() is called twice', async () => {
    const bridge = new RelayBridgeServer({
      host: '127.0.0.1',
      port: 0,
      allowedOrigins: ['*'],
    });

    try {
      await bridge.start();
      const port = bridge.port;
      await bridge.start(); // second call should be a no-op
      expect(bridge.port).toBe(port);
    } finally {
      await bridge.stop();
    }
  });

  it('stop is safe to call when not started', async () => {
    const bridge = new RelayBridgeServer({
      host: '127.0.0.1',
      port: 0,
      allowedOrigins: ['*'],
    });

    await bridge.stop(); // should not throw
  });

  it('rejects hello with no origin when origins are restricted', async () => {
    const bridge = new RelayBridgeServer({
      host: '127.0.0.1',
      port: 0,
      allowedOrigins: ['https://trusted.example.com'],
    });

    try {
      await bridge.start();

      const ws = new WebSocket(`ws://127.0.0.1:${bridge.port}`);
      await new Promise<void>((resolve, reject) => {
        ws.once('open', () => resolve());
        ws.once('error', reject);
      });

      ws.send(
        JSON.stringify({
          type: 'hello',
          tabId: 'tab-1',
        })
      );

      const closeCode = await new Promise<number>((resolve) => {
        ws.on('close', (code) => resolve(code));
      });

      expect(closeCode).toBe(1008);
    } finally {
      await bridge.stop();
    }
  });

  it('uses the WebSocket Origin instead of a claimed host origin', async () => {
    const bridge = new RelayBridgeServer({
      host: '127.0.0.1',
      port: 0,
      allowedOrigins: ['https://myapp.com'],
    });

    try {
      await bridge.start();

      const ws = new WebSocket(`ws://127.0.0.1:${bridge.port}`, {
        headers: { origin: 'https://evil.example.com' },
      });
      const rejection = new Promise<Record<string, unknown>>((resolve) => {
        ws.on('message', (raw) => {
          const message = JSON.parse(String(raw)) as Record<string, unknown>;
          if (message.type === 'hello/rejected') resolve(message);
        });
      });
      await new Promise<void>((resolve, reject) => {
        ws.once('open', () => resolve());
        ws.once('error', reject);
      });

      ws.send(
        JSON.stringify({
          type: 'hello',
          tabId: 'tab-1',
          origin: 'https://myapp.com',
          url: 'https://myapp.com/page',
        })
      );
      ws.send(
        JSON.stringify({
          type: 'tools/list',
          tools: [{ name: 'cdn_tool' }],
        })
      );

      await expect(rejection).resolves.toMatchObject({
        reason: 'host-origin-not-allowed',
        type: 'hello/rejected',
      });
      expect(bridge.registry.listTools()).toEqual([]);
    } finally {
      await bridge.stop();
    }
  });

  it('rejects browser connections that negotiate the internal relay protocol', async () => {
    const bridge = new RelayBridgeServer({ host: '127.0.0.1', port: 0 });

    try {
      await bridge.start();
      const messages: unknown[] = [];
      const ws = new WebSocket(`ws://127.0.0.1:${bridge.port}`, 'webmcp-relay.v1', {
        headers: { origin: 'https://evil.example.com' },
      });
      ws.on('message', (raw) => messages.push(JSON.parse(String(raw))));

      const closeCode = await new Promise<number>((resolve, reject) => {
        ws.once('close', resolve);
        ws.once('error', reject);
      });

      expect(closeCode).toBe(1008);
      expect(messages).toEqual([]);
    } finally {
      await bridge.stop();
    }
  });

  it('does not accept relay messages over the browser protocol', async () => {
    const bridge = new RelayBridgeServer({ host: '127.0.0.1', port: 0 });

    try {
      await bridge.start();
      const ws = new WebSocket(`ws://127.0.0.1:${bridge.port}`, 'webmcp.v1', {
        headers: { origin: 'https://evil.example.com' },
      });
      await new Promise<void>((resolve, reject) => {
        ws.once('open', resolve);
        ws.once('error', reject);
      });
      ws.send(JSON.stringify({ type: 'relay/list-tools' }));

      const closeCode = await new Promise<number>((resolve) => ws.once('close', resolve));
      expect(closeCode).toBe(1008);
    } finally {
      await bridge.stop();
    }
  });

  it('requires relay/hello before serving relay clients', async () => {
    const bridge = new RelayBridgeServer({ host: '127.0.0.1', port: 0 });

    try {
      await bridge.start();
      const messages: Array<Record<string, unknown>> = [];
      const ws = new WebSocket(`ws://127.0.0.1:${bridge.port}`, 'webmcp-relay.v1');
      ws.on('message', (raw) => messages.push(JSON.parse(String(raw))));
      await new Promise<void>((resolve, reject) => {
        ws.once('open', resolve);
        ws.once('error', reject);
      });

      ws.send(JSON.stringify({ type: 'relay/list-tools' }));
      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(messages.some((message) => message.type === 'relay/tools')).toBe(false);

      ws.send(JSON.stringify({ type: 'relay/hello' }));
      ws.send(JSON.stringify({ type: 'relay/list-tools' }));
      await waitFor(() => messages.find((message) => message.type === 'relay/tools'));
      ws.close();
    } finally {
      await bridge.stop();
    }
  });

  it('handles tools before hello as warning without crash', async () => {
    const bridge = new RelayBridgeServer({
      host: '127.0.0.1',
      port: 0,
      allowedOrigins: ['*'],
    });

    try {
      await bridge.start();

      const ws = new WebSocket(`ws://127.0.0.1:${bridge.port}`);
      await new Promise<void>((resolve, reject) => {
        ws.once('open', () => resolve());
        ws.once('error', reject);
      });

      ws.send(JSON.stringify({ type: 'tools/list', tools: [{ name: 'tool_a' }] }));

      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(ws.readyState).toBe(WebSocket.OPEN);

      ws.close();
    } finally {
      await bridge.stop();
    }
  });

  it('handles result for unknown callId gracefully', async () => {
    const bridge = new RelayBridgeServer({
      host: '127.0.0.1',
      port: 0,
      allowedOrigins: ['*'],
    });

    try {
      await bridge.start();

      const ws = new WebSocket(`ws://127.0.0.1:${bridge.port}`);
      await new Promise<void>((resolve, reject) => {
        ws.once('open', () => resolve());
        ws.once('error', reject);
      });

      ws.send(
        JSON.stringify({
          type: 'hello',
          tabId: 'tab-1',
          url: 'https://example.com',
          origin: 'https://example.com',
        })
      );

      ws.send(
        JSON.stringify({
          type: 'result',
          callId: 'nonexistent-call-id',
          result: { content: [{ type: 'text', text: 'orphan result' }] },
        })
      );

      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(ws.readyState).toBe(WebSocket.OPEN);

      ws.close();
    } finally {
      await bridge.stop();
    }
  });

  it('handles pong messages without error', async () => {
    const bridge = new RelayBridgeServer({
      host: '127.0.0.1',
      port: 0,
      allowedOrigins: ['*'],
    });

    try {
      await bridge.start();

      const ws = new WebSocket(`ws://127.0.0.1:${bridge.port}`);
      await new Promise<void>((resolve, reject) => {
        ws.once('open', () => resolve());
        ws.once('error', reject);
      });

      ws.send(
        JSON.stringify({
          type: 'hello',
          tabId: 'tab-1',
          url: 'https://example.com',
          origin: 'https://example.com',
        })
      );

      ws.send(JSON.stringify({ type: 'pong' }));

      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(ws.readyState).toBe(WebSocket.OPEN);

      ws.close();
    } finally {
      await bridge.stop();
    }
  });

  it('closes a browser connection that stops answering heartbeat pings', async () => {
    // Fake only the heartbeat's own timers; socket I/O and setTimeout stay real.
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] });
    const bridge = new RelayBridgeServer({ host: '127.0.0.1', port: 0, allowedOrigins: ['*'] });

    try {
      await bridge.start();

      const ws = await connectAndRegister(bridge, {
        tabId: 'tab-silent',
        url: 'https://example.com',
        tools: [{ name: 'silent_tool' }],
      });
      const closeCode = new Promise<number>((resolve) => {
        ws.once('close', (code: number) => resolve(code));
      });

      // First tick stays inside the 25s dead threshold: the relay only pings.
      vi.advanceTimersByTime(15_000);
      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(ws.readyState).toBe(WebSocket.OPEN);

      // Second tick crosses the threshold with no pong received.
      vi.advanceTimersByTime(15_000);
      await expect(closeCode).resolves.toBe(1001);
    } finally {
      vi.useRealTimers();
      await bridge.stop();
    }
  });

  it('keeps a browser connection alive while it answers heartbeat pings', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] });
    const bridge = new RelayBridgeServer({ host: '127.0.0.1', port: 0, allowedOrigins: ['*'] });

    try {
      await bridge.start();

      const ws = await connectAndRegister(bridge, {
        tabId: 'tab-healthy',
        url: 'https://example.com',
        tools: [{ name: 'healthy_tool' }],
      });

      let pings = 0;
      ws.on('message', (raw) => {
        const message: unknown = JSON.parse(String(raw));
        if ((message as { type?: unknown }).type !== 'ping') return;
        pings++;
        ws.send(JSON.stringify({ type: 'pong' }));
      });

      for (let tick = 0; tick < 3; tick++) {
        vi.advanceTimersByTime(15_000);
        await new Promise((resolve) => setTimeout(resolve, 50));
      }

      expect(pings).toBe(3);
      expect(ws.readyState).toBe(WebSocket.OPEN);

      ws.close();
    } finally {
      vi.useRealTimers();
      await bridge.stop();
    }
  });

  it('switches to client mode when the port is already in use', async () => {
    const bridge1 = new RelayBridgeServer({
      host: '127.0.0.1',
      port: 0,
      allowedOrigins: ['*'],
    });

    await bridge1.start();
    expect(bridge1.mode).toBe('server');
    const usedPort = bridge1.port;

    const bridge2 = new RelayBridgeServer({
      host: '127.0.0.1',
      port: usedPort,
      allowedOrigins: ['*'],
      persistPath,
    });

    await bridge2.start();
    expect(bridge2.mode).toBe('client');

    await bridge2.stop();
    await bridge1.stop();
  });

  it('skips a non-relay port owner and binds the next available port', async () => {
    const preferredPort = await getOpenPort();
    const preferredPortHolder = await occupyTcpPort(preferredPort);
    const bridge = new RelayBridgeServer({
      host: '127.0.0.1',
      port: preferredPort,
      portRangeEnd: preferredPort + 1,
      allowedOrigins: ['*'],
      persistPath,
    });

    try {
      await bridge.start();
      expect(bridge.mode).toBe('server');
      expect(bridge.port).toBe(preferredPort + 1);
    } finally {
      await bridge.stop();
      await preferredPortHolder.close();
    }
  });

  it('fails explicit ports when occupied by a non-relay service', async () => {
    const preferredPort = await getOpenPort();
    const preferredPortHolder = await occupyTcpPort(preferredPort);
    const bridge = new RelayBridgeServer({
      host: '127.0.0.1',
      port: preferredPort,
      portExplicitlySet: true,
      allowedOrigins: ['*'],
      persistPath,
    });

    try {
      await expect(bridge.start()).rejects.toThrow(/non-WebMCP service/i);
    } finally {
      await bridge.stop();
      await preferredPortHolder.close();
    }
  });

  it('invokes tool with explicit sourceId option', async () => {
    const bridge = new RelayBridgeServer({
      host: '127.0.0.1',
      port: 0,
      allowedOrigins: ['*'],
      invokeTimeoutMs: 500,
    });

    try {
      await bridge.start();

      const ws = await connectAndRegister(bridge, {
        tabId: 'tab-1',
        url: 'https://example.com',
        tools: [{ name: 'echo', description: 'Echo' }],
      });

      ws.on('message', (raw) => {
        const msg = JSON.parse(String(raw));
        if (msg.type !== 'invoke') return;
        ws.send(
          JSON.stringify({
            type: 'result',
            callId: msg.callId,
            result: { content: [{ type: 'text', text: 'ok-src' }] },
          })
        );
      });

      const toolName = await waitFor(() => bridge.registry.listTools()[0]?.name);
      const source = bridge.registry.listSources()[0];
      if (!source) {
        throw new Error('Expected source to be registered');
      }

      const result = await bridge.invokeTool(toolName, {}, { sourceId: source.sourceId });
      const text = (result.content?.[0] as { text?: string } | undefined)?.text;
      expect(text).toBe('ok-src');

      ws.close();
    } finally {
      await bridge.stop();
    }
  });

  it('invokes tool with explicit requestTabId option', async () => {
    const bridge = new RelayBridgeServer({
      host: '127.0.0.1',
      port: 0,
      allowedOrigins: ['*'],
      invokeTimeoutMs: 500,
    });

    try {
      await bridge.start();

      const ws = await connectAndRegister(bridge, {
        tabId: 'tab-rt',
        url: 'https://example.com',
        tools: [{ name: 'echo', description: 'Echo' }],
      });

      ws.on('message', (raw) => {
        const msg = JSON.parse(String(raw));
        if (msg.type !== 'invoke') return;
        ws.send(
          JSON.stringify({
            type: 'result',
            callId: msg.callId,
            result: { content: [{ type: 'text', text: 'ok-tab' }] },
          })
        );
      });

      const toolName = await waitFor(() => bridge.registry.listTools()[0]?.name);

      const result = await bridge.invokeTool(toolName, {}, { requestTabId: 'tab-rt' });
      const text = (result.content?.[0] as { text?: string } | undefined)?.text;
      expect(text).toBe('ok-tab');

      ws.close();
    } finally {
      await bridge.stop();
    }
  });

  it('throws when socket is closed before invokeTool executes', async () => {
    const bridge = new RelayBridgeServer({
      host: '127.0.0.1',
      port: 0,
      allowedOrigins: ['*'],
      invokeTimeoutMs: 500,
    });

    try {
      await bridge.start();

      const ws = await connectAndRegister(bridge, {
        tabId: 'tab-1',
        url: 'https://example.com',
        tools: [{ name: 'fragile_tool' }],
      });

      const toolName = await waitFor(() => bridge.registry.listTools()[0]?.name);

      // Close the socket but don't wait for the registry cleanup
      ws.close();
      // Wait a tick for close to propagate
      await new Promise((resolve) => setTimeout(resolve, 100));

      // The tool should still be resolvable in registry but socket is gone
      await expect(bridge.invokeTool(toolName, {})).rejects.toThrow(
        /disconnected|No active browser/
      );
    } finally {
      await bridge.stop();
    }
  });

  it('accepts invocation messages only from the selected source', async () => {
    const bridge = new RelayBridgeServer({
      host: '127.0.0.1',
      port: 0,
      allowedOrigins: ['*'],
      invokeTimeoutMs: 2000,
    });

    try {
      await bridge.start();

      // Connect two browser sources with different tools
      const ws1 = await connectAndRegister(bridge, {
        tabId: 'tab-a',
        url: 'https://a.example.com',
        tools: [{ name: 'tool_a', description: 'From A' }],
      });
      const ws2 = await connectAndRegister(bridge, {
        tabId: 'tab-b',
        url: 'https://b.example.com',
        tools: [{ name: 'tool_b', description: 'From B' }],
      });
      // The other source tries to spoof invocation messages before the selected source responds.
      ws1.on('message', (raw) => {
        const msg = JSON.parse(String(raw));
        if (msg.type !== 'invoke') return;
        ws2.send(
          JSON.stringify({
            type: 'result',
            callId: msg.callId,
            result: { content: [{ type: 'text', text: 'spoofed' }] },
          })
        );
        setTimeout(() => {
          ws1.send(
            JSON.stringify({
              type: 'result',
              callId: msg.callId,
              result: { content: [{ type: 'text', text: 'ok-a' }] },
            })
          );
        }, 100);
      });

      const toolAName = await waitFor(() => {
        const tools = bridge.registry.listTools();
        return tools.find((t) => t.originalName === 'tool_a')?.name;
      });

      const invokePromise = bridge.invokeTool(toolAName, {});
      const result = await invokePromise;
      const text = (result.content?.[0] as { text?: string } | undefined)?.text;
      expect(text).toBe('ok-a');

      ws1.close();
      ws2.close();
    } finally {
      await bridge.stop();
    }
  });

  it('sends reload to the correct browser source', async () => {
    const bridge = new RelayBridgeServer({
      host: '127.0.0.1',
      port: 0,
      allowedOrigins: ['*'],
    });

    try {
      await bridge.start();

      const ws = await connectAndRegister(bridge, {
        tabId: 'tab-1',
        url: 'https://example.com',
        tools: [{ name: 'echo', description: 'Echo tool' }],
      });

      const source = await waitFor(() => bridge.registry.listSources()[0]);

      const received = new Promise<{ type: string }>((resolve) => {
        ws.on('message', (raw) => {
          const msg = JSON.parse(String(raw));
          if (msg.type === 'reload') {
            resolve(msg);
          }
        });
      });

      bridge.reloadSource(source.sourceId);

      const msg = await received;
      expect(msg.type).toBe('reload');

      ws.close();
    } finally {
      await bridge.stop();
    }
  });

  it('throws when reloading a disconnected source', async () => {
    const bridge = new RelayBridgeServer({
      host: '127.0.0.1',
      port: 0,
      allowedOrigins: ['*'],
    });

    try {
      await bridge.start();

      const ws = await connectAndRegister(bridge, {
        tabId: 'tab-1',
        url: 'https://example.com',
        tools: [{ name: 'echo' }],
      });

      const source = await waitFor(() => bridge.registry.listSources()[0]);

      ws.close();
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(() => bridge.reloadSource(source.sourceId)).toThrow(/not connected/i);
    } finally {
      await bridge.stop();
    }
  });

  it('updates registry when tools/changed replaces initial tools', async () => {
    const bridge = new RelayBridgeServer({
      host: '127.0.0.1',
      port: 0,
      allowedOrigins: ['*'],
    });

    try {
      await bridge.start();

      const ws = await connectAndRegister(bridge, {
        tabId: 'tab-1',
        url: 'https://example.com',
        tools: [{ name: 'tool_a', description: 'Initial tool' }],
      });

      // Wait for tool_a to appear in registry
      const toolAName = await waitFor(() => bridge.registry.listTools()[0]?.name);
      expect(toolAName).toBeTruthy();

      // Send tools/changed replacing tool_a with tool_b
      ws.send(
        JSON.stringify({
          type: 'tools/changed',
          tools: [{ name: 'tool_b', description: 'Replacement tool' }],
        })
      );

      // Wait for tool_b to appear and tool_a to disappear
      const toolBName = await waitFor(() => {
        const tools = bridge.registry.listTools();
        const hasA = tools.some((t) => t.originalName === 'tool_a');
        const toolB = tools.find((t) => t.originalName === 'tool_b');
        return !hasA && toolB ? toolB.name : undefined;
      });

      expect(toolBName).toBeTruthy();
      const allTools = bridge.registry.listTools();
      expect(allTools.some((t) => t.originalName === 'tool_a')).toBe(false);
      expect(allTools.some((t) => t.originalName === 'tool_b')).toBe(true);

      ws.close();
    } finally {
      await bridge.stop();
    }
  });

  it('survives malformed JSON messages without dropping the connection', async () => {
    const bridge = new RelayBridgeServer({
      host: '127.0.0.1',
      port: 0,
      allowedOrigins: ['*'],
      invokeTimeoutMs: 500,
    });

    try {
      await bridge.start();

      const ws = new WebSocket(`ws://127.0.0.1:${bridge.port}`);
      await new Promise<void>((resolve, reject) => {
        ws.once('open', () => resolve());
        ws.once('error', reject);
      });

      ws.send(`{"x":"${'a'.repeat(400)}`); // intentionally invalid JSON > 200 chars
      ws.send(JSON.stringify({ type: 'invalid_type', foo: 'bar' }));
      ws.send(JSON.stringify(42)); // valid JSON but invalid envelope shape

      ws.send(
        JSON.stringify({
          type: 'hello',
          tabId: 'tab-1',
          url: 'https://example.com',
          origin: 'https://example.com',
        })
      );
      ws.send(JSON.stringify({ type: 'tools/list', tools: [{ name: 'after_garbage' }] }));

      const toolName = await waitFor(() => bridge.registry.listTools()[0]?.name);
      expect(toolName).toBeTruthy();

      ws.close();
    } finally {
      await bridge.stop();
    }
  });

  it('throws from start() when bind fails with non-EADDRINUSE errors', async () => {
    const bridge = new RelayBridgeServer({
      host: '256.256.256.256',
      port: 9333,
      allowedOrigins: ['*'],
      persistPath,
    });

    await expect(bridge.start()).rejects.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Client mode (relay-to-relay) integration tests
// ---------------------------------------------------------------------------

describe('RelayBridgeServer client mode', () => {
  it('ignores cancellation from another relay connection', async () => {
    const server = new RelayBridgeServer({ host: '127.0.0.1', port: 0, allowedOrigins: ['*'] });
    const sockets: WebSocket[] = [];
    try {
      await server.start();
      const browser = await connectAndRegister(server, {
        tabId: 'tab-owned',
        url: 'https://example.com',
        tools: [{ name: 'echo' }],
      });
      sockets.push(browser);
      const browserMessages: Array<{ type: string; callId: string }> = [];
      browser.on('message', (raw) => browserMessages.push(JSON.parse(String(raw))));
      const toolName = await waitFor(() => server.registry.listTools()[0]?.name);
      const clients = await Promise.all(
        [0, 1].map(async () => {
          const ws = new WebSocket(`ws://127.0.0.1:${server.port}`, 'webmcp-relay.v1');
          sockets.push(ws);
          const messages: Array<{ type: string; callId: string; result?: unknown }> = [];
          ws.on('message', (raw) => messages.push(JSON.parse(String(raw))));
          await new Promise<void>((resolve, reject) => {
            ws.once('open', resolve);
            ws.once('error', reject);
          });
          ws.send(JSON.stringify({ type: 'relay/hello' }));
          return { ws, messages };
        })
      );
      const owner = clients[0]!;
      const other = clients[1]!;
      owner.ws.send(
        JSON.stringify({ type: 'relay/invoke', callId: 'owned-call', toolName, args: {} })
      );
      const invocation = await waitFor(() =>
        browserMessages.find((message) => message.type === 'invoke')
      );

      other.ws.send(JSON.stringify({ type: 'relay/cancel', callId: 'owned-call' }));
      other.ws.send(JSON.stringify({ type: 'relay/list-tools' }));
      // The reply confirms the server processed the preceding unauthorized cancel.
      await waitFor(() => other.messages.find((message) => message.type === 'relay/tools'));
      browser.send(
        JSON.stringify({
          type: 'result',
          callId: invocation.callId,
          result: { content: [{ type: 'text', text: 'still-running' }] },
        })
      );
      const response = await waitFor(() =>
        owner.messages.find((message) => message.type === 'relay/result')
      );
      expect(response.result).toMatchObject({ content: [{ type: 'text', text: 'still-running' }] });
      expect(browserMessages.filter((message) => message.type === 'cancel')).toEqual([]);

      owner.ws.send(
        JSON.stringify({ type: 'relay/invoke', callId: 'owned-call', toolName, args: {} })
      );
      const next = await waitFor(() =>
        browserMessages.find(
          (message) => message.type === 'invoke' && message.callId !== invocation.callId
        )
      );
      owner.ws.send(JSON.stringify({ type: 'relay/cancel', callId: 'owned-call' }));
      const cancel = await waitFor(() =>
        browserMessages.find((message) => message.type === 'cancel')
      );
      expect(cancel.callId).toBe(next.callId);
    } finally {
      for (const socket of sockets) socket.close();
      await server.stop();
    }
  });

  it('receives tools from the server relay via relay/tools', async () => {
    const server = new RelayBridgeServer({
      host: '127.0.0.1',
      port: 0,
      allowedOrigins: ['*'],
    });

    try {
      await server.start();
      expect(server.mode).toBe('server');

      // Connect a browser source with tools to the server
      const ws = await connectAndRegister(server, {
        tabId: 'tab-1',
        url: 'https://example.com',
        tools: [
          { name: 'echo', description: 'Echo tool' },
          { name: 'greet', description: 'Greeting tool' },
        ],
      });

      // Wait for tools to appear in the registry
      await waitFor(() => (server.registry.listTools().length >= 2 ? true : undefined));

      // Start a client relay pointing at the server's port
      const client = new RelayBridgeServer({
        host: '127.0.0.1',
        port: server.port,
        allowedOrigins: ['*'],
        persistPath,
      });

      await client.start();
      expect(client.mode).toBe('client');

      // Wait for the client to receive tool data
      const clientTools = await waitFor(() => {
        const tools = client.listToolsFromRelay();
        return tools.length >= 2 ? tools : undefined;
      });

      expect(clientTools.some((t) => t.name.includes('echo'))).toBe(true);
      expect(clientTools.some((t) => t.name.includes('greet'))).toBe(true);

      ws.close();
      await client.stop();
    } finally {
      await server.stop();
    }
  });

  it('proxies tool invocations through the server relay', async () => {
    const server = new RelayBridgeServer({
      host: '127.0.0.1',
      port: 0,
      allowedOrigins: ['*'],
      invokeTimeoutMs: 2000,
    });

    try {
      await server.start();

      // Connect a browser source with a tool
      const ws = await connectAndRegister(server, {
        tabId: 'tab-1',
        url: 'https://example.com',
        tools: [{ name: 'echo', description: 'Echo tool' }],
      });

      // Set up browser source to respond to invocations
      ws.on('message', (raw) => {
        const msg = JSON.parse(String(raw));
        if (msg.type !== 'invoke') return;
        ws.send(
          JSON.stringify({
            type: 'result',
            callId: msg.callId,
            result: {
              content: [{ type: 'text', text: `Echo:${msg.args?.message ?? ''}` }],
            },
          })
        );
      });

      await waitFor(() => (server.registry.listTools().length >= 1 ? true : undefined));

      // Start client relay
      const client = new RelayBridgeServer({
        host: '127.0.0.1',
        port: server.port,
        allowedOrigins: ['*'],
        persistPath,
        invokeTimeoutMs: 2000,
      });

      await client.start();
      expect(client.mode).toBe('client');

      // Wait for tools to arrive at the client
      const clientTools = await waitFor(() => {
        const tools = client.listToolsFromRelay();
        return tools.length >= 1 ? tools : undefined;
      });
      const firstClientTool = clientTools[0];
      if (!firstClientTool) {
        throw new Error('Expected at least one relayed tool');
      }

      // Invoke the tool through the client relay
      const toolName = firstClientTool.name;
      const result = await client.invokeTool(toolName, { message: 'hello' });
      const text = (result.content?.[0] as { text?: string } | undefined)?.text;
      expect(text).toBe('Echo:hello');

      ws.close();
      await client.stop();
    } finally {
      await server.stop();
    }
  });

  it('defaults relay/invoke args to {} when omitted', async () => {
    const server = new RelayBridgeServer({
      host: '127.0.0.1',
      port: 0,
      allowedOrigins: ['*'],
      invokeTimeoutMs: 2000,
    });

    try {
      await server.start();

      const ws = await connectAndRegister(server, {
        tabId: 'tab-1',
        url: 'https://example.com',
        tools: [{ name: 'echo', description: 'Echo tool' }],
      });

      ws.on('message', (raw) => {
        const msg = JSON.parse(String(raw));
        if (msg.type !== 'invoke') return;
        ws.send(
          JSON.stringify({
            type: 'result',
            callId: msg.callId,
            result: {
              content: [{ type: 'text', text: `keys:${Object.keys(msg.args ?? {}).length}` }],
            },
          })
        );
      });

      const toolName = await waitFor(() => server.registry.listTools()[0]?.name);
      if (!toolName) {
        throw new Error('Expected server tool name');
      }

      const relayClient = new WebSocket(`ws://127.0.0.1:${server.port}`, 'webmcp-relay.v1');
      await new Promise<void>((resolve, reject) => {
        relayClient.once('open', () => resolve());
        relayClient.once('error', reject);
      });

      relayClient.send(JSON.stringify({ type: 'relay/hello' }));

      const resultPromise = new Promise<{
        type: string;
        callId: string;
        result: { content?: unknown[] };
      }>((resolve) => {
        relayClient.on('message', (raw) => {
          const msg = JSON.parse(String(raw));
          if (msg.type === 'relay/result' && msg.callId === 'call-1') {
            resolve(msg);
          }
        });
      });

      relayClient.send(
        JSON.stringify({
          type: 'relay/invoke',
          callId: 'call-1',
          toolName,
        })
      );

      const relayResult = await resultPromise;
      const text = (relayResult.result.content?.[0] as { text?: string } | undefined)?.text ?? '';
      expect(text).toBe('keys:0');

      relayClient.close();
      ws.close();
    } finally {
      await server.stop();
    }
  });

  it('receives tools-changed pushes from the server relay', async () => {
    const server = new RelayBridgeServer({
      host: '127.0.0.1',
      port: 0,
      allowedOrigins: ['*'],
    });

    try {
      await server.start();

      // Connect browser source with initial tools
      const ws = await connectAndRegister(server, {
        tabId: 'tab-1',
        url: 'https://example.com',
        tools: [{ name: 'tool_a', description: 'Tool A' }],
      });

      await waitFor(() => (server.registry.listTools().length >= 1 ? true : undefined));

      // Start client relay
      const client = new RelayBridgeServer({
        host: '127.0.0.1',
        port: server.port,
        allowedOrigins: ['*'],
        persistPath,
      });

      await client.start();
      expect(client.mode).toBe('client');

      // Wait for initial tool list
      await waitFor(() => {
        const tools = client.listToolsFromRelay();
        return tools.length >= 1 ? true : undefined;
      });

      // Send tools/changed from browser, replacing tool_a with tool_b
      ws.send(
        JSON.stringify({
          type: 'tools/changed',
          tools: [{ name: 'tool_b', description: 'Tool B' }],
        })
      );

      // Wait for client to receive the updated tools
      const updatedTools = await waitFor(() => {
        const tools = client.listToolsFromRelay();
        const hasB = tools.some((t) => t.name.includes('tool_b'));
        return hasB ? tools : undefined;
      });

      expect(updatedTools.some((t) => t.name.includes('tool_a'))).toBe(false);
      expect(updatedTools.some((t) => t.name.includes('tool_b'))).toBe(true);

      ws.close();
      await client.stop();
    } finally {
      await server.stop();
    }
  });

  it('rejects invocations when not connected to the server relay', async () => {
    const server = new RelayBridgeServer({
      host: '127.0.0.1',
      port: 0,
      allowedOrigins: ['*'],
    });

    try {
      await server.start();

      const client = new RelayBridgeServer({
        host: '127.0.0.1',
        port: server.port,
        allowedOrigins: ['*'],
        persistPath,
        invokeTimeoutMs: 500,
      });

      await client.start();
      expect(client.mode).toBe('client');

      // Stop the server to break the connection
      await server.stop();
      // Wait for the client's close event to fire
      await new Promise((resolve) => setTimeout(resolve, 100));

      await expect(client.invokeTool('some_tool', {})).rejects.toThrow(
        /Not connected to relay server/
      );

      await client.stop();
    } finally {
      // server already stopped
    }
  });

  it('receives source metadata from the server relay', async () => {
    const server = new RelayBridgeServer({
      host: '127.0.0.1',
      port: 0,
      allowedOrigins: ['*'],
    });

    try {
      await server.start();

      const ws = await connectAndRegister(server, {
        tabId: 'tab-src',
        url: 'https://example.com/page',
        tools: [{ name: 'echo', description: 'Echo tool' }],
      });

      await waitFor(() => (server.registry.listTools().length >= 1 ? true : undefined));

      const client = new RelayBridgeServer({
        host: '127.0.0.1',
        port: server.port,
        allowedOrigins: ['*'],
        persistPath,
      });

      await client.start();
      expect(client.mode).toBe('client');

      const clientSources = await waitFor(() => {
        const sources = client.listSourcesFromRelay();
        return sources.length > 0 ? sources : undefined;
      });

      expect(clientSources[0]?.tabId).toBe('tab-src');
      expect(clientSources[0]?.url).toBe('https://example.com/page');
      expect(clientSources[0]?.toolCount).toBe(1);

      const sourceMap = client.getToolSourceMapFromRelay();
      const mapValues = Object.values(sourceMap);
      expect(mapValues.length).toBeGreaterThan(0);
      expect(mapValues[0]?.length).toBeGreaterThan(0);

      ws.close();
      await client.stop();
    } finally {
      await server.stop();
    }
  });

  it('clears source metadata on disconnect', async () => {
    const server = new RelayBridgeServer({
      host: '127.0.0.1',
      port: 0,
      allowedOrigins: ['*'],
    });

    try {
      await server.start();

      await connectAndRegister(server, {
        tabId: 'tab-1',
        url: 'https://example.com',
        tools: [{ name: 'tool_a' }],
      });

      await waitFor(() => (server.registry.listTools().length >= 1 ? true : undefined));

      const client = new RelayBridgeServer({
        host: '127.0.0.1',
        port: server.port,
        allowedOrigins: ['*'],
        persistPath,
      });

      await client.start();
      await waitFor(() => {
        const sources = client.listSourcesFromRelay();
        return sources.length > 0 ? sources : undefined;
      });

      // Stop the server; client should clear source data
      await server.stop();
      await new Promise((resolve) => setTimeout(resolve, 200));

      expect(client.listSourcesFromRelay()).toEqual([]);
      expect(client.getToolSourceMapFromRelay()).toEqual({});

      await client.stop();
    } finally {
      await server.stop().catch((e) => console.warn('[test cleanup] server.stop():', e));
    }
  });

  it('returns empty from listToolsFromRelay and source accessors when in server mode', async () => {
    const bridge = new RelayBridgeServer({
      host: '127.0.0.1',
      port: 0,
      allowedOrigins: ['*'],
    });

    try {
      await bridge.start();
      expect(bridge.mode).toBe('server');
      expect(bridge.listToolsFromRelay()).toEqual([]);
      expect(bridge.listSourcesFromRelay()).toEqual([]);
      expect(bridge.getToolSourceMapFromRelay()).toEqual({});
    } finally {
      await bridge.stop();
    }
  });

  it('promotes from client to server mode when the server disappears', async () => {
    const server = new RelayBridgeServer({
      host: '127.0.0.1',
      port: 0,
      allowedOrigins: ['*'],
    });

    try {
      await server.start();
      expect(server.mode).toBe('server');
      const port = server.port;

      // Start client pointing at the server
      const client = new RelayBridgeServer({
        host: '127.0.0.1',
        port,
        allowedOrigins: ['*'],
        persistPath,
      });

      await client.start();
      expect(client.mode).toBe('client');

      // Kill the server; client should eventually promote to server
      await server.stop();

      // Wait for the client to become a server
      await waitFor(() => (client.mode === 'server' ? true : undefined), 5000);
      expect(client.mode).toBe('server');
      expect(client.port).toBe(port);

      // Verify the promoted server accepts browser connections
      const ws = await connectAndRegister(client, {
        tabId: 'promoted-tab',
        url: 'https://example.com',
        tools: [{ name: 'promoted_tool', description: 'Tool after promotion' }],
      });

      await waitFor(() => (client.registry.listTools().length >= 1 ? true : undefined));
      expect(client.registry.listTools().some((t) => t.name === 'promoted_tool')).toBe(true);

      ws.close();
      await client.stop();
    } finally {
      await server.stop().catch((e) => console.warn('[test cleanup] server.stop():', e));
    }
  });

  it('rejects invalid constructor options', () => {
    const cases: Array<[ConstructorParameters<typeof RelayBridgeServer>[0], RegExp]> = [
      [{ port: -1 }, /Invalid port/],
      [{ port: 70000 }, /Invalid port/],
      [{ port: Number.NaN }, /Invalid port/],
      [{ port: 9333.5 }, /Invalid port/],
      [{ port: 9333, portRangeEnd: 9332 }, /Invalid port range/],
      [{ portRangeEnd: Number.NaN }, /Invalid port range/],
      [{ portRangeEnd: 9333.5 }, /Invalid port range/],
      [{ maxPayloadBytes: 0 }, /Invalid maxPayloadBytes/],
      [{ maxPayloadBytes: -5 }, /Invalid maxPayloadBytes/],
      [{ maxPayloadBytes: 1.5 }, /Invalid maxPayloadBytes/],
      [{ invokeTimeoutMs: 0 }, /Invalid invokeTimeoutMs/],
      [{ invokeTimeoutMs: -100 }, /Invalid invokeTimeoutMs/],
      [{ invokeTimeoutMs: Number.NaN }, /Invalid invokeTimeoutMs/],
      [{ invokeTimeoutMs: 1.5 }, /Invalid invokeTimeoutMs/],
    ];

    for (const [options, error] of cases) {
      expect(() => new RelayBridgeServer(options)).toThrow(error);
    }
  });

  it('allows port 0 for auto-assignment', async () => {
    const bridge = new RelayBridgeServer({ port: 0 });
    try {
      await bridge.start();
      expect(bridge.port).toBeGreaterThan(0);
    } finally {
      await bridge.stop();
    }
  });

  it('cleans up pending client invocations on stop', async () => {
    const server = new RelayBridgeServer({
      host: '127.0.0.1',
      port: 0,
      allowedOrigins: ['*'],
    });

    try {
      await server.start();

      // Connect a browser source that never responds
      await connectAndRegister(server, {
        tabId: 'tab-1',
        url: 'https://example.com',
        tools: [{ name: 'hang_tool' }],
      });

      await waitFor(() => (server.registry.listTools().length >= 1 ? true : undefined));

      const client = new RelayBridgeServer({
        host: '127.0.0.1',
        port: server.port,
        allowedOrigins: ['*'],
        persistPath,
        invokeTimeoutMs: 5000,
      });

      await client.start();
      expect(client.mode).toBe('client');

      const clientTools = await waitFor(() => {
        const tools = client.listToolsFromRelay();
        return tools.length >= 1 ? tools : undefined;
      });
      const firstClientTool = clientTools[0];
      if (!firstClientTool) {
        throw new Error('Expected at least one relayed tool');
      }

      // Start an invocation that will never complete
      const invokePromise = client.invokeTool(firstClientTool.name, {});

      // Stop the client; should reject the pending invocation
      await client.stop();

      await expect(invokePromise).rejects.toThrow(/Relay client stopped/);
    } finally {
      await server.stop();
    }
  });

  it('emits stateChanged only once when socket error triggers both error and close', async () => {
    const bridge = new RelayBridgeServer({
      host: '127.0.0.1',
      port: 0,
      allowedOrigins: ['*'],
    });

    try {
      await bridge.start();

      const ws = await connectAndRegister(bridge, {
        tabId: 'tab-double-close',
        url: 'https://example.com',
        tools: [{ name: 'tool_a', description: 'A tool' }],
      });

      await waitFor(() => bridge.registry.listTools()[0]?.name);

      let stateChangedCount = 0;
      bridge.on('stateChanged', () => {
        stateChangedCount++;
      });

      ws.terminate();

      await waitFor(() => (bridge.registry.listSources().length === 0 ? true : undefined));
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(stateChangedCount).toBe(1);
    } finally {
      await bridge.stop();
    }
  });

  it('rejects pending invocations with payload-exceeded error when browser sends oversized result', async () => {
    // Use a tiny maxPayloadBytes to trigger the 1009 close code.
    const server = new RelayBridgeServer({
      host: '127.0.0.1',
      port: 0,
      allowedOrigins: ['*'],
      maxPayloadBytes: 256,
      invokeTimeoutMs: 5000,
    });

    try {
      await server.start();

      const ws = await connectAndRegister(server, {
        tabId: 'tab-payload',
        url: 'https://example.com',
        tools: [{ name: 'big_response', description: 'Returns large data' }],
      });

      // When invoked, respond with a payload that exceeds maxPayloadBytes.
      ws.on('message', (raw) => {
        const msg = JSON.parse(String(raw));
        if (msg.type !== 'invoke') return;
        const oversizedText = 'x'.repeat(1024);
        ws.send(
          JSON.stringify({
            type: 'result',
            callId: msg.callId,
            result: { content: [{ type: 'text', text: oversizedText }] },
          })
        );
      });

      await waitFor(() => (server.registry.listTools().length >= 1 ? true : undefined));

      const invokePromise = server.invokeTool('big_response', {});

      await expect(invokePromise).rejects.toThrow(/exceeded maximum payload size/);
    } finally {
      await server.stop();
    }
  });

  it('answers relay/invoke for an unknown tool with an error result instead of hanging', async () => {
    const server = new RelayBridgeServer({
      host: '127.0.0.1',
      port: 0,
      allowedOrigins: ['*'],
      invokeTimeoutMs: 60_000,
    });

    try {
      await server.start();

      const relayClient = new WebSocket(`ws://127.0.0.1:${server.port}`, 'webmcp-relay.v1');
      await new Promise<void>((resolve, reject) => {
        relayClient.once('open', () => resolve());
        relayClient.once('error', reject);
      });

      relayClient.send(JSON.stringify({ type: 'relay/hello' }));

      const resultPromise = new Promise<{
        callId: string;
        result: { isError?: boolean; content?: unknown[] };
      }>((resolve, reject) => {
        const timer = setTimeout(() => {
          reject(new Error('Timed out waiting for relay/result'));
        }, 2000);
        relayClient.on('message', (raw) => {
          const msg = JSON.parse(String(raw));
          if (msg.type === 'relay/result' && msg.callId === 'call-missing') {
            clearTimeout(timer);
            resolve(msg);
          }
        });
      });

      relayClient.send(
        JSON.stringify({
          type: 'relay/invoke',
          callId: 'call-missing',
          toolName: 'no_such_tool',
          args: {},
        })
      );

      const relayResult = await resultPromise;
      expect(relayResult.result.isError).toBe(true);
      const text = (relayResult.result.content?.[0] as { text?: string } | undefined)?.text ?? '';
      expect(text).toMatch(/No active browser source provides tool "no_such_tool"/);

      relayClient.close();
    } finally {
      await server.stop();
    }
  });
});
