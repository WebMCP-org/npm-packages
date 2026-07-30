import {
  type Client,
  type RequestOptions,
  type Resource,
  type ServerCapabilities,
  type Tool as McpTool,
  type Transport,
} from '@modelcontextprotocol/client';
import {
  createContext,
  type ReactElement,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';

/**
 * Context value provided by McpClientProvider.
 *
 * @internal
 */
interface McpClientContextValue {
  client: Client;
  tools: McpTool[];
  resources: Resource[];
  isConnected: boolean;
  isLoading: boolean;
  error: Error | null;
  capabilities: ServerCapabilities | null;
  reconnect: () => Promise<void>;
}

const McpClientContext = createContext<McpClientContextValue | null>(null);
const EMPTY_REQUEST_OPTS: RequestOptions = {};

/**
 * Props for the McpClientProvider component.
 *
 * @public
 */
export interface McpClientProviderProps {
  /**
   * React children to render within the provider.
   */
  children: ReactNode;

  /**
   * MCP Client instance to use for communication.
   */
  client: Client;

  /**
   * Transport instance for the client to connect through.
   */
  transport: Transport;

  /**
   * Optional request options for the connection.
   */
  opts?: RequestOptions;
}

/**
 * Provider component that manages an MCP client connection and exposes
 * tools, resources, and connection state to child components.
 *
 * This provider handles:
 * - Establishing and maintaining the MCP client connection
 * - Fetching available tools and resources from the server
 * - Listening for server notifications about tool/resource changes
 * - Managing connection state and errors
 * - Automatic cleanup on unmount
 *
 * @param props - Component props
 * @returns Provider component wrapping children
 *
 * @public
 *
 * @example
 * Connect to an MCP server via tab transport:
 * ```tsx
 * import { TabClientTransport } from '@mcp-b/transports';
 * import { McpClientProvider } from '@mcp-b/react-webmcp';
 * import { Client } from '@modelcontextprotocol/client';
 *
 * const client = new Client(
 *   { name: 'my-app', version: '1.0.0' },
 *   { versionNegotiation: { mode: 'auto' } }
 * );
 *
 * const transport = new TabClientTransport({
 *   channelId: 'mcp',
 *   targetOrigin: window.location.origin,
 * });
 *
 * function App() {
 *   return (
 *     <McpClientProvider client={client} transport={transport}>
 *       <MyAppContent />
 *     </McpClientProvider>
 *   );
 * }
 * ```
 *
 * @example
 * Access tools from child components:
 * ```tsx
 * function MyAppContent() {
 *   const { tools, isConnected, isLoading } = useMcpClient();
 *
 *   if (isLoading) {
 *     return <div>Connecting to MCP server...</div>;
 *   }
 *
 *   if (!isConnected) {
 *     return <div>Failed to connect to MCP server</div>;
 *   }
 *
 *   return (
 *     <div>
 *       <h2>Available Tools:</h2>
 *       <ul>
 *         {tools.map(tool => (
 *           <li key={tool.name}>{tool.description}</li>
 *         ))}
 *       </ul>
 *     </div>
 *   );
 * }
 * ```
 */
export function McpClientProvider({
  children,
  client,
  transport,
  opts,
}: McpClientProviderProps): ReactElement {
  const [resources, setResources] = useState<Resource[]>([]);
  const [tools, setTools] = useState<McpTool[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<Error | null>(null);
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [capabilities, setCapabilities] = useState<ServerCapabilities | null>(null);
  const requestOpts = opts ?? EMPTY_REQUEST_OPTS;

  const connectionStateRef = useRef<'disconnected' | 'connecting' | 'connected'>('disconnected');
  const connectionGenerationRef = useRef(0);

  /**
   * Fetches available resources from the MCP server.
   * Only fetches if the server supports the resources capability.
   */
  const fetchResourcesInternal = useCallback(async () => {
    const serverCapabilities = client.getServerCapabilities();
    if (!serverCapabilities?.resources) {
      setResources([]);
      return;
    }

    try {
      const response = await client.listResources();
      setResources(response.resources);
    } catch (e) {
      console.error('[ReactWebMCP:McpClientProvider]', 'Error fetching resources:', e);
      throw e;
    }
  }, [client]);

  /**
   * Fetches available tools from the MCP server.
   * Only fetches if the server supports the tools capability.
   */
  const fetchToolsInternal = useCallback(async () => {
    const serverCapabilities = client.getServerCapabilities();
    if (!serverCapabilities?.tools) {
      setTools([]);
      return;
    }

    try {
      const response = await client.listTools();
      setTools(response.tools);
    } catch (e) {
      console.error('[ReactWebMCP:McpClientProvider]', 'Error fetching tools:', e);
      throw e;
    }
  }, [client]);

  /**
   * Establishes connection to the MCP server.
   * Safe to call multiple times - will no-op if already connected or connecting.
   */
  const reconnect = useCallback(async () => {
    if (connectionStateRef.current !== 'disconnected') {
      return;
    }

    connectionStateRef.current = 'connecting';
    setIsLoading(true);
    setError(null);
    const connectionGeneration = connectionGenerationRef.current;

    try {
      await client.connect(transport, requestOpts);
      if (connectionGeneration !== connectionGenerationRef.current) {
        return;
      }
      const caps = client.getServerCapabilities();
      setIsConnected(true);
      setCapabilities(caps ?? null);
      connectionStateRef.current = 'connected';

      await Promise.all([fetchResourcesInternal(), fetchToolsInternal()]);
    } catch (e) {
      const err = e instanceof Error ? e : new Error(String(e));
      if (connectionGeneration === connectionGenerationRef.current) {
        connectionStateRef.current = 'disconnected';
        setError(err);
      }
      throw err;
    } finally {
      if (connectionGeneration === connectionGenerationRef.current) {
        setIsLoading(false);
      }
    }
  }, [client, transport, requestOpts, fetchResourcesInternal, fetchToolsInternal]);

  useEffect(() => {
    if (!isConnected) {
      return;
    }

    const serverCapabilities = client.getServerCapabilities();

    const handleResourcesChanged = () => {
      fetchResourcesInternal().catch((error) => {
        console.error(
          '[ReactWebMCP:McpClientProvider]',
          'Failed to refresh resources after list_changed:',
          error
        );
      });
    };

    const handleToolsChanged = () => {
      fetchToolsInternal().catch((error) => {
        console.error(
          '[ReactWebMCP:McpClientProvider]',
          'Failed to refresh tools after list_changed:',
          error
        );
      });
    };

    if (serverCapabilities?.resources?.listChanged) {
      client.setNotificationHandler('notifications/resources/list_changed', handleResourcesChanged);
    }

    if (serverCapabilities?.tools?.listChanged) {
      client.setNotificationHandler('notifications/tools/list_changed', handleToolsChanged);
    }

    return () => {
      if (serverCapabilities?.resources?.listChanged) {
        client.removeNotificationHandler('notifications/resources/list_changed');
      }

      if (serverCapabilities?.tools?.listChanged) {
        client.removeNotificationHandler('notifications/tools/list_changed');
      }
    };
  }, [client, isConnected, fetchResourcesInternal, fetchToolsInternal]);

  useEffect(() => {
    const connectionGeneration = connectionGenerationRef.current;
    connectionStateRef.current = 'disconnected';
    setIsConnected(false);

    // Initial connection - reconnect() has its own guard to prevent concurrent connections
    reconnect().catch((err) => {
      if (connectionGeneration === connectionGenerationRef.current) {
        console.error('[ReactWebMCP:McpClientProvider]', 'Failed to connect MCP client:', err);
      }
    });

    return () => {
      if (connectionGenerationRef.current === connectionGeneration) {
        connectionGenerationRef.current += 1;
      }
      connectionStateRef.current = 'disconnected';
      void client.close().catch((error: unknown) => {
        console.error('[ReactWebMCP:McpClientProvider]', 'Failed to close MCP client:', error);
      });
    };
  }, [client, transport, reconnect]);

  return (
    <McpClientContext.Provider
      value={{
        client,
        tools,
        resources,
        isConnected,
        isLoading,
        error,
        capabilities,
        reconnect,
      }}
    >
      {children}
    </McpClientContext.Provider>
  );
}

/**
 * Hook to access the MCP client context.
 * Must be used within an {@link McpClientProvider}.
 *
 * @returns The MCP client context including client instance, tools, resources, and connection state
 * @throws Error if used outside of McpClientProvider
 *
 * @public
 *
 * @example
 * ```tsx
 * function ToolsList() {
 *   const { tools, isConnected, error, reconnect } = useMcpClient();
 *
 *   if (error) {
 *     return (
 *       <div>
 *         Error: {error.message}
 *         <button onClick={reconnect}>Retry</button>
 *       </div>
 *     );
 *   }
 *
 *   if (!isConnected) {
 *     return <div>Not connected</div>;
 *   }
 *
 *   return (
 *     <ul>
 *       {tools.map(tool => (
 *         <li key={tool.name}>{tool.description}</li>
 *       ))}
 *     </ul>
 *   );
 * }
 * ```
 */
export function useMcpClient() {
  const context = useContext(McpClientContext);
  if (!context) {
    throw new Error('useMcpClient must be used within an McpClientProvider');
  }
  return context;
}
