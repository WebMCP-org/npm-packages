// global.ts - Web Model Context API Implementation
// Bridges the Web Model Context API (window.navigator.modelContext) to MCP SDK

import { TabServerTransport } from '@mcp-b/transports';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Server as McpServer,
} from '@mcp-b/webmcp-ts-sdk';
import type {
  MCPBridge,
  ModelContext,
  ModelContextInput,
  ToolCallEvent,
  ToolDescriptor,
  ToolResponse,
  ValidatedToolDescriptor,
} from './types.js';
import { normalizeSchema, validateWithZod } from './validation.js';

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
 * Time window (in ms) to detect rapid duplicate registrations
 * Registrations within this window are likely due to React Strict Mode
 */
const RAPID_DUPLICATE_WINDOW_MS = 50;

/**
 * ModelContext implementation that bridges to MCP SDK
 * Implements the W3C Web Model Context API proposal with two-bucket tool management
 *
 * Two-Bucket System:
 * - Bucket A (provideContextTools): Tools registered via provideContext() - base/app-level tools
 * - Bucket B (dynamicTools): Tools registered via registerTool() - component-scoped tools
 *
 * Benefits:
 * - provideContext() only clears Bucket A, leaving Bucket B intact
 * - Components can manage their own tool lifecycle independently
 * - Final tool list = Bucket A + Bucket B (merged, with collision detection)
 */
class WebModelContext implements ModelContext {
  private bridge: MCPBridge;
  private eventTarget: EventTarget;

  // Bucket A: Tools from provideContext() - cleared when provideContext is called again
  private provideContextTools: Map<string, ValidatedToolDescriptor>;

  // Bucket B: Tools from registerTool() - persist across provideContext calls
  private dynamicTools: Map<string, ValidatedToolDescriptor>;

  // Track registration timestamps for rapid duplicate detection (React Strict Mode)
  private registrationTimestamps: Map<string, number>;

  // Store unregister functions for returning on rapid duplicates
  private unregisterFunctions: Map<string, () => void>;

  constructor(bridge: MCPBridge) {
    this.bridge = bridge;
    this.eventTarget = new EventTarget();
    this.provideContextTools = new Map();
    this.dynamicTools = new Map();
    this.registrationTimestamps = new Map();
    this.unregisterFunctions = new Map();
  }

  /**
   * Add event listener (compatible with ModelContext interface)
   */
  addEventListener(
    type: 'toolcall',
    listener: (event: ToolCallEvent) => void | Promise<void>,
    options?: boolean | AddEventListenerOptions
  ): void {
    this.eventTarget.addEventListener(type, listener as EventListener, options);
  }

  /**
   * Remove event listener
   */
  removeEventListener(
    type: 'toolcall',
    listener: (event: ToolCallEvent) => void | Promise<void>,
    options?: boolean | EventListenerOptions
  ): void {
    this.eventTarget.removeEventListener(type, listener as EventListener, options);
  }

  /**
   * Dispatch event
   */
  dispatchEvent(event: Event): boolean {
    return this.eventTarget.dispatchEvent(event);
  }

  /**
   * Provide context (tools) to AI models
   * Clears and replaces Bucket A (provideContext tools), leaving Bucket B (dynamic tools) intact
   */
  provideContext(context: ModelContextInput): void {
    console.log(`[Web Model Context] Registering ${context.tools.length} tools via provideContext`);

    // Clear only Bucket A (provideContext tools)
    this.provideContextTools.clear();

    // Process each tool: normalize schemas and create validated descriptors
    for (const tool of context.tools) {
      // Check for name collisions with Bucket B (dynamic tools)
      if (this.dynamicTools.has(tool.name)) {
        throw new Error(
          `[Web Model Context] Tool name collision: "${tool.name}" is already registered via registerTool(). ` +
            'Please use a different name or unregister the dynamic tool first.'
        );
      }

      // Normalize input schema (convert to both JSON Schema and Zod)
      const { jsonSchema: inputJson, zodValidator: inputZod } = normalizeSchema(tool.inputSchema);

      // Normalize output schema if provided
      const normalizedOutput = tool.outputSchema ? normalizeSchema(tool.outputSchema) : null;

      // Create validated tool descriptor
      const validatedTool: ValidatedToolDescriptor = {
        name: tool.name,
        description: tool.description,
        inputSchema: inputJson,
        ...(normalizedOutput && { outputSchema: normalizedOutput.jsonSchema }),
        ...(tool.annotations && { annotations: tool.annotations }),
        execute: tool.execute,
        inputValidator: inputZod,
        ...(normalizedOutput && { outputValidator: normalizedOutput.zodValidator }),
      };

      // Add to Bucket A
      this.provideContextTools.set(tool.name, validatedTool);
    }

    // Update the merged tool list in bridge
    this.updateBridgeTools();

    // Notify that tools list changed
    if (this.bridge.server.notification) {
      this.bridge.server.notification({
        method: 'notifications/tools/list_changed',
        params: {},
      });
    }
  }

