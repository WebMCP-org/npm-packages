import type { ServerOptions } from '@modelcontextprotocol/sdk/server/index.js';
import { McpServer as BaseMcpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { mergeCapabilities } from '@modelcontextprotocol/sdk/shared/protocol.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import type { Implementation } from '@modelcontextprotocol/sdk/types.js';

/**
 * Browser-optimized MCP Server for Web Model Context API (navigator.modelContext).
 *
 * This class extends McpServer to support dynamic registration of tools, resources,
 * and prompts after transport connection, which is required for the Web Model Context API
 * where items are registered via navigator.modelContext.provideContext() at any time.
 *
 * Key differences from base McpServer:
 * - Pre-registers tool, resource, and prompt capabilities before connection
 * - Allows items to be registered after transport is connected
 * - Designed for browser environments where items arrive asynchronously
 */
export class BrowserMcpServer extends BaseMcpServer {
  constructor(serverInfo: Implementation, options?: ServerOptions) {
    // Ensure tools, resources, and prompts capabilities are registered from the start
    const enhancedOptions: ServerOptions = {
      ...options,
      capabilities: mergeCapabilities(options?.capabilities || {}, {
        tools: { listChanged: true },
        resources: { listChanged: true },
        prompts: { listChanged: true },
      }),
    };

    super(serverInfo, enhancedOptions);
  }

  /**
   * Override connect to ensure request handlers are initialized
   * BEFORE the transport connection is established.
   *
   * This prevents the "Cannot register capabilities after connecting to transport"
   * error when items are registered dynamically after connection.
   */
  override async connect(transport: Transport): Promise<void> {
    // Call setToolRequestHandlers() BEFORE connecting the transport
    // This will:
    // 1. Register tool capabilities (won't throw since transport isn't connected yet)
    // 2. Set up ListTools and CallTool request handlers
    // 3. Set _toolHandlersInitialized = true
    //
    // After this, any future registerTool() calls will skip registerCapabilities()
    // because _toolHandlersInitialized is true, allowing dynamic tool registration

    // Type-safe access to private method - we need to call this internal method
    // to initialize tool handlers before connecting
    (this as unknown as { setToolRequestHandlers: () => void }).setToolRequestHandlers();

    // Now connect with the transport
    return super.connect(transport);
  }
}
