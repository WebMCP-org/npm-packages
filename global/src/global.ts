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
  ModelContext,
  ModelContextInput,
  ModelContextTesting,
  ToolCallEvent,
  ToolDescriptor,
  ToolResponse,
  ValidatedToolDescriptor,
  WebModelContextInitOptions,
  ZodSchemaObject,
} from './types.js';
import { jsonSchemaToZod, normalizeSchema, validateWithZod } from './validation.js';

declare global {
  interface Window {
    __webModelContextOptions?: WebModelContextInitOptions;
  }
}

/**
 * Detect if the native Chromium Web Model Context API is available.
 * Checks for both navigator.modelContext and navigator.modelContextTesting,
 * and verifies they are native implementations (not polyfills) by examining
 * the constructor name.
 *
 * @returns Detection result with flags for native context and testing API availability
 */
function detectNativeAPI(): {
  hasNativeContext: boolean;
  hasNativeTesting: boolean;
} {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return { hasNativeContext: false, hasNativeTesting: false };
  }

  const modelContext = navigator.modelContext;
  const modelContextTesting = navigator.modelContextTesting;

  if (!modelContext || !modelContextTesting) {
    return { hasNativeContext: false, hasNativeTesting: false };
  }

  const testingConstructorName = modelContextTesting.constructor?.name || '';
  const isPolyfill = testingConstructorName.includes('WebModelContext');

  if (isPolyfill) {
    return { hasNativeContext: false, hasNativeTesting: false };
  }

  return { hasNativeContext: true, hasNativeTesting: true };
}

/**
 * Adapter that wraps the native Chromium Web Model Context API.
 * Synchronizes tool changes from the native API to the MCP bridge,
 * enabling MCP clients to stay in sync with the native tool registry.
 *
 * Key features:
 * - Listens to native tool changes via registerToolsChangedCallback()
 * - Syncs native tools to MCP bridge automatically
 * - Delegates tool execution to native API
 * - Converts native results to MCP ToolResponse format
 *
 * @class NativeModelContextAdapter
 * @implements {InternalModelContext}
 */
class NativeModelContextAdapter implements InternalModelContext {
  private nativeContext: ModelContext;
  private nativeTesting: ModelContextTesting;
  private bridge: MCPBridge;
  private syncInProgress = false;

  /**
   * Creates a new NativeModelContextAdapter.
   *
   * @param {MCPBridge} bridge - The MCP bridge instance
   * @param {ModelContext} nativeContext - The native navigator.modelContext
   * @param {ModelContextTesting} nativeTesting - The native navigator.modelContextTesting
   */
  constructor(bridge: MCPBridge, nativeContext: ModelContext, nativeTesting: ModelContextTesting) {
    this.bridge = bridge;
    this.nativeContext = nativeContext;
    this.nativeTesting = nativeTesting;

    this.nativeTesting.registerToolsChangedCallback(() => {
      console.log('[Native Adapter] Tool change detected from native API');
      this.syncToolsFromNative();
    });

    this.syncToolsFromNative();
  }

  /**
   * Synchronizes tools from the native API to the MCP bridge.
   * Fetches all tools from navigator.modelContextTesting.listTools()
   * and updates the bridge's tool registry.
   *
   * @private
   */
  private syncToolsFromNative(): void {
    if (this.syncInProgress) {
      return;
    }

    this.syncInProgress = true;

    try {
      const nativeTools = this.nativeTesting.listTools();
      console.log(`[Native Adapter] Syncing ${nativeTools.length} tools from native API`);

      this.bridge.tools.clear();

      for (const toolInfo of nativeTools) {
        try {
          const inputSchema = JSON.parse(toolInfo.inputSchema);

          const validatedTool: ValidatedToolDescriptor = {
            name: toolInfo.name,
            description: toolInfo.description,
            inputSchema: inputSchema,
            execute: async (args: Record<string, unknown>) => {
              const result = await this.nativeTesting.executeTool(
                toolInfo.name,
                JSON.stringify(args)
              );
              return this.convertToToolResponse(result);
            },
            inputValidator: jsonSchemaToZod(inputSchema),
          };

          this.bridge.tools.set(toolInfo.name, validatedTool);
        } catch (error) {
          console.error(`[Native Adapter] Failed to sync tool "${toolInfo.name}":`, error);
        }
      }

      this.notifyMCPServers();
    } finally {
      this.syncInProgress = false;
    }
  }