  /**
   * Register a single tool dynamically (Bucket B)
   * Returns an object with an unregister function to remove the tool
   * Tools registered via this method persist across provideContext() calls
   */
  registerTool(tool: ToolDescriptor<any, any>): { unregister: () => void } {
    console.log(`[Web Model Context] Registering tool dynamically: ${tool.name}`);

    // Check for rapid duplicate registration (React Strict Mode detection)
    const now = Date.now();
    const lastRegistration = this.registrationTimestamps.get(tool.name);

    if (lastRegistration && now - lastRegistration < RAPID_DUPLICATE_WINDOW_MS) {
      console.warn(
        `[Web Model Context] Tool "${tool.name}" registered multiple times within ${RAPID_DUPLICATE_WINDOW_MS}ms. ` +
          'This is likely due to React Strict Mode double-mounting. Ignoring duplicate registration.'
      );

      // Return the existing unregister function
      const existingUnregister = this.unregisterFunctions.get(tool.name);
      if (existingUnregister) {
        return { unregister: existingUnregister };
      }
    }

    // Check for name collision with Bucket A (provideContext tools)
    if (this.provideContextTools.has(tool.name)) {
      throw new Error(
        `[Web Model Context] Tool name collision: "${tool.name}" is already registered via provideContext(). ` +
          'Please use a different name or update your provideContext() call.'
      );
    }

    // Check for name collision within Bucket B (genuine duplicate, not rapid)
    if (this.dynamicTools.has(tool.name)) {
      throw new Error(
        `[Web Model Context] Tool name collision: "${tool.name}" is already registered via registerTool(). ` +
          'Please unregister it first or use a different name.'
      );
    }

    // Normalize input schema (convert to both JSON Schema and Zod)
    const { jsonSchema: inputJson, zodValidator: inputZod } = normalizeSchema(tool.inputSchema);

    // Normalize output schema if provided
    const normalizedOutput = tool.outputSchema ? normalizeSchema(tool.outputSchema) : null;

    // Create validated tool descriptor
    const validatedTool: ValidatedToolDescriptor = {
      name: tool.name,
      description: tool.description,
      inputSchema: inputJson,
      ...(normalizedOutput && { outputSchema: normalizedOutput.jsonSchema }),
      ...(tool.annotations && { annotations: tool.annotations }),
      execute: tool.execute,
      inputValidator: inputZod,
      ...(normalizedOutput && { outputValidator: normalizedOutput.zodValidator }),
    };

    // Add to Bucket B (dynamic tools)
    this.dynamicTools.set(tool.name, validatedTool);

    // Store registration timestamp for rapid duplicate detection
    this.registrationTimestamps.set(tool.name, now);

    // Update the merged tool list in bridge
    this.updateBridgeTools();

    // Notify that tools list changed
    if (this.bridge.server.notification) {
      this.bridge.server.notification({
        method: 'notifications/tools/list_changed',
        params: {},
      });
    }

    // Create unregister function
    const unregisterFn = () => {
      console.log(`[Web Model Context] Unregistering tool: ${tool.name}`);

      // Check if this tool was registered via provideContext
      if (this.provideContextTools.has(tool.name)) {
        throw new Error(
          `[Web Model Context] Cannot unregister tool "${tool.name}": ` +
            'This tool was registered via provideContext(). Use provideContext() to update the base tool set.'
        );
      }

      // Remove from Bucket B
      if (!this.dynamicTools.has(tool.name)) {
        console.warn(
          `[Web Model Context] Tool "${tool.name}" is not registered, ignoring unregister call`
        );
        return;
      }

      this.dynamicTools.delete(tool.name);

      // Clean up tracking data
      this.registrationTimestamps.delete(tool.name);
      this.unregisterFunctions.delete(tool.name);

      // Update the merged tool list in bridge
      this.updateBridgeTools();

      // Notify that tools list changed
      if (this.bridge.server.notification) {
        this.bridge.server.notification({
          method: 'notifications/tools/list_changed',
          params: {},
        });
      }
    };

    // Store unregister function for rapid duplicate detection
    this.unregisterFunctions.set(tool.name, unregisterFn);

    // Return unregister function
    return { unregister: unregisterFn };
  }

