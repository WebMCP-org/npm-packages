import {
  IframeChildTransport,
  type IframeChildTransportOptions,
  TabServerTransport,
  type TabServerTransportOptions,
} from '@mcp-b/transports';
import { initializeWebMCPPolyfill } from '@mcp-b/webmcp-polyfill';
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
import { createLogger } from './logger.js';
import {
  detectNativeAPI,
  installConsumerShim,
  installDeprecatedTestingAccessor,
  installMissingMethodStubs,
  NativeModelContextAdapter,
} from './native-adapter.js';
import {
  requireCreateMessageCapability,
  requireElicitInputCapability,
} from './tab-server-capabilities.js';
import type {
  ElicitationParams,
  ElicitationResult,
  InputSchema,
  InternalModelContext,
  MCPBridge,
  MCPBridgeInitState,
  ModelContext,
  ModelContextClient,
  ModelContextOptions,
  ModelContextTesting,
  ModelContextTestingExecuteToolOptions,
  ModelContextTestingPolyfillExtensions,
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
import { normalizeSchema, validateWithZod } from './validation.js';

// Create namespaced loggers for different components
const logger = createLogger('WebModelContext');
const bridgeLogger = createLogger('MCPBridge');
const testingLogger = createLogger('ModelContextTesting');
const GLOBAL_RUNTIME_VERSION = 'unknown';

/**
 * Marker property name used to identify polyfill implementations.
 * This constant ensures single source of truth for the marker used in
 * both detection (detectNativeAPI) and definition (WebModelContextTesting).
 */
const POLYFILL_MARKER_PROPERTY = '__isWebMCPPolyfill' as const;

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
const DEFAULT_INPUT_SCHEMA: InputSchema = { type: 'object', properties: {} };

/**
 * Types of lists that can trigger change notifications.
 * Single source of truth for notification batching logic.
 */
type ListChangeType = 'tools' | 'resources' | 'prompts';

const FAILED_TO_PARSE_INPUT_ARGUMENTS_MESSAGE = 'Failed to parse input arguments';
const TOOL_INVOCATION_FAILED_MESSAGE =
  'Tool was executed but the invocation failed. For example, the script function threw an error';
const TOOL_CANCELLED_MESSAGE = 'Tool was cancelled';

function createUnknownError(message: string): Error {
  try {
    return new DOMException(message, 'UnknownError');
  } catch {
    const error = new Error(message);
    error.name = 'UnknownError';
    return error;
  }
}

function parseInputArgsJson(inputArgsJson: string): Record<string, unknown> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(inputArgsJson);
  } catch {
    throw createUnknownError(FAILED_TO_PARSE_INPUT_ARGUMENTS_MESSAGE);
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw createUnknownError(FAILED_TO_PARSE_INPUT_ARGUMENTS_MESSAGE);
  }

  return parsed as Record<string, unknown>;
}

function getFirstTextBlock(result: ToolResponse): string | null {
  for (const block of result.content ?? []) {
    if (block.type === 'text' && 'text' in block && typeof block.text === 'string') {
      return block.text;
    }
  }

  return null;
}

function toSerializedTestingResult(result: ToolResponse): string | null {
  if (result.isError) {
    const toolErrorText = getFirstTextBlock(result);
    const errorMessage = toolErrorText
      ? toolErrorText.replace(/^Error:\s*/i, '').trim() || TOOL_INVOCATION_FAILED_MESSAGE
      : TOOL_INVOCATION_FAILED_MESSAGE;
    throw createUnknownError(errorMessage);
  }

  if (
    result.metadata &&
    typeof result.metadata === 'object' &&
    (result.metadata as { willNavigate?: boolean }).willNavigate
  ) {
    return null;
  }

  try {
    return JSON.stringify(result);
  } catch {
    throw createUnknownError(TOOL_INVOCATION_FAILED_MESSAGE);
  }
}

function createToolCancelledError(): Error {
  return createUnknownError(TOOL_CANCELLED_MESSAGE);
}

function createToolInvocationFailedError(): Error {
  return createUnknownError(TOOL_INVOCATION_FAILED_MESSAGE);
}

function withAbortSignal<T>(operation: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) {
    return operation;
  }

  if (signal.aborted) {
    return Promise.reject(createToolInvocationFailedError());
  }

  return new Promise<T>((resolve, reject) => {
    const onAbort = () => {
      cleanup();
      reject(createToolCancelledError());
    };

    const cleanup = () => {
      signal.removeEventListener('abort', onAbort);
    };

    signal.addEventListener('abort', onAbort, { once: true });

    operation.then(
      (value) => {
        cleanup();
        resolve(value);
      },
      (error) => {
        cleanup();
        reject(error);
      }
    );
  });
}

function withSingleToolsChangedCallback(callback: unknown): () => void {
  if (typeof callback !== 'function') {
    throw new TypeError(
      "Failed to execute 'registerToolsChangedCallback' on 'ModelContextTesting': parameter 1 is not of type 'Function'."
    );
  }

  const typedCallback = callback as () => void;

  return () => {
    try {
      typedCallback();
    } catch (error) {
      testingLogger.error('Error in tools changed callback:', error);
    }
  };
}

