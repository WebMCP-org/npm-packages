import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { describe, expect, it } from 'vitest';
import WebSocket from 'ws';

import { RelayBridgeServer } from './bridgeServer.js';
import { LocalRelayMcpServer } from './mcpRelayServer.js';

/**
 * Polls until `fn` returns a defined value.
 */
async function waitFor<T>(
  fn: () => T | undefined | Promise<T | undefined>,
  timeoutMs = 2500
): Promise<T> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const value = await fn();
    if (value !== undefined) {
      return value;
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error('Timed out waiting for condition');
}

/**
 * Creates a running relay + in-memory MCP client pair.
 */
async function createConnectedRelay(options?: { invokeTimeoutMs?: number }): Promise<{
  relay: LocalRelayMcpServer;
  bridge: RelayBridgeServer;
  client: Client;
  cleanup: () => Promise<void>;
}> {
  const bridge = new RelayBridgeServer({
    host: '127.0.0.1',
    port: 0,
    allowedOrigins: ['*'],
    invokeTimeoutMs: options?.invokeTimeoutMs ?? 500,
  });
  const relay = new LocalRelayMcpServer({ bridge });
  await relay.start();

  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'test-client', version: '1.0.0' });
  await relay.connect(serverTransport);
  await client.connect(clientTransport);

  return {
    relay,
    bridge,
    client,
    cleanup: async () => {
      await client.close();
      await relay.stop();
    },
  };
}

/**
 * Connects a browser websocket fixture and optionally handles invoke calls.
 */
async function connectBrowser(
  bridge: RelayBridgeServer,
  options: {
    tabId: string;
    url: string;
    tools: { name: string; description?: string }[];
    onInvoke?: (msg: {
      callId: string;
      toolName: string;
      args?: Record<string, unknown>;
    }) => unknown;
  }
): Promise<WebSocket> {
  const ws = new WebSocket(`ws://127.0.0.1:${bridge.port}`);
  await new Promise<void>((resolve, reject) => {
    ws.once('open', () => resolve());
    ws.once('error', reject);
  });

  if (options.onInvoke) {
    const handler = options.onInvoke;
    ws.on('message', (raw) => {
      const msg = JSON.parse(String(raw));
      if (msg.type !== 'invoke') return;
      const response = handler(msg);
      if (response) {
        ws.send(JSON.stringify(response));
      }
    });
  }

  ws.send(
    JSON.stringify({
      type: 'hello',
      tabId: options.tabId,
      url: options.url,
      origin: new URL(options.url).origin,
    })
  );
  ws.send(JSON.stringify({ type: 'tools/list', tools: options.tools }));

  return ws;
}

