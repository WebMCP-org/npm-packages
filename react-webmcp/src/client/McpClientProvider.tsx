import type { Client } from '@modelcontextprotocol/sdk/client/index.js';
import type { RequestOptions } from '@modelcontextprotocol/sdk/shared/protocol.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import type {
  Tool as McpTool,
  Resource,
  ServerCapabilities,
} from '@modelcontextprotocol/sdk/types.js';
import {
  ResourceListChangedNotificationSchema,
  ToolListChangedNotificationSchema,
} from '@modelcontextprotocol/sdk/types.js';
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
 * import { Client } from '@modelcontextprotocol/sdk/client/index.js';
 * import { TabClientTransport } from '@mcp-b/transports';
 * import { McpClientProvider } from '@mcp-b/react-webmcp';
 *
 * const client = new Client(
 *   { name: 'my-app', version: '1.0.0' },
 *   { capabilities: {} }
 * );
 *
 * const transport = new TabClientTransport('mcp', {
 *   clientInstanceId: 'my-app-instance',
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
  opts = {},
}: McpClientProviderProps): ReactElement {
  const [resources, setResources] = useState<Resource[]>([]);
  const [tools, setTools] = useState<McpTool[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<Error | null>(null);
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [capabilities, setCapabilities] = useState<ServerCapabilities | null>(null);

  const connectionStateRef = useRef<'disconnected' | 'connecting' | 'connected'>('disconnected');

  /**
   * Fetches available resources from the MCP server.
   * Only fetches if the server supports the resources capability.
   */
  const fetchResourcesInternal = useCallback(async () => {
    if (!client) return;

    const serverCapabilities = client.getServerCapabilities();
    if (!serverCapabilities?.resources) {
      setResources([]);
      return;
    }

    try {
      const response = await client.listResources();
      setResources(response.resources);
    } catch (e) {
      console.error('Error fetching resources:', e);
      throw e;
    }
  }, [client]);

  /**
   * Fetches available tools from the MCP server.
   * Only fetches if the server supports the tools capability.
   */
  const fetchToolsInternal = useCallback(async () => {
    if (!client) return;

    const serverCapabilities = client.getServerCapabilities();
    if (!serverCapabilities?.tools) {
      setTools([]);
      return;
    }

    try {
      const response = await client.listTools();
      setTools(response.tools);
    } catch (e) {
      console.error('Error fetching tools:', e);
      throw e;
    }
  }, [client]);

  /**
   * Establishes connection to the MCP server.
   * Safe to call multiple times - will no-op if already connected or connecting.
   */
  const reconnect = useCallback(async () => {
    if (!client || !transport) {
      throw new Error('Client or transport not available');
    }

    if (connectionStateRef.current !== 'disconnected') {
      return;
    }

    connectionStateRef.current = 'connecting';
    setIsLoading(true);
    setError(null);

    try {
      await client.connect(transport, opts);
      const caps = client.getServerCapabilities();
      setIsConnected(true);
      setCapabilities(caps || null);
      connectionStateRef.current = 'connected';

      await Promise.all([fetchResourcesInternal(), fetchToolsInternal()]);
    } catch (e) {
      const err = e instanceof Error ? e : new Error(String(e));
      connectionStateRef.current = 'disconnected';
      setError(err);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [client, transport, opts, fetchResourcesInternal, fetchToolsInternal]);

  useEffect(() => {
    if (!isConnected || !client) {
      return;
    }

    const serverCapabilities = client.getServerCapabilities();

    const handleResourcesChanged = () => {
      fetchResourcesInternal().catch(console.error);
    };

    const handleToolsChanged = () => {
      fetchToolsInternal().catch(console.error);
    };

    if (serverCapabilities?.resources?.listChanged) {
      client.setNotificationHandler(ResourceListChangedNotificationSchema, handleResourcesChanged);
    }

    if (serverCapabilities?.tools?.listChanged) {
      client.setNotificationHandler(ToolListChangedNotificationSchema, handleToolsChanged);
    }

    // Re-fetch after setting up handlers to catch any changes that occurred
    // during the gap between initial fetch and handler setup
    Promise.all([fetchResourcesInternal(), fetchToolsInternal()]).catch(console.error);

    return () => {
      if (serverCapabilities?.resources?.listChanged) {
        client.removeNotificationHandler('notifications/resources/list_changed');
      }

      if (serverCapabilities?.tools?.listChanged) {
        client.removeNotificationHandler('notifications/tools/list_changed');
      }
    };
  }, [client, isConnected, fetchResourcesInternal, fetchToolsInternal]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: intentional - reconnect when client/transport props change
  useEffect(() => {
    // Initial connection - reconnect() has its own guard to prevent concurrent connections
    reconnect().catch((err) => {
      console.error('Failed to connect MCP client:', err);
    });

    // Cleanup: mark as disconnected so next mount will reconnect
    return () => {
      connectionStateRef.current = 'disconnected';
      setIsConnected(false);
    };
  }, [client, transport]);

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
