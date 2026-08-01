import { Client, type ConnectOptions, InMemoryTransport } from '@modelcontextprotocol/client';
import { fromJsonSchema, McpServer } from '@modelcontextprotocol/server';
import { StrictMode, type ReactNode } from 'react';
import { describe, expect, expectTypeOf, it, vi } from 'vitest';
import { renderHook } from 'vitest-browser-react';
import {
  McpClientProvider,
  type McpClientProviderProps,
  useMcpClient,
} from './McpClientProvider.js';

interface TestConnection {
  client: Client;
  server: McpServer;
  transport: InMemoryTransport;
}

async function createConnection(configure: (server: McpServer) => void): Promise<TestConnection> {
  const server = new McpServer({
    name: 'react-webmcp-test-server',
    version: '1.0.0',
  });
  configure(server);

  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);

  const client = new Client(
    { name: 'react-webmcp-test-client', version: '1.0.0' },
    { versionNegotiation: { mode: 'auto' } }
  );

  return { client, server, transport: clientTransport };
}

function providerFor(connection: TestConnection) {
  return function Provider({ children }: { children: ReactNode }) {
    return (
      <McpClientProvider client={connection.client} transport={connection.transport}>
        {children}
      </McpClientProvider>
    );
  };
}

async function closeConnection(connection: TestConnection): Promise<void> {
  await Promise.allSettled([connection.client.close(), connection.server.close()]);
}

