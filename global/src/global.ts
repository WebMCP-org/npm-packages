// global.ts - Web Model Context API Implementation
// Bridges the Web Model Context API (window.agent) to MCP SDK

import { TabServerTransport } from '@mcp-b/transports';
import { Server as McpServer } from '@modelcontextprotocol/sdk/server/index.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import type {
  Agent,
  AgentContext,
  MCPBridge,
  ToolCallEvent,
  ToolDescriptor,
  ToolResponse,
} from './types.js';

/**
 * Custom ToolCallEvent implementation
 */
class WebToolCallEvent extends Event implements ToolCallEvent {
  public name: string;
  public arguments: Record<string, unknown>;
  private _response: ToolResponse | null = null;
  private _responded = false;

  constructor(toolName: string, args: Record<string, unknown>) {
    super('toolcall', { cancelable: true });
    this.name = toolName;
    this.arguments = args;
  }

  respondWith(response: ToolResponse): void {
    if (this._responded) {
      throw new Error('Response already provided for this tool call');
    }
    this._response = response;
    this._responded = true;
  }

  getResponse(): ToolResponse | null {
    return this._response;
  }

  hasResponse(): boolean {
    return this._responded;
  }
}

/**
 * Agent implementation that bridges to MCP SDK
 */
class WebModelContextAgent extends EventTarget implements Agent {
  private bridge: MCPBridge;

  constructor(bridge: MCPBridge) {
    super();
    this.bridge = bridge;
  }

  /**
   * Provide context (tools) to agents
   * Implements the Web Model Context API
   */
  provideContext(context: AgentContext): void {
    console.log(`[Web Model Context] Registering ${context.tools.length} tools`);

    // Clear existing tools
    this.bridge.tools.clear();

    // Register each tool
    for (const tool of context.tools) {
      this.registerTool(tool);
    }

    // Notify that tools list changed (if MCP server supports it)
    if (this.bridge.server.notification) {
      this.bridge.server.notification({
        method: 'notifications/tools/list_changed',
        params: {},
      });
    }
  }

  /**
   * Register a single tool with the MCP server
   */
  private registerTool(tool: ToolDescriptor): void {
    console.log(`[Web Model Context] Registering tool: ${tool.name}`);

    // Store tool descriptor
    this.bridge.tools.set(tool.name, tool);

    // Note: We don't need to register with MCP server here
    // Instead, we handle tool registration dynamically in the handlers
  }

  /**
   * Execute a tool with hybrid approach:
   * 1. Dispatch toolcall event first
   * 2. If not prevented, call tool's execute function
   */
  async executeTool(toolName: string, args: Record<string, unknown>): Promise<ToolResponse> {
    const tool = this.bridge.tools.get(toolName);
    if (!tool) {
      throw new Error(`Tool not found: ${toolName}`);
    }

    // Create toolcall event
    const event = new WebToolCallEvent(toolName, args);

    // Dispatch event to listeners
    this.dispatchEvent(event);

    // If event was prevented and response provided, use that
    if (event.defaultPrevented && event.hasResponse()) {
      const response = event.getResponse();
      if (response) {
        console.log(`[Web Model Context] Tool ${toolName} handled by event listener`);
        return response;
      }
    }

    // Otherwise, execute the tool's execute function
    console.log(`[Web Model Context] Executing tool: ${toolName}`);
    try {
      const response = await tool.execute(args);
      return response;
    } catch (error) {
      console.error(`[Web Model Context] Error executing tool ${toolName}:`, error);
      return {
        content: [
          {
            type: 'text',
            text: `Error: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
        isError: true,
      };
    }
  }

  /**
   * Get list of registered tools in MCP format
   */
  listTools() {
    return Array.from(this.bridge.tools.values()).map((tool) => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema,
    }));
  }
}

/**
 * Initialize the MCP bridge
 */
function initializeMCPBridge(): MCPBridge {
  console.log('[Web Model Context] Initializing MCP bridge');

  const hostname = window.location.hostname || 'localhost';

  // Create MCP server
  const server = new McpServer(
    {
      name: hostname,
      version: '1.0.0',
    },
    {
      capabilities: {
        tools: {
          listChanged: true,
        },
      },
    }
  );

  // Create bridge object
  const bridge: MCPBridge = {
    server,
    tools: new Map(),
    isInitialized: true,
  };

  // Create agent
  const agent = new WebModelContextAgent(bridge);

  // Set up MCP server handlers
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    console.log('[MCP Bridge] Handling list_tools request');
    return {
      tools: agent.listTools(),
    };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    console.log(`[MCP Bridge] Handling call_tool request: ${request.params.name}`);

    const toolName = request.params.name;
    const args = (request.params.arguments || {}) as Record<string, unknown>;

    try {
      const response = await agent.executeTool(toolName, args);
      return response;
    } catch (error) {
      console.error(`[MCP Bridge] Error calling tool ${toolName}:`, error);
      throw error;
    }
  });

  // Connect transport
  const transport = new TabServerTransport({
    allowedOrigins: ['*'], // TODO: Make this configurable
  });

  server.connect(transport);

  console.log('[Web Model Context] MCP server connected');

  return bridge;
}

/**
 * Initialize the Web Model Context API (window.agent)
 */
export function initializeWebModelContext(): void {
  if (typeof window === 'undefined') {
    console.warn('[Web Model Context] Not in browser environment, skipping initialization');
    return;
  }

  if (window.agent) {
    console.warn('[Web Model Context] window.agent already exists, skipping initialization');
    return;
  }

  try {
    // Initialize MCP bridge
    const bridge = initializeMCPBridge();

    // Create and expose agent
    const agent = new WebModelContextAgent(bridge);
    Object.defineProperty(window, 'agent', {
      value: agent,
      writable: false,
      configurable: false,
    });

    // Expose bridge for debugging (optional)
    if (process.env.NODE_ENV === 'development') {
      Object.defineProperty(window, '__mcpBridge', {
        value: bridge,
        writable: false,
        configurable: true,
      });
    }

    console.log('✅ [Web Model Context] window.agent initialized successfully');
  } catch (error) {
    console.error('[Web Model Context] Failed to initialize:', error);
    throw error;
  }
}

/**
 * Cleanup function (for testing/development)
 */
export function cleanupWebModelContext(): void {
  if (typeof window === 'undefined') return;

  if (window.__mcpBridge) {
    try {
      window.__mcpBridge.server.close();
    } catch (error) {
      console.warn('[Web Model Context] Error closing MCP server:', error);
    }
  }

  delete (window as unknown as { agent?: unknown }).agent;
  delete (window as unknown as { __mcpBridge?: unknown }).__mcpBridge;

  console.log('[Web Model Context] Cleaned up');
}
