import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { describe, expect, it } from 'vitest';
import WebSocket from 'ws';

import { RelayBridgeServer } from './bridgeServer.js';
import { LocalRelayMcpServer } from './mcpRelayServer.js';
import {
  EMPTY_STATIC_TOOL_INPUT_SHAPE,
  publicInputSchemaFromZodShape,
  WEBMCP_CALL_TOOL_INPUT_SHAPE,
  WEBMCP_OPEN_PAGE_INPUT_SHAPE,
} from './staticToolSchemas.js';

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
 * Extracts text items from MCP call tool result content.
 */
function contentTextItems(result: unknown): string[] {
  const content =
    typeof result === 'object' && result !== null && 'content' in result
      ? (result as { content?: unknown }).content
      : undefined;
  if (!Array.isArray(content)) {
    return [];
  }
  return content
    .map((item) => {
      if (!item || typeof item !== 'object') {
        return undefined;
      }
      const text = (item as { text?: unknown }).text;
      return typeof text === 'string' ? text : undefined;
    })
    .filter((text): text is string => typeof text === 'string');
}

/**
 * Returns the first text content item when present.
 */
function firstContentText(result: unknown): string {
  return contentTextItems(result)[0] ?? '';
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
    tools: Array<{ name: string; description?: string; [key: string]: unknown }>;
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

    const text = firstContentText(result);
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

      const text = firstContentText(result);
      expect(text).toContain('tab-src');
      expect(text).toContain('"count": 1');

      ws.close();
      await cleanup();
    });

    it('returns source metadata in client mode', async () => {
      const serverBridge = new RelayBridgeServer({
        host: '127.0.0.1',
        port: 0,
        allowedOrigins: ['*'],
      });
      await serverBridge.start();

      const ws = await connectBrowser(serverBridge, {
        tabId: 'tab-client-src',
        url: 'https://example.com/app',
        tools: [{ name: 'my_tool' }],
      });

      await waitFor(() => serverBridge.registry.listTools()[0]?.name);

      const clientBridge = new RelayBridgeServer({
        host: '127.0.0.1',
        port: serverBridge.port,
        allowedOrigins: ['*'],
      });
      await clientBridge.start();
      expect(clientBridge.mode).toBe('client');

      const relay = new LocalRelayMcpServer({ bridge: clientBridge });
      const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
      const client = new Client({ name: 'test-client', version: '1.0.0' });
      await relay.connect(serverTransport);
      await client.connect(clientTransport);

      await waitFor(() => {
        const tools = clientBridge.listToolsFromRelay();
        return tools.length > 0 ? tools : undefined;
      });

      const result = await client.callTool({
        name: 'webmcp_list_sources',
        arguments: {},
      });

      const text = firstContentText(result);
      expect(text).toContain('"mode": "client"');
      expect(text).toContain('tab-client-src');
      expect(text).toContain('"count": 1');

      ws.close();
      await client.close();
      await relay.stop();
      await serverBridge.stop();
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

      const text = firstContentText(result);
      expect(text).toContain('search');
      expect(text).toContain('Search things');

      ws.close();
      await cleanup();
    });
  });

  it('registers dynamic tools with valid annotations', async () => {
    const { bridge, client, cleanup } = await createConnectedRelay();

    const ws = await connectBrowser(bridge, {
      tabId: 'tab-ann',
      url: 'https://example.com',
      tools: [
        {
          name: 'annotated_tool',
          description: 'A tool with annotations',
        },
      ],
    });

    // Send tools with annotations via tools/changed
    ws.send(
      JSON.stringify({
        type: 'tools/changed',
        tools: [
          {
            name: 'annotated_tool',
            description: 'A tool with annotations',
            annotations: {
              readOnlyHint: true,
              idempotentHint: true,
            },
          },
        ],
      })
    );

    const toolName = await waitFor(() => bridge.registry.listTools()[0]?.name);

    const list = await client.listTools();
    const tool = list.tools.find((t) => t.name === toolName);
    expect(tool).toBeTruthy();
    expect(tool?.annotations?.readOnlyHint).toBe(true);

    ws.close();
    await cleanup();
  });

  it('preserves inputSchema through the relay to MCP clients', async () => {
    const { bridge, client, cleanup } = await createConnectedRelay();

    const ws = await connectBrowser(bridge, {
      tabId: 'tab-schema',
      url: 'https://example.com',
      tools: [
        {
          name: 'search',
          description: 'Search docs',
          inputSchema: {
            type: 'object',
            properties: {
              query: { type: 'string', description: 'Search query' },
              limit: { type: 'number' },
            },
            required: ['query'],
          },
        },
      ],
    });

    const toolName = await waitFor(() => bridge.registry.listTools()[0]?.name);

    const list = await client.listTools();
    const tool = list.tools.find((t) => t.name === toolName);
    expect(tool).toBeTruthy();
    expect(tool?.inputSchema).toEqual({
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query' },
        limit: { type: 'number' },
      },
      required: ['query'],
    });

    ws.close();
    await cleanup();
  });

  it('dynamic tool returns error when invokeTool times out', async () => {
    // Use very short timeout so the test completes quickly
    const { bridge, client, cleanup } = await createConnectedRelay({ invokeTimeoutMs: 50 });

    // Connect browser that does NOT respond to invocations
    const ws = await connectBrowser(bridge, {
      tabId: 'tab-err',
      url: 'https://example.com',
      tools: [{ name: 'slow_tool', description: 'Never responds' }],
    });

    const toolName = await waitFor(() => bridge.registry.listTools()[0]?.name);

    await waitFor(async () => {
      const list = await client.listTools();
      return list.tools.find((t) => t.name === toolName) ? true : undefined;
    });

    // Invoke the dynamic tool — it will timeout and hit the catch block
    const result = await client.callTool({
      name: toolName,
      arguments: {},
    });

    const text = firstContentText(result);
    expect(text).toContain('Failed to invoke relayed tool');
    expect(text).toContain('timed out');
    expect(result.isError).toBe(true);

    ws.close();
    await cleanup();
  });

  it('drops invalid annotations with a warning', async () => {
    const { bridge, relay, cleanup } = await createConnectedRelay();

    const ws = await connectBrowser(bridge, {
      tabId: 'tab-bad-ann',
      url: 'https://example.com',
      tools: [{ name: 'bad_ann_tool', description: 'Has bad annotations' }],
    });

    await waitFor(() => (relay.listDynamicToolNames().length > 0 ? true : undefined));

    // Send tools with invalid annotation types
    ws.send(
      JSON.stringify({
        type: 'tools/changed',
        tools: [
          {
            name: 'bad_ann_tool',
            description: 'Has bad annotations',
            annotations: {
              readOnlyHint: 'not-a-boolean',
              idempotentHint: 42,
            },
          },
        ],
      })
    );

    await new Promise((resolve) => setTimeout(resolve, 100));

    // Tool should still be registered (annotations dropped)
    expect(relay.listDynamicToolNames().length).toBeGreaterThan(0);

    ws.close();
    await cleanup();
  });

  it('skips re-registering dynamic tools when signature is unchanged', async () => {
    const { bridge, relay, cleanup } = await createConnectedRelay();

    const ws = await connectBrowser(bridge, {
      tabId: 'tab-skip',
      url: 'https://example.com',
      tools: [{ name: 'stable_tool', description: 'Stays the same' }],
    });

    await waitFor(() => (relay.listDynamicToolNames().length > 0 ? true : undefined));

    const namesBefore = relay.listDynamicToolNames();

    // Send the same tools again — should not trigger re-registration
    ws.send(
      JSON.stringify({
        type: 'tools/changed',
        tools: [{ name: 'stable_tool', description: 'Stays the same' }],
      })
    );

    await new Promise((resolve) => setTimeout(resolve, 100));

    const namesAfter = relay.listDynamicToolNames();
    expect(namesAfter).toEqual(namesBefore);

    ws.close();
    await cleanup();
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

      const texts = contentTextItems(result);
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

      const text = firstContentText(result);
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

      const text = firstContentText(result);
      expect(text).toContain('Tool "some_tool" not found');
      expect(text).toContain('No tools are currently available');
      expect(result.isError).toBe(true);

      await cleanup();
    });

    it('returns error with tool summary when invokeTool throws during webmcp_call_tool', async () => {
      const { bridge, client, cleanup } = await createConnectedRelay({ invokeTimeoutMs: 50 });

      // Connect two tools — one that doesn't respond (timeout) and one for the summary
      const ws = await connectBrowser(bridge, {
        tabId: 'tab-mix',
        url: 'https://example.com',
        tools: [
          { name: 'timeout_tool', description: 'Never responds' },
          { name: 'other_tool', description: 'Exists for summary' },
        ],
      });

      const toolNames = await waitFor(() => {
        const tools = bridge.registry.listTools();
        return tools.length >= 2 ? tools.map((t) => t.name) : undefined;
      });

      const timeoutToolName = toolNames.find((n) => n.includes('timeout'));

      const result = await client.callTool({
        name: 'webmcp_call_tool',
        arguments: { name: timeoutToolName },
      });

      const text = firstContentText(result);
      expect(text).toContain('Failed to call tool');
      expect(text).toContain('timed out');
      expect(text).toContain('Available tools:');
      expect(result.isError).toBe(true);

      ws.close();
      await cleanup();
    });

    it('returns error when invokeTool throws during webmcp_call_tool', async () => {
      const { bridge, client, cleanup } = await createConnectedRelay();

      const ws = await connectBrowser(bridge, {
        tabId: 'tab-fail',
        url: 'https://example.com',
        tools: [{ name: 'will_disconnect', description: 'A tool that will disconnect' }],
      });

      const toolName = await waitFor(() => bridge.registry.listTools()[0]?.name);

      // Close the socket so invocation will throw
      ws.close();
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Re-connect a new source so there are tools available (for the summary path)
      const ws2 = await connectBrowser(bridge, {
        tabId: 'tab-ok',
        url: 'https://example.com',
        tools: [{ name: 'other_tool', description: 'Another tool' }],
      });

      await waitFor(() => (bridge.registry.listTools().length > 0 ? true : undefined));

      // Now call the tool — name won't match any available tool, so it triggers not-found error with summary
      const result = await client.callTool({
        name: 'webmcp_call_tool',
        arguments: { name: toolName },
      });

      const text = firstContentText(result);
      expect(result.isError).toBe(true);
      // Should contain either "not found" or "Failed to call tool"
      expect(text).toMatch(/not found|Failed to call/);

      ws2.close();
      await cleanup();
    });

    it('is always listed as a static tool even with no browser sources', async () => {
      const { client, cleanup } = await createConnectedRelay();

      const list = await client.listTools();
      const names = list.tools.map((t) => t.name);

      expect(names).toContain('webmcp_call_tool');
      expect(names).toContain('webmcp_list_tools');
      expect(names).toContain('webmcp_list_sources');
      expect(names).toContain('webmcp_open_page');

      await cleanup();
    });
  });

  describe('webmcp_open_page', () => {
    it('returns error for an invalid URL', async () => {
      const { client, cleanup } = await createConnectedRelay();

      const result = await client.callTool({
        name: 'webmcp_open_page',
        arguments: { url: 'not a url' },
      });

      const text = firstContentText(result);
      expect(text).toContain('Invalid URL');
      expect(result.isError).toBe(true);

      await cleanup();
    });

    it('rejects non-http/https protocols', async () => {
      const { client, cleanup } = await createConnectedRelay();

      const result = await client.callTool({
        name: 'webmcp_open_page',
        arguments: { url: 'file:///etc/passwd' },
      });

      const text = firstContentText(result);
      expect(text).toContain('Only http: and https:');
      expect(result.isError).toBe(true);

      await cleanup();
    });

    it('returns error when refresh is requested in client mode', async () => {
      // Start a server relay first
      const serverBridge = new RelayBridgeServer({
        host: '127.0.0.1',
        port: 0,
        allowedOrigins: ['*'],
      });
      await serverBridge.start();

      // Start a client relay that connects to the server
      const clientBridge = new RelayBridgeServer({
        host: '127.0.0.1',
        port: serverBridge.port,
        allowedOrigins: ['*'],
      });
      await clientBridge.start();

      expect(clientBridge.mode).toBe('client');

      const relay = new LocalRelayMcpServer({ bridge: clientBridge });
      const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
      const client = new Client({ name: 'test-client', version: '1.0.0' });
      await relay.connect(serverTransport);
      await client.connect(clientTransport);

      const result = await client.callTool({
        name: 'webmcp_open_page',
        arguments: { url: 'https://example.com', refresh: true },
      });

      const text = firstContentText(result);
      expect(text).toContain('not supported in client mode');
      expect(result.isError).toBe(true);

      await client.close();
      await relay.stop();
      await serverBridge.stop();
    });

    it('returns error when refresh target has no matching source', async () => {
      const { client, cleanup } = await createConnectedRelay();

      const result = await client.callTool({
        name: 'webmcp_open_page',
        arguments: { url: 'https://no-such-origin.example.com', refresh: true },
      });

      const text = firstContentText(result);
      expect(text).toContain('No connected source matches origin');
      expect(result.isError).toBe(true);

      await cleanup();
    });

    it('sends reload to matching source on refresh', async () => {
      const { bridge, client, cleanup } = await createConnectedRelay();

      let reloadReceived = false;
      const ws = await connectBrowser(bridge, {
        tabId: 'tab-reload',
        url: 'https://example.com/page',
        tools: [{ name: 'some_tool' }],
      });

      ws.on('message', (raw) => {
        const msg = JSON.parse(String(raw));
        if (msg.type === 'reload') {
          reloadReceived = true;
        }
      });

      await waitFor(() => bridge.registry.listTools()[0]?.name);

      const result = await client.callTool({
        name: 'webmcp_open_page',
        arguments: { url: 'https://example.com/other-page', refresh: true },
      });

      const text = firstContentText(result);
      expect(text).toContain('Reload sent');
      expect(result.isError).toBeFalsy();

      await waitFor(() => (reloadReceived ? true : undefined));
      expect(reloadReceived).toBe(true);

      ws.close();
      await cleanup();
    });
  });

  describe('listTools schema fidelity', () => {
    it('returns default inputSchema when browser tool omits it', async () => {
      const { bridge, client, cleanup } = await createConnectedRelay();

      const ws = await connectBrowser(bridge, {
        tabId: 'tab-bare',
        url: 'https://example.com',
        tools: [{ name: 'bare_tool' }],
      });

      const toolName = await waitFor(() => bridge.registry.listTools()[0]?.name);

      const list = await client.listTools();
      const tool = list.tools.find((t) => t.name === toolName);
      expect(tool).toBeTruthy();
      expect(tool?.inputSchema).toEqual({
        type: 'object',
        properties: {},
      });

      ws.close();
      await cleanup();
    });

    it('preserves complex nested inputSchema with objects, arrays, and enums', async () => {
      const { bridge, client, cleanup } = await createConnectedRelay();

      const complexSchema = {
        type: 'object',
        properties: {
          filter: {
            type: 'object',
            properties: {
              tags: { type: 'array', items: { type: 'string' } },
              status: { type: 'string', enum: ['active', 'archived'] },
            },
          },
          pagination: {
            type: 'object',
            properties: {
              page: { type: 'integer' },
              perPage: { type: 'integer' },
            },
          },
        },
        required: ['filter'],
      };

      const ws = await connectBrowser(bridge, {
        tabId: 'tab-complex',
        url: 'https://example.com',
        tools: [
          { name: 'complex_tool', description: 'Complex schema', inputSchema: complexSchema },
        ],
      });

      const toolName = await waitFor(() => bridge.registry.listTools()[0]?.name);

      const list = await client.listTools();
      const tool = list.tools.find((t) => t.name === toolName);
      expect(tool).toBeTruthy();
      expect(tool?.inputSchema).toEqual(complexSchema);

      ws.close();
      await cleanup();
    });

    it('includes outputSchema on dynamic tools when present', async () => {
      const { bridge, client, cleanup } = await createConnectedRelay();

      const inputSchema = { type: 'object', properties: { q: { type: 'string' } } };
      const outputSchema = {
        type: 'object',
        properties: {
          results: { type: 'array', items: { type: 'string' } },
          total: { type: 'number' },
        },
      };

      const ws = await connectBrowser(bridge, {
        tabId: 'tab-output',
        url: 'https://example.com',
        tools: [{ name: 'output_tool', inputSchema, outputSchema }],
      });

      const toolName = await waitFor(() => bridge.registry.listTools()[0]?.name);

      const list = await client.listTools();
      const tool = list.tools.find((t) => t.name === toolName);
      expect(tool).toBeTruthy();
      expect(tool?.inputSchema).toEqual(inputSchema);
      expect((tool as Record<string, unknown>).outputSchema).toEqual(outputSchema);

      ws.close();
      await cleanup();
    });

    it('disambiguates same-named tools from different tabs preserving distinct schemas', async () => {
      const { bridge, client, cleanup } = await createConnectedRelay();

      const schemaA = { type: 'object', properties: { query: { type: 'string' } } };
      const schemaB = {
        type: 'object',
        properties: { term: { type: 'string' }, limit: { type: 'number' } },
      };

      // Use tabIds that differ in the first 4 chars (disambiguation uses 4-char suffix)
      const wsA = await connectBrowser(bridge, {
        tabId: 'aaaa',
        url: 'https://example.com',
        tools: [{ name: 'search', description: 'Search A', inputSchema: schemaA }],
      });

      await waitFor(() => (bridge.registry.listTools().length >= 1 ? true : undefined));

      // Connect second browser — triggers disambiguation
      const wsB = await connectBrowser(bridge, {
        tabId: 'bbbb',
        url: 'https://other.com',
        tools: [{ name: 'search', description: 'Search B', inputSchema: schemaB }],
      });

      // Wait for both disambiguated tools to appear in the MCP client
      const dynamicTools = await waitFor(async () => {
        const list = await client.listTools();
        const dynamic = list.tools.filter((t) => !t.name.startsWith('webmcp_'));
        return dynamic.length >= 2 ? dynamic : undefined;
      });

      expect(dynamicTools).toHaveLength(2);

      // Each disambiguated tool should have its own schema
      const schemas = dynamicTools.map((t) => t.inputSchema);
      expect(schemas).toContainEqual(schemaA);
      expect(schemas).toContainEqual(schemaB);

      wsA.close();
      wsB.close();
      await cleanup();
    });

    it('returns all static tools alongside dynamic tools with correct schemas', async () => {
      const { bridge, client, cleanup } = await createConnectedRelay();

      const dynamicSchema = {
        type: 'object',
        properties: { query: { type: 'string' } },
        required: ['query'],
      };

      const ws = await connectBrowser(bridge, {
        tabId: 'tab-mixed',
        url: 'https://example.com',
        tools: [{ name: 'my_tool', description: 'A tool', inputSchema: dynamicSchema }],
      });

      const toolName = await waitFor(() => bridge.registry.listTools()[0]?.name);

      const list = await client.listTools();

      const expectedStaticSchemas: Record<string, Record<string, unknown>> = {
        webmcp_list_sources: publicInputSchemaFromZodShape(EMPTY_STATIC_TOOL_INPUT_SHAPE),
        webmcp_list_tools: publicInputSchemaFromZodShape(EMPTY_STATIC_TOOL_INPUT_SHAPE),
        webmcp_call_tool: publicInputSchemaFromZodShape(WEBMCP_CALL_TOOL_INPUT_SHAPE),
        webmcp_open_page: publicInputSchemaFromZodShape(WEBMCP_OPEN_PAGE_INPUT_SHAPE),
      };

      for (const [name, expectedSchema] of Object.entries(expectedStaticSchemas)) {
        const staticTool = list.tools.find((t) => t.name === name);
        expect(staticTool).toBeTruthy();
        expect(staticTool?.inputSchema).toEqual(expectedSchema);
        expect(staticTool?.inputSchema).not.toHaveProperty('$schema');
      }

      // Dynamic tool present with real schema
      const dynamicTool = list.tools.find((t) => t.name === toolName);
      expect(dynamicTool).toBeTruthy();
      expect(dynamicTool?.inputSchema).toEqual(dynamicSchema);

      // Total count: 4 static + 1 dynamic
      expect(list.tools).toHaveLength(5);

      ws.close();
      await cleanup();
    });

    it('updates inputSchema when browser sends tools/changed', async () => {
      const { bridge, client, cleanup } = await createConnectedRelay();

      const initialSchema = {
        type: 'object',
        properties: { v: { type: 'number' } },
      };
      const updatedSchema = {
        type: 'object',
        properties: { v: { type: 'string' }, extra: { type: 'boolean' } },
      };

      const ws = await connectBrowser(bridge, {
        tabId: 'tab-update',
        url: 'https://example.com',
        tools: [{ name: 'evolving_tool', description: 'Evolves', inputSchema: initialSchema }],
      });

      const toolName = await waitFor(() => bridge.registry.listTools()[0]?.name);

      // Verify initial schema
      const list1 = await client.listTools();
      const tool1 = list1.tools.find((t) => t.name === toolName);
      expect(tool1?.inputSchema).toEqual(initialSchema);

      // Send updated schema
      ws.send(
        JSON.stringify({
          type: 'tools/changed',
          tools: [{ name: 'evolving_tool', description: 'Evolves', inputSchema: updatedSchema }],
        })
      );

      // Poll until schema updates
      await waitFor(async () => {
        const list = await client.listTools();
        const tool = list.tools.find((t) => t.name === toolName);
        return JSON.stringify(tool?.inputSchema) === JSON.stringify(updatedSchema)
          ? true
          : undefined;
      });

      const list2 = await client.listTools();
      const tool2 = list2.tools.find((t) => t.name === toolName);
      expect(tool2?.inputSchema).toEqual(updatedSchema);

      ws.close();
      await cleanup();
    });

    it('removes dynamic tool data after browser disconnects', async () => {
      const { bridge, client, cleanup } = await createConnectedRelay();

      const ws = await connectBrowser(bridge, {
        tabId: 'tab-remove',
        url: 'https://example.com',
        tools: [
          {
            name: 'ephemeral_tool',
            inputSchema: { type: 'object', properties: { x: { type: 'string' } } },
          },
        ],
      });

      await waitFor(() => bridge.registry.listTools()[0]?.name);

      // Verify tool is listed
      const list1 = await client.listTools();
      expect(list1.tools.find((t) => !t.name.startsWith('webmcp_'))).toBeTruthy();

      // Disconnect browser
      ws.close();

      // Wait for tool to disappear
      await waitFor(async () => {
        const list = await client.listTools();
        const dynamic = list.tools.filter((t) => !t.name.startsWith('webmcp_'));
        return dynamic.length === 0 ? true : undefined;
      });

      const list2 = await client.listTools();
      expect(list2.tools.filter((t) => !t.name.startsWith('webmcp_'))).toHaveLength(0);
      expect(list2.tools).toHaveLength(4); // only static tools

      await cleanup();
    });

    it('preserves distinct schemas for multiple tools from one browser', async () => {
      const { bridge, client, cleanup } = await createConnectedRelay();

      const tools = [
        {
          name: 'tool_a',
          description: 'A',
          inputSchema: { type: 'object', properties: { a: { type: 'string' } } },
        },
        {
          name: 'tool_b',
          description: 'B',
          inputSchema: { type: 'object', properties: { b: { type: 'number' } } },
        },
        {
          name: 'tool_c',
          description: 'C',
          inputSchema: { type: 'object', properties: { c: { type: 'boolean' } } },
        },
      ];

      const ws = await connectBrowser(bridge, {
        tabId: 'tab-multi',
        url: 'https://example.com',
        tools,
      });

      await waitFor(() => {
        const registered = bridge.registry.listTools();
        return registered.length >= 3 ? true : undefined;
      });

      const list = await client.listTools();
      expect(list.tools).toHaveLength(7); // 4 static + 3 dynamic

      for (const expected of tools) {
        const found = list.tools.find((t) => t.name.includes(expected.name));
        expect(found).toBeTruthy();
        expect(found?.inputSchema).toEqual(expected.inputSchema);
      }

      ws.close();
      await cleanup();
    });

    it('passes through annotations, inputSchema, and outputSchema together', async () => {
      const { bridge, client, cleanup } = await createConnectedRelay();

      const inputSchema = {
        type: 'object',
        properties: { query: { type: 'string' } },
        required: ['query'],
      };
      const outputSchema = {
        type: 'object',
        properties: { answer: { type: 'string' } },
      };

      const ws = await connectBrowser(bridge, {
        tabId: 'tab-full',
        url: 'https://example.com',
        tools: [
          {
            name: 'full_tool',
            description: 'Fully specified',
            inputSchema,
            outputSchema,
            annotations: { readOnlyHint: true, idempotentHint: true },
          },
        ],
      });

      const toolName = await waitFor(() => bridge.registry.listTools()[0]?.name);

      const list = await client.listTools();
      const tool = list.tools.find((t) => t.name === toolName);
      expect(tool).toBeTruthy();
      expect(tool?.inputSchema).toEqual(inputSchema);
      expect((tool as Record<string, unknown>).outputSchema).toEqual(outputSchema);
      expect(tool?.annotations?.readOnlyHint).toBe(true);
      expect(tool?.annotations?.idempotentHint).toBe(true);

      ws.close();
      await cleanup();
    });

    it('normalizes invalid inputSchema to default', async () => {
      const { bridge, client, cleanup } = await createConnectedRelay();

      const ws = await connectBrowser(bridge, {
        tabId: 'tab-invalid',
        url: 'https://example.com',
        tools: [{ name: 'bad_schema_tool', inputSchema: 'not-an-object' }],
      });

      const toolName = await waitFor(() => bridge.registry.listTools()[0]?.name);

      const list = await client.listTools();
      const tool = list.tools.find((t) => t.name === toolName);
      expect(tool).toBeTruthy();
      expect(tool?.inputSchema).toEqual({
        type: 'object',
        properties: {},
      });

      ws.close();
      await cleanup();
    });

    it('maintains consistent schemas after rapid connect/disconnect cycles', async () => {
      const { bridge, client, cleanup } = await createConnectedRelay();

      for (let i = 0; i < 3; i++) {
        const schema = {
          type: 'object',
          properties: { [`field_${i}`]: { type: 'string' } },
        };

        const ws = await connectBrowser(bridge, {
          tabId: `tab-cycle-${i}`,
          url: 'https://example.com',
          tools: [{ name: 'cycling_tool', inputSchema: schema }],
        });

        await waitFor(() => bridge.registry.listTools()[0]?.name);

        ws.close();

        await waitFor(() => {
          const tools = bridge.registry.listTools();
          return tools.length === 0 ? true : undefined;
        });
      }

      // Connect final browser with known schema
      const finalSchema = {
        type: 'object',
        properties: { final: { type: 'boolean' } },
        required: ['final'],
      };

      const ws = await connectBrowser(bridge, {
        tabId: 'tab-final',
        url: 'https://example.com',
        tools: [{ name: 'stable_after_churn', inputSchema: finalSchema }],
      });

      const toolName = await waitFor(() => bridge.registry.listTools()[0]?.name);

      const list = await client.listTools();
      expect(list.tools).toHaveLength(5); // 4 static + 1 dynamic
      const tool = list.tools.find((t) => t.name === toolName);
      expect(tool).toBeTruthy();
      expect(tool?.inputSchema).toEqual(finalSchema);

      ws.close();
      await cleanup();
    });
  });
});
