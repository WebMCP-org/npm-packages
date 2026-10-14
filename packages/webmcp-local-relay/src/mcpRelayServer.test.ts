import { Client, InMemoryTransport } from '@modelcontextprotocol/client';
import { describe, expect, it, vi } from 'vitest';
import WebSocket from 'ws';

import { RelayBridgeServer } from './bridgeServer.js';
import { LocalRelayMcpServer } from './mcpRelayServer.js';

const execFileMock = vi.fn(
  (_command: string, _args: readonly string[], callback: (cause: Error | null) => void) => {
    callback(null);
  }
);

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

type ClientToolList = Awaited<ReturnType<Client['listTools']>>;
type ClientTool = ClientToolList['tools'][number];

// Fixtures cover both object schemas and intentionally malformed serialized schemas.
type BrowserToolFixture = Pick<ClientTool, 'name'> &
  Partial<Omit<ClientTool, 'name' | 'inputSchema'>> & { inputSchema?: object | string };

function createTestClient(): Client {
  return new Client(
    { name: 'test-client', version: '1.0.0' },
    { versionNegotiation: { mode: 'auto' } }
  );
}

async function waitForClientToolList(client: Client, toolName: string): Promise<ClientToolList> {
  return waitFor(async () => {
    const list = await client.listTools();
    return list.tools.some((tool) => tool.name === toolName) ? list : undefined;
  });
}

async function waitForClientTool(client: Client, toolName: string): Promise<ClientTool> {
  const list = await waitForClientToolList(client, toolName);
  const tool = list.tools.find((entry) => entry.name === toolName);
  if (!tool) {
    throw new Error(`Timed out waiting for client-visible tool ${toolName}`);
  }
  return tool;
}

/**
 * Extracts text items from MCP call tool result content.
 */
type ClientToolResult = Awaited<ReturnType<Client['callTool']>>;

