import { describe, expect, it } from 'vitest';
import WebSocket from 'ws';

import { RelayBridgeServer } from './bridgeServer.js';

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

      // Start invocation but close socket before responding
      const invokePromise = bridge.invokeTool(toolName, {});

      // Give the invoke message time to be sent, then disconnect
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

      // Send garbage, then valid messages
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
