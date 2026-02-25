import { describe, expect, it } from 'vitest';
import WebSocket from 'ws';

import { RelayBridgeServer } from './bridgeServer.js';

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
    const ws = new WebSocket(`ws://127.0.0.1:${bridge.port}`, {
      headers: { origin: options.origin ?? new URL(options.url).origin },
    });
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

describe('RelayBridgeServer', () => {
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

  it('times out when the tab does not return a result', async () => {
    const bridge = new RelayBridgeServer({
      host: '127.0.0.1',
      port: 0,
      allowedOrigins: ['*'],
      invokeTimeoutMs: 50,
    });

    try {
      await bridge.start();

      const ws = await connectAndRegister(bridge, {
        tabId: 'tab-1',
        url: 'https://example.com',
        tools: [{ name: 'slow_tool' }],
      });

      const toolName = await waitFor(() => bridge.registry.listTools()[0]?.name);

      await expect(bridge.invokeTool(toolName, {})).rejects.toThrow(/timed out/i);

      ws.close();
    } finally {
      await bridge.stop();
    }
  });

  it('rejects connections from disallowed origins', async () => {
    const bridge = new RelayBridgeServer({
      host: '127.0.0.1',
      port: 0,
      allowedOrigins: ['https://trusted.example.com'],
    });

    try {
      await bridge.start();

      const ws = new WebSocket(`ws://127.0.0.1:${bridge.port}`, {
        headers: { origin: 'https://evil.example.com' },
      });

      const closeCode = await new Promise<number>((resolve) => {
        ws.on('close', (code) => resolve(code));
      });

      expect(closeCode).toBe(1008);
    } finally {
      await bridge.stop();
    }
  });

  it('allows connections from explicitly allowed origins', async () => {
    const bridge = new RelayBridgeServer({
      host: '127.0.0.1',
      port: 0,
      allowedOrigins: ['https://trusted.example.com'],
    });

    try {
      await bridge.start();

      const ws = new WebSocket(`ws://127.0.0.1:${bridge.port}`, {
        headers: { origin: 'https://trusted.example.com' },
      });

      await new Promise<void>((resolve, reject) => {
        ws.once('open', () => resolve());
        ws.once('error', reject);
      });

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
    ws.close();
  });

  it('wraps invalid tool results as MCP errors', async () => {
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
        tools: [{ name: 'bad_result_tool', description: 'Returns malformed content blocks' }],
      });

      ws.on('message', (raw) => {
        const msg = JSON.parse(String(raw));
        if (msg.type !== 'invoke') {
          return;
        }

        ws.send(
          JSON.stringify({
            type: 'result',
            callId: msg.callId,
            result: {
              content: [42, null],
            },
          })
        );
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

  it('rejects connections with no origin when origins are restricted', async () => {
    const bridge = new RelayBridgeServer({
      host: '127.0.0.1',
      port: 0,
      allowedOrigins: ['https://trusted.example.com'],
    });

    try {
      await bridge.start();

      const ws = new WebSocket(`ws://127.0.0.1:${bridge.port}`);

      const closeCode = await new Promise<number>((resolve) => {
        ws.on('close', (code) => resolve(code));
      });

      expect(closeCode).toBe(1008);
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

  it('rejects start() when the port is already in use', async () => {
    const bridge1 = new RelayBridgeServer({
      host: '127.0.0.1',
      port: 0,
      allowedOrigins: ['*'],
    });

    await bridge1.start();
    const usedPort = bridge1.port;

    const bridge2 = new RelayBridgeServer({
      host: '127.0.0.1',
      port: usedPort,
      allowedOrigins: ['*'],
    });

    await expect(bridge2.start()).rejects.toThrow(/EADDRINUSE/);

    await bridge1.stop();
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

      const result = await bridge.invokeTool(toolName, {}, { sourceId: source?.sourceId });
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

  it('does not reject pending invocations from a different connection when one disconnects', async () => {
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

      // Set up ws1 to respond to invocations after a short delay
      ws1.on('message', (raw) => {
        const msg = JSON.parse(String(raw));
        if (msg.type !== 'invoke') return;
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

      // Start invocation on ws1's tool
      const invokePromise = bridge.invokeTool(toolAName, {});

      // Disconnect ws2 while ws1's invocation is pending
      await new Promise((resolve) => setTimeout(resolve, 20));
      ws2.close();

      // ws1's invocation should still complete successfully
      const result = await invokePromise;
      const text = (result.content?.[0] as { text?: string } | undefined)?.text;
      expect(text).toBe('ok-a');

      ws1.close();
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

      ws.send('not json at all');
      ws.send(JSON.stringify({ type: 'invalid_type', foo: 'bar' }));

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
});