function firstContentText(result: ClientToolResult): string {
  return result.content.find((item) => item.type === 'text')?.text ?? '';
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
  const relay = new LocalRelayMcpServer({ bridge, launchBrowser: execFileMock });
  await relay.start();

  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = createTestClient();
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
 * Answers each invoke with the page's tab ID and the arguments it received.
 */
function echoInvokes(ws: WebSocket, tabId: string, invokes: unknown[] = []): unknown[] {
  ws.on('message', (raw) => {
    const msg = JSON.parse(String(raw));
    if (msg.type !== 'invoke') return;
    invokes.push(msg);
    ws.send(
      JSON.stringify({
        type: 'result',
        callId: msg.callId,
        result: { content: [{ type: 'text', text: `${tabId}:${JSON.stringify(msg.args)}` }] },
      })
    );
  });
  return invokes;
}

/**
 * Connects a browser websocket fixture and optionally handles invoke calls.
 */
async function connectBrowser(
  bridge: RelayBridgeServer,
  options: {
    tabId: string;
    url: string;
    tools: BrowserToolFixture[];
  }
): Promise<WebSocket> {
  const ws = new WebSocket(`ws://127.0.0.1:${bridge.port}`);
  await new Promise<void>((resolve, reject) => {
    ws.once('open', () => resolve());
    ws.once('error', reject);
  });

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
        title: 'Dashboard v1',
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
    const client = createTestClient();
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

    ws.send(
      JSON.stringify({
        type: 'hello',
        tabId: 'tab-abc',
        url: 'https://acme.example.com/dashboard',
        origin: 'https://acme.example.com',
        title: 'Dashboard v2',
      })
    );

    await waitFor(async () => {
      const list = await client.listTools();
      const tool = list.tools.find((entry) => entry.name === dynamicToolName);
      return tool?.description?.includes('Dashboard v2') ? true : undefined;
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
    const client = createTestClient();

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
      const client = createTestClient();
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

  describe('webmcp_call_tool', () => {
    it('calls a page tool registered after the client listed tools', async () => {
      const { bridge, client, cleanup } = await createConnectedRelay();
      // The client snapshots the list before the page connects and never refreshes it.
      const before = await client.listTools();
      expect(before.tools.map((tool) => tool.name).sort()).toEqual([
        'webmcp_call_tool',
        'webmcp_list_sources',
        'webmcp_list_tools',
        'webmcp_open_page',
      ]);

      const ws = await connectBrowser(bridge, {
        tabId: 'tab-late',
        url: 'https://example.com',
        tools: [{ name: 'late_tool', description: 'Registered late' }],
      });
      echoInvokes(ws, 'tab-late');
      const name = await waitFor(() => bridge.registry.listTools()[0]?.name);

      const result = await client.callTool({
        name: 'webmcp_call_tool',
        arguments: { name, arguments: { query: 'webmcp' } },
      });

      expect(result.isError).toBeFalsy();
      expect(firstContentText(result)).toBe('tab-late:{"query":"webmcp"}');

      ws.close();
      await cleanup();
    });

    it('sends empty arguments when they are omitted', async () => {
      const { bridge, client, cleanup } = await createConnectedRelay();
      const ws = await connectBrowser(bridge, {
        tabId: 'tab-empty',
        url: 'https://example.com',
        tools: [{ name: 'no_args' }],
      });
      echoInvokes(ws, 'tab-empty');
      const name = await waitFor(() => bridge.registry.listTools()[0]?.name);

      const result = await client.callTool({ name: 'webmcp_call_tool', arguments: { name } });

      expect(firstContentText(result)).toBe('tab-empty:{}');

      ws.close();
      await cleanup();
    });

    it('reports an unknown tool without invoking any page', async () => {
      const { bridge, client, cleanup } = await createConnectedRelay();
      const ws = await connectBrowser(bridge, {
        tabId: 'tab-known',
        url: 'https://example.com',
        tools: [{ name: 'known_tool' }],
      });
      const invokes = echoInvokes(ws, 'tab-known');
      await waitFor(() => bridge.registry.listTools()[0]?.name);

      const result = await client.callTool({
        name: 'webmcp_call_tool',
        arguments: { name: 'missing_tool', arguments: {} },
      });

      expect(result.isError).toBe(true);
      expect(firstContentText(result)).toBe(
        'Tool "missing_tool" not found. Call webmcp_list_tools to see available tools.'
      );
      expect(invokes).toEqual([]);

      ws.close();
      await cleanup();
    });

    it('routes a disambiguated name to the tab that provides it', async () => {
      const { bridge, client, cleanup } = await createConnectedRelay();
      const first = await connectBrowser(bridge, {
        tabId: 'tab-one',
        url: 'https://one.example.com',
        tools: [{ name: 'search' }],
      });
      const second = await connectBrowser(bridge, {
        tabId: 'tab-two',
        url: 'https://two.example.com',
        tools: [{ name: 'search' }],
      });
      echoInvokes(first, 'tab-one');
      echoInvokes(second, 'tab-two');
      const tools = await waitFor(() => {
        const listed = bridge.registry.listTools();
        return listed.length === 2 ? listed : undefined;
      });

      for (const tool of tools) {
        const tabId = tool.sources[0]?.tabId;
        expect(tool.name).not.toBe('search');
        const result = await client.callTool({
          name: 'webmcp_call_tool',
          arguments: { name: tool.name, arguments: {} },
        });
        expect(firstContentText(result)).toBe(`${tabId}:{}`);
      }

      first.close();
      second.close();
      await cleanup();
    });

    it('returns an error result when the page call fails', async () => {
      const stderr = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
      const { bridge, client, cleanup } = await createConnectedRelay({ invokeTimeoutMs: 100 });
      const ws = await connectBrowser(bridge, {
        tabId: 'tab-silent',
        url: 'https://example.com',
        tools: [{ name: 'silent_tool' }],
      });
      const name = await waitFor(() => bridge.registry.listTools()[0]?.name);

      const result = await client.callTool({ name: 'webmcp_call_tool', arguments: { name } });

      expect(result.isError).toBe(true);
      expect(firstContentText(result)).toContain(`Failed to invoke relayed tool "${name}"`);
      expect(firstContentText(result)).toContain('timed out');

      ws.close();
      await cleanup();
      stderr.mockRestore();
    });

    it('forwards caller cancellation to the page', async () => {
      const { bridge, client, cleanup } = await createConnectedRelay({ invokeTimeoutMs: 2000 });
      const ws = await connectBrowser(bridge, {
        tabId: 'tab-cancel-call',
        url: 'https://example.com',
        tools: [{ name: 'slow_tool' }],
      });
      const messages: Array<{ type: string; callId?: string }> = [];
      ws.on('message', (raw) => messages.push(JSON.parse(String(raw))));
      const name = await waitFor(() => bridge.registry.listTools()[0]?.name);

      const controller = new AbortController();
      const pending = client.callTool(
        { name: 'webmcp_call_tool', arguments: { name } },
        { signal: controller.signal }
      );
      const rejected = expect(pending).rejects.toThrow('caller cancelled');
      const invocation = await waitFor(() => messages.find((message) => message.type === 'invoke'));
      controller.abort(new Error('caller cancelled'));
      await rejected;
      const cancel = await waitFor(() => messages.find((message) => message.type === 'cancel'));
      expect(cancel.callId).toBe(invocation.callId);

      ws.close();
      await cleanup();
    });

    it('calls page tools through the server relay in client mode', async () => {
      const serverBridge = new RelayBridgeServer({
        host: '127.0.0.1',
        port: 0,
        allowedOrigins: ['*'],
      });
      await serverBridge.start();
      const ws = await connectBrowser(serverBridge, {
        tabId: 'tab-via-server',
        url: 'https://example.com',
        tools: [{ name: 'shared_tool' }],
      });
      echoInvokes(ws, 'tab-via-server');
      await waitFor(() => serverBridge.registry.listTools()[0]?.name);

      const clientBridge = new RelayBridgeServer({
        host: '127.0.0.1',
        port: serverBridge.port,
        allowedOrigins: ['*'],
      });
      const relay = new LocalRelayMcpServer({ bridge: clientBridge });
      await relay.start();
      expect(clientBridge.mode).toBe('client');
      const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
      const client = createTestClient();
      await relay.connect(serverTransport);
      await client.connect(clientTransport);
      const name = await waitFor(() => clientBridge.listToolsFromRelay()[0]?.name);

      const result = await client.callTool({
        name: 'webmcp_call_tool',
        arguments: { name, arguments: { via: 'client' } },
      });

      expect(firstContentText(result)).toBe('tab-via-server:{"via":"client"}');

      ws.close();
      await client.close();
      await relay.stop();
      await serverBridge.stop();
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

    const tool = await waitForClientTool(client, toolName);
    expect(tool?.annotations?.readOnlyHint).toBe(true);

    ws.close();
    await cleanup();
  });

  it('preserves dynamic tool icons and metadata', async () => {
    const { bridge, client, cleanup } = await createConnectedRelay();

    const ws = await connectBrowser(bridge, {
      tabId: 'tab-metadata',
      url: 'https://example.com',
      tools: [
        {
          name: 'metadata_tool',
          icons: [{ src: 'https://example.com/icon.svg', mimeType: 'image/svg+xml' }],
          _meta: { 'example/key': 'value' },
        },
      ],
    });

    const toolName = await waitFor(() => bridge.registry.listTools()[0]?.name);
    const tool = await waitForClientTool(client, toolName);

    expect(tool.icons).toEqual([
      { src: 'https://example.com/icon.svg', mimeType: 'image/svg+xml' },
    ]);
    expect(tool._meta).toEqual({ 'example/key': 'value' });

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

    const tool = await waitForClientTool(client, toolName);
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

  it('skips an unresolvable dynamic schema without blocking later tools', async () => {
    const { bridge, client, relay, cleanup } = await createConnectedRelay();

    const ws = await connectBrowser(bridge, {
      tabId: 'tab-schema-isolation',
      url: 'https://example.com',
      tools: [
        {
          name: 'a_bad_schema',
          inputSchema: {
            type: 'object',
            properties: {
              value: { $ref: 'https://schemas.invalid/missing.json' },
            },
          },
        },
        {
          name: 'z_valid_schema',
          inputSchema: {
            type: 'object',
            properties: { value: { type: 'string' } },
          },
        },
      ],
    });

    const aggregatedTools = await waitFor(() => {
      const tools = bridge.registry.listTools();
      return tools.length === 2 ? tools : undefined;
    });
    const badName = aggregatedTools.find(
      ({ originalName }) => originalName === 'a_bad_schema'
    )?.name;
    const validName = aggregatedTools.find(
      ({ originalName }) => originalName === 'z_valid_schema'
    )?.name;
    expect(badName).toBeDefined();
    expect(validName).toBeDefined();

    const list = await waitForClientToolList(client, validName!);
    expect(list.tools.some(({ name }) => name === badName)).toBe(false);
    expect(relay.listDynamicToolNames()).toEqual([validName]);

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

  it('forwards MCP caller cancellation to the browser execution', async () => {
    const { bridge, client, cleanup } = await createConnectedRelay({ invokeTimeoutMs: 2000 });
    let ws: WebSocket | undefined;
    try {
      ws = await connectBrowser(bridge, {
        tabId: 'tab-cancel',
        url: 'https://example.com',
        tools: [{ name: 'slow_tool', description: 'Waits for cancellation' }],
      });
      const messages: Array<{ type: string; callId: string }> = [];
      ws.on('message', (raw) => messages.push(JSON.parse(String(raw))));
      const toolName = await waitFor(() => bridge.registry.listTools()[0]?.name);
      await waitForClientTool(client, toolName);

      const controller = new AbortController();
      const pending = client.callTool(
        { name: toolName, arguments: {} },
        { signal: controller.signal }
      );
      const rejected = expect(pending).rejects.toThrow('caller cancelled');
      const invocation = await waitFor(() => messages.find((message) => message.type === 'invoke'));
      controller.abort(new Error('caller cancelled'));
      await rejected;
      const cancel = await waitFor(() => messages.find((message) => message.type === 'cancel'));
      expect(cancel.callId).toBe(invocation.callId);
    } finally {
      ws?.close();
      await cleanup();
    }
  });

  it('skips a tool with invalid annotations and keeps the rest', async () => {
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
          { name: 'good_tool', description: 'Valid' },
        ],
      })
    );

    await waitFor(() =>
      relay.listDynamicToolNames().some((name) => name.includes('good_tool')) ? true : undefined
    );
    expect(relay.listDynamicToolNames().some((name) => name.includes('bad_ann_tool'))).toBe(false);

    ws.close();
    await cleanup();
  });

  it('reports a page tool that takes a built-in tool name and keeps the rest', async () => {
    const stderr = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
    const { bridge, relay, cleanup } = await createConnectedRelay();

    const ws = await connectBrowser(bridge, {
      tabId: 'tab-shadow',
      url: 'https://example.com',
      tools: [
        { name: 'webmcp_list_tools', description: 'Takes a built-in name' },
        { name: 'webmcp_call_tool', description: 'Takes a built-in name' },
        { name: 'good_tool', description: 'Valid' },
      ],
    });

    await waitFor(() =>
      relay.listDynamicToolNames().some((name) => name.includes('good_tool')) ? true : undefined
    );
    expect(stderr).toHaveBeenCalledWith(
      expect.stringContaining('skipped page tool "webmcp_list_tools"')
    );
    expect(stderr).toHaveBeenCalledWith(
      expect.stringContaining('skipped page tool "webmcp_call_tool"')
    );

    ws.close();
    await cleanup();
    stderr.mockRestore();
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

  describe('webmcp_open_page', () => {
    it('passes Windows URLs as one literal launcher argument', async () => {
      const platform = vi.spyOn(process, 'platform', 'get').mockReturnValue('win32');
      const { client, cleanup } = await createConnectedRelay();
      const url = 'https://example.com/?payload=$(calc)&next=`whoami`';

      try {
        execFileMock.mockClear();
        const result = await client.callTool({
          name: 'webmcp_open_page',
          arguments: { url },
        });

        expect(result.isError).toBeFalsy();
        expect(execFileMock).toHaveBeenCalledWith(
          'explorer.exe',
          [new URL(url).href],
          expect.any(Function)
        );
      } finally {
        platform.mockRestore();
        await cleanup();
      }
    });

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
      const client = createTestClient();
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

      const tool = await waitForClientTool(client, toolName);
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

      const tool = await waitForClientTool(client, toolName);
      expect(tool?.inputSchema).toEqual(complexSchema);

      ws.close();
      await cleanup();
    });

    it('projects primitive outputSchema for the legacy protocol era', async () => {
      const { bridge, client, cleanup } = await createConnectedRelay();

      const inputSchema = { type: 'object', properties: { q: { type: 'string' } } };
      const outputSchema = { type: 'string' };

      const ws = await connectBrowser(bridge, {
        tabId: 'tab-output',
        url: 'https://example.com',
        tools: [{ name: 'output_tool', inputSchema, outputSchema }],
      });

      const toolName = await waitFor(() => bridge.registry.listTools()[0]?.name);

      const tool = await waitForClientTool(client, toolName);
      expect(tool?.inputSchema).toEqual(inputSchema);
      expect(tool.outputSchema).toEqual({
        type: 'object',
        properties: { result: outputSchema },
        required: ['result'],
      });

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

      const list = await waitForClientToolList(client, toolName);

      const expectedStaticSchemas = {
        webmcp_list_sources: {
          $schema: 'https://json-schema.org/draft/2020-12/schema',
          type: 'object',
          properties: {},
        },
        webmcp_list_tools: {
          $schema: 'https://json-schema.org/draft/2020-12/schema',
          type: 'object',
          properties: {},
        },
        webmcp_call_tool: {
          $schema: 'https://json-schema.org/draft/2020-12/schema',
          type: 'object',
          properties: {
            name: { type: 'string', description: 'Tool name as returned by webmcp_list_tools.' },
            arguments: {
              type: 'object',
              propertyNames: { type: 'string' },
              additionalProperties: {},
              description: 'Arguments matching the tool input schema.',
            },
          },
          required: ['name'],
        },
        webmcp_open_page: {
          $schema: 'https://json-schema.org/draft/2020-12/schema',
          type: 'object',
          properties: {
            url: {
              type: 'string',
              description: 'URL to open or match for refresh.',
            },
            refresh: {
              type: 'boolean',
              description:
                'If true, refresh the connected source matching this URL instead of opening a new tab.',
            },
          },
          required: ['url'],
        },
      };

      for (const [name, expectedSchema] of Object.entries(expectedStaticSchemas)) {
        const staticTool = list.tools.find((t) => t.name === name);
        expect(staticTool).toBeTruthy();
        expect(staticTool?.inputSchema).toEqual(expectedSchema);
      }

      // Dynamic tool present with real schema
      const dynamicTool = list.tools.find((t) => t.name === toolName);
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
      const tool1 = await waitForClientTool(client, toolName);
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
      const list1 = await waitFor(async () => {
        const list = await client.listTools();
        return list.tools.some((tool) => !tool.name.startsWith('webmcp_')) ? list : undefined;
      });
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

      const tool = await waitForClientTool(client, toolName);
      expect(tool?.inputSchema).toEqual(inputSchema);
      expect(tool.outputSchema).toEqual(outputSchema);
      expect(tool?.annotations?.readOnlyHint).toBe(true);
      expect(tool?.annotations?.idempotentHint).toBe(true);

      ws.close();
      await cleanup();
    });

    it('rejects an invalid inputSchema', async () => {
      const { bridge, cleanup } = await createConnectedRelay();

      const ws = await connectBrowser(bridge, {
        tabId: 'tab-invalid',
        url: 'https://example.com',
        tools: [{ name: 'bad_schema_tool', inputSchema: 'not-an-object' }],
      });

      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(bridge.registry.listTools()).toEqual([]);

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

      const list = await waitForClientToolList(client, toolName);
      expect(list.tools).toHaveLength(5); // 4 static + 1 dynamic
      const tool = list.tools.find((t) => t.name === toolName);
      expect(tool?.inputSchema).toEqual(finalSchema);

      ws.close();
      await cleanup();
    });
  });

  describe('notification debouncing', () => {
    it('sends one list-changed notification for one dynamic tool registration', async () => {
      const { bridge, client, cleanup } = await createConnectedRelay();
      let notifications = 0;
      client.setNotificationHandler('notifications/tools/list_changed', () => {
        notifications += 1;
      });

      const ws = await connectBrowser(bridge, {
        tabId: 'tab-notifications',
        url: 'https://example.com',
        tools: [{ name: 'notification_tool', description: 'Notification test' }],
      });

      const toolName = await waitFor(() => bridge.registry.listTools()[0]?.name);
      await waitForClientTool(client, toolName);
      await new Promise((resolve) => setImmediate(resolve));

      expect(notifications).toBe(1);

      ws.close();
      await cleanup();
    });

    it('does not re-register tools when a browser reconnects with the same tools', async () => {
      const { bridge, client, cleanup } = await createConnectedRelay();

      const tools = [
        { name: 'stable_tool', description: 'A stable tool' },
        { name: 'another_tool', description: 'Another tool' },
      ];

      const ws1 = await connectBrowser(bridge, {
        tabId: 'tab-reconnect',
        url: 'https://example.com',
        tools,
      });

      const toolName = await waitFor(() => bridge.registry.listTools()[0]?.name);
      expect(toolName).toBeTruthy();

      const list1 = await waitFor(async () => {
        const list = await client.listTools();
        return list.tools.length === 6 ? list : undefined; // 4 static + 2 dynamic
      });
      expect(list1.tools).toHaveLength(6);

      ws1.close();
      await waitFor(() => (bridge.registry.listSources().length === 0 ? true : undefined));

      await waitFor(async () => {
        const list = await client.listTools();
        return list.tools.length === 4 ? true : undefined; // only static tools
      });

      const ws2 = await connectBrowser(bridge, {
        tabId: 'tab-reconnect',
        url: 'https://example.com',
        tools,
      });

      const list2 = await waitFor(async () => {
        const list = await client.listTools();
        return list.tools.length === 6 ? list : undefined;
      });

      const dynamicTools2 = list2.tools.filter((t) => !t.name.startsWith('webmcp_'));
      expect(dynamicTools2).toHaveLength(2);
      expect(dynamicTools2.map((t) => t.name).sort()).toEqual(
        list1.tools
          .filter((t) => !t.name.startsWith('webmcp_'))
          .map((t) => t.name)
          .sort()
      );

      ws2.close();
      await cleanup();
    });

    it('coalesces a burst of tool-list changes into a single sync', async () => {
      const { bridge, client, cleanup } = await createConnectedRelay();

      const ws = await connectBrowser(bridge, {
        tabId: 'tab-batch',
        url: 'https://example.com',
        tools: [{ name: 'batch_tool', description: 'Batch test' }],
      });

      const batchName = await waitFor(() => bridge.registry.listTools()[0]?.name);
      await waitForClientTool(client, batchName);

      let notifications = 0;
      client.setNotificationHandler('notifications/tools/list_changed', () => {
        notifications += 1;
      });

      // A reconnecting tab drops and re-publishes its tools in the same tick.
      ws.send(JSON.stringify({ type: 'tools/changed', tools: [] }));
      ws.send(
        JSON.stringify({
          type: 'tools/changed',
          tools: [
            { name: 'batch_tool', description: 'Batch test' },
            { name: 'extra_tool', description: 'Extra' },
          ],
        })
      );

      const extraName = await waitFor(
        () => bridge.registry.listTools().find((tool) => tool.originalName === 'extra_tool')?.name
      );
      await waitForClientTool(client, extraName);
      await new Promise((resolve) => setImmediate(resolve));

      // Only extra_tool is new. Without debouncing the empty list syncs first,
      // unregistering and re-registering batch_tool for 3 notifications.
      expect(notifications).toBe(1);

      ws.close();
      await cleanup();
    });
  });
});
