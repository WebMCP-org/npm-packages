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

      await cleanup();
    });
  });
});
