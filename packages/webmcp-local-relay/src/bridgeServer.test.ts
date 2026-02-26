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
    });

    await bridge2.start();
    expect(bridge2.mode).toBe('client');

    await bridge2.stop();
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

// ---------------------------------------------------------------------------
// Client mode (relay-to-relay) integration tests
// ---------------------------------------------------------------------------

describe('RelayBridgeServer client mode', () => {
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

  it('returns empty tools from listToolsFromRelay when in server mode', async () => {
    const bridge = new RelayBridgeServer({
      host: '127.0.0.1',
      port: 0,
      allowedOrigins: ['*'],
    });

    try {
      await bridge.start();
      expect(bridge.mode).toBe('server');
      expect(bridge.listToolsFromRelay()).toEqual([]);
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
      });

      await client.start();
      expect(client.mode).toBe('client');

      // Kill the server — client should eventually promote to server
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
      await server.stop().catch(() => {});
    }
  });

  it('rejects invalid constructor options', () => {
    expect(() => new RelayBridgeServer({ port: -1 })).toThrow(/Invalid port/);
    expect(() => new RelayBridgeServer({ port: 70000 })).toThrow(/Invalid port/);
    expect(() => new RelayBridgeServer({ maxPayloadBytes: 0 })).toThrow(/Invalid maxPayloadBytes/);
    expect(() => new RelayBridgeServer({ maxPayloadBytes: -5 })).toThrow(/Invalid maxPayloadBytes/);
    expect(() => new RelayBridgeServer({ invokeTimeoutMs: 0 })).toThrow(/Invalid invokeTimeoutMs/);
    expect(() => new RelayBridgeServer({ invokeTimeoutMs: -100 })).toThrow(
      /Invalid invokeTimeoutMs/
    );
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

  it('wraps null tool results as MCP errors', async () => {
    const bridge = new RelayBridgeServer({
      host: '127.0.0.1',
      port: 0,
      allowedOrigins: ['*'],
      invokeTimeoutMs: 500,
    });

    try {
      await bridge.start();

      const ws = await connectAndRegister(bridge, {
        tabId: 'tab-null',
        url: 'https://example.com',
        tools: [{ name: 'null_result_tool' }],
      });

      ws.on('message', (raw) => {
        const msg = JSON.parse(String(raw));
        if (msg.type !== 'invoke') return;
        ws.send(
          JSON.stringify({
            type: 'result',
            callId: msg.callId,
            result: null,
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

  it('wraps string tool results as MCP errors', async () => {
    const bridge = new RelayBridgeServer({
      host: '127.0.0.1',
      port: 0,
      allowedOrigins: ['*'],
      invokeTimeoutMs: 500,
    });

    try {
      await bridge.start();

      const ws = await connectAndRegister(bridge, {
        tabId: 'tab-str',
        url: 'https://example.com',
        tools: [{ name: 'string_result_tool' }],
      });

      ws.on('message', (raw) => {
        const msg = JSON.parse(String(raw));
        if (msg.type !== 'invoke') return;
        ws.send(
          JSON.stringify({
            type: 'result',
            callId: msg.callId,
            result: 'just a string',
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

      // Stop the client — should reject the pending invocation
      await client.stop();

      await expect(invokePromise).rejects.toThrow(/Relay client stopped/);
    } finally {
      await server.stop();
    }
  });
});
