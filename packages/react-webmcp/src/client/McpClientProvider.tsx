import {
  type Client,
  type ConnectOptions,
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
  useMemo,
  useRef,
  useState,
} from 'react';
import { useCommittedRef } from '../useCommittedRef.js';

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
  reconnect: (freshTransport?: Transport) => Promise<void>;
}

type ConnectionState = 'disconnected' | 'connecting' | 'initializing' | 'connected';

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
   * Optional connection options.
   */
  opts?: ConnectOptions;
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
  const [error, setError] = useState<Error | null>(null);
  const [connectionState, setConnectionState] = useState<ConnectionState>('disconnected');
  const [capabilities, setCapabilities] = useState<ServerCapabilities | null>(null);
  const isConnected = connectionState === 'initializing' || connectionState === 'connected';
  const isLoading = connectionState === 'connecting' || connectionState === 'initializing';
  const connectionStateRef = useRef<ConnectionState>('disconnected');
  const connectionGenerationRef = useRef(0);
  const closePromiseRef = useRef<Promise<void> | null>(null);
  const providerCloseRef = useRef<object | null>(null);
  const inventoryRequestRef = useRef(0);
  const requestOptsRef = useCommittedRef(opts);

  /**
   * Refreshes every provider-owned inventory list and clears a prior inventory
   * error only after the complete refresh succeeds.
   */
  const refreshInventory = useCallback(
    async (connectionGeneration: number): Promise<void> => {
      const inventoryRequest = ++inventoryRequestRef.current;
      const isCurrent = () =>
        connectionGeneration === connectionGenerationRef.current &&
        inventoryRequest === inventoryRequestRef.current;
      const serverCapabilities = client.getServerCapabilities();

      try {
        const [resourceResponse, toolResponse] = await Promise.all([
          serverCapabilities?.resources
            ? client.listResources(undefined, { cacheMode: 'refresh' })
            : undefined,
          serverCapabilities?.tools
            ? client.listTools(undefined, { cacheMode: 'refresh' })
            : undefined,
        ]);
        if (!isCurrent()) {
          return;
        }

        setResources(resourceResponse?.resources ?? []);
        setTools(toolResponse?.tools ?? []);
        setError(null);
      } catch (cause) {
        if (!isCurrent()) {
          return;
        }
        const error = cause instanceof Error ? cause : new Error(String(cause));
        setError(error);
        throw error;
      }
    },
    [client]
  );

  /**
   * Connects a disconnected client, or retries inventory discovery when the
   * MCP handshake is already alive. Calls made while work is in progress no-op.
   *
   * Pass a fresh transport after a one-shot transport has closed.
   */
  const reconnect = useCallback(
    async (freshTransport?: Transport): Promise<void> => {
      const connectionGeneration = connectionGenerationRef.current;
      if (connectionStateRef.current !== 'connected' || freshTransport !== undefined) {
        if (connectionStateRef.current !== 'disconnected') {
          return;
        }

        connectionStateRef.current = 'connecting';
        setConnectionState('connecting');
        setError(null);

        try {
          await closePromiseRef.current;
          if (connectionGeneration !== connectionGenerationRef.current) {
            return;
          }
          await client.connect(freshTransport ?? transport, requestOptsRef.current);
          if (connectionGeneration !== connectionGenerationRef.current) {
            return;
          }
        } catch (e) {
          const err = e instanceof Error ? e : new Error(String(e));
          if (connectionGeneration === connectionGenerationRef.current) {
            connectionStateRef.current = 'disconnected';
            setConnectionState('disconnected');
            setError(err);
          }
          throw err;
        }

        setCapabilities(client.getServerCapabilities() ?? null);
      }

      connectionStateRef.current = 'initializing';
      setConnectionState('initializing');
      try {
        await refreshInventory(connectionGeneration);
      } catch {
        // Inventory failure does not undo the completed MCP handshake.
      }

      if (connectionGeneration === connectionGenerationRef.current) {
        connectionStateRef.current = 'connected';
        setConnectionState('connected');
      }
    },
    [client, transport, refreshInventory, requestOptsRef]
  );

  useEffect(() => {
    if (!isConnected) {
      return;
    }

    const serverCapabilities = client.getServerCapabilities();
    const resourcesListChanged = serverCapabilities?.resources?.listChanged === true;
    const toolsListChanged = serverCapabilities?.tools?.listChanged === true;
    if (!resourcesListChanged && !toolsListChanged) {
      return;
    }

    const refreshLists = async () => {
      try {
        await refreshInventory(connectionGenerationRef.current);
      } catch (error) {
        console.error(
          '[ReactWebMCP:McpClientProvider]',
          'Failed to refresh tools/resources after list_changed:',
          error
        );
      }
    };

    if (resourcesListChanged) {
      client.setNotificationHandler('notifications/resources/list_changed', refreshLists);
    }

    if (toolsListChanged) {
      client.setNotificationHandler('notifications/tools/list_changed', refreshLists);
    }

    const controller = new AbortController();
    if (client.getProtocolEra() === 'modern') {
      void client
        .listen(
          {
            ...(toolsListChanged && { toolsListChanged: true }),
            ...(resourcesListChanged && { resourcesListChanged: true }),
          },
          { signal: controller.signal }
        )
        .then(async (subscription) => {
          if (controller.signal.aborted) {
            await subscription.close();
            return;
          }

          // Modern servers deliver list_changed only after listen is acknowledged.
          await refreshLists();
        })
        .catch((error) => {
          if (!controller.signal.aborted) {
            console.error(
              '[ReactWebMCP:McpClientProvider]',
              'Failed to listen for list_changed notifications:',
              error
            );
          }
        });
    } else {
      // Legacy servers deliver list_changed unsolicited once handlers are installed.
      void refreshLists();
    }

    return () => {
      if (resourcesListChanged) {
        client.removeNotificationHandler('notifications/resources/list_changed');
      }

      if (toolsListChanged) {
        client.removeNotificationHandler('notifications/tools/list_changed');
      }

      controller.abort();
    };
  }, [client, isConnected, refreshInventory]);

  useEffect(() => {
    let active = true;
    const connectionGeneration = connectionGenerationRef.current;
    const previousOnclose = client.onclose;
    const handleClientClose = () => {
      try {
        previousOnclose?.();
      } finally {
        if (active && providerCloseRef.current === null) {
          connectionGenerationRef.current += 1;
          inventoryRequestRef.current += 1;
          connectionStateRef.current = 'disconnected';
          setConnectionState('disconnected');
          setCapabilities(null);
          setResources([]);
          setTools([]);
        }
      }
    };
    client.onclose = handleClientClose;
    connectionStateRef.current = 'disconnected';
    setConnectionState('disconnected');
    setCapabilities(null);
    setResources([]);
    setTools([]);

    // Initial connection - reconnect() has its own guard to prevent concurrent connections
    reconnect().catch((err) => {
      if (connectionGeneration === connectionGenerationRef.current) {
        console.error('[ReactWebMCP:McpClientProvider]', 'Failed to connect MCP client:', err);
      }
    });

    return () => {
      active = false;
      if (client.onclose === handleClientClose) {
        if (previousOnclose) {
          client.onclose = previousOnclose;
        } else {
          Reflect.deleteProperty(client, 'onclose');
        }
      }
      connectionGenerationRef.current += 1;
      inventoryRequestRef.current += 1;
      connectionStateRef.current = 'disconnected';
      const closeToken = {};
      providerCloseRef.current = closeToken;
      closePromiseRef.current = client
        .close()
        .catch((cause: unknown) => {
          console.error('[ReactWebMCP:McpClientProvider]', 'Failed to close MCP client:', cause);
        })
        .finally(() => {
          if (providerCloseRef.current === closeToken) {
            providerCloseRef.current = null;
          }
        });
    };
  }, [client, transport, reconnect]);

  const contextValue = useMemo(
    () => ({
      client,
      tools,
      resources,
      isConnected,
      isLoading,
      error,
      capabilities,
      reconnect,
    }),
    [client, tools, resources, isConnected, isLoading, error, capabilities, reconnect]
  );

  return <McpClientContext.Provider value={contextValue}>{children}</McpClientContext.Provider>;
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
 *         <button onClick={() => void reconnect()}>Retry</button>
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