  /**
   * Converts native API result to MCP ToolResponse format.
   * Native API returns simplified values (string, number, object, etc.)
   * which need to be wrapped in the MCP CallToolResult format.
   *
   * @param {unknown} result - The result from native executeTool()
   * @returns {ToolResponse} Formatted MCP ToolResponse
   * @private
   */
  private convertToToolResponse(result: unknown): ToolResponse {
    if (typeof result === 'string') {
      return { content: [{ type: 'text', text: result }] };
    }

    if (result === undefined || result === null) {
      return { content: [{ type: 'text', text: '' }] };
    }

    if (typeof result === 'object') {
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        structuredContent: result as Record<string, unknown>,
      };
    }

    return {
      content: [{ type: 'text', text: String(result) }],
    };
  }

  /**
   * Notifies all connected MCP servers that the tools list has changed.
   *
   * @private
   */
  private notifyMCPServers(): void {
    if (this.bridge.tabServer?.notification) {
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
   * Provides context (tools) to AI models via the native API.
   * Delegates to navigator.modelContext.provideContext().
   * Tool change callback will fire and trigger sync automatically.
   *
   * @param {ModelContextInput} context - Context containing tools to register
   */
  provideContext(context: ModelContextInput): void {
    console.log('[Native Adapter] Delegating provideContext to native API');
    this.nativeContext.provideContext(context);
  }

  /**
   * Registers a single tool dynamically via the native API.
   * Delegates to navigator.modelContext.registerTool().
   * Tool change callback will fire and trigger sync automatically.
   *
   * @param {ToolDescriptor} tool - The tool descriptor to register
   * @returns {{unregister: () => void}} Object with unregister function
   */
  registerTool<
    TInputSchema extends ZodSchemaObject = Record<string, never>,
    TOutputSchema extends ZodSchemaObject = Record<string, never>,
  >(tool: ToolDescriptor<TInputSchema, TOutputSchema>): { unregister: () => void } {
    console.log(`[Native Adapter] Delegating registerTool("${tool.name}") to native API`);
    const result = this.nativeContext.registerTool(tool);
    return result;
  }

  /**
   * Unregisters a tool by name via the native API.
   * Delegates to navigator.modelContext.unregisterTool().
   *
   * @param {string} name - Name of the tool to unregister
   */
  unregisterTool(name: string): void {
    console.log(`[Native Adapter] Delegating unregisterTool("${name}") to native API`);
    this.nativeContext.unregisterTool(name);
  }

  /**
   * Clears all registered tools via the native API.
   * Delegates to navigator.modelContext.clearContext().
   */
  clearContext(): void {
    console.log('[Native Adapter] Delegating clearContext to native API');
    this.nativeContext.clearContext();
  }

  /**
   * Executes a tool via the native API.
   * Delegates to navigator.modelContextTesting.executeTool() with JSON string args.
   *
   * @param {string} toolName - Name of the tool to execute
   * @param {Record<string, unknown>} args - Arguments to pass to the tool
   * @returns {Promise<ToolResponse>} The tool's response in MCP format
   * @internal
   */
  async executeTool(toolName: string, args: Record<string, unknown>): Promise<ToolResponse> {
    console.log(`[Native Adapter] Executing tool "${toolName}" via native API`);
    try {
      const result = await this.nativeTesting.executeTool(toolName, JSON.stringify(args));
      return this.convertToToolResponse(result);
    } catch (error) {
      console.error(`[Native Adapter] Error executing tool "${toolName}":`, error);
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
   * Lists all registered tools from the MCP bridge.
   * Returns tools synced from the native API.
   *
   * @returns {Array<{name: string, description: string, inputSchema: InputSchema}>} Array of tool descriptors
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

  /**
   * Adds an event listener for tool call events.
   * Delegates to the native API's addEventListener.
   *
   * @param {'toolcall'} type - Event type
   * @param {(event: ToolCallEvent) => void | Promise<void>} listener - Event handler
   * @param {boolean | AddEventListenerOptions} [options] - Event listener options
   */
  addEventListener(
    type: 'toolcall',
    listener: (event: ToolCallEvent) => void | Promise<void>,
    options?: boolean | AddEventListenerOptions
  ): void {
    this.nativeContext.addEventListener(type, listener, options);
  }

  /**
   * Removes an event listener for tool call events.
   * Delegates to the native API's removeEventListener.
   *
   * @param {'toolcall'} type - Event type
   * @param {(event: ToolCallEvent) => void | Promise<void>} listener - Event handler
   * @param {boolean | EventListenerOptions} [options] - Event listener options
   */
  removeEventListener(
    type: 'toolcall',
    listener: (event: ToolCallEvent) => void | Promise<void>,
    options?: boolean | EventListenerOptions
  ): void {
    this.nativeContext.removeEventListener(type, listener, options);
  }

  /**
   * Dispatches a tool call event.
   * Delegates to the native API's dispatchEvent.
   *
   * @param {Event} event - The event to dispatch
   * @returns {boolean} False if event was cancelled, true otherwise
   */
  dispatchEvent(event: Event): boolean {
    return this.nativeContext.dispatchEvent(event);
  }
}

/**
 * ToolCallEvent implementation for the Web Model Context API.
 * Represents an event fired when a tool is called, allowing event listeners
 * to intercept and provide custom responses.
 *
 * @class WebToolCallEvent
 * @extends {Event}
 * @implements {ToolCallEvent}
 */
class WebToolCallEvent extends Event implements ToolCallEvent {
  public name: string;
  public arguments: Record<string, unknown>;
  private _response: ToolResponse | null = null;
  private _responded = false;

  /**
   * Creates a new ToolCallEvent.
   *
   * @param {string} toolName - Name of the tool being called
   * @param {Record<string, unknown>} args - Validated arguments for the tool
   */
  constructor(toolName: string, args: Record<string, unknown>) {
    super('toolcall', { cancelable: true });
    this.name = toolName;
    this.arguments = args;
  }

  /**
   * Provides a response for this tool call, preventing the default tool execution.
   *
   * @param {ToolResponse} response - The response to use instead of executing the tool
   * @throws {Error} If a response has already been provided
   */
  respondWith(response: ToolResponse): void {
    if (this._responded) {
      throw new Error('Response already provided for this tool call');
    }
    this._response = response;
    this._responded = true;
  }

  /**
   * Gets the response provided via respondWith().
   *
   * @returns {ToolResponse | null} The response, or null if none provided
   */
  getResponse(): ToolResponse | null {
    return this._response;
  }

  /**
   * Checks whether a response has been provided for this tool call.
   *
   * @returns {boolean} True if respondWith() was called
   */
  hasResponse(): boolean {
    return this._responded;
  }
}

/**
 * Time window in milliseconds to detect rapid duplicate tool registrations.
 * Used to filter out double-registrations caused by React Strict Mode.
 */
const RAPID_DUPLICATE_WINDOW_MS = 50;

/**
 * Testing API implementation for the Model Context Protocol.
 * Provides debugging, mocking, and testing capabilities for tool execution.
 * Implements both Chromium native methods and polyfill-specific extensions.
 *
 * @class WebModelContextTesting
 * @implements {ModelContextTesting}
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

  /**
   * Creates a new WebModelContextTesting instance.
   *
   * @param {MCPBridge} bridge - The MCP bridge instance to test
   */
  constructor(bridge: MCPBridge) {
    this.bridge = bridge;
  }

  /**
   * Records a tool call in the history.
   * Called internally by WebModelContext when tools are executed.
   *
   * @param {string} toolName - Name of the tool that was called
   * @param {Record<string, unknown>} args - Arguments passed to the tool
   * @internal
   */
  recordToolCall(toolName: string, args: Record<string, unknown>): void {
    this.toolCallHistory.push({
      toolName,
      arguments: args,
      timestamp: Date.now(),
    });
  }

  /**
   * Checks if a mock response is registered for a specific tool.
   *
   * @param {string} toolName - Name of the tool to check
   * @returns {boolean} True if a mock response exists
   * @internal
   */
  hasMockResponse(toolName: string): boolean {
    return this.mockResponses.has(toolName);
  }

  /**
   * Retrieves the mock response for a specific tool.
   *
   * @param {string} toolName - Name of the tool
   * @returns {ToolResponse | undefined} The mock response, or undefined if none exists
   * @internal
   */
  getMockResponse(toolName: string): ToolResponse | undefined {
    return this.mockResponses.get(toolName);
  }

  /**
   * Notifies all registered callbacks that the tools list has changed.
   * Called internally when tools are registered, unregistered, or cleared.
   *
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
   * Executes a tool directly with JSON string input (Chromium native API).
   * Parses the JSON input, validates it, and executes the tool.
   *
   * @param {string} toolName - Name of the tool to execute
   * @param {string} inputArgsJson - JSON string of input arguments
   * @returns {Promise<unknown>} The tool's result, or undefined on error
   * @throws {SyntaxError} If the input JSON is invalid
   * @throws {Error} If the tool does not exist
   */
  async executeTool(toolName: string, inputArgsJson: string): Promise<unknown> {
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

    if (result.isError) {
      return undefined;
    }

    if (result.structuredContent) {
      return result.structuredContent;
    }

    if (result.content && result.content.length > 0) {
      const firstContent = result.content[0];
      if (firstContent && firstContent.type === 'text') {
        return firstContent.text;
      }
    }

    return undefined;
  }

  /**
   * Lists all registered tools with inputSchema as JSON string (Chromium native API).
   * Returns an array of ToolInfo objects where inputSchema is stringified.
   *
   * @returns {Array<{name: string, description: string, inputSchema: string}>} Array of tool information
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
   * Registers a callback that fires when the tools list changes (Chromium native API).
   * The callback will be invoked on registerTool, unregisterTool, provideContext, and clearContext.
   *
   * @param {() => void} callback - Function to call when tools change
   */
  registerToolsChangedCallback(callback: () => void): void {
    this.toolsChangedCallbacks.add(callback);
    console.log('[Model Context Testing] Tools changed callback registered');
  }

  /**
   * Gets all tool calls that have been recorded (polyfill extension).
   *
   * @returns {Array<{toolName: string, arguments: Record<string, unknown>, timestamp: number}>} Tool call history
   */
  getToolCalls(): Array<{
    toolName: string;
    arguments: Record<string, unknown>;
    timestamp: number;
  }> {
    return [...this.toolCallHistory];
  }

  /**
   * Clears the tool call history (polyfill extension).
   */
  clearToolCalls(): void {
    this.toolCallHistory = [];
    console.log('[Model Context Testing] Tool call history cleared');
  }

  /**
   * Sets a mock response for a specific tool (polyfill extension).
   * When set, the tool's execute function will be bypassed.
   *
   * @param {string} toolName - Name of the tool to mock
   * @param {ToolResponse} response - The mock response to return
   */
  setMockToolResponse(toolName: string, response: ToolResponse): void {
    this.mockResponses.set(toolName, response);
    console.log(`[Model Context Testing] Mock response set for tool: ${toolName}`);
  }

  /**
   * Clears the mock response for a specific tool (polyfill extension).
   *
   * @param {string} toolName - Name of the tool
   */
  clearMockToolResponse(toolName: string): void {
    this.mockResponses.delete(toolName);
    console.log(`[Model Context Testing] Mock response cleared for tool: ${toolName}`);
  }

  /**
   * Clears all mock tool responses (polyfill extension).
   */
  clearAllMockToolResponses(): void {
    this.mockResponses.clear();
    console.log('[Model Context Testing] All mock responses cleared');
  }

  /**
   * Gets the current tools registered in the system (polyfill extension).
   *
   * @returns {ReturnType<InternalModelContext['listTools']>} Array of registered tools
   */
  getRegisteredTools(): ReturnType<InternalModelContext['listTools']> {
    return this.bridge.modelContext.listTools();
  }

  /**
   * Resets the entire testing state (polyfill extension).
   * Clears both tool call history and all mock responses.
   */
  reset(): void {
    this.clearToolCalls();
    this.clearAllMockToolResponses();
    console.log('[Model Context Testing] Testing state reset');
  }
}

/**
 * ModelContext implementation that bridges to the Model Context Protocol SDK.
 * Implements the W3C Web Model Context API proposal with two-bucket tool management:
 * - Bucket A (provideContextTools): Tools registered via provideContext()
 * - Bucket B (dynamicTools): Tools registered via registerTool()
 *
 * This separation ensures that component-scoped dynamic tools persist across
 * app-level provideContext() calls.
 *
 * @class WebModelContext
 * @implements {InternalModelContext}
 */
class WebModelContext implements InternalModelContext {
  private bridge: MCPBridge;
  private eventTarget: EventTarget;
  private provideContextTools: Map<string, ValidatedToolDescriptor>;
  private dynamicTools: Map<string, ValidatedToolDescriptor>;
  private registrationTimestamps: Map<string, number>;
  private unregisterFunctions: Map<string, () => void>;
  private testingAPI?: WebModelContextTesting;

  /**
   * Creates a new WebModelContext instance.
   *
   * @param {MCPBridge} bridge - The MCP bridge to use for communication
   */
  constructor(bridge: MCPBridge) {
    this.bridge = bridge;
    this.eventTarget = new EventTarget();
    this.provideContextTools = new Map();
    this.dynamicTools = new Map();
    this.registrationTimestamps = new Map();
    this.unregisterFunctions = new Map();
  }

  /**
   * Sets the testing API instance.
   * Called during initialization to enable testing features.
   *
   * @param {WebModelContextTesting} testingAPI - The testing API instance
   * @internal
   */
  setTestingAPI(testingAPI: WebModelContextTesting): void {
    this.testingAPI = testingAPI;
  }

  /**
   * Adds an event listener for tool call events.
   *
   * @param {'toolcall'} type - Event type (only 'toolcall' is supported)
   * @param {(event: ToolCallEvent) => void | Promise<void>} listener - Event handler function
   * @param {boolean | AddEventListenerOptions} [options] - Event listener options
   */
  addEventListener(
    type: 'toolcall',
    listener: (event: ToolCallEvent) => void | Promise<void>,
    options?: boolean | AddEventListenerOptions
  ): void {
    this.eventTarget.addEventListener(type, listener as EventListener, options);
  }

  /**
   * Removes an event listener for tool call events.
   *
   * @param {'toolcall'} type - Event type (only 'toolcall' is supported)
   * @param {(event: ToolCallEvent) => void | Promise<void>} listener - Event handler function
   * @param {boolean | EventListenerOptions} [options] - Event listener options
   */
  removeEventListener(
    type: 'toolcall',
    listener: (event: ToolCallEvent) => void | Promise<void>,
    options?: boolean | EventListenerOptions
  ): void {
    this.eventTarget.removeEventListener(type, listener as EventListener, options);
  }

  /**
   * Dispatches a tool call event to all registered listeners.
   *
   * @param {Event} event - The event to dispatch
   * @returns {boolean} False if event was cancelled, true otherwise
   */
  dispatchEvent(event: Event): boolean {
    return this.eventTarget.dispatchEvent(event);
  }

  /**
   * Provides context (tools) to AI models by registering base tools (Bucket A).
   * Clears and replaces all previously registered base tools while preserving
   * dynamic tools registered via registerTool().
   *
   * @param {ModelContextInput} context - Context containing tools to register
   * @throws {Error} If a tool name collides with an existing dynamic tool
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
   * Registers a single tool dynamically (Bucket B).
   * Dynamic tools persist across provideContext() calls and can be independently managed.
   *
   * @param {ToolDescriptor} tool - The tool descriptor to register
   * @returns {{unregister: () => void}} Object with unregister function
   * @throws {Error} If tool name collides with existing tools
   */
  registerTool<
    TInputSchema extends ZodSchemaObject = Record<string, never>,
    TOutputSchema extends ZodSchemaObject = Record<string, never>,
  >(tool: ToolDescriptor<TInputSchema, TOutputSchema>): { unregister: () => void } {
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
      execute: tool.execute as (args: Record<string, unknown>) => Promise<ToolResponse>,
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
   * Unregisters a tool by name (Chromium native API).
   * Can unregister tools from either Bucket A (provideContext) or Bucket B (registerTool).
   *
   * @param {string} name - Name of the tool to unregister
   */
  unregisterTool(name: string): void {
    console.log(`[Web Model Context] Unregistering tool: ${name}`);

    const inProvideContext = this.provideContextTools.has(name);
    const inDynamic = this.dynamicTools.has(name);

    if (!inProvideContext && !inDynamic) {
      console.warn(
        `[Web Model Context] Tool "${name}" is not registered, ignoring unregister call`
      );
      return;
    }

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
   * Clears all registered tools from both buckets (Chromium native API).
   * Removes all tools registered via provideContext() and registerTool().
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
   * Updates the bridge tools map with merged tools from both buckets.
   * The final tool list is the union of Bucket A (provideContext) and Bucket B (dynamic).
   *
   * @private
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
   * Notifies all servers and testing callbacks that the tools list has changed.
   * Sends MCP notifications to connected servers and invokes registered testing callbacks.
   *
   * @private
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

    if (this.testingAPI && 'notifyToolsChanged' in this.testingAPI) {
      (this.testingAPI as WebModelContextTesting).notifyToolsChanged();
    }
  }

  /**
   * Executes a tool with validation and event dispatch.
   * Follows this sequence:
   * 1. Validates input arguments against schema
   * 2. Records tool call in testing API (if available)
   * 3. Checks for mock response (if testing)
   * 4. Dispatches 'toolcall' event to listeners
   * 5. Executes tool function if not prevented
   * 6. Validates output (permissive mode - warns only)
   *
   * @param {string} toolName - Name of the tool to execute
   * @param {Record<string, unknown>} args - Arguments to pass to the tool
   * @returns {Promise<ToolResponse>} The tool's response
   * @throws {Error} If tool is not found
   * @internal
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
   * Lists all registered tools in MCP format.
   * Returns tools from both buckets with full MCP specification including
   * annotations and output schemas.
   *
   * @returns {Array<{name: string, description: string, inputSchema: InputSchema, outputSchema?: InputSchema, annotations?: ToolAnnotations}>} Array of tool descriptors
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
 * Initializes the MCP bridge with dual-server support.
 * Creates TabServer for same-window communication and optionally IframeChildServer
 * for parent-child iframe communication.
 *
 * @param {WebModelContextInitOptions} [options] - Configuration options
 * @returns {MCPBridge} The initialized MCP bridge
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
 * Initializes the Web Model Context API on window.navigator.
 * Creates and exposes navigator.modelContext and navigator.modelContextTesting.
 * Automatically detects and uses native Chromium implementation if available.
 *
 * @param {WebModelContextInitOptions} [options] - Configuration options
 * @throws {Error} If initialization fails
 * @example
 * ```typescript
 * import { initializeWebModelContext } from '@mcp-b/global';
 *
 * initializeWebModelContext({
 *   transport: {
 *     tabServer: {
 *       allowedOrigins: ['https://example.com']
 *     }
 *   }
 * });
 * ```
 */
export function initializeWebModelContext(options?: WebModelContextInitOptions): void {
  if (typeof window === 'undefined') {
    console.warn('[Web Model Context] Not in browser environment, skipping initialization');
    return;
  }

  const effectiveOptions = options ?? window.__webModelContextOptions;
  const native = detectNativeAPI();

  if (native.hasNativeContext && native.hasNativeTesting) {
    const nativeContext = window.navigator.modelContext;
    const nativeTesting = window.navigator.modelContextTesting;

    if (!nativeContext || !nativeTesting) {
      console.error('[Web Model Context] Native API detection mismatch');
      return;
    }

    console.log('✅ [Web Model Context] Native Chromium API detected');
    console.log('   Using native implementation with MCP bridge synchronization');
    console.log('   Native API will automatically collect tools from embedded iframes');

    try {
      const bridge = initializeMCPBridge(effectiveOptions);

      const adapter = new NativeModelContextAdapter(bridge, nativeContext, nativeTesting);

      bridge.modelContext = adapter;
      bridge.modelContextTesting = nativeTesting;

      Object.defineProperty(window, '__mcpBridge', {
        value: bridge,
        writable: false,
        configurable: true,
      });

      console.log('✅ [Web Model Context] MCP bridge synced with native API');
      console.log('   MCP clients will receive automatic tool updates from native registry');
    } catch (error) {
      console.error('[Web Model Context] Failed to initialize native adapter:', error);
      throw error;
    }

    return;
  }

  if (native.hasNativeContext && !native.hasNativeTesting) {
    console.warn('[Web Model Context] Partial native API detected');
    console.warn('   navigator.modelContext exists but navigator.modelContextTesting is missing');
    console.warn('   Cannot sync with native API. Please enable experimental features:');
    console.warn('      - Navigate to chrome://flags');
    console.warn('      - Enable "Experimental Web Platform Features"');
    console.warn('      - Or launch with: --enable-experimental-web-platform-features');
    console.warn('   Skipping initialization to avoid conflicts');
    return;
  }

  if (window.navigator.modelContext) {
    console.warn(
      '[Web Model Context] window.navigator.modelContext already exists, skipping initialization'
    );
    return;
  }

  console.log('[Web Model Context] Native API not detected, installing polyfill');

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

    console.log('[Model Context Testing] Installing polyfill');
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
  } catch (error) {
    console.error('[Web Model Context] Failed to initialize:', error);
    throw error;
  }
}

/**
 * Cleans up the Web Model Context API.
 * Closes all MCP servers and removes API from window.navigator.
 * Useful for testing and hot module replacement.
 *
 * @example
 * ```typescript
 * import { cleanupWebModelContext } from '@mcp-b/global';
 *
 * cleanupWebModelContext();
 * ```
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
