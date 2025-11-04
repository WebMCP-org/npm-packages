import {
  IframeChildTransport,
  type IframeChildTransportOptions,
  TabServerTransport,
  type TabServerTransportOptions,
} from '@mcp-b/transports';
import type { Transport } from '@mcp-b/webmcp-ts-sdk';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Server as McpServer,
} from '@mcp-b/webmcp-ts-sdk';
import type {
  InternalModelContext,
  MCPBridge,
  ModelContextInput,
  ToolCallEvent,
  ToolDescriptor,
  ToolResponse,
  ValidatedToolDescriptor,
  WebModelContextInitOptions,
} from './types.js';
import { normalizeSchema, validateWithZod } from './validation.js';

declare global {
  interface Window {
    __webModelContextOptions?: WebModelContextInitOptions;
  }
}

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
class WebModelContext implements InternalModelContext {
  private bridge: MCPBridge;
  private eventTarget: EventTarget;
  private provideContextTools: Map<string, ValidatedToolDescriptor>;
  private dynamicTools: Map<string, ValidatedToolDescriptor>;
  private registrationTimestamps: Map<string, number>;
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

    this.provideContextTools.clear();

    for (const tool of context.tools) {
      if (this.dynamicTools.has(tool.name)) {
        throw new Error(
          `[Web Model Context] Tool name collision: "${tool.name}" is already registered via registerTool(). ` +
            'Please use a different name or unregister the dynamic tool first.'
        );
      }

      const { jsonSchema: inputJson, zodValidator: inputZod } = normalizeSchema(tool.inputSchema);

      const normalizedOutput = tool.outputSchema ? normalizeSchema(tool.outputSchema) : null;

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

      this.provideContextTools.set(tool.name, validatedTool);
    }

    this.updateBridgeTools();