  /**
   * Update the bridge tools map with merged tools from both buckets
   * Final tool list = Bucket A (provideContext) + Bucket B (dynamic)
   */
  private updateBridgeTools(): void {
    // Clear the bridge tools map
    this.bridge.tools.clear();

    // Add tools from Bucket A (provideContext tools)
    for (const [name, tool] of this.provideContextTools) {
      this.bridge.tools.set(name, tool);
    }

    // Add tools from Bucket B (dynamic tools)
    for (const [name, tool] of this.dynamicTools) {
      this.bridge.tools.set(name, tool);
    }

    console.log(
      `[Web Model Context] Updated bridge with ${this.provideContextTools.size} base tools + ${this.dynamicTools.size} dynamic tools = ${this.bridge.tools.size} total`
    );
  }

  /**
   * Execute a tool with hybrid approach:
   * 1. Validate input arguments
   * 2. Dispatch toolcall event first
   * 3. If not prevented, call tool's execute function
   * 4. Validate output (permissive mode - warn only)
   */
  async executeTool(toolName: string, args: Record<string, unknown>): Promise<ToolResponse> {
    const tool = this.bridge.tools.get(toolName);
    if (!tool) {
      throw new Error(`Tool not found: ${toolName}`);
    }

    // 1. VALIDATE INPUT ARGUMENTS
    console.log(`[Web Model Context] Validating input for tool: ${toolName}`);
    const validation = validateWithZod(args, tool.inputValidator);
    if (!validation.success) {
      console.error(
        `[Web Model Context] Input validation failed for ${toolName}:`,
        validation.error
      );
      return {
        content: [
          {
            type: 'text',
            text: `Input validation error for tool "${toolName}":\n${validation.error}`,
          },
        ],
        isError: true,
      };
    }

    // Use validated data for execution
    const validatedArgs = validation.data as Record<string, unknown>;

    // 2. Create toolcall event
    const event = new WebToolCallEvent(toolName, validatedArgs);

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

    // 3. Execute the tool's execute function
    console.log(`[Web Model Context] Executing tool: ${toolName}`);
    try {
      const response = await tool.execute(validatedArgs);

      // 4. VALIDATE OUTPUT (permissive mode - warn only, don't block)
      if (tool.outputValidator && response.structuredContent) {
        const outputValidation = validateWithZod(response.structuredContent, tool.outputValidator);
        if (!outputValidation.success) {
          console.warn(
            `[Web Model Context] Output validation failed for ${toolName}:`,
            outputValidation.error
          );
          // Continue anyway - permissive mode
        }
      }

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
   * Includes full MCP spec: annotations, outputSchema, etc.
   */
  listTools() {
    return Array.from(this.bridge.tools.values()).map((tool) => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema,
      ...(tool.outputSchema && { outputSchema: tool.outputSchema }),
      ...(tool.annotations && { annotations: tool.annotations }),
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

  // Create modelContext
  const modelContext = new WebModelContext(bridge);

  // Set up MCP server handlers
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    console.log('[MCP Bridge] Handling list_tools request');
    return {
      tools: modelContext.listTools(),
    };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    console.log(`[MCP Bridge] Handling call_tool request: ${request.params.name}`);

    const toolName = request.params.name;
    const args = (request.params.arguments || {}) as Record<string, unknown>;

    try {
      const response = await modelContext.executeTool(toolName, args);
      // Return in MCP SDK format
      return {
        content: response.content,
        isError: response.isError,
      };
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
 * Initialize the Web Model Context API (window.navigator.modelContext)
 */
export function initializeWebModelContext(): void {
  if (typeof window === 'undefined') {
    console.warn('[Web Model Context] Not in browser environment, skipping initialization');
    return;
  }

  if (window.navigator.modelContext) {
    console.warn(
      '[Web Model Context] window.navigator.modelContext already exists, skipping initialization'
    );
    return;
  }

  try {
    // Initialize MCP bridge
    const bridge = initializeMCPBridge();

    // Create and expose modelContext
    const modelContext = new WebModelContext(bridge);
    Object.defineProperty(window.navigator, 'modelContext', {
      value: modelContext,
      writable: false,
      configurable: false,
    });

    // Expose bridge for debugging
    Object.defineProperty(window, '__mcpBridge', {
      value: bridge,
      writable: false,
      configurable: true,
    });

    console.log('✅ [Web Model Context] window.navigator.modelContext initialized successfully');
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

  delete (window.navigator as unknown as { modelContext?: unknown }).modelContext;
  delete (window as unknown as { __mcpBridge?: unknown }).__mcpBridge;

  console.log('[Web Model Context] Cleaned up');
}