const BRIDGE_MODEL_CONTEXT_METHODS = [
  'provideContext',
  'clearContext',
  'registerTool',
  'unregisterTool',
  'executeTool',
  'setTestingAPI',
  'listTools',
  'callTool',
  'registerResource',
  'unregisterResource',
  'listResources',
  'listResourceTemplates',
  'readResource',
  'registerPrompt',
  'unregisterPrompt',
  'listPrompts',
  'getPrompt',
  'createMessage',
  'elicitInput',
  'addEventListener',
  'removeEventListener',
  'dispatchEvent',
] as const;

function attachBridgeBackedModelContext(
  targetContext: ModelContext,
  bridgeContext: InternalModelContext
): void {
  const target = targetContext as unknown as Record<string, unknown>;
  const source = bridgeContext as unknown as Record<string, unknown>;

  for (const methodName of BRIDGE_MODEL_CONTEXT_METHODS) {
    const method = source[methodName];
    if (typeof method !== 'function') {
      continue;
    }

    Object.defineProperty(target, methodName, {
      configurable: true,
      writable: true,
      value: method.bind(bridgeContext),
    });
  }
}

/**
 * Testing API implementation for the Model Context Protocol.
 * Provides debugging, mocking, and testing capabilities for tool execution.
 * Implements both Chromium native methods and polyfill-specific extensions.
 *
 * @class WebModelContextTesting
 * @implements {ModelContextTesting}
 */
class WebModelContextTesting implements ModelContextTesting, ModelContextTestingPolyfillExtensions {
  /**
   * Marker property to identify this as a polyfill implementation.
   * Used by detectNativeAPI() to distinguish polyfill from native Chromium API.
   * This approach works reliably even when class names are minified in production builds.
   *
   * @see POLYFILL_MARKER_PROPERTY - The constant defining this property name
   * @see detectNativeAPI in native-adapter.ts - native/polyfill detection logic
   */
  readonly [POLYFILL_MARKER_PROPERTY] = true as const;

  private toolCallHistory: Array<{
    toolName: string;
    arguments: Record<string, unknown>;
    timestamp: number;
  }> = [];
  private mockResponses: Map<string, ToolResponse> = new Map();
  private toolsChangedCallback: (() => void) | null = null;
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
    this.toolsChangedCallback?.();
  }

  /**
   * Executes a tool directly with JSON string input (Chromium native API).
   *
   * @param {string} toolName - Name of the tool to execute
   * @param {string} inputArgsJson - JSON string of input arguments
   * @param {ModelContextTestingExecuteToolOptions} options - Optional execution controls
   * @returns {Promise<string | null>} Serialized tool output JSON, or null when navigation is triggered
   * @throws {DOMException} UnknownError if invocation fails or input is invalid
   */
  async executeTool(
    toolName: string,
    inputArgsJson: string,
    options?: ModelContextTestingExecuteToolOptions
  ): Promise<string | null> {
    if (options?.signal?.aborted) {
      throw createToolInvocationFailedError();
    }

    const args = parseInputArgsJson(inputArgsJson);

    const tool = this.bridge.tools.get(toolName);
    if (!tool) {
      throw createUnknownError(`Tool not found: ${toolName}`);
    }

    const execution = this.bridge.modelContext
      .executeTool(toolName, args)
      .then((result) => toSerializedTestingResult(result));

    return withAbortSignal(execution, options?.signal);
  }

  /**
   * Lists all registered tools with inputSchema as JSON string (Chromium native API).
   * Returns an array of ToolInfo objects where inputSchema is stringified.
   *
   * @returns {Array<{name: string, description: string, inputSchema?: string}>} Array of tool information
   */
  listTools(): Array<{ name: string; description: string; inputSchema?: string }> {
    const tools = this.bridge.modelContext.listTools();
    return tools.map((tool) => {
      const toolInfo: { name: string; description: string; inputSchema?: string } = {
        name: tool.name,
        description: tool.description,
      };

      try {
        toolInfo.inputSchema = JSON.stringify(tool.inputSchema);
      } catch {
        // Keep schema omitted when serialization fails.
      }

      return toolInfo;
    });
  }

  /**
   * Registers a callback that fires when the tools list changes (Chromium native API).
   * The callback will be invoked on registerTool, unregisterTool, provideContext, and clearContext.
   *
   * @param {() => void} callback - Function to call when tools change
   */
  registerToolsChangedCallback(callback: () => void): void {
    this.toolsChangedCallback = withSingleToolsChangedCallback(callback);
  }

  async getCrossDocumentScriptToolResult(): Promise<string> {
    // This polyfill does not model cross-document declarative execution yet.
    // Return an empty JSON list for compatibility with Chromium's string return type.
    return '[]';
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
  }

  /**
   * Clears the mock response for a specific tool (polyfill extension).
   *
   * @param {string} toolName - Name of the tool
   */
  clearMockToolResponse(toolName: string): void {
    this.mockResponses.delete(toolName);
  }

  /**
   * Clears all mock tool responses (polyfill extension).
   */
  clearAllMockToolResponses(): void {
    this.mockResponses.clear();
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
  }
}