    this.notifyToolsListChanged();
  }

  /**
   * Register a single tool dynamically (Bucket B)
   * Returns an object with an unregister function to remove the tool
   * Tools registered via this method persist across provideContext() calls
   */
  registerTool(tool: ToolDescriptor<any, any>): { unregister: () => void } {
    console.log(`[Web Model Context] Registering tool dynamically: ${tool.name}`);

    const now = Date.now();
    const lastRegistration = this.registrationTimestamps.get(tool.name);

    if (lastRegistration && now - lastRegistration < RAPID_DUPLICATE_WINDOW_MS) {
      console.warn(
        `[Web Model Context] Tool "${tool.name}" registered multiple times within ${RAPID_DUPLICATE_WINDOW_MS}ms. ` +
          'This is likely due to React Strict Mode double-mounting. Ignoring duplicate registration.'
      );

      const existingUnregister = this.unregisterFunctions.get(tool.name);
      if (existingUnregister) {
        return { unregister: existingUnregister };
      }
    }

    if (this.provideContextTools.has(tool.name)) {
      throw new Error(
        `[Web Model Context] Tool name collision: "${tool.name}" is already registered via provideContext(). ` +
          'Please use a different name or update your provideContext() call.'
      );
    }

    if (this.dynamicTools.has(tool.name)) {
      throw new Error(
        `[Web Model Context] Tool name collision: "${tool.name}" is already registered via registerTool(). ` +
          'Please unregister it first or use a different name.'
      );
    }

    const { jsonSchema: inputJson, zodValidator: inputZod } = normalizeSchema(tool.inputSchema);

    const normalizedOutput = tool.outputSchema ? normalizeSchema(tool.outputSchema) : null;

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

    this.dynamicTools.set(tool.name, validatedTool);

    this.registrationTimestamps.set(tool.name, now);

    this.updateBridgeTools();

    this.notifyToolsListChanged();

    const unregisterFn = () => {
      console.log(`[Web Model Context] Unregistering tool: ${tool.name}`);

      if (this.provideContextTools.has(tool.name)) {
        throw new Error(
          `[Web Model Context] Cannot unregister tool "${tool.name}": ` +
            'This tool was registered via provideContext(). Use provideContext() to update the base tool set.'
        );
      }

      if (!this.dynamicTools.has(tool.name)) {
        console.warn(
          `[Web Model Context] Tool "${tool.name}" is not registered, ignoring unregister call`
        );
        return;
      }

      this.dynamicTools.delete(tool.name);

      this.registrationTimestamps.delete(tool.name);
      this.unregisterFunctions.delete(tool.name);

      this.updateBridgeTools();

      this.notifyToolsListChanged();
    };

    this.unregisterFunctions.set(tool.name, unregisterFn);

    return { unregister: unregisterFn };
  }

  /**
   * Update the bridge tools map with merged tools from both buckets
   * Final tool list = Bucket A (provideContext) + Bucket B (dynamic)
   */
  private updateBridgeTools(): void {
    this.bridge.tools.clear();

    for (const [name, tool] of this.provideContextTools) {
      this.bridge.tools.set(name, tool);
    }

    for (const [name, tool] of this.dynamicTools) {
      this.bridge.tools.set(name, tool);
    }

    console.log(
      `[Web Model Context] Updated bridge with ${this.provideContextTools.size} base tools + ${this.dynamicTools.size} dynamic tools = ${this.bridge.tools.size} total`
    );
  }

  /**
   * Notify all servers that the tools list has changed
   */
  private notifyToolsListChanged(): void {
    if (this.bridge.tabServer.notification) {
      this.bridge.tabServer.notification({
        method: 'notifications/tools/list_changed',
        params: {},
      });
    }

    if (this.bridge.iframeServer?.notification) {
      this.bridge.iframeServer.notification({
        method: 'notifications/tools/list_changed',
        params: {},
      });
    }
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

    const validatedArgs = validation.data as Record<string, unknown>;

    const event = new WebToolCallEvent(toolName, validatedArgs);

    this.dispatchEvent(event);

    if (event.defaultPrevented && event.hasResponse()) {
      const response = event.getResponse();
      if (response) {
        console.log(`[Web Model Context] Tool ${toolName} handled by event listener`);
        return response;
      }
    }

    console.log(`[Web Model Context] Executing tool: ${toolName}`);
    try {
      const response = await tool.execute(validatedArgs);

      if (tool.outputValidator && response.structuredContent) {
        const outputValidation = validateWithZod(response.structuredContent, tool.outputValidator);
        if (!outputValidation.success) {
          console.warn(
            `[Web Model Context] Output validation failed for ${toolName}:`,
            outputValidation.error
          );
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
 * Initialize the MCP bridge with dual-server support
 * Creates both TabServer (same-window) and IframeChildServer (parent-child) by default
 */
function initializeMCPBridge(options?: WebModelContextInitOptions): MCPBridge {
  console.log('[Web Model Context] Initializing MCP bridge');

  const hostname = window.location.hostname || 'localhost';
  const transportOptions = options?.transport;

  const setupServerHandlers = (server: McpServer, bridge: MCPBridge) => {
    server.setRequestHandler(ListToolsRequestSchema, async () => {
      console.log('[MCP Bridge] Handling list_tools request');
      return {
        tools: bridge.modelContext.listTools(),
      };
    });

    server.setRequestHandler(CallToolRequestSchema, async (request) => {
      console.log(`[MCP Bridge] Handling call_tool request: ${request.params.name}`);

      const toolName = request.params.name;
      const args = (request.params.arguments || {}) as Record<string, unknown>;

      try {
        const response = await bridge.modelContext.executeTool(toolName, args);
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
  };

  const customTransport: Transport | undefined = transportOptions?.create?.();

  if (customTransport) {
    console.log('[Web Model Context] Using custom transport');

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

    const bridge: MCPBridge = {
      tabServer: server,
      tools: new Map(),
      modelContext: undefined as unknown as InternalModelContext,
      isInitialized: true,
    };

    const modelContext = new WebModelContext(bridge);
    bridge.modelContext = modelContext;

    setupServerHandlers(server, bridge);
    server.connect(customTransport);

    console.log('[Web Model Context] MCP server connected with custom transport');
    return bridge;
  }

  console.log('[Web Model Context] Using dual-server mode');

  const tabServerEnabled = transportOptions?.tabServer !== false;
  const tabServer = new McpServer(
    {
      name: `${hostname}-tab`,
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

  // Create bridge object (modelContext is assigned after instantiation)
  const bridge: MCPBridge = {
    tabServer,
    tools: new Map(),
    modelContext: undefined as unknown as InternalModelContext,
    isInitialized: true,
  };

  // Create modelContext and attach to bridge
  const modelContext = new WebModelContext(bridge);
  bridge.modelContext = modelContext;

  // Set up handlers for tab server
  setupServerHandlers(tabServer, bridge);

  // Connect tab server transport
  if (tabServerEnabled) {
    const tabServerOptions: Partial<TabServerTransportOptions> =
      typeof transportOptions?.tabServer === 'object' ? transportOptions.tabServer : {};
    const { allowedOrigins, ...restTabServerOptions } = tabServerOptions;

    const tabTransport = new TabServerTransport({
      allowedOrigins: allowedOrigins ?? ['*'],
      ...(restTabServerOptions as Omit<TabServerTransportOptions, 'allowedOrigins'>),
    });

    tabServer.connect(tabTransport);
    console.log('[Web Model Context] Tab server connected');
  }

  const isInIframe = typeof window !== 'undefined' && window.parent !== window;
  const iframeServerConfig = transportOptions?.iframeServer;
  const iframeServerEnabled =
    iframeServerConfig !== false && (iframeServerConfig !== undefined || isInIframe);

  if (iframeServerEnabled) {
    console.log('[Web Model Context] Enabling iframe server');

    const iframeServer = new McpServer(
      {
        name: `${hostname}-iframe`,
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

    setupServerHandlers(iframeServer, bridge);

    const iframeServerOptions: Partial<IframeChildTransportOptions> =
      typeof iframeServerConfig === 'object' ? iframeServerConfig : {};
    const { allowedOrigins, ...restIframeServerOptions } = iframeServerOptions;

    const iframeTransport = new IframeChildTransport({
      allowedOrigins: allowedOrigins ?? ['*'],
      ...(restIframeServerOptions as Omit<IframeChildTransportOptions, 'allowedOrigins'>),
    });

    iframeServer.connect(iframeTransport);
    bridge.iframeServer = iframeServer;

    console.log('[Web Model Context] Iframe server connected');
  }

  return bridge;
}

/**
 * Initialize the Web Model Context API (window.navigator.modelContext)
 */
export function initializeWebModelContext(options?: WebModelContextInitOptions): void {
  if (typeof window === 'undefined') {
    console.warn('[Web Model Context] Not in browser environment, skipping initialization');
    return;
  }

  const effectiveOptions = options ?? window.__webModelContextOptions;

  if (window.navigator.modelContext) {
    console.warn(
      '[Web Model Context] window.navigator.modelContext already exists, skipping initialization'
    );
    return;
  }

  try {
    const bridge = initializeMCPBridge(effectiveOptions);

    Object.defineProperty(window.navigator, 'modelContext', {
      value: bridge.modelContext,
      writable: false,
      configurable: false,
    });

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
      window.__mcpBridge.tabServer.close();

      if (window.__mcpBridge.iframeServer) {
        window.__mcpBridge.iframeServer.close();
      }
    } catch (error) {
      console.warn('[Web Model Context] Error closing MCP servers:', error);
    }
  }

  delete (window.navigator as unknown as { modelContext?: unknown }).modelContext;
  delete (window as unknown as { __mcpBridge?: unknown }).__mcpBridge;

  console.log('[Web Model Context] Cleaned up');
}
