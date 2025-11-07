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
  ModelContextTesting,
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
 * Testing API implementation for Model Context
 * Provides debugging and mocking capabilities for testing
 */
class WebModelContextTesting implements ModelContextTesting {
  private toolCallHistory: Array<{
    toolName: string;
    arguments: Record<string, unknown>;
    timestamp: number;
  }> = [];
  private mockResponses: Map<string, ToolResponse> = new Map();
  private toolsChangedCallbacks: Set<() => void> = new Set();
  private bridge: MCPBridge;

  constructor(bridge: MCPBridge) {
    this.bridge = bridge;
  }

  /**
   * Record a tool call (called internally by WebModelContext)
   */
  recordToolCall(toolName: string, args: Record<string, unknown>): void {
    this.toolCallHistory.push({
      toolName,
      arguments: args,
      timestamp: Date.now(),
    });
  }

  /**
   * Check if a mock response exists for a tool
   */
  hasMockResponse(toolName: string): boolean {
    return this.mockResponses.has(toolName);
  }

  /**
   * Get mock response for a tool (if set)
   */
  getMockResponse(toolName: string): ToolResponse | undefined {
    return this.mockResponses.get(toolName);
  }

  /**
   * Notify all registered callbacks that tools have changed
   * @internal
   */
  notifyToolsChanged(): void {
    for (const callback of this.toolsChangedCallbacks) {
      try {
        callback();
      } catch (error) {
        console.error('[Model Context Testing] Error in tools changed callback:', error);
      }
    }
  }

  /**
   * Execute a tool directly with JSON string input (Chromium native API)
   */
  async executeTool(toolName: string, inputArgsJson: string): Promise<any> {
    console.log(`[Model Context Testing] Executing tool: ${toolName}`);

    let args: Record<string, unknown>;
    try {
      args = JSON.parse(inputArgsJson);
    } catch (error) {
      throw new SyntaxError(
        `Invalid JSON input: ${error instanceof Error ? error.message : String(error)}`
      );
    }

    const tool = this.bridge.tools.get(toolName);
    if (!tool) {
      throw new Error(`Tool not found: ${toolName}`);
    }

    const result = await this.bridge.modelContext.executeTool(toolName, args);

    // Return the actual result based on response structure
    if (result.isError) {
      // For errors, return undefined (matches Chromium behavior)
      return undefined;
    }

    // If there's structured content, return it
    if (result.structuredContent) {
      return result.structuredContent;
    }

    // Otherwise, extract text from content array
    if (result.content && result.content.length > 0) {
      const firstContent = result.content[0];
      if (firstContent && firstContent.type === 'text') {
        return firstContent.text;
      }
    }

    return undefined;
  }