describe('LocalRelayMcpServer', () => {
  it('removes dynamic tools after a browser source disconnects', async () => {
    const bridge = new RelayBridgeServer({
      host: '127.0.0.1',
      port: 0,
      allowedOrigins: ['*'],
      invokeTimeoutMs: 500,
    });
    const relay = new LocalRelayMcpServer({ bridge });

    await relay.start();

    const ws = new WebSocket(`ws://127.0.0.1:${bridge.port}`);
    await new Promise<void>((resolve, reject) => {
      ws.once('open', () => resolve());
      ws.once('error', reject);
    });

    ws.send(
      JSON.stringify({
        type: 'hello',
        tabId: 'tab-abc',
        url: 'https://acme.example.com/dashboard',
        origin: 'https://acme.example.com',
      })
    );
    ws.send(
      JSON.stringify({
        type: 'tools/list',
        tools: [{ name: 'search_docs', description: 'Search docs' }],
      })
    );

    await waitFor(() => {
      const names = relay.listDynamicToolNames();
      return names.length > 0 ? names[0] : undefined;
    });

    ws.close();
    await waitFor(() => {
      const names = relay.listDynamicToolNames();
      return names.length === 0 ? true : undefined;
    });

    await relay.stop();
  });

  it('updates a dynamic tool when the browser changes its signature', async () => {
    const bridge = new RelayBridgeServer({
      host: '127.0.0.1',
      port: 0,
      allowedOrigins: ['*'],
      invokeTimeoutMs: 500,
    });
    const relay = new LocalRelayMcpServer({ bridge });

    await relay.start();

    const ws = new WebSocket(`ws://127.0.0.1:${bridge.port}`);
    await new Promise<void>((resolve, reject) => {
      ws.once('open', () => resolve());
      ws.once('error', reject);
    });

    ws.send(
      JSON.stringify({
        type: 'hello',
        tabId: 'tab-abc',
        url: 'https://acme.example.com/dashboard',
        origin: 'https://acme.example.com',
      })
    );
    ws.send(
      JSON.stringify({
        type: 'tools/list',
        tools: [{ name: 'search_docs', description: 'Search docs v1' }],
      })
    );

    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: 'test-client', version: '1.0.0' });
    await relay.connect(serverTransport);
    await client.connect(clientTransport);

    const dynamicToolName = await waitFor(() => {
      const tools = relay.bridge.registry.listTools();
      return tools[0]?.name;
    });

    await waitFor(async () => {
      const list = await client.listTools();
      const tool = list.tools.find((entry) => entry.name === dynamicToolName);
      return tool?.description?.includes('Search docs v1') ? true : undefined;
    });

    ws.send(
      JSON.stringify({
        type: 'tools/changed',
        tools: [{ name: 'search_docs', description: 'Search docs v2' }],
      })
    );

    await waitFor(async () => {
      const list = await client.listTools();
      const tool = list.tools.find((entry) => entry.name === dynamicToolName);
      return tool?.description?.includes('Search docs v2') ? true : undefined;
    });

    await client.close();
    ws.close();
    await relay.stop();
  });

  it('exposes dynamic relayed tools and executes them end-to-end', async () => {
    const bridge = new RelayBridgeServer({
      host: '127.0.0.1',
      port: 0,
      allowedOrigins: ['*'],
      invokeTimeoutMs: 500,
    });
    const relay = new LocalRelayMcpServer({ bridge });

    await relay.start();

    const ws = new WebSocket(`ws://127.0.0.1:${bridge.port}`);
    await new Promise<void>((resolve, reject) => {
      ws.once('open', () => resolve());
      ws.once('error', reject);
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
            content: [{ type: 'text', text: `OK:${msg.args?.query ?? ''}` }],
          },
        })
      );
    });

    ws.send(
      JSON.stringify({
        type: 'hello',
        tabId: 'tab-abc',
        url: 'https://acme.example.com/dashboard',
        origin: 'https://acme.example.com',
      })
    );
    ws.send(
      JSON.stringify({
        type: 'tools/list',
        tools: [{ name: 'search_docs', description: 'Search docs' }],
      })
    );

    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: 'test-client', version: '1.0.0' });

    await relay.connect(serverTransport);
    await client.connect(clientTransport);

    const dynamicToolName = await waitFor(() => {
      const tools = relay.bridge.registry.listTools();
      return tools[0]?.name;
    });

    await waitFor(() => {
      const tools = relay.listDynamicToolNames();
      return tools.includes(dynamicToolName) ? true : undefined;
    });

    const list = await client.listTools();
    expect(list.tools.some((tool) => tool.name === dynamicToolName)).toBe(true);

    const result = await client.callTool({
      name: dynamicToolName,
      arguments: { query: 'webmcp' },
    });

    const text = (result.content?.[0] as { text?: string } | undefined)?.text;
    expect(text).toBe('OK:webmcp');

    await client.close();
    ws.close();
    await relay.stop();
  });

  it('throws when connect() is called twice', async () => {
    const { relay, cleanup } = await createConnectedRelay();

    const [clientTransport2] = InMemoryTransport.createLinkedPair();
    await expect(relay.connect(clientTransport2)).rejects.toThrow(
      /MCP server transport already connected/
    );

    await cleanup();
  });

  it('stop handles mcpServer.close() errors gracefully', async () => {
    const bridge = new RelayBridgeServer({
      host: '127.0.0.1',
      port: 0,
      allowedOrigins: ['*'],
    });
    const relay = new LocalRelayMcpServer({ bridge });
    await relay.start();

    // stop without connect — mcpServer.close() may fail but stop should not throw
    await relay.stop();
  });

  describe('webmcp_list_sources', () => {
    it('returns connected sources with metadata', async () => {
      const { bridge, client, cleanup } = await createConnectedRelay();

      const ws = await connectBrowser(bridge, {
        tabId: 'tab-src',
        url: 'https://example.com/page',
        tools: [{ name: 'tool_a' }],
      });

      await waitFor(() => bridge.registry.listTools()[0]?.name);

      const result = await client.callTool({
        name: 'webmcp_list_sources',
        arguments: {},
      });

      const text = (result.content as { type: string; text: string }[])[0].text;
      expect(text).toContain('tab-src');
      expect(text).toContain('"count": 1');

      ws.close();
      await cleanup();
    });
  });

  describe('webmcp_list_tools', () => {
    it('returns available tools with descriptions', async () => {
      const { bridge, client, cleanup } = await createConnectedRelay();

      const ws = await connectBrowser(bridge, {
        tabId: 'tab-tools',
        url: 'https://example.com/page',
        tools: [{ name: 'search', description: 'Search things' }],
      });

      await waitFor(() => bridge.registry.listTools()[0]?.name);

      const result = await client.callTool({
        name: 'webmcp_list_tools',
        arguments: {},
      });

      const text = (result.content as { type: string; text: string }[])[0].text;
      expect(text).toContain('search');
      expect(text).toContain('Search things');

      ws.close();
      await cleanup();
    });
  });

  describe('webmcp_call_tool', () => {
    it('invokes a browser tool by name and appends available tools summary', async () => {
      const { bridge, client, cleanup } = await createConnectedRelay();

      const ws = await connectBrowser(bridge, {
        tabId: 'tab-1',
        url: 'https://example.com',
        tools: [{ name: 'greet', description: 'Greet someone' }],
        onInvoke: (msg) => ({
          type: 'result',
          callId: msg.callId,
          result: {
            content: [{ type: 'text', text: `Hello ${msg.args?.name ?? 'world'}` }],
          },
        }),
      });

      const toolName = await waitFor(() => bridge.registry.listTools()[0]?.name);

      const result = await client.callTool({
        name: 'webmcp_call_tool',
        arguments: { name: toolName, arguments: { name: 'Alice' } },
      });

      const texts = (result.content as { type: string; text: string }[]).map((c) => c.text);
      const combined = texts.join('\n');

      expect(combined).toContain('Hello Alice');
      expect(combined).toContain('Available tools:');
      expect(combined).toContain(toolName);
      expect(result.isError).toBeFalsy();

      ws.close();
      await cleanup();
    });

    it('returns error with available tools list when tool name not found', async () => {
      const { bridge, client, cleanup } = await createConnectedRelay();

      const ws = await connectBrowser(bridge, {
        tabId: 'tab-1',
        url: 'https://example.com',
        tools: [{ name: 'real_tool', description: 'A real tool' }],
      });

      await waitFor(() => bridge.registry.listTools()[0]?.name);

      const result = await client.callTool({
        name: 'webmcp_call_tool',
        arguments: { name: 'nonexistent_tool' },
      });

      const text = (result.content as { type: string; text: string }[])[0].text;
      expect(text).toContain('Tool "nonexistent_tool" not found');
      expect(text).toContain('Available tools:');
      expect(text).toContain('real_tool');
      expect(result.isError).toBe(true);

      ws.close();
      await cleanup();
    });

    it('returns error with no-tools message when nothing is connected', async () => {
      const { client, cleanup } = await createConnectedRelay();

      const result = await client.callTool({
        name: 'webmcp_call_tool',
        arguments: { name: 'some_tool' },
      });

      const text = (result.content as { type: string; text: string }[])[0].text;
      expect(text).toContain('Tool "some_tool" not found');
      expect(text).toContain('No tools are currently available');
      expect(result.isError).toBe(true);

      await cleanup();
    });

    it('is always listed as a static tool even with no browser sources', async () => {
      const { client, cleanup } = await createConnectedRelay();

      const list = await client.listTools();
      const names = list.tools.map((t) => t.name);

      expect(names).toContain('webmcp_call_tool');
      expect(names).toContain('webmcp_list_tools');
      expect(names).toContain('webmcp_list_sources');

      await cleanup();
    });
  });
});
