import {
  IframeChildTransport,
  type IframeChildTransportOptions,
  TabServerTransport,
  type TabServerTransportOptions,
} from '@mcp-b/transports';
import type {
  Prompt,
  PromptMessage,
  Resource,
  ResourceContents,
  Transport,
} from '@mcp-b/webmcp-ts-sdk';
import {
  CallToolRequestSchema,
  GetPromptRequestSchema,
  ListPromptsRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  Server as McpServer,
  ReadResourceRequestSchema,
} from '@mcp-b/webmcp-ts-sdk';
import type { z } from 'zod';
import type {
  ElicitationParams,
  ElicitationResult,
  InputSchema,
  InternalModelContext,
  MCPBridge,
  ModelContext,
  ModelContextInput,
  ModelContextTesting,
  PromptDescriptor,
  ResourceDescriptor,
  SamplingRequestParams,
  SamplingResult,
  ToolCallEvent,
  ToolDescriptor,
  ToolResponse,
  ValidatedPromptDescriptor,
  ValidatedResourceDescriptor,
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

  // ==================== RESOURCE METHODS (not yet supported by native API) ====================

  /**
   * Registers a resource dynamically.
   * Note: Native Chromium API does not yet support resources.
   * This is a polyfill-only feature.
   */
  registerResource(_resource: ResourceDescriptor): { unregister: () => void } {
    console.warn('[Native Adapter] registerResource is not supported by native API');
    return { unregister: () => {} };
  }

  /**
   * Unregisters a resource by URI.
   * Note: Native Chromium API does not yet support resources.
   */
  unregisterResource(_uri: string): void {
    console.warn('[Native Adapter] unregisterResource is not supported by native API');
  }

  /**
   * Lists all registered resources.
   * Note: Native Chromium API does not yet support resources.
   */
  listResources(): Resource[] {
    return [];
  }

  /**
   * Lists all resource templates.
   * Note: Native Chromium API does not yet support resources.
   */
  listResourceTemplates(): Array<{
    uriTemplate: string;
    name: string;
    description?: string;
    mimeType?: string;
  }> {
    return [];
  }

  /**
   * Reads a resource by URI.
   * Note: Native Chromium API does not yet support resources.
   * @internal
   */
  async readResource(_uri: string): Promise<{ contents: ResourceContents[] }> {
    throw new Error('[Native Adapter] readResource is not supported by native API');
  }

  // ==================== PROMPT METHODS (not yet supported by native API) ====================

  /**
   * Registers a prompt dynamically.
   * Note: Native Chromium API does not yet support prompts.
   * This is a polyfill-only feature.
   */
  registerPrompt<TArgsSchema extends ZodSchemaObject = Record<string, never>>(
    _prompt: PromptDescriptor<TArgsSchema>
  ): { unregister: () => void } {
    console.warn('[Native Adapter] registerPrompt is not supported by native API');
    return { unregister: () => {} };
  }

  /**
   * Unregisters a prompt by name.
   * Note: Native Chromium API does not yet support prompts.
   */
  unregisterPrompt(_name: string): void {
    console.warn('[Native Adapter] unregisterPrompt is not supported by native API');
  }

  /**
   * Lists all registered prompts.
   * Note: Native Chromium API does not yet support prompts.
   */
  listPrompts(): Prompt[] {
    return [];
  }

  /**
   * Gets a prompt with arguments.
   * Note: Native Chromium API does not yet support prompts.
   * @internal
   */
  async getPrompt(
    _name: string,
    _args?: Record<string, unknown>
  ): Promise<{ messages: PromptMessage[] }> {
    throw new Error('[Native Adapter] getPrompt is not supported by native API');
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

  // ==================== SAMPLING METHODS ====================

  /**
   * Request an LLM completion from the connected client.
   * Note: Native Chromium API does not yet support sampling.
   * This is handled by the polyfill.
   */
  async createMessage(params: SamplingRequestParams): Promise<SamplingResult> {
    console.log('[Native Adapter] Requesting sampling from client');
    const server = this.bridge.tabServer;

    // Access the underlying Server instance to call createMessage
    const underlyingServer = (
      server as unknown as {
        server: { createMessage: (params: unknown) => Promise<SamplingResult> };
      }
    ).server;

    if (!underlyingServer?.createMessage) {
      throw new Error('Sampling is not supported: no connected client with sampling capability');
    }

    return underlyingServer.createMessage(params);
  }

  // ==================== ELICITATION METHODS ====================

  /**
   * Request user input from the connected client.
   * Note: Native Chromium API does not yet support elicitation.
   * This is handled by the polyfill.
   */
  async elicitInput(params: ElicitationParams): Promise<ElicitationResult> {
    console.log('[Native Adapter] Requesting elicitation from client');
    const server = this.bridge.tabServer;

    // Access the underlying Server instance to call elicitInput
    const underlyingServer = (
      server as unknown as {
        server: { elicitInput: (params: unknown) => Promise<ElicitationResult> };
      }
    ).server;

    if (!underlyingServer?.elicitInput) {
      throw new Error(
        'Elicitation is not supported: no connected client with elicitation capability'
      );
    }

    return underlyingServer.elicitInput(params);
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

  // Tool storage (Bucket A = provideContext, Bucket B = dynamic)
  private provideContextTools: Map<string, ValidatedToolDescriptor>;
  private dynamicTools: Map<string, ValidatedToolDescriptor>;

  // Resource storage (Bucket A = provideContext, Bucket B = dynamic)
  private provideContextResources: Map<string, ValidatedResourceDescriptor>;
  private dynamicResources: Map<string, ValidatedResourceDescriptor>;

  // Prompt storage (Bucket A = provideContext, Bucket B = dynamic)
  private provideContextPrompts: Map<string, ValidatedPromptDescriptor>;
  private dynamicPrompts: Map<string, ValidatedPromptDescriptor>;

  // Registration tracking for duplicate detection
  private toolRegistrationTimestamps: Map<string, number>;
  private resourceRegistrationTimestamps: Map<string, number>;
  private promptRegistrationTimestamps: Map<string, number>;

  // Unregister functions for dynamic registrations
  private toolUnregisterFunctions: Map<string, () => void>;
  private resourceUnregisterFunctions: Map<string, () => void>;
  private promptUnregisterFunctions: Map<string, () => void>;

  // Pending notification flags for microtask-based batching
  // This coalesces rapid registrations (e.g., React mount phase) into a single notification
  private pendingToolNotification = false;
  private pendingResourceNotification = false;
  private pendingPromptNotification = false;

  private testingAPI?: WebModelContextTesting;

  /**
   * Creates a new WebModelContext instance.
   *
   * @param {MCPBridge} bridge - The MCP bridge to use for communication
   */
  constructor(bridge: MCPBridge) {
    this.bridge = bridge;
    this.eventTarget = new EventTarget();

    // Initialize tool storage
    this.provideContextTools = new Map();
    this.dynamicTools = new Map();
    this.toolRegistrationTimestamps = new Map();
    this.toolUnregisterFunctions = new Map();

    // Initialize resource storage
    this.provideContextResources = new Map();
    this.dynamicResources = new Map();
    this.resourceRegistrationTimestamps = new Map();
    this.resourceUnregisterFunctions = new Map();

    // Initialize prompt storage
    this.provideContextPrompts = new Map();
    this.dynamicPrompts = new Map();
    this.promptRegistrationTimestamps = new Map();
    this.promptUnregisterFunctions = new Map();
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
   * Provides context (tools, resources, prompts) to AI models by registering base items (Bucket A).
   * Clears and replaces all previously registered base items while preserving
   * dynamic items registered via register* methods.
   *
   * @param {ModelContextInput} context - Context containing tools, resources, and prompts to register
   * @throws {Error} If a name/uri collides with existing dynamic items
   */
  provideContext(context: ModelContextInput): void {
    const toolCount = context.tools?.length ?? 0;
    const resourceCount = context.resources?.length ?? 0;
    const promptCount = context.prompts?.length ?? 0;
    console.log(
      `[Web Model Context] provideContext: ${toolCount} tools, ${resourceCount} resources, ${promptCount} prompts`
    );

    // Clear base items (Bucket A)
    this.provideContextTools.clear();
    this.provideContextResources.clear();
    this.provideContextPrompts.clear();

    // Register tools
    for (const tool of context.tools ?? []) {
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

    // Register resources
    for (const resource of context.resources ?? []) {
      if (this.dynamicResources.has(resource.uri)) {
        throw new Error(
          `[Web Model Context] Resource URI collision: "${resource.uri}" is already registered via registerResource(). ` +
            'Please use a different URI or unregister the dynamic resource first.'
        );
      }

      const validatedResource = this.validateResource(resource);
      this.provideContextResources.set(resource.uri, validatedResource);
    }

    // Register prompts
    for (const prompt of context.prompts ?? []) {
      if (this.dynamicPrompts.has(prompt.name)) {
        throw new Error(
          `[Web Model Context] Prompt name collision: "${prompt.name}" is already registered via registerPrompt(). ` +
            'Please use a different name or unregister the dynamic prompt first.'
        );
      }

      const validatedPrompt = this.validatePrompt(prompt);
      this.provideContextPrompts.set(prompt.name, validatedPrompt);
    }

    // Update bridge and schedule notifications (batched via microtask)
    this.updateBridgeTools();
    this.updateBridgeResources();
    this.updateBridgePrompts();

    this.scheduleToolsListChanged();
    this.scheduleResourcesListChanged();
    this.schedulePromptsListChanged();
  }

  /**
   * Validates and normalizes a resource descriptor.
   * @private
   */
  private validateResource(resource: ResourceDescriptor): ValidatedResourceDescriptor {
    // Extract template parameters from URI (e.g., "file://{path}" -> ["path"])
    const templateParamRegex = /\{([^}]+)\}/g;
    const templateParams: string[] = [];
    for (const match of resource.uri.matchAll(templateParamRegex)) {
      const paramName = match[1];
      if (paramName) {
        templateParams.push(paramName);
      }
    }

    return {
      uri: resource.uri,
      name: resource.name,
      description: resource.description,
      mimeType: resource.mimeType,
      read: resource.read,
      isTemplate: templateParams.length > 0,
      templateParams,
    };
  }

  /**
   * Validates and normalizes a prompt descriptor.
   * @private
   */
  private validatePrompt<TArgsSchema extends ZodSchemaObject>(
    prompt: PromptDescriptor<TArgsSchema>
  ): ValidatedPromptDescriptor {
    let argsSchema: InputSchema | undefined;
    let argsValidator: z.ZodType | undefined;

    if (prompt.argsSchema) {
      const normalized = normalizeSchema(prompt.argsSchema);
      argsSchema = normalized.jsonSchema;
      argsValidator = normalized.zodValidator;
    }

    return {
      name: prompt.name,
      description: prompt.description,
      argsSchema,
      get: prompt.get as (args: Record<string, unknown>) => Promise<{ messages: PromptMessage[] }>,
      argsValidator,
    };
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
    const lastRegistration = this.toolRegistrationTimestamps.get(tool.name);

    if (lastRegistration && now - lastRegistration < RAPID_DUPLICATE_WINDOW_MS) {
      console.warn(
        `[Web Model Context] Tool "${tool.name}" registered multiple times within ${RAPID_DUPLICATE_WINDOW_MS}ms. ` +
          'This is likely due to React Strict Mode double-mounting. Ignoring duplicate registration.'
      );

      const existingUnregister = this.toolUnregisterFunctions.get(tool.name);
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
    this.toolRegistrationTimestamps.set(tool.name, now);
    this.updateBridgeTools();
    this.scheduleToolsListChanged();

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
      this.toolRegistrationTimestamps.delete(tool.name);
      this.toolUnregisterFunctions.delete(tool.name);
      this.updateBridgeTools();
      this.scheduleToolsListChanged();
    };

    this.toolUnregisterFunctions.set(tool.name, unregisterFn);

    return { unregister: unregisterFn };
  }

  // ==================== RESOURCE METHODS ====================

  /**
   * Registers a single resource dynamically (Bucket B).
   * Dynamic resources persist across provideContext() calls and can be independently managed.
   *
   * @param {ResourceDescriptor} resource - The resource descriptor to register
   * @returns {{unregister: () => void}} Object with unregister function
   * @throws {Error} If resource URI collides with existing resources
   */
  registerResource(resource: ResourceDescriptor): { unregister: () => void } {
    console.log(`[Web Model Context] Registering resource dynamically: ${resource.uri}`);

    const now = Date.now();
    const lastRegistration = this.resourceRegistrationTimestamps.get(resource.uri);

    if (lastRegistration && now - lastRegistration < RAPID_DUPLICATE_WINDOW_MS) {
      console.warn(
        `[Web Model Context] Resource "${resource.uri}" registered multiple times within ${RAPID_DUPLICATE_WINDOW_MS}ms. ` +
          'This is likely due to React Strict Mode double-mounting. Ignoring duplicate registration.'
      );

      const existingUnregister = this.resourceUnregisterFunctions.get(resource.uri);
      if (existingUnregister) {
        return { unregister: existingUnregister };
      }
    }

    if (this.provideContextResources.has(resource.uri)) {
      throw new Error(
        `[Web Model Context] Resource URI collision: "${resource.uri}" is already registered via provideContext(). ` +
          'Please use a different URI or update your provideContext() call.'
      );
    }

    if (this.dynamicResources.has(resource.uri)) {
      throw new Error(
        `[Web Model Context] Resource URI collision: "${resource.uri}" is already registered via registerResource(). ` +
          'Please unregister it first or use a different URI.'
      );
    }

    const validatedResource = this.validateResource(resource);
    this.dynamicResources.set(resource.uri, validatedResource);
    this.resourceRegistrationTimestamps.set(resource.uri, now);
    this.updateBridgeResources();
    this.scheduleResourcesListChanged();

    const unregisterFn = () => {
      console.log(`[Web Model Context] Unregistering resource: ${resource.uri}`);

      if (this.provideContextResources.has(resource.uri)) {
        throw new Error(
          `[Web Model Context] Cannot unregister resource "${resource.uri}": ` +
            'This resource was registered via provideContext(). Use provideContext() to update the base resource set.'
        );
      }

      if (!this.dynamicResources.has(resource.uri)) {
        console.warn(
          `[Web Model Context] Resource "${resource.uri}" is not registered, ignoring unregister call`
        );
        return;
      }

      this.dynamicResources.delete(resource.uri);
      this.resourceRegistrationTimestamps.delete(resource.uri);
      this.resourceUnregisterFunctions.delete(resource.uri);
      this.updateBridgeResources();
      this.scheduleResourcesListChanged();
    };

    this.resourceUnregisterFunctions.set(resource.uri, unregisterFn);

    return { unregister: unregisterFn };
  }

  /**
   * Unregisters a resource by URI.
   * Can unregister resources from either Bucket A (provideContext) or Bucket B (registerResource).
   *
   * @param {string} uri - URI of the resource to unregister
   */
  unregisterResource(uri: string): void {
    console.log(`[Web Model Context] Unregistering resource: ${uri}`);

    const inProvideContext = this.provideContextResources.has(uri);
    const inDynamic = this.dynamicResources.has(uri);

    if (!inProvideContext && !inDynamic) {
      console.warn(
        `[Web Model Context] Resource "${uri}" is not registered, ignoring unregister call`
      );
      return;
    }

    if (inProvideContext) {
      this.provideContextResources.delete(uri);
    }

    if (inDynamic) {
      this.dynamicResources.delete(uri);
      this.resourceRegistrationTimestamps.delete(uri);
      this.resourceUnregisterFunctions.delete(uri);
    }

    this.updateBridgeResources();
    this.scheduleResourcesListChanged();
  }

  /**
   * Lists all registered resources in MCP format.
   * Returns static resources from both buckets (not templates).
   *
   * @returns {Resource[]} Array of resource descriptors
   */
  listResources(): Resource[] {
    return Array.from(this.bridge.resources.values())
      .filter((r) => !r.isTemplate)
      .map((resource) => ({
        uri: resource.uri,
        name: resource.name,
        description: resource.description,
        mimeType: resource.mimeType,
      }));
  }

  /**
   * Lists all registered resource templates.
   * Returns only resources with URI templates (dynamic resources).
   *
   * @returns {Array<{uriTemplate: string, name: string, description?: string, mimeType?: string}>}
   */
  listResourceTemplates(): Array<{
    uriTemplate: string;
    name: string;
    description?: string;
    mimeType?: string;
  }> {
    return Array.from(this.bridge.resources.values())
      .filter((r) => r.isTemplate)
      .map((resource) => ({
        uriTemplate: resource.uri,
        name: resource.name,
        ...(resource.description !== undefined && { description: resource.description }),
        ...(resource.mimeType !== undefined && { mimeType: resource.mimeType }),
      }));
  }

  // ==================== PROMPT METHODS ====================

  /**
   * Registers a single prompt dynamically (Bucket B).
   * Dynamic prompts persist across provideContext() calls and can be independently managed.
   *
   * @param {PromptDescriptor} prompt - The prompt descriptor to register
   * @returns {{unregister: () => void}} Object with unregister function
   * @throws {Error} If prompt name collides with existing prompts
   */
  registerPrompt<TArgsSchema extends ZodSchemaObject = Record<string, never>>(
    prompt: PromptDescriptor<TArgsSchema>
  ): { unregister: () => void } {
    console.log(`[Web Model Context] Registering prompt dynamically: ${prompt.name}`);

    const now = Date.now();
    const lastRegistration = this.promptRegistrationTimestamps.get(prompt.name);

    if (lastRegistration && now - lastRegistration < RAPID_DUPLICATE_WINDOW_MS) {
      console.warn(
        `[Web Model Context] Prompt "${prompt.name}" registered multiple times within ${RAPID_DUPLICATE_WINDOW_MS}ms. ` +
          'This is likely due to React Strict Mode double-mounting. Ignoring duplicate registration.'
      );

      const existingUnregister = this.promptUnregisterFunctions.get(prompt.name);
      if (existingUnregister) {
        return { unregister: existingUnregister };
      }
    }

    if (this.provideContextPrompts.has(prompt.name)) {
      throw new Error(
        `[Web Model Context] Prompt name collision: "${prompt.name}" is already registered via provideContext(). ` +
          'Please use a different name or update your provideContext() call.'
      );
    }

    if (this.dynamicPrompts.has(prompt.name)) {
      throw new Error(
        `[Web Model Context] Prompt name collision: "${prompt.name}" is already registered via registerPrompt(). ` +
          'Please unregister it first or use a different name.'
      );
    }

    const validatedPrompt = this.validatePrompt(prompt);
    this.dynamicPrompts.set(prompt.name, validatedPrompt);
    this.promptRegistrationTimestamps.set(prompt.name, now);
    this.updateBridgePrompts();
    this.schedulePromptsListChanged();

    const unregisterFn = () => {
      console.log(`[Web Model Context] Unregistering prompt: ${prompt.name}`);

      if (this.provideContextPrompts.has(prompt.name)) {
        throw new Error(
          `[Web Model Context] Cannot unregister prompt "${prompt.name}": ` +
            'This prompt was registered via provideContext(). Use provideContext() to update the base prompt set.'
        );
      }

      if (!this.dynamicPrompts.has(prompt.name)) {
        console.warn(
          `[Web Model Context] Prompt "${prompt.name}" is not registered, ignoring unregister call`
        );
        return;
      }

      this.dynamicPrompts.delete(prompt.name);
      this.promptRegistrationTimestamps.delete(prompt.name);
      this.promptUnregisterFunctions.delete(prompt.name);
      this.updateBridgePrompts();
      this.schedulePromptsListChanged();
    };

    this.promptUnregisterFunctions.set(prompt.name, unregisterFn);

    return { unregister: unregisterFn };
  }

  /**
   * Unregisters a prompt by name.
   * Can unregister prompts from either Bucket A (provideContext) or Bucket B (registerPrompt).
   *
   * @param {string} name - Name of the prompt to unregister
   */
  unregisterPrompt(name: string): void {
    console.log(`[Web Model Context] Unregistering prompt: ${name}`);

    const inProvideContext = this.provideContextPrompts.has(name);
    const inDynamic = this.dynamicPrompts.has(name);

    if (!inProvideContext && !inDynamic) {
      console.warn(
        `[Web Model Context] Prompt "${name}" is not registered, ignoring unregister call`
      );
      return;
    }

    if (inProvideContext) {
      this.provideContextPrompts.delete(name);
    }

    if (inDynamic) {
      this.dynamicPrompts.delete(name);
      this.promptRegistrationTimestamps.delete(name);
      this.promptUnregisterFunctions.delete(name);
    }

    this.updateBridgePrompts();
    this.schedulePromptsListChanged();
  }

  /**
   * Lists all registered prompts in MCP format.
   * Returns prompts from both buckets.
   *
   * @returns {Prompt[]} Array of prompt descriptors
   */
  listPrompts(): Prompt[] {
    return Array.from(this.bridge.prompts.values()).map((prompt) => ({
      name: prompt.name,
      description: prompt.description,
      arguments: prompt.argsSchema?.properties
        ? Object.entries(prompt.argsSchema.properties).map(([name, schema]) => ({
            name,
            description: (schema as { description?: string }).description,
            required: prompt.argsSchema?.required?.includes(name) ?? false,
          }))
        : undefined,
    }));
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
      this.toolRegistrationTimestamps.delete(name);
      this.toolUnregisterFunctions.delete(name);
    }

    this.updateBridgeTools();
    this.scheduleToolsListChanged();
  }

  /**
   * Clears all registered context from both buckets (Chromium native API).
   * Removes all tools, resources, and prompts registered via provideContext() and register* methods.
   */
  clearContext(): void {
    console.log('[Web Model Context] Clearing all context (tools, resources, prompts)');

    // Clear tools
    this.provideContextTools.clear();
    this.dynamicTools.clear();
    this.toolRegistrationTimestamps.clear();
    this.toolUnregisterFunctions.clear();

    // Clear resources
    this.provideContextResources.clear();
    this.dynamicResources.clear();
    this.resourceRegistrationTimestamps.clear();
    this.resourceUnregisterFunctions.clear();

    // Clear prompts
    this.provideContextPrompts.clear();
    this.dynamicPrompts.clear();
    this.promptRegistrationTimestamps.clear();
    this.promptUnregisterFunctions.clear();

    // Update bridge
    this.updateBridgeTools();
    this.updateBridgeResources();
    this.updateBridgePrompts();

    // Schedule notifications (batched via microtask)
    this.scheduleToolsListChanged();
    this.scheduleResourcesListChanged();
    this.schedulePromptsListChanged();
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
   * Updates the bridge resources map with merged resources from both buckets.
   *
   * @private
   */
  private updateBridgeResources(): void {
    this.bridge.resources.clear();

    for (const [uri, resource] of this.provideContextResources) {
      this.bridge.resources.set(uri, resource);
    }

    for (const [uri, resource] of this.dynamicResources) {
      this.bridge.resources.set(uri, resource);
    }

    console.log(
      `[Web Model Context] Updated bridge with ${this.provideContextResources.size} base resources + ${this.dynamicResources.size} dynamic resources = ${this.bridge.resources.size} total`
    );
  }

  /**
   * Notifies all servers that the resources list has changed.
   *
   * @private
   */
  private notifyResourcesListChanged(): void {
    if (this.bridge.tabServer.notification) {
      this.bridge.tabServer.notification({
        method: 'notifications/resources/list_changed',
        params: {},
      });
    }

    if (this.bridge.iframeServer?.notification) {
      this.bridge.iframeServer.notification({
        method: 'notifications/resources/list_changed',
        params: {},
      });
    }
  }

  /**
   * Updates the bridge prompts map with merged prompts from both buckets.
   *
   * @private
   */
  private updateBridgePrompts(): void {
    this.bridge.prompts.clear();

    for (const [name, prompt] of this.provideContextPrompts) {
      this.bridge.prompts.set(name, prompt);
    }

    for (const [name, prompt] of this.dynamicPrompts) {
      this.bridge.prompts.set(name, prompt);
    }

    console.log(
      `[Web Model Context] Updated bridge with ${this.provideContextPrompts.size} base prompts + ${this.dynamicPrompts.size} dynamic prompts = ${this.bridge.prompts.size} total`
    );
  }

  /**
   * Notifies all servers that the prompts list has changed.
   *
   * @private
   */
  private notifyPromptsListChanged(): void {
    if (this.bridge.tabServer.notification) {
      this.bridge.tabServer.notification({
        method: 'notifications/prompts/list_changed',
        params: {},
      });
    }

    if (this.bridge.iframeServer?.notification) {
      this.bridge.iframeServer.notification({
        method: 'notifications/prompts/list_changed',
        params: {},
      });
    }
  }

  /**
   * Schedules a tools list changed notification using microtask batching.
   * Multiple calls within the same task are coalesced into a single notification.
   * This dramatically reduces notification spam during React mount/unmount cycles.
   *
   * @private
   */
  private scheduleToolsListChanged(): void {
    if (this.pendingToolNotification) return;

    this.pendingToolNotification = true;
    queueMicrotask(() => {
      this.pendingToolNotification = false;
      this.notifyToolsListChanged();
    });
  }

  /**
   * Schedules a resources list changed notification using microtask batching.
   * Multiple calls within the same task are coalesced into a single notification.
   *
   * @private
   */
  private scheduleResourcesListChanged(): void {
    if (this.pendingResourceNotification) return;

    this.pendingResourceNotification = true;
    queueMicrotask(() => {
      this.pendingResourceNotification = false;
      this.notifyResourcesListChanged();
    });
  }

  /**
   * Schedules a prompts list changed notification using microtask batching.
   * Multiple calls within the same task are coalesced into a single notification.
   *
   * @private
   */
  private schedulePromptsListChanged(): void {
    if (this.pendingPromptNotification) return;

    this.pendingPromptNotification = true;
    queueMicrotask(() => {
      this.pendingPromptNotification = false;
      this.notifyPromptsListChanged();
    });
  }

  /**
   * Reads a resource by URI (internal use only by MCP bridge).
   * Handles both static resources and URI templates.
   *
   * @param {string} uri - The URI of the resource to read
   * @returns {Promise<{contents: ResourceContents[]}>} The resource contents
   * @throws {Error} If resource is not found
   * @internal
   */
  async readResource(uri: string): Promise<{ contents: ResourceContents[] }> {
    console.log(`[Web Model Context] Reading resource: ${uri}`);

    // First, try to find an exact match (static resource)
    const staticResource = this.bridge.resources.get(uri);
    if (staticResource && !staticResource.isTemplate) {
      try {
        const parsedUri = new URL(uri);
        return await staticResource.read(parsedUri);
      } catch (error) {
        console.error(`[Web Model Context] Error reading resource ${uri}:`, error);
        throw error;
      }
    }

    // Try to match against URI templates
    for (const resource of this.bridge.resources.values()) {
      if (!resource.isTemplate) continue;

      const params = this.matchUriTemplate(resource.uri, uri);
      if (params) {
        try {
          const parsedUri = new URL(uri);
          return await resource.read(parsedUri, params);
        } catch (error) {
          console.error(`[Web Model Context] Error reading resource ${uri}:`, error);
          throw error;
        }
      }
    }

    throw new Error(`Resource not found: ${uri}`);
  }

  /**
   * Matches a URI against a URI template and extracts parameters.
   *
   * @param {string} template - The URI template (e.g., "file://{path}")
   * @param {string} uri - The actual URI to match
   * @returns {Record<string, string> | null} Extracted parameters or null if no match
   * @private
   */
  private matchUriTemplate(template: string, uri: string): Record<string, string> | null {
    // Convert template to regex pattern
    // e.g., "file://{path}" -> "^file://(.+)$" with capture group for "path"
    const paramNames: string[] = [];
    let regexPattern = template.replace(/[.*+?^${}()|[\]\\]/g, (char) => {
      // Don't escape { and } - we'll handle them specially
      if (char === '{' || char === '}') return char;
      return `\\${char}`;
    });

    // Replace {param} with capture groups
    regexPattern = regexPattern.replace(/\{([^}]+)\}/g, (_, paramName) => {
      paramNames.push(paramName);
      return '(.+)';
    });

    const regex = new RegExp(`^${regexPattern}$`);
    const match = uri.match(regex);

    if (!match) return null;

    const params: Record<string, string> = {};
    for (let i = 0; i < paramNames.length; i++) {
      const paramName = paramNames[i];
      const paramValue = match[i + 1];
      if (paramName !== undefined && paramValue !== undefined) {
        params[paramName] = paramValue;
      }
    }

    return params;
  }

  /**
   * Gets a prompt with arguments (internal use only by MCP bridge).
   *
   * @param {string} name - Name of the prompt
   * @param {Record<string, unknown>} args - Arguments to pass to the prompt
   * @returns {Promise<{messages: PromptMessage[]}>} The prompt messages
   * @throws {Error} If prompt is not found
   * @internal
   */
  async getPrompt(
    name: string,
    args?: Record<string, unknown>
  ): Promise<{ messages: PromptMessage[] }> {
    console.log(`[Web Model Context] Getting prompt: ${name}`);

    const prompt = this.bridge.prompts.get(name);
    if (!prompt) {
      throw new Error(`Prompt not found: ${name}`);
    }

    // Validate arguments if schema is defined
    if (prompt.argsValidator && args) {
      const validation = validateWithZod(args, prompt.argsValidator);
      if (!validation.success) {
        console.error(
          `[Web Model Context] Argument validation failed for prompt ${name}:`,
          validation.error
        );
        throw new Error(`Argument validation error for prompt "${name}":\n${validation.error}`);
      }
    }

    try {
      return await prompt.get(args ?? {});
    } catch (error) {
      console.error(`[Web Model Context] Error getting prompt ${name}:`, error);
      throw error;
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

  // ==================== SAMPLING METHODS ====================

  /**
   * Request an LLM completion from the connected client.
   * This sends a sampling request to the connected MCP client.
   *
   * @param {SamplingRequestParams} params - Parameters for the sampling request
   * @returns {Promise<SamplingResult>} The LLM completion result
   */
  async createMessage(params: SamplingRequestParams): Promise<SamplingResult> {
    console.log('[Web Model Context] Requesting sampling from client');
    const server = this.bridge.tabServer;

    // Access the underlying Server instance to call createMessage
    const underlyingServer = (
      server as unknown as {
        server: { createMessage: (params: unknown) => Promise<SamplingResult> };
      }
    ).server;

    if (!underlyingServer?.createMessage) {
      throw new Error('Sampling is not supported: no connected client with sampling capability');
    }

    return underlyingServer.createMessage(params);
  }

  // ==================== ELICITATION METHODS ====================

  /**
   * Request user input from the connected client.
   * This sends an elicitation request to the connected MCP client.
   *
   * @param {ElicitationParams} params - Parameters for the elicitation request
   * @returns {Promise<ElicitationResult>} The user's response
   */
  async elicitInput(params: ElicitationParams): Promise<ElicitationResult> {
    console.log('[Web Model Context] Requesting elicitation from client');
    const server = this.bridge.tabServer;

    // Access the underlying Server instance to call elicitInput
    const underlyingServer = (
      server as unknown as {
        server: { elicitInput: (params: unknown) => Promise<ElicitationResult> };
      }
    ).server;

    if (!underlyingServer?.elicitInput) {
      throw new Error(
        'Elicitation is not supported: no connected client with elicitation capability'
      );
    }

    return underlyingServer.elicitInput(params);
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
    // ==================== TOOL HANDLERS ====================
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

    // ==================== RESOURCE HANDLERS ====================
    server.setRequestHandler(ListResourcesRequestSchema, async () => {
      console.log('[MCP Bridge] Handling list_resources request');
      return {
        resources: bridge.modelContext.listResources(),
        // Note: Resource templates are included in the resources list as the MCP SDK
        // doesn't export ListResourceTemplatesRequestSchema separately.
        // Clients can identify templates by checking for URI patterns containing {param}.
      };
    });

    server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
      console.log(`[MCP Bridge] Handling read_resource request: ${request.params.uri}`);

      try {
        return await bridge.modelContext.readResource(request.params.uri);
      } catch (error) {
        console.error(`[MCP Bridge] Error reading resource ${request.params.uri}:`, error);
        throw error;
      }
    });

    // ==================== PROMPT HANDLERS ====================
    server.setRequestHandler(ListPromptsRequestSchema, async () => {
      console.log('[MCP Bridge] Handling list_prompts request');
      return {
        prompts: bridge.modelContext.listPrompts(),
      };
    });

    server.setRequestHandler(GetPromptRequestSchema, async (request) => {
      console.log(`[MCP Bridge] Handling get_prompt request: ${request.params.name}`);

      try {
        return await bridge.modelContext.getPrompt(
          request.params.name,
          request.params.arguments as Record<string, unknown> | undefined
        );
      } catch (error) {
        console.error(`[MCP Bridge] Error getting prompt ${request.params.name}:`, error);
        throw error;
      }
    });

    // Note: Sampling and elicitation are server-to-client requests.
    // The server calls createMessage() and elicitInput() methods on the Server instance.
    // These are NOT request handlers - the client handles these requests.
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
          tools: { listChanged: true },
          resources: { listChanged: true },
          prompts: { listChanged: true },
        },
      }
    );

    const bridge: MCPBridge = {
      tabServer: server,
      tools: new Map(),
      resources: new Map(),
      prompts: new Map(),
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
        tools: { listChanged: true },
        resources: { listChanged: true },
        prompts: { listChanged: true },
      },
    }
  );

  const bridge: MCPBridge = {
    tabServer,
    tools: new Map(),
    resources: new Map(),
    prompts: new Map(),
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
          tools: { listChanged: true },
          resources: { listChanged: true },
          prompts: { listChanged: true },
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
