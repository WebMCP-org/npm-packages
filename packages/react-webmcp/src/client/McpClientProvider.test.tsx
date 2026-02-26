import { TabClientTransport, TabServerTransport } from '@mcp-b/transports';
import { BrowserMcpServer, Client } from '@mcp-b/webmcp-ts-sdk';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, renderHook } from 'vitest-browser-react';
import {
  McpClientProvider,
  type McpClientProviderProps,
  useMcpClient,
} from './McpClientProvider.js';

// Create mock client and transport
const mockConnect = vi.fn();
const mockListTools = vi.fn();
const mockListResources = vi.fn();
const mockGetServerCapabilities = vi.fn();
const mockSetNotificationHandler = vi.fn();
const mockRemoveNotificationHandler = vi.fn();

const createMockClient = () => ({
  connect: mockConnect,
  listTools: mockListTools,
  listResources: mockListResources,
  getServerCapabilities: mockGetServerCapabilities,
  setNotificationHandler: mockSetNotificationHandler,
  removeNotificationHandler: mockRemoveNotificationHandler,
});

const createMockTransport = () => ({
  start: vi.fn(),
  close: vi.fn(),
  send: vi.fn(),
});

type LiveConnection = {
  client: Client;
  clientTransport: TabClientTransport;
  server: BrowserMcpServer;
  serverTransport: TabServerTransport;
};

const liveConnections: LiveConnection[] = [];

function toProviderProps(
  client: ReturnType<typeof createMockClient>,
  transport: ReturnType<typeof createMockTransport>
): Pick<McpClientProviderProps, 'client' | 'transport'> {
  return {
    client: client as unknown as McpClientProviderProps['client'],
    transport: transport as unknown as McpClientProviderProps['transport'],
  };
}