/**
 * ModelContext implementation that bridges to the Model Context Protocol SDK.
 * Implements the W3C Web Model Context API proposal and MCPB extension surface.
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

  // Tool storage
  private provideContextTools: Map<string, ValidatedToolDescriptor>;
  private dynamicTools: Map<string, ValidatedToolDescriptor>;

  // Resource storage
  private provideContextResources: Map<string, ValidatedResourceDescriptor>;
  private dynamicResources: Map<string, ValidatedResourceDescriptor>;

  // Prompt storage
  private provideContextPrompts: Map<string, ValidatedPromptDescriptor>;
  private dynamicPrompts: Map<string, ValidatedPromptDescriptor>;

  // Registration tracking for duplicate detection (extensions only)
  private resourceRegistrationTimestamps: Map<string, number>;
  private promptRegistrationTimestamps: Map<string, number>;

  // Unregister functions for extension registrations
  private resourceUnregisterFunctions: Map<string, () => void>;
  private promptUnregisterFunctions: Map<string, () => void>;

  /**
   * Tracks which list change notifications are pending.
   * Uses microtask-based batching to coalesce rapid registrations
   * (e.g., React mount phase) into a single notification per list type.
   */
  private pendingNotifications = new Set<ListChangeType>();

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

  addEventListener(
    type: 'toolcall' | 'toolschanged',
    listener: ((event: ToolCallEvent) => void | Promise<void>) | (() => void),
    options?: boolean | AddEventListenerOptions
  ): void {
    this.eventTarget.addEventListener(type, listener as EventListener, options);
  }

  removeEventListener(
    type: 'toolcall' | 'toolschanged',
    listener: ((event: ToolCallEvent) => void | Promise<void>) | (() => void),
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
   * Provides context (tools, resources, prompts) to AI models.
   * For tools, this replaces the existing tool set per strict WebMCP behavior.
   *
   * @param {ModelContextOptions} context - Context containing tools, resources, and prompts to register
   * @throws {Error} If a name/uri collides with existing dynamic items
   */
  provideContext(context: ModelContextOptions = {}): void {
    // Strict WebMCP behavior: replace existing tool context entirely.
    this.provideContextTools.clear();
    this.dynamicTools.clear();
    this.provideContextResources.clear();
    this.provideContextPrompts.clear();

    // Register tools
    for (const tool of context.tools ?? []) {
      // Validate tool name and log warnings for potential compatibility issues
      // NOTE: Similar validation exists in @mcp-b/chrome-devtools-mcp/src/tools/WebMCPToolHub.ts
      // Keep both implementations in sync when making changes.
      if (tool.name.startsWith('_')) {
        logger.warn(
          `⚠️ Warning: Tool name "${tool.name}" starts with underscore. ` +
            'This may cause compatibility issues with some MCP clients. ' +
            'Consider using a letter as the first character.'
        );
      }
      if (/^[0-9]/.test(tool.name)) {
        logger.warn(
          `⚠️ Warning: Tool name "${tool.name}" starts with a number. ` +
            'This may cause compatibility issues. ' +
            'Consider using a letter as the first character.'
        );
      }
      if (tool.name.startsWith('-')) {
        logger.warn(
          `⚠️ Warning: Tool name "${tool.name}" starts with hyphen. ` +
            'This may cause compatibility issues. ' +
            'Consider using a letter as the first character.'
        );
      }

      if (this.provideContextTools.has(tool.name)) {
        throw new Error(
          `[Web Model Context] Tool name collision: "${tool.name}" is already registered in provideContext(). ` +
            'Each tool name in provideContext(options.tools) must be unique.'
        );
      }

      const inputSchema = tool.inputSchema ?? DEFAULT_INPUT_SCHEMA;
      const { jsonSchema: inputJson, zodValidator: inputZod } = normalizeSchema(inputSchema, {
        strict: true,
      });
      const normalizedOutput = tool.outputSchema
        ? normalizeSchema(tool.outputSchema, { strict: true })
        : null;

      const validatedTool: ValidatedToolDescriptor = {
        name: tool.name,
        description: tool.description,
        inputSchema: inputJson,
        ...(normalizedOutput && { outputSchema: normalizedOutput.jsonSchema }),
        ...(tool.annotations && { annotations: tool.annotations }),
        execute: tool.execute as (
          args: Record<string, unknown>,
          client: ModelContextClient
        ) => Promise<ToolResponse>,
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

    this.scheduleListChanged('tools');
    this.scheduleListChanged('resources');
    this.scheduleListChanged('prompts');
  }

  /**
   * Validates and normalizes a resource descriptor.
   * @private
   */
  private validateResource(resource: ResourceDescriptor): ValidatedResourceDescriptor {
    // Extract template parameters from URI (e.g., "file://{path}" -> ["path"])
    // Limit parameter name length to 100 chars to prevent ReDoS on malicious input
    const templateParamRegex = /\{([^}]{1,100})\}/g;
    const templateParams: string[] = [];
    for (const match of resource.uri.matchAll(templateParamRegex)) {
      const paramName = match[1];
      if (typeof paramName === 'string') {
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
   * Registers a single tool dynamically.
   *
   * @param {ToolDescriptor} tool - The tool descriptor to register
   * @throws {Error} If tool name collides with existing tools
   */
  registerTool<
    TInputSchema extends ZodSchemaObject = Record<string, never>,
    TOutputSchema extends ZodSchemaObject = Record<string, never>,
  >(tool: ToolDescriptor<TInputSchema, TOutputSchema>): void {
    // Validate tool name and log warnings for potential compatibility issues
    // NOTE: Similar validation exists in @mcp-b/chrome-devtools-mcp/src/tools/WebMCPToolHub.ts
    // Keep both implementations in sync when making changes.
    if (tool.name.startsWith('_')) {
      logger.warn(
        `⚠️ Warning: Tool name "${tool.name}" starts with underscore. ` +
          'This may cause compatibility issues with some MCP clients. ' +
          'Consider using a letter as the first character.'
      );
    }
    if (/^[0-9]/.test(tool.name)) {
      logger.warn(
        `⚠️ Warning: Tool name "${tool.name}" starts with a number. ` +
          'This may cause compatibility issues. ' +
          'Consider using a letter as the first character.'
      );
    }
    if (tool.name.startsWith('-')) {
      logger.warn(
        `⚠️ Warning: Tool name "${tool.name}" starts with hyphen. ` +
          'This may cause compatibility issues. ' +
          'Consider using a letter as the first character.'
      );
    }

    if (this.provideContextTools.has(tool.name) || this.dynamicTools.has(tool.name)) {
      throw new Error(
        `[Web Model Context] Tool name collision: "${tool.name}" is already registered. ` +
          'Please unregister it first or use a different name.'
      );
    }

    const inputSchema = tool.inputSchema ?? DEFAULT_INPUT_SCHEMA;
    const { jsonSchema: inputJson, zodValidator: inputZod } = normalizeSchema(inputSchema, {
      strict: true,
    });

    const normalizedOutput = tool.outputSchema
      ? normalizeSchema(tool.outputSchema, { strict: true })
      : null;

    const validatedTool: ValidatedToolDescriptor = {
      name: tool.name,
      description: tool.description,
      inputSchema: inputJson,
      ...(normalizedOutput && { outputSchema: normalizedOutput.jsonSchema }),
      ...(tool.annotations && { annotations: tool.annotations }),
      // Tool handlers receive a per-call execution context for elicitation.
      execute: tool.execute as (
        args: Record<string, unknown>,
        client: ModelContextClient
      ) => Promise<ToolResponse>,
      inputValidator: inputZod,
      ...(normalizedOutput && { outputValidator: normalizedOutput.zodValidator }),
    };

    this.dynamicTools.set(tool.name, validatedTool);
    this.updateBridgeTools();
    this.scheduleListChanged('tools');
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
    const now = Date.now();
    const lastRegistration = this.resourceRegistrationTimestamps.get(resource.uri);

    if (lastRegistration && now - lastRegistration < RAPID_DUPLICATE_WINDOW_MS) {
      logger.warn(
        `Resource "${resource.uri}" registered multiple times within ${RAPID_DUPLICATE_WINDOW_MS}ms. ` +
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
    this.scheduleListChanged('resources');

    const unregisterFn = () => {
      if (this.provideContextResources.has(resource.uri)) {
        throw new Error(
          `[Web Model Context] Cannot unregister resource "${resource.uri}": ` +
            'This resource was registered via provideContext(). Use provideContext() to update the base resource set.'
        );
      }

      if (!this.dynamicResources.has(resource.uri)) {
        logger.warn(`Resource "${resource.uri}" is not registered, ignoring unregister call`);
        return;
      }

      this.dynamicResources.delete(resource.uri);
      this.resourceRegistrationTimestamps.delete(resource.uri);
      this.resourceUnregisterFunctions.delete(resource.uri);
      this.updateBridgeResources();
      this.scheduleListChanged('resources');
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
    const inProvideContext = this.provideContextResources.has(uri);
    const inDynamic = this.dynamicResources.has(uri);

    if (!inProvideContext && !inDynamic) {
      logger.warn(`Resource "${uri}" is not registered, ignoring unregister call`);
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
    this.scheduleListChanged('resources');
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
    const now = Date.now();
    const lastRegistration = this.promptRegistrationTimestamps.get(prompt.name);

    if (lastRegistration && now - lastRegistration < RAPID_DUPLICATE_WINDOW_MS) {
      logger.warn(
        `Prompt "${prompt.name}" registered multiple times within ${RAPID_DUPLICATE_WINDOW_MS}ms. ` +
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
    this.scheduleListChanged('prompts');

    const unregisterFn = () => {
      if (this.provideContextPrompts.has(prompt.name)) {
        throw new Error(
          `[Web Model Context] Cannot unregister prompt "${prompt.name}": ` +
            'This prompt was registered via provideContext(). Use provideContext() to update the base prompt set.'
        );
      }

      if (!this.dynamicPrompts.has(prompt.name)) {
        logger.warn(`Prompt "${prompt.name}" is not registered, ignoring unregister call`);
        return;
      }

      this.dynamicPrompts.delete(prompt.name);
      this.promptRegistrationTimestamps.delete(prompt.name);
      this.promptUnregisterFunctions.delete(prompt.name);
      this.updateBridgePrompts();
      this.scheduleListChanged('prompts');
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
    const inProvideContext = this.provideContextPrompts.has(name);
    const inDynamic = this.dynamicPrompts.has(name);

    if (!inProvideContext && !inDynamic) {
      logger.warn(`Prompt "${name}" is not registered, ignoring unregister call`);
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
    this.scheduleListChanged('prompts');
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
   * Unregisters a tool by name, regardless of registration path.
   *
   * @param {string} name - Name of the tool to unregister
   */
  unregisterTool(name: string): void {
    const inProvideContext = this.provideContextTools.has(name);
    const inDynamic = this.dynamicTools.has(name);

    if (!inProvideContext && !inDynamic) {
      logger.warn(`Tool "${name}" is not registered, ignoring unregister call`);
      return;
    }

    if (inProvideContext) {
      this.provideContextTools.delete(name);
    }

    if (inDynamic) {
      this.dynamicTools.delete(name);
    }

    this.updateBridgeTools();
    this.scheduleListChanged('tools');
  }

  /**
   * Clears all registered context.
   * Removes all tools, resources, and prompts registered via provideContext() and register* methods.
   */
  clearContext(): void {
    // Clear tools
    this.provideContextTools.clear();
    this.dynamicTools.clear();

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
    this.scheduleListChanged('tools');
    this.scheduleListChanged('resources');
    this.scheduleListChanged('prompts');
  }

  /**
   * Rebuilds the bridge tool map from current provideContext and dynamic registrations.
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

    this.dispatchEvent(new Event('toolschanged'));
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
   * Schedules a list changed notification using microtask batching.
   * Multiple calls for the same list type within the same task are coalesced
   * into a single notification. This dramatically reduces notification spam
   * during React mount/unmount cycles.
   *
   * @param listType - The type of list that changed ('tools' | 'resources' | 'prompts')
   * @private
   */
  private scheduleListChanged(listType: ListChangeType): void {
    if (this.pendingNotifications.has(listType)) return;

    this.pendingNotifications.add(listType);
    queueMicrotask(() => {
      this.pendingNotifications.delete(listType);

      // Dispatch to the appropriate notification method
      // Exhaustive switch ensures compile-time safety when adding new list types
      switch (listType) {
        case 'tools':
          this.notifyToolsListChanged();
          break;
        case 'resources':
          this.notifyResourcesListChanged();
          break;
        case 'prompts':
          this.notifyPromptsListChanged();
          break;
        default: {
          // Exhaustiveness check: TypeScript will error if a case is missing
          const _exhaustive: never = listType;
          logger.error(`Unknown list type: ${_exhaustive}`);
        }
      }
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
    // First, try to find an exact match (static resource)
    const staticResource = this.bridge.resources.get(uri);
    if (staticResource && !staticResource.isTemplate) {
      try {
        // Try to parse as URL, but fall back to a pseudo-URL for custom schemes
        let parsedUri: URL;
        try {
          parsedUri = new URL(uri);
        } catch {
          // Custom URI scheme (e.g., "iframe://config", "prefix_iframe://config")
          // Create a pseudo-URL with the original URI as the pathname
          parsedUri = new URL(`custom-scheme:///${encodeURIComponent(uri)}`);
          // Store original URI for handlers that need it
          (parsedUri as URL & { originalUri: string }).originalUri = uri;
        }
        return await staticResource.read(parsedUri);
      } catch (error) {
        logger.error(`Error reading resource ${uri}:`, error);
        throw error;
      }
    }

    // Try to match against URI templates
    for (const resource of this.bridge.resources.values()) {
      if (!resource.isTemplate) continue;

      const params = this.matchUriTemplate(resource.uri, uri);
      if (params) {
        try {
          // Try to parse as URL, but fall back to a pseudo-URL for custom schemes
          let parsedUri: URL;
          try {
            parsedUri = new URL(uri);
          } catch {
            // Custom URI scheme - create a pseudo-URL
            parsedUri = new URL(`custom-scheme:///${encodeURIComponent(uri)}`);
            (parsedUri as URL & { originalUri: string }).originalUri = uri;
          }
          return await resource.read(parsedUri, params);
        } catch (error) {
          logger.error(`Error reading resource ${uri}:`, error);
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
      if (typeof paramName !== 'string' || typeof paramValue !== 'string') {
        continue;
      }
      params[paramName] = paramValue;
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
    const prompt = this.bridge.prompts.get(name);
    if (!prompt) {
      throw new Error(`Prompt not found: ${name}`);
    }

    // Validate arguments if schema is defined
    if (prompt.argsValidator && args) {
      const validation = validateWithZod(args, prompt.argsValidator);
      if (!validation.success) {
        logger.error(`Argument validation failed for prompt ${name}:`, validation.error);
        throw new Error(`Argument validation error for prompt "${name}":\n${validation.error}`);
      }
    }

    try {
      return await prompt.get(args ?? {});
    } catch (error) {
      logger.error(`Error getting prompt ${name}:`, error);
      throw error;
    }
  }

  /**
   * Executes a tool with validation and event dispatch.
   * Follows this sequence:
   * 1. Validates input arguments against schema (unless skipValidation is true)
   * 2. Records tool call in testing API (if available)
   * 3. Checks for mock response (if testing)
   * 4. Dispatches 'toolcall' event to listeners
   * 5. Executes tool function if not prevented
   * 6. Validates output (permissive mode - warns only)
   *
   * @param {string} toolName - Name of the tool to execute
   * @param {Record<string, unknown>} args - Arguments to pass to the tool
   * @param {Object} [options] - Execution options
   * @param {boolean} [options.skipValidation] - Skip input validation (used when MCP SDK already validated)
   * @returns {Promise<ToolResponse>} The tool's response
   * @throws {Error} If tool is not found
   * @internal
   */
  async executeTool(
    toolName: string,
    args: Record<string, unknown>,
    options?: { skipValidation?: boolean }
  ): Promise<ToolResponse> {
    const tool = this.bridge.tools.get(toolName);
    if (!tool) {
      throw new Error(`Tool not found: ${toolName}`);
    }

    // Skip validation if requested (MCP SDK already validated via safeParseAsync)
    // Keep validation for polyfill/testing path where SDK validation doesn't apply
    let validatedArgs: Record<string, unknown>;
    if (options?.skipValidation) {
      validatedArgs = args;
    } else {
      const validation = validateWithZod(args, tool.inputValidator);
      if (!validation.success) {
        logger.error(`Input validation failed for ${toolName}:`, validation.error);
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
      validatedArgs = validation.data as Record<string, unknown>;
    }

    if (this.testingAPI) {
      this.testingAPI.recordToolCall(toolName, validatedArgs);
    }

    if (this.testingAPI?.hasMockResponse(toolName)) {
      const mockResponse = this.testingAPI.getMockResponse(toolName);
      if (mockResponse) {
        return mockResponse;
      }
    }

    const event = new WebToolCallEvent(toolName, validatedArgs);

    this.dispatchEvent(event);

    if (event.defaultPrevented && event.hasResponse()) {
      const response = event.getResponse();
      if (response) {
        return response;
      }
    }

    let contextActive = true;
    try {
      const executionContext = {
        requestUserInteraction: async (callback: () => Promise<unknown>): Promise<unknown> => {
          if (!contextActive) {
            throw new Error(
              `ModelContextClient for tool "${toolName}" is no longer active after execute() resolved`
            );
          }

          if (typeof callback !== 'function') {
            throw new TypeError('requestUserInteraction(callback) requires a function callback');
          }

          return callback();
        },
        elicitInput: async (params) => {
          if (!contextActive) {
            throw new Error(
              `Elicitation context for tool "${toolName}" is no longer active after execute() resolved`
            );
          }

          return requireElicitInputCapability(this.bridge.tabServer)(params);
        },
      } as ModelContextClient & {
        elicitInput: (params: ElicitationParams) => Promise<ElicitationResult>;
      };

      const response = await tool.execute(validatedArgs, executionContext);

      if (tool.outputValidator && response.structuredContent) {
        const outputValidation = validateWithZod(response.structuredContent, tool.outputValidator);
        if (!outputValidation.success) {
          logger.warn(`Output validation failed for ${toolName}:`, outputValidation.error);
        }
      }

      // Log navigation tools for debugging
      if (
        response.metadata &&
        typeof response.metadata === 'object' &&
        'willNavigate' in response.metadata
      ) {
        logger.info(`Tool "${toolName}" will trigger navigation`, response.metadata);
      }

      return response;
    } catch (error) {
      logger.error(`Error executing tool ${toolName}:`, error);
      return {
        content: [
          {
            type: 'text',
            text: `Error: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
        isError: true,
      };
    } finally {
      contextActive = false;
    }
  }

  /**
   * Lists all registered tools in MCP format.
   * Returns tools with full MCP specification including
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

  /**
   * Executes a registered tool using MCP-style params.
   * Throws for missing tools and returns MCP-shaped errors for execution/validation failures.
   */
  async callTool(params: {
    name: string;
    arguments?: Record<string, unknown>;
  }): Promise<ToolResponse> {
    if (!params?.name || typeof params.name !== 'string') {
      throw new Error('Tool name is required');
    }

    if (!this.bridge.tools.has(params.name)) {
      throw new Error(`Tool not found: ${params.name}`);
    }

    return this.executeTool(params.name, params.arguments ?? {});
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
    return requireCreateMessageCapability(this.bridge.tabServer)(params);
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
    return requireElicitInputCapability(this.bridge.tabServer)(params);
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
  const hostname = window.location.hostname || 'localhost';
  const transportOptions = options?.transport;

  const setupServerHandlers = (server: McpServer, bridge: MCPBridge) => {
    // ==================== TOOL HANDLERS ====================
    server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: bridge.modelContext.listTools(),
      };
    });

    server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const toolName = request.params.name;
      const args = (request.params.arguments || {}) as Record<string, unknown>;

      try {
        const response = await bridge.modelContext.executeTool(toolName, args);
        return {
          content: response.content,
          isError: response.isError,
          ...(response.structuredContent && { structuredContent: response.structuredContent }),
        };
      } catch (error) {
        bridgeLogger.error(`Error calling tool ${toolName}:`, error);
        throw error;
      }
    });

    // ==================== RESOURCE HANDLERS ====================
    server.setRequestHandler(ListResourcesRequestSchema, async () => {
      return {
        resources: bridge.modelContext.listResources(),
        // Note: Resource templates are included in the resources list as the MCP SDK
        // doesn't export ListResourceTemplatesRequestSchema separately.
        // Clients can identify templates by checking for URI patterns containing {param}.
      };
    });

    server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
      try {
        return await bridge.modelContext.readResource(request.params.uri);
      } catch (error) {
        bridgeLogger.error(`Error reading resource ${request.params.uri}:`, error);
        throw error;
      }
    });

    // ==================== PROMPT HANDLERS ====================
    server.setRequestHandler(ListPromptsRequestSchema, async () => {
      return {
        prompts: bridge.modelContext.listPrompts(),
      };
    });

    server.setRequestHandler(GetPromptRequestSchema, async (request) => {
      try {
        return await bridge.modelContext.getPrompt(
          request.params.name,
          request.params.arguments as Record<string, unknown> | undefined
        );
      } catch (error) {
        bridgeLogger.error(`Error getting prompt ${request.params.name}:`, error);
        throw error;
      }
    });

    // Note: Sampling and elicitation are server-to-client requests.
    // The server calls createMessage() and elicitInput() methods on the Server instance.
    // These are NOT request handlers - the client handles these requests.
  };

  const customTransport: Transport | undefined = transportOptions?.create?.();

  if (customTransport) {
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

    return bridge;
  }

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
  }

  const isInIframe = typeof window !== 'undefined' && window.parent !== window;
  const iframeServerConfig = transportOptions?.iframeServer;
  const iframeServerEnabled =
    iframeServerConfig !== false && (iframeServerConfig !== undefined || isInIframe);

  if (iframeServerEnabled) {
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
  }

  return bridge;
}

function canonicalizeForFingerprint(value: unknown): unknown {
  if (value === null) {
    return null;
  }

  const valueType = typeof value;
  if (valueType === 'string' || valueType === 'number' || valueType === 'boolean') {
    return value;
  }

  if (valueType === 'bigint') {
    return `${String(value)}n`;
  }

  if (valueType === 'function') {
    const fnName = (value as { name?: string }).name;
    return `[Function:${fnName || 'anonymous'}]`;
  }

  if (valueType === 'symbol') {
    return String(value);
  }

  if (valueType === 'undefined') {
    return '[undefined]';
  }

  if (Array.isArray(value)) {
    return value.map((entry) => canonicalizeForFingerprint(entry));
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (valueType === 'object') {
    const result: Record<string, unknown> = {};
    const entries = Object.entries(value as Record<string, unknown>).sort(([left], [right]) =>
      left.localeCompare(right)
    );

    for (const [key, entryValue] of entries) {
      if (typeof entryValue === 'undefined') {
        continue;
      }
      result[key] = canonicalizeForFingerprint(entryValue);
    }

    return result;
  }

  return String(value);
}

function createOptionsFingerprint(options?: WebModelContextInitOptions): string {
  return JSON.stringify(canonicalizeForFingerprint(options ?? {}));
}

function createBridgeInitState(
  mode: MCPBridgeInitState['mode'],
  optionsFingerprint: string
): MCPBridgeInitState {
  return {
    initialized: true,
    mode,
    optionsFingerprint,
    version: GLOBAL_RUNTIME_VERSION,
  };
}

function setBridgeInitState(initState: MCPBridgeInitState): void {
  Object.defineProperty(window, '__mcpBridgeInitState', {
    value: initState,
    writable: false,
    configurable: true,
  });
}

function installBridgeGlobals(bridge: MCPBridge, initState: MCPBridgeInitState): void {
  Object.defineProperty(window, '__mcpBridge', {
    value: bridge,
    writable: false,
    configurable: true,
  });

  setBridgeInitState(initState);
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
  /* c8 ignore next 4 */
  if (typeof window === 'undefined') {
    logger.warn('Not in browser environment, skipping initialization');
    return;
  }

  const effectiveOptions = options ?? window.__webModelContextOptions;
  const optionsFingerprint = createOptionsFingerprint(effectiveOptions);
  const existingModelContext = window.navigator.modelContext as
    | (ModelContext & Record<string, unknown>)
    | undefined;
  const isKnownPolyfillContext = existingModelContext?.[POLYFILL_MARKER_PROPERTY] === true;

  if (window.__mcpBridge) {
    const initState = window.__mcpBridgeInitState;
    if (initState?.initialized) {
      if (initState.optionsFingerprint !== optionsFingerprint) {
        logger.warn(
          'initializeWebModelContext() options mismatch ignored; first initialization wins'
        );
      }
      logger.info('Web Model Context already initialized, skipping');
      return;
    }

    const nativeForAdoption = detectNativeAPI();
    const adoptedMode: MCPBridgeInitState['mode'] = nativeForAdoption.hasNativeContext
      ? isKnownPolyfillContext
        ? 'polyfill-installed'
        : 'native'
      : 'polyfill-installed';
    setBridgeInitState(createBridgeInitState(adoptedMode, optionsFingerprint));
    logger.info('Adopted existing __mcpBridge state; skipping re-initialization');
    return;
  }

  const native = detectNativeAPI();

  if (native.hasNativeContext && !isKnownPolyfillContext) {
    const nativeContext = window.navigator.modelContext;
    const nativeTesting = window.navigator.modelContextTesting;

    if (!nativeContext) {
      logger.error('Native API detection mismatch');
      return;
    }

    logger.info('✅ Native Chromium API detected');
    logger.info(
      `   Using native implementation with MCP bridge synchronization${
        nativeTesting ? ' (with modelContextTesting)' : ' (without modelContextTesting)'
      }`
    );

    try {
      const bridge = initializeMCPBridge(effectiveOptions);

      const adapter = new NativeModelContextAdapter(
        bridge,
        nativeContext as unknown as ModelContext,
        nativeTesting
      );

      bridge.modelContext = adapter;
      if (nativeTesting) {
        bridge.modelContextTesting = nativeTesting;
        installDeprecatedTestingAccessor(nativeTesting);
      }

      installConsumerShim(
        nativeContext as unknown as ModelContext,
        (params: { name: string; arguments?: Record<string, unknown> }) => adapter.callTool(params),
        {
          hasNativeTesting: Boolean(nativeTesting),
          onBeforeProducerMutation: (methodName, args) => {
            adapter.applyProducerMutation(methodName, args);
          },
          onToolRegistryMutated: () => adapter.refreshToolsFromNative(),
        }
      );

      installMissingMethodStubs(nativeContext as unknown as ModelContext, adapter);

      installBridgeGlobals(bridge, createBridgeInitState('native', optionsFingerprint));

      logger.info('✅ MCP bridge synced with native API');
      logger.info(
        `   MCP clients will receive automatic tool updates from native registry${
          nativeTesting ? '' : ' (mutation-driven sync fallback)'
        }`
      );
    } catch (error) {
      logger.error('Failed to initialize native adapter:', error);
      throw error;
    }

    return;
  }

  if (existingModelContext) {
    logger.info('Existing navigator.modelContext detected; attach-only mode activated');

    try {
      const bridge = initializeMCPBridge(effectiveOptions);
      attachBridgeBackedModelContext(existingModelContext, bridge.modelContext);
      bridge.modelContext = existingModelContext as unknown as InternalModelContext;
      installBridgeGlobals(bridge, createBridgeInitState('attach-existing', optionsFingerprint));
      logger.info('✅ Attached MCP bridge to existing navigator.modelContext (attach-only mode)');
    } catch (error) {
      logger.error('Failed to initialize attach-only bridge mode:', error);
      throw error;
    }
    return;
  }

  logger.info('Native API not detected, installing polyfill');

  try {
    initializeWebMCPPolyfill({
      forceOverride: true,
      installTestingShim: false,
    });

    const bridge = initializeMCPBridge(effectiveOptions);
    const modelContextTarget = window.navigator.modelContext as ModelContext | undefined;

    if (modelContextTarget) {
      attachBridgeBackedModelContext(modelContextTarget, bridge.modelContext);
      bridge.modelContext = modelContextTarget as unknown as InternalModelContext;
    }

    installBridgeGlobals(bridge, createBridgeInitState('polyfill-installed', optionsFingerprint));

    logger.info('✅ window.navigator.modelContext initialized successfully');

    testingLogger.info('Installing polyfill');
    testingLogger.info('   💡 To use the native implementation in Chromium:');
    testingLogger.info('      - Navigate to chrome://flags/#enable-webmcp-testing');
    testingLogger.info('      - Enable "WebMCP for testing"');
    testingLogger.info('      - Restart the browser');

    const testingAPI = new WebModelContextTesting(bridge);
    bridge.modelContextTesting = testingAPI;

    if ('setTestingAPI' in bridge.modelContext) {
      (bridge.modelContext as WebModelContext).setTestingAPI(testingAPI);
    }

    installDeprecatedTestingAccessor(testingAPI);

    testingLogger.info('✅ Polyfill installed at window.navigator.modelContextTesting');
  } catch (error) {
    logger.error('Failed to initialize:', error);
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
  /* c8 ignore next */
  if (typeof window === 'undefined') return;

  if (window.__mcpBridge) {
    try {
      window.__mcpBridge.tabServer.close();

      if (window.__mcpBridge.iframeServer) {
        window.__mcpBridge.iframeServer.close();
      }
    } catch (error) {
      logger.warn('Error closing MCP servers:', error);
    }
  }

  const safeDeleteNavigatorProperty = (propertyName: 'modelContext' | 'modelContextTesting') => {
    const descriptor = Object.getOwnPropertyDescriptor(window.navigator, propertyName);
    if (descriptor?.configurable === false) {
      logger.debug(
        `Skipping cleanup for navigator.${propertyName} because property is non-configurable`
      );
      return;
    }

    try {
      delete (window.navigator as unknown as Record<string, unknown>)[propertyName];
    } catch (error) {
      logger.warn(`Failed to remove navigator.${propertyName} during cleanup:`, error);
    }
  };

  safeDeleteNavigatorProperty('modelContext');
  safeDeleteNavigatorProperty('modelContextTesting');
  delete (window as unknown as { __mcpBridge?: unknown }).__mcpBridge;
  delete (window as unknown as { __mcpBridgeInitState?: unknown }).__mcpBridgeInitState;

  logger.info('Cleaned up');
}