  /**
   * List all registered tools (Chromium native API)
   * Returns tools with inputSchema as JSON string
   */
  listTools(): Array<{ name: string; description: string; inputSchema: string }> {
    const tools = this.bridge.modelContext.listTools();
    return tools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      inputSchema: JSON.stringify(tool.inputSchema),
    }));
  }

  /**
   * Register a callback that fires when the tools list changes (Chromium native API)
   */
  registerToolsChangedCallback(callback: () => void): void {
    this.toolsChangedCallbacks.add(callback);
    console.log('[Model Context Testing] Tools changed callback registered');
  }

  getToolCalls(): Array<{
    toolName: string;
    arguments: Record<string, unknown>;
    timestamp: number;
  }> {
    return [...this.toolCallHistory];
  }

  clearToolCalls(): void {
    this.toolCallHistory = [];
    console.log('[Model Context Testing] Tool call history cleared');
  }

  setMockToolResponse(toolName: string, response: ToolResponse): void {
    this.mockResponses.set(toolName, response);
    console.log(`[Model Context Testing] Mock response set for tool: ${toolName}`);
  }

  clearMockToolResponse(toolName: string): void {
    this.mockResponses.delete(toolName);
    console.log(`[Model Context Testing] Mock response cleared for tool: ${toolName}`);
  }

  clearAllMockToolResponses(): void {
    this.mockResponses.clear();
    console.log('[Model Context Testing] All mock responses cleared');
  }

  getRegisteredTools(): ReturnType<InternalModelContext['listTools']> {
    return this.bridge.modelContext.listTools();
  }

  reset(): void {
    this.clearToolCalls();
    this.clearAllMockToolResponses();
    console.log('[Model Context Testing] Testing state reset');
  }
}

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
  private testingAPI?: WebModelContextTesting;

  constructor(bridge: MCPBridge) {
    this.bridge = bridge;
    this.eventTarget = new EventTarget();
    this.provideContextTools = new Map();
    this.dynamicTools = new Map();
    this.registrationTimestamps = new Map();
    this.unregisterFunctions = new Map();
  }

  /**
   * Set the testing API (called during initialization)
   * @internal
   */
  setTestingAPI(testingAPI: WebModelContextTesting): void {
    this.testingAPI = testingAPI;
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
   * Unregister a tool by name (Chromium native API)
   * Can unregister tools from either bucket
   */
  unregisterTool(name: string): void {
    console.log(`[Web Model Context] Unregistering tool: ${name}`);

    // Check if tool exists in either bucket
    const inProvideContext = this.provideContextTools.has(name);
    const inDynamic = this.dynamicTools.has(name);

    if (!inProvideContext && !inDynamic) {
      console.warn(
        `[Web Model Context] Tool "${name}" is not registered, ignoring unregister call`
      );
      return;
    }

    // Remove from appropriate bucket
    if (inProvideContext) {
      this.provideContextTools.delete(name);
    }

    if (inDynamic) {
      this.dynamicTools.delete(name);
      this.registrationTimestamps.delete(name);
      this.unregisterFunctions.delete(name);
    }

    this.updateBridgeTools();
    this.notifyToolsListChanged();
  }

  /**
   * Clear all registered tools (Chromium native API)
   * Clears both buckets (provideContext and dynamic)
   */
  clearContext(): void {
    console.log('[Web Model Context] Clearing all tools');

    this.provideContextTools.clear();
    this.dynamicTools.clear();
    this.registrationTimestamps.clear();
    this.unregisterFunctions.clear();

    this.updateBridgeTools();
    this.notifyToolsListChanged();
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

    // Notify testing API callbacks
    if (this.testingAPI && 'notifyToolsChanged' in this.testingAPI) {
      (this.testingAPI as WebModelContextTesting).notifyToolsChanged();
    }
  }

  /**
   * Execute a tool with hybrid approach:
   * 1. Validate input arguments
   * 2. Record tool call in testing API (if available)
   * 3. Check for mock response (if testing API is active)
   * 4. Dispatch toolcall event first
   * 5. If not prevented, call tool's execute function
   * 6. Validate output (permissive mode - warn only)
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

    if (this.testingAPI) {
      this.testingAPI.recordToolCall(toolName, validatedArgs);
    }

    if (this.testingAPI?.hasMockResponse(toolName)) {
      const mockResponse = this.testingAPI.getMockResponse(toolName);
      if (mockResponse) {
        console.log(`[Web Model Context] Returning mock response for tool: ${toolName}`);
        return mockResponse;
      }
    }

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

  const bridge: MCPBridge = {
    tabServer,
    tools: new Map(),
    modelContext: undefined as unknown as InternalModelContext,
    isInitialized: true,
  };

  const modelContext = new WebModelContext(bridge);
  bridge.modelContext = modelContext;

  setupServerHandlers(tabServer, bridge);

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

    if (window.navigator.modelContextTesting) {
      console.log(
        '✅ [Model Context Testing] Native implementation detected (Chromium experimental feature)'
      );
      console.log('   Using native window.navigator.modelContextTesting from browser');
      bridge.modelContextTesting = window.navigator.modelContextTesting;
    } else {
      console.log('[Model Context Testing] Native implementation not found, installing polyfill');
      console.log('   💡 To use the native implementation in Chromium:');
      console.log('      - Navigate to chrome://flags');
      console.log('      - Enable "Experimental Web Platform Features"');
      console.log('      - Or launch with: --enable-experimental-web-platform-features');

      const testingAPI = new WebModelContextTesting(bridge);
      bridge.modelContextTesting = testingAPI;

      (bridge.modelContext as WebModelContext).setTestingAPI(testingAPI);

      Object.defineProperty(window.navigator, 'modelContextTesting', {
        value: testingAPI,
        writable: false,
        configurable: true,
      });

      console.log(
        '✅ [Model Context Testing] Polyfill installed at window.navigator.modelContextTesting'
      );
    }
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
  delete (window.navigator as unknown as { modelContextTesting?: unknown }).modelContextTesting;
  delete (window as unknown as { __mcpBridge?: unknown }).__mcpBridge;

  console.log('[Web Model Context] Cleaned up');
}