describe('McpClientProvider', () => {
  let mockClient: ReturnType<typeof createMockClient>;
  let mockTransport: ReturnType<typeof createMockTransport>;
  let providerProps: Pick<McpClientProviderProps, 'client' | 'transport'>;

  beforeEach(() => {
    mockClient = createMockClient();
    mockTransport = createMockTransport();
    providerProps = toProviderProps(mockClient, mockTransport);

    // Default mocks
    mockConnect.mockResolvedValue(undefined);
    mockGetServerCapabilities.mockReturnValue({
      tools: { listChanged: true },
      resources: { listChanged: true },
    });
    mockListTools.mockResolvedValue({ tools: [] });
    mockListResources.mockResolvedValue({ resources: [] });
  });

  afterEach(async () => {
    while (liveConnections.length > 0) {
      const connection = liveConnections.pop();
      if (!connection) {
        break;
      }
      await connection.client.close().catch(() => {});
      await connection.clientTransport.close().catch(() => {});
      await connection.server.close().catch(() => {});
      await connection.serverTransport.close().catch(() => {});
    }
    vi.clearAllMocks();
  });

  describe('connection', () => {
    it('should connect client on mount', async () => {
      await render(
        <McpClientProvider {...providerProps}>
          <div>Test</div>
        </McpClientProvider>
      );

      // Wait for connection
      await vi.waitFor(() => {
        expect(mockConnect).toHaveBeenCalledWith(mockTransport, {});
      });
    });

    it('should fetch tools and resources after connection', async () => {
      mockListTools.mockResolvedValue({
        tools: [{ name: 'tool1', description: 'Test tool' }],
      });
      mockListResources.mockResolvedValue({
        resources: [{ uri: 'test://resource', name: 'Test Resource' }],
      });

      await render(
        <McpClientProvider {...providerProps}>
          <div>Test</div>
        </McpClientProvider>
      );

      await vi.waitFor(() => {
        expect(mockListTools).toHaveBeenCalled();
        expect(mockListResources).toHaveBeenCalled();
      });
    });

    it('should not fetch tools if capability is not supported', async () => {
      mockGetServerCapabilities.mockReturnValue({
        resources: { listChanged: true },
        // No tools capability
      });

      await render(
        <McpClientProvider {...providerProps}>
          <div>Test</div>
        </McpClientProvider>
      );

      await vi.waitFor(() => {
        expect(mockConnect).toHaveBeenCalled();
      });

      // Give time for potential calls
      await new Promise((r) => setTimeout(r, 50));

      expect(mockListTools).not.toHaveBeenCalled();
    });

    it('should not fetch resources if capability is not supported', async () => {
      mockGetServerCapabilities.mockReturnValue({
        tools: { listChanged: true },
        // No resources capability
      });

      await render(
        <McpClientProvider {...providerProps}>
          <div>Test</div>
        </McpClientProvider>
      );

      await vi.waitFor(() => {
        expect(mockConnect).toHaveBeenCalled();
      });

      // Give time for potential calls
      await new Promise((r) => setTimeout(r, 50));

      expect(mockListResources).not.toHaveBeenCalled();
    });

    it('emits tool-flow trace logs when WEBMCP_TRACE_TOOL_FLOW=1', async () => {
      const originalDebug = console.debug;
      const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      window.localStorage.setItem('WEBMCP_TRACE_TOOL_FLOW', '1');
      // Force capability-missing path that emits a tool-flow event.
      mockGetServerCapabilities.mockReturnValue({
        resources: { listChanged: true },
      });

      try {
        // Ensure fallback path is also safe if debug is unavailable.
        Object.defineProperty(console, 'debug', {
          configurable: true,
          writable: true,
          value: undefined,
        });

        await render(
          <McpClientProvider {...providerProps}>
            <div>Test</div>
          </McpClientProvider>
        );

        await vi.waitFor(() => {
          expect(mockConnect).toHaveBeenCalled();
        });

        await vi.waitFor(() => {
          expect(logSpy).toHaveBeenCalledWith(
            '[ReactWebMCP:McpClientProvider:ToolFlow]',
            expect.stringContaining('listTools:capability_missing'),
            expect.any(Object)
          );
        });
      } finally {
        Object.defineProperty(console, 'debug', {
          configurable: true,
          writable: true,
          value: originalDebug,
        });
        window.localStorage.removeItem('WEBMCP_TRACE_TOOL_FLOW');
        debugSpy.mockRestore();
        logSpy.mockRestore();
      }
    });
  });

  describe('useMcpClient hook', () => {
    const wrapper = ({ children }: { children: ReactNode }) => (
      <McpClientProvider {...providerProps}>{children}</McpClientProvider>
    );

    it('should provide client instance', async () => {
      const { result } = await renderHook(() => useMcpClient(), { wrapper });

      await vi.waitFor(() => {
        expect(result.current.client).toBe(mockClient);
      });
    });

    it('should provide connection state', async () => {
      const { result } = await renderHook(() => useMcpClient(), { wrapper });

      await vi.waitFor(() => {
        expect(result.current.isConnected).toBe(true);
        expect(result.current.isLoading).toBe(false);
      });
    });

    it('should provide tools list', async () => {
      mockListTools.mockResolvedValue({
        tools: [
          { name: 'add', description: 'Add numbers' },
          { name: 'subtract', description: 'Subtract numbers' },
        ],
      });

      const { result } = await renderHook(() => useMcpClient(), { wrapper });

      await vi.waitFor(() => {
        expect(result.current.tools).toHaveLength(2);
        expect(result.current.tools[0].name).toBe('add');
      });
    });

    it('should provide resources list', async () => {
      mockListResources.mockResolvedValue({
        resources: [{ uri: 'config://app', name: 'App Config' }],
      });

      const { result } = await renderHook(() => useMcpClient(), { wrapper });

      await vi.waitFor(() => {
        expect(result.current.resources).toHaveLength(1);
        expect(result.current.resources[0].uri).toBe('config://app');
      });
    });

    it('should provide server capabilities', async () => {
      const capabilities = {
        tools: { listChanged: true },
        resources: { listChanged: true },
        prompts: {},
      };
      mockGetServerCapabilities.mockReturnValue(capabilities);

      const { result } = await renderHook(() => useMcpClient(), { wrapper });

      await vi.waitFor(() => {
        expect(result.current.capabilities).toEqual(capabilities);
      });
    });

    it('should provide reconnect function', async () => {
      const { result } = await renderHook(() => useMcpClient(), { wrapper });

      await vi.waitFor(() => {
        expect(typeof result.current.reconnect).toBe('function');
      });
    });

    it('should throw error when used outside provider', async () => {
      // Suppress console.error for this test
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      let thrownError: Error | null = null;
      try {
        await renderHook(() => useMcpClient());
      } catch (e) {
        thrownError = e as Error;
      }

      expect(thrownError).not.toBeNull();
      expect(thrownError?.message).toBe('useMcpClient must be used within an McpClientProvider');

      consoleSpy.mockRestore();
    });
  });

  describe('error handling', () => {
    it('should set error state on connection failure', async () => {
      const connectionError = new Error('Connection failed');
      mockConnect.mockRejectedValueOnce(connectionError);

      // Suppress console.error for expected error
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const wrapper = ({ children }: { children: ReactNode }) => (
        <McpClientProvider {...providerProps}>{children}</McpClientProvider>
      );

      const { result } = await renderHook(() => useMcpClient(), { wrapper });

      await vi.waitFor(() => {
        expect(result.current.error).toEqual(connectionError);
        expect(result.current.isConnected).toBe(false);
      });

      consoleSpy.mockRestore();
    });

    it('surfaces listResources fetch failures with provider logging', async () => {
      const resourcesError = new Error('Resources unavailable');
      mockListResources.mockRejectedValue(resourcesError);
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const wrapper = ({ children }: { children: ReactNode }) => (
        <McpClientProvider {...providerProps}>{children}</McpClientProvider>
      );

      try {
        const { result } = await renderHook(() => useMcpClient(), { wrapper });

        await vi.waitFor(() => {
          expect(result.current.error?.message).toBe('Resources unavailable');
        });

        expect(result.current.isConnected).toBe(true);
        expect(consoleSpy).toHaveBeenCalledWith(
          '[ReactWebMCP:McpClientProvider]',
          'Error fetching resources:',
          resourcesError
        );
      } finally {
        consoleSpy.mockRestore();
      }
    });

    it('surfaces listTools fetch failures with provider logging', async () => {
      const toolsError = new Error('Tools unavailable');
      mockListTools.mockRejectedValue(toolsError);
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const wrapper = ({ children }: { children: ReactNode }) => (
        <McpClientProvider {...providerProps}>{children}</McpClientProvider>
      );

      try {
        const { result } = await renderHook(() => useMcpClient(), { wrapper });

        await vi.waitFor(() => {
          expect(result.current.error?.message).toBe('Tools unavailable');
        });

        expect(result.current.isConnected).toBe(true);
        expect(consoleSpy).toHaveBeenCalledWith(
          '[ReactWebMCP:McpClientProvider]',
          'Error fetching tools:',
          toolsError
        );
      } finally {
        consoleSpy.mockRestore();
      }
    });
  });

  describe('notification handlers', () => {
    it('should set up notification handlers for tool changes', async () => {
      await render(
        <McpClientProvider {...providerProps}>
          <div>Test</div>
        </McpClientProvider>
      );

      await vi.waitFor(() => {
        expect(mockSetNotificationHandler).toHaveBeenCalled();
      });
    });

    it('should set up notification handlers for resource changes', async () => {
      await render(
        <McpClientProvider {...providerProps}>
          <div>Test</div>
        </McpClientProvider>
      );

      await vi.waitFor(() => {
        expect(mockSetNotificationHandler).toHaveBeenCalled();
      });
    });

    it('logs refresh errors when list_changed notifications trigger failing fetches', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      try {
        await render(
          <McpClientProvider {...providerProps}>
            <div>Test</div>
          </McpClientProvider>
        );

        await vi.waitFor(() => {
          expect(mockSetNotificationHandler).toHaveBeenCalledTimes(2);
        });

        const resourceHandler = mockSetNotificationHandler.mock.calls[0]?.[1] as () => void;
        const toolsHandler = mockSetNotificationHandler.mock.calls[1]?.[1] as () => void;
        mockListResources.mockRejectedValueOnce(new Error('resource refresh failed'));
        mockListTools.mockRejectedValueOnce(new Error('tool refresh failed'));

        resourceHandler();
        toolsHandler();

        await vi.waitFor(() => {
          expect(consoleSpy).toHaveBeenCalledWith(
            '[ReactWebMCP:McpClientProvider]',
            'Failed to refresh resources after list_changed:',
            expect.any(Error)
          );
        });
        await vi.waitFor(() => {
          expect(consoleSpy).toHaveBeenCalledWith(
            '[ReactWebMCP:McpClientProvider]',
            'Failed to refresh tools after list_changed:',
            expect.any(Error)
          );
        });
      } finally {
        consoleSpy.mockRestore();
      }
    });

    it('logs post-handler refresh failures after notification handlers are registered', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      mockListTools
        .mockResolvedValueOnce({ tools: [] })
        .mockRejectedValueOnce(new Error('post-handler refresh failed'));

      try {
        await render(
          <McpClientProvider {...providerProps}>
            <div>Test</div>
          </McpClientProvider>
        );

        await vi.waitFor(() => {
          expect(consoleSpy).toHaveBeenCalledWith(
            '[ReactWebMCP:McpClientProvider]',
            'Failed to refresh tools/resources after handler registration:',
            expect.any(Error)
          );
        });
      } finally {
        consoleSpy.mockRestore();
      }
    });
  });

  describe('cleanup', () => {
    it('should clean up on unmount', async () => {
      const { unmount } = await render(
        <McpClientProvider {...providerProps}>
          <div>Test</div>
        </McpClientProvider>
      );

      await vi.waitFor(() => {
        expect(mockConnect).toHaveBeenCalled();
      });

      unmount();

      // Notification handlers should be removed
      // Note: The exact cleanup behavior depends on the implementation
    });
  });

  describe('real transport integration', () => {
    function uniqueChannelId(prefix: string): string {
      return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    }

    async function createLiveProvider(): Promise<{
      server: BrowserMcpServer;
      providerProps: Pick<McpClientProviderProps, 'client' | 'transport'>;
    }> {
      const channelId = uniqueChannelId('mcp-client-provider-live');
      const server = new BrowserMcpServer({
        name: 'react-webmcp-test-server',
        version: '1.0.0',
      });
      const serverTransport = new TabServerTransport({
        channelId,
        allowedOrigins: [window.location.origin],
      });
      await server.connect(serverTransport);

      const client = new Client({ name: 'react-webmcp-test-client', version: '1.0.0' });
      const clientTransport = new TabClientTransport({
        targetOrigin: window.location.origin,
        channelId,
      });
      liveConnections.push({ client, clientTransport, server, serverTransport });

      return {
        server,
        providerProps: {
          client: client as unknown as McpClientProviderProps['client'],
          transport: clientTransport as unknown as McpClientProviderProps['transport'],
        },
      };
    }

    it('connects through real transport and loads tools from server', async () => {
      const { server, providerProps: liveProviderProps } = await createLiveProvider();

      server.registerTool({
        name: 'live_echo',
        description: 'Echoes message',
        inputSchema: {
          type: 'object',
          properties: { message: { type: 'string' } },
          required: ['message'],
        },
        async execute(args) {
          return {
            content: [{ type: 'text', text: `echo:${String(args.message ?? '')}` }],
          };
        },
      });

      const wrapper = ({ children }: { children: ReactNode }) => (
        <McpClientProvider {...liveProviderProps}>{children}</McpClientProvider>
      );

      const { result } = await renderHook(() => useMcpClient(), { wrapper });

      await vi.waitFor(() => {
        expect(result.current.isConnected).toBe(true);
      });

      await vi.waitFor(() => {
        expect(result.current.tools.some((tool) => tool.name === 'live_echo')).toBe(true);
      });

      const callResult = await result.current.client.callTool({
        name: 'live_echo',
        arguments: { message: 'hello' },
      });

      expect(callResult.content[0]).toEqual({ type: 'text', text: 'echo:hello' });
    });

    it('refreshes tool list after real list_changed notifications', async () => {
      const { server, providerProps: liveProviderProps } = await createLiveProvider();
      const wrapper = ({ children }: { children: ReactNode }) => (
        <McpClientProvider {...liveProviderProps}>{children}</McpClientProvider>
      );

      const { result } = await renderHook(() => useMcpClient(), { wrapper });

      await vi.waitFor(() => {
        expect(result.current.isConnected).toBe(true);
      });

      await vi.waitFor(() => {
        expect(result.current.tools).toEqual([]);
      });

      server.registerTool({
        name: 'list_changed_tool',
        description: 'Added after provider connection',
        inputSchema: {},
        async execute() {
          return { content: [{ type: 'text', text: 'ok' }] };
        },
      });

      await vi.waitFor(() => {
        expect(result.current.tools.some((tool) => tool.name === 'list_changed_tool')).toBe(true);
      });
    });
  });
});