describe('McpClientProvider with an MCP v2 in-memory connection', () => {
  it('accepts every SDK connection option', () => {
    expectTypeOf<McpClientProviderProps['opts']>().toEqualTypeOf<ConnectOptions | undefined>();
  });

  it('connects under StrictMode when the transport cannot be restarted', async () => {
    const connection = await createConnection((server) => {
      server.registerTool('strict_mode_tool', {}, async () => ({
        content: [{ type: 'text', text: 'ready' }],
      }));
    });
    const start = connection.transport.start.bind(connection.transport);
    const close = connection.transport.close.bind(connection.transport);
    let startCount = 0;
    connection.transport.start = async () => {
      startCount += 1;
      if (startCount > 1) {
        throw new Error('transport cannot be restarted');
      }
      await start();
    };
    connection.transport.close = async () => {
      await Promise.resolve();
      await close();
    };

    const Provider = providerFor(connection);
    const hook = await renderHook(() => useMcpClient(), {
      wrapper: ({ children }) => (
        <StrictMode>
          <Provider>{children}</Provider>
        </StrictMode>
      ),
    });

    try {
      await vi.waitFor(() => {
        expect(hook.result.current.error).toBeNull();
        expect(hook.result.current.isConnected).toBe(true);
        expect(hook.result.current.tools.map(({ name }) => name)).toContain('strict_mode_tool');
        expect(startCount).toBe(1);
      });
    } finally {
      await hook.unmount();
      await closeConnection(connection);
    }
  });

  it('does not reconnect when request options are recreated', async () => {
    const connection = await createConnection((server) => {
      server.registerTool('stable_connection', {}, async () => ({
        content: [{ type: 'text', text: 'ready' }],
      }));
    });
    const close = vi.spyOn(connection.client, 'close');
    let requestOptions = { timeout: 1_000 };
    function Provider({ children }: { children: ReactNode }) {
      return (
        <McpClientProvider
          client={connection.client}
          transport={connection.transport}
          opts={requestOptions}
        >
          {children}
        </McpClientProvider>
      );
    }

    const hook = await renderHook(() => useMcpClient(), { wrapper: Provider });

    try {
      await vi.waitFor(() => {
        expect(hook.result.current.isConnected).toBe(true);
        expect(hook.result.current.tools.map(({ name }) => name)).toContain('stable_connection');
      });

      requestOptions = { timeout: 1_000 };
      await hook.rerender();

      expect(close).not.toHaveBeenCalled();
      expect(hook.result.current.isConnected).toBe(true);
      expect(hook.result.current.error).toBeNull();
    } finally {
      await hook.unmount();
      await closeConnection(connection);
    }
  });

  it('connects, discovers, and invokes real server capabilities', async () => {
    const connection = await createConnection((server) => {
      server.registerTool(
        'echo',
        {
          description: 'Echoes a message',
          inputSchema: fromJsonSchema<{ message: string }>({
            type: 'object',
            properties: { message: { type: 'string' } },
            required: ['message'],
          }),
        },
        async ({ message }) => ({
          content: [{ type: 'text', text: `echo:${message}` }],
        })
      );
      server.registerResource(
        'settings',
        'config://settings',
        {
          description: 'Application settings',
          mimeType: 'application/json',
        },
        async (uri) => ({
          contents: [{ uri: uri.href, text: '{"theme":"dark"}' }],
        })
      );
    });

    const hook = await renderHook(() => useMcpClient(), {
      wrapper: providerFor(connection),
    });

    try {
      await vi.waitFor(() => {
        expect(hook.result.current.isConnected).toBe(true);
        expect(hook.result.current.isLoading).toBe(false);
        expect(hook.result.current.error).toBeNull();
        expect(hook.result.current.tools.map(({ name }) => name)).toContain('echo');
        expect(hook.result.current.resources.map(({ uri }) => uri)).toContain('config://settings');
      });

      const toolResult = await hook.result.current.client.callTool({
        name: 'echo',
        arguments: { message: 'hello' },
      });
      const resourceResult = await hook.result.current.client.readResource({
        uri: 'config://settings',
      });

      expect(toolResult.content[0]).toMatchObject({ type: 'text', text: 'echo:hello' });
      expect(resourceResult.contents[0]).toMatchObject({
        uri: 'config://settings',
        text: '{"theme":"dark"}',
      });
    } finally {
      await hook.unmount();
      await closeConnection(connection);
    }
  });

  it('reconnects after remote closure when given a fresh one-shot transport', async () => {
    const connection = await createConnection((server) => {
      server.registerTool('remote_close_tool', {}, async () => ({
        content: [{ type: 'text', text: 'ready' }],
      }));
    });
    const replacementServer = new McpServer({
      name: 'react-webmcp-replacement-server',
      version: '1.0.0',
    });
    replacementServer.registerTool('replacement_tool', {}, async () => ({
      content: [{ type: 'text', text: 'reconnected' }],
    }));
    const [replacementTransport, replacementServerTransport] = InMemoryTransport.createLinkedPair();
    await replacementServer.connect(replacementServerTransport);
    const previousOnclose = vi.fn();
    connection.client.onclose = previousOnclose;
    const connect = vi.spyOn(connection.client, 'connect');
    let requestOptions = { timeout: 1_000 };
    function Provider({ children }: { children: ReactNode }) {
      return (
        <McpClientProvider
          client={connection.client}
          transport={connection.transport}
          opts={requestOptions}
        >
          {children}
        </McpClientProvider>
      );
    }
    const hook = await renderHook(() => useMcpClient(), {
      wrapper: Provider,
    });

    try {
      await vi.waitFor(() => {
        expect(hook.result.current.isConnected).toBe(true);
        expect(hook.result.current.tools).toHaveLength(1);
      });

      requestOptions = { timeout: 2_000 };
      await hook.rerender();
      await connection.server.close();

      await vi.waitFor(() => {
        expect(previousOnclose).toHaveBeenCalledOnce();
        expect(connection.client.transport).toBeUndefined();
        expect(hook.result.current.isConnected).toBe(false);
        expect(hook.result.current.tools).toEqual([]);
        expect(hook.result.current.capabilities).toBeNull();
      });

      connection.transport.start = vi.fn(async () => {
        throw new Error('fresh transport required');
      });

      await hook.act(async () => {
        await hook.result.current.reconnect(replacementTransport);
      });
      await vi.waitFor(() => {
        expect(hook.result.current.error).toBeNull();
        expect(hook.result.current.isConnected).toBe(true);
        expect(hook.result.current.tools.map(({ name }) => name)).toEqual(['replacement_tool']);
      });
      expect(connect.mock.calls[1]?.[0]).toBe(replacementTransport);
      expect(connect.mock.calls[1]?.[1]).toBe(requestOptions);
      expect(connect).toHaveBeenCalledTimes(2);
    } finally {
      await hook.unmount();
      expect(connection.client.onclose).toBe(previousOnclose);
      await Promise.allSettled([
        connection.client.close(),
        connection.server.close(),
        replacementServer.close(),
      ]);
    }
  });

  it('keeps the handshake alive and recovers an initial inventory failure', async () => {
    const connection = await createConnection((server) => {
      server.registerTool('still_callable', {}, async () => ({
        content: [{ type: 'text', text: 'usable' }],
      }));
    });
    vi.spyOn(connection.client, 'getServerCapabilities').mockReturnValue({ tools: {} });
    const listTools = vi
      .spyOn(connection.client, 'listTools')
      .mockRejectedValueOnce(new Error('inventory unavailable'))
      .mockResolvedValue({
        tools: [{ name: 'recovered_tool', inputSchema: { type: 'object' } }],
      });
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const hook = await renderHook(() => useMcpClient(), {
      wrapper: providerFor(connection),
    });

    try {
      await vi.waitFor(() => {
        expect(hook.result.current.error?.message).toBe('inventory unavailable');
        expect(hook.result.current.isConnected).toBe(true);
        expect(hook.result.current.isLoading).toBe(false);
      });
      expect(connection.client.transport).toBeDefined();
      await expect(
        connection.client.callTool({ name: 'still_callable', arguments: {} })
      ).resolves.toMatchObject({
        content: [{ type: 'text', text: 'usable' }],
      });

      await hook.act(async () => {
        await hook.result.current.reconnect();
      });
      await vi.waitFor(() => {
        expect(hook.result.current.error).toBeNull();
        expect(hook.result.current.isConnected).toBe(true);
        expect(hook.result.current.isLoading).toBe(false);
        expect(hook.result.current.tools.map(({ name }) => name)).toEqual(['recovered_tool']);
      });
      expect(listTools).toHaveBeenCalledTimes(2);
    } finally {
      consoleError.mockRestore();
      await hook.unmount();
      await closeConnection(connection);
    }
  });

  it('keeps the last complete inventory when one list refresh fails', async () => {
    const connection = await createConnection((server) => {
      server.registerTool('stable_tool', {}, async () => ({
        content: [{ type: 'text', text: 'stable' }],
      }));
      server.registerResource('stable_resource', 'stable://resource', {}, async (uri) => ({
        contents: [{ uri: uri.href, text: 'stable' }],
      }));
    });
    vi.spyOn(connection.client, 'getServerCapabilities').mockReturnValue({
      resources: {},
      tools: {},
    });
    const listResources = vi.spyOn(connection.client, 'listResources');
    const listTools = vi.spyOn(connection.client, 'listTools');
    const hook = await renderHook(() => useMcpClient(), {
      wrapper: providerFor(connection),
    });

    try {
      await vi.waitFor(() => {
        expect(hook.result.current.resources.map(({ uri }) => uri)).toEqual(['stable://resource']);
        expect(hook.result.current.tools.map(({ name }) => name)).toEqual(['stable_tool']);
      });

      listResources.mockResolvedValueOnce({
        resources: [{ uri: 'new://resource', name: 'New resource' }],
      });
      listTools.mockRejectedValueOnce(new Error('tool inventory unavailable'));
      await hook.act(async () => hook.result.current.reconnect());

      expect(hook.result.current.error?.message).toBe('tool inventory unavailable');
      expect(hook.result.current.resources.map(({ uri }) => uri)).toEqual(['stable://resource']);
      expect(hook.result.current.tools.map(({ name }) => name)).toEqual(['stable_tool']);
    } finally {
      await hook.unmount();
      await closeConnection(connection);
    }
  });

  it('clears an inventory error after a subscribed full refresh succeeds', async () => {
    const connection = await createConnection((server) => {
      server.registerTool('subscribed_recovery', {}, async () => ({
        content: [{ type: 'text', text: 'ready' }],
      }));
    });
    vi.spyOn(connection.client, 'getServerCapabilities').mockReturnValue({
      tools: { listChanged: true },
    });
    vi.spyOn(connection.client, 'getProtocolEra').mockReturnValue('modern');
    const subscription = {
      honoredFilter: { toolsListChanged: true },
      close: vi.fn(async () => {}),
      closed: new Promise<'local' | 'graceful' | 'remote'>(() => {}),
    };
    let acknowledgeSubscription!: (value: typeof subscription) => void;
    const subscriptionAcknowledged = new Promise<typeof subscription>((resolve) => {
      acknowledgeSubscription = resolve;
    });
    const listen = vi
      .spyOn(connection.client, 'listen')
      .mockImplementation(async () => subscriptionAcknowledged);
    const listTools = vi
      .spyOn(connection.client, 'listTools')
      .mockRejectedValueOnce(new Error('inventory unavailable'))
      .mockResolvedValue({
        tools: [{ name: 'subscribed_recovery', inputSchema: { type: 'object' } }],
      });
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const hook = await renderHook(() => useMcpClient(), {
      wrapper: providerFor(connection),
    });

    try {
      await vi.waitFor(() => {
        expect(hook.result.current.error?.message).toBe('inventory unavailable');
        expect(hook.result.current.isConnected).toBe(true);
        expect(listen).toHaveBeenCalledTimes(1);
        expect(listTools).toHaveBeenCalledTimes(1);
      });

      acknowledgeSubscription(subscription);
      await vi.waitFor(() => {
        expect(hook.result.current.error).toBeNull();
        expect(hook.result.current.tools.map(({ name }) => name)).toEqual(['subscribed_recovery']);
        expect(listTools).toHaveBeenCalledTimes(2);
      });
    } finally {
      consoleError.mockRestore();
      await hook.unmount();
      await closeConnection(connection);
    }
  });

  it('refreshes every provider-owned tool and resource list read', async () => {
    const connection = await createConnection((server) => {
      server.registerTool('cached_tool', {}, async () => ({
        content: [{ type: 'text', text: 'tool' }],
      }));
      server.registerResource('cached_resource', 'cache://resource', {}, async (uri) => ({
        contents: [{ uri: uri.href, text: 'resource' }],
      }));
    });
    const listTools = vi.spyOn(connection.client, 'listTools');
    const listResources = vi.spyOn(connection.client, 'listResources');

    const hook = await renderHook(() => useMcpClient(), {
      wrapper: providerFor(connection),
    });

    try {
      await vi.waitFor(() => {
        expect(hook.result.current.tools.map(({ name }) => name)).toContain('cached_tool');
        expect(hook.result.current.resources.map(({ uri }) => uri)).toContain('cache://resource');
      });

      expect(listTools.mock.calls.length).toBeGreaterThan(0);
      expect(listResources.mock.calls.length).toBeGreaterThan(0);
      expect(listTools.mock.calls.every(([, options]) => options?.cacheMode === 'refresh')).toBe(
        true
      );
      expect(
        listResources.mock.calls.every(([, options]) => options?.cacheMode === 'refresh')
      ).toBe(true);
    } finally {
      await hook.unmount();
      await closeConnection(connection);
    }
  });

  it('opens and aborts a modern list-changed subscription', async () => {
    const connection = await createConnection((server) => {
      server.registerTool('modern_tool', {}, async () => ({
        content: [{ type: 'text', text: 'tool' }],
      }));
      server.registerResource('modern_resource', 'modern://resource', {}, async (uri) => ({
        contents: [{ uri: uri.href, text: 'resource' }],
      }));
    });
    vi.spyOn(connection.client, 'getProtocolEra').mockReturnValue('modern');
    const subscription = {
      honoredFilter: {
        toolsListChanged: true,
        resourcesListChanged: true,
      },
      close: vi.fn(async () => {}),
      closed: new Promise<'local' | 'graceful' | 'remote'>(() => {}),
    };
    let acknowledgeSubscription!: (value: typeof subscription) => void;
    const subscriptionAcknowledged = new Promise<typeof subscription>((resolve) => {
      acknowledgeSubscription = resolve;
    });
    const listen = vi
      .spyOn(connection.client, 'listen')
      .mockImplementation(async () => subscriptionAcknowledged);
    const listTools = vi.spyOn(connection.client, 'listTools');
    const listResources = vi.spyOn(connection.client, 'listResources');

    const hook = await renderHook(() => useMcpClient(), {
      wrapper: providerFor(connection),
    });

    let unmounted = false;
    try {
      await vi.waitFor(() => {
        expect(listen).toHaveBeenCalledTimes(1);
      });
      const [filter, options] = listen.mock.calls[0] ?? [];
      expect(filter).toEqual({
        toolsListChanged: true,
        resourcesListChanged: true,
      });
      expect(options?.signal?.aborted).toBe(false);
      expect(listTools).toHaveBeenCalledTimes(1);
      expect(listResources).toHaveBeenCalledTimes(1);

      acknowledgeSubscription(subscription);
      await vi.waitFor(() => {
        expect(listTools).toHaveBeenCalledTimes(2);
        expect(listResources).toHaveBeenCalledTimes(2);
      });

      await hook.unmount();
      unmounted = true;

      expect(options?.signal?.aborted).toBe(true);
    } finally {
      if (!unmounted) {
        await hook.unmount();
      }
      await closeConnection(connection);
    }
  });

  it('refreshes the tool list after a real list_changed notification', async () => {
    let addTool: (() => void) | undefined;
    const connection = await createConnection((server) => {
      server.registerTool('initial', {}, async () => ({
        content: [{ type: 'text', text: 'initial' }],
      }));
      addTool = () => {
        server.registerTool('added_later', {}, async () => ({
          content: [{ type: 'text', text: 'added' }],
        }));
      };
    });

    const hook = await renderHook(() => useMcpClient(), {
      wrapper: providerFor(connection),
    });

    try {
      await vi.waitFor(() => {
        expect(hook.result.current.tools.map(({ name }) => name)).toEqual(['initial']);
      });

      addTool?.();

      await vi.waitFor(() => {
        expect(hook.result.current.tools.map(({ name }) => name)).toEqual([
          'initial',
          'added_later',
        ]);
      });
    } finally {
      await hook.unmount();
      await closeConnection(connection);
    }
  });

  it('refreshes after installing handlers to close the initial snapshot race', async () => {
    const connection = await createConnection((server) => {
      server.registerTool('initial', {}, async () => ({
        content: [{ type: 'text', text: 'initial' }],
      }));
    });
    let availableTools = [{ name: 'initial', inputSchema: { type: 'object' as const } }];
    const listTools = vi.spyOn(connection.client, 'listTools').mockImplementation(async () => ({
      tools: [...availableTools],
    }));
    let subscribedAfterInitialSnapshot = false;
    vi.spyOn(connection.client, 'setNotificationHandler').mockImplementation((method) => {
      if (method === 'notifications/tools/list_changed') {
        subscribedAfterInitialSnapshot = listTools.mock.calls.length === 1;
        availableTools = [
          ...availableTools,
          { name: 'added_during_subscription', inputSchema: { type: 'object' as const } },
        ];
      }
    });

    const hook = await renderHook(() => useMcpClient(), {
      wrapper: providerFor(connection),
    });

    try {
      await vi.waitFor(() => {
        expect(hook.result.current.tools.map(({ name }) => name)).toEqual([
          'initial',
          'added_during_subscription',
        ]);
      });
      expect(subscribedAfterInitialSnapshot).toBe(true);
      expect(listTools).toHaveBeenCalledTimes(2);
    } finally {
      await hook.unmount();
      await closeConnection(connection);
    }
  });

  it('does not refetch a list when the server cannot notify changes', async () => {
    const connection = await createConnection((server) => {
      server.registerTool('stable', {}, async () => ({
        content: [{ type: 'text', text: 'stable' }],
      }));
    });
    vi.spyOn(connection.client, 'getServerCapabilities').mockReturnValue({ tools: {} });
    const listTools = vi.spyOn(connection.client, 'listTools');

    const hook = await renderHook(() => useMcpClient(), {
      wrapper: providerFor(connection),
    });

    try {
      await vi.waitFor(() => {
        expect(hook.result.current.isConnected).toBe(true);
        expect(hook.result.current.tools.map(({ name }) => name)).toEqual(['stable']);
      });
      expect(listTools).toHaveBeenCalledTimes(1);
    } finally {
      await hook.unmount();
      await closeConnection(connection);
    }
  });

  it('keeps the newest tool snapshot when overlapping refreshes finish out of order', async () => {
    const connection = await createConnection((server) => {
      server.registerTool('initial', {}, async () => ({
        content: [{ type: 'text', text: 'initial' }],
      }));
    });
    type ToolList = Awaited<ReturnType<Client['listTools']>>;
    let resolveInitialSnapshot!: (value: ToolList) => void;
    const initialSnapshot = new Promise<ToolList>((resolve) => {
      resolveInitialSnapshot = resolve;
    });
    const listTools = vi
      .spyOn(connection.client, 'listTools')
      .mockImplementationOnce(async () => initialSnapshot)
      .mockResolvedValueOnce({
        tools: [
          { name: 'initial', inputSchema: { type: 'object' } },
          { name: 'newest', inputSchema: { type: 'object' } },
        ],
      });

    const hook = await renderHook(() => useMcpClient(), {
      wrapper: providerFor(connection),
    });

    try {
      await vi.waitFor(() => {
        expect(listTools).toHaveBeenCalledTimes(2);
        expect(hook.result.current.isLoading).toBe(true);
        expect(hook.result.current.tools.map(({ name }) => name)).toEqual(['initial', 'newest']);
      });

      await hook.act(async () => {
        resolveInitialSnapshot({
          tools: [{ name: 'initial', inputSchema: { type: 'object' } }],
        });
        await initialSnapshot;
      });

      expect(hook.result.current.tools.map(({ name }) => name)).toEqual(['initial', 'newest']);
    } finally {
      await hook.unmount();
      await closeConnection(connection);
    }
  });
});
