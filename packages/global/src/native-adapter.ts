import { createLogger } from './logger.js';
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
  ModelContext,
  ModelContextInput,
  ModelContextTesting,
  Prompt,
  PromptDescriptor,
  PromptMessage,
  Resource,
  ResourceContents,
  ResourceDescriptor,
  SamplingRequestParams,
  SamplingResult,
  ToolCallEvent,
  ToolDescriptor,
  ToolResponse,
  ValidatedToolDescriptor,
  ZodSchemaObject,
} from './types.js';
import { jsonSchemaToZod, normalizeSchema } from './validation.js';

const nativeLogger = createLogger('NativeAdapter');
const testingLogger = createLogger('ModelContextTesting');

const POLYFILL_MARKER_PROPERTY = '__isWebMCPPolyfill' as const;
const CONSUMER_SHIM_MARKER_PROPERTY = '__webMCPConsumerShimInstalled' as const;
const CONSUMER_CALL_TOOL_SHIM_MARKER_PROPERTY = '__webMCPCallToolShimInstalled' as const;
const MODEL_CONTEXT_TESTING_DEPRECATION_MESSAGE =
  "navigator.modelContextTesting is deprecated. Use navigator.modelContext.callTool() and addEventListener('toolschanged', ...) instead.";

interface MayHavePolyfillMarker {
  [POLYFILL_MARKER_PROPERTY]?: true;
}

interface MayHaveConsumerShimMarker {
  [CONSUMER_SHIM_MARKER_PROPERTY]?: true;
  [CONSUMER_CALL_TOOL_SHIM_MARKER_PROPERTY]?: true;
}

/**
 * Detect if the native Chromium Web Model Context API is available.
 * Checks for both navigator.modelContext and navigator.modelContextTesting,
 * and verifies they are native implementations (not polyfills).
 */
export function detectNativeAPI(): {
  hasNativeContext: boolean;
  hasNativeTesting: boolean;
} {
  /* c8 ignore next 2 */
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return { hasNativeContext: false, hasNativeTesting: false };
  }

  const modelContext = navigator.modelContext;
  const modelContextTesting = navigator.modelContextTesting;

  if (!modelContext || !modelContextTesting) {
    return {
      hasNativeContext: Boolean(modelContext),
      hasNativeTesting: Boolean(modelContextTesting),
    };
  }

  const isPolyfill =
    POLYFILL_MARKER_PROPERTY in modelContextTesting &&
    (modelContextTesting as MayHavePolyfillMarker)[POLYFILL_MARKER_PROPERTY] === true;

  if (isPolyfill) {
    return { hasNativeContext: false, hasNativeTesting: false };
  }

  return { hasNativeContext: true, hasNativeTesting: true };
}

/**
 * Installs a deprecation getter for navigator.modelContextTesting.
 * Emits a warning on first access while preserving compatibility behavior.
 */
export function installDeprecatedTestingAccessor(modelContextTesting: ModelContextTesting): void {
  let hasWarned = false;

  try {
    Object.defineProperty(window.navigator, 'modelContextTesting', {
      configurable: true,
      enumerable: true,
      get() {
        if (!hasWarned) {
          testingLogger.warn(MODEL_CONTEXT_TESTING_DEPRECATION_MESSAGE);
          hasWarned = true;
        }
        return modelContextTesting;
      },
    });
  } catch (error) {
    testingLogger.warn('Failed to install modelContextTesting deprecation accessor:', error);
  }
}

/**
 * Dispatches a tools-changed event on a modelContext object.
 */
function dispatchToolsChangedEvent(modelContext: ModelContext): void {
  try {
    modelContext.dispatchEvent(new Event('toolschanged'));
  } catch (error) {
    nativeLogger.warn('Failed to dispatch "toolschanged" event:', error);
  }
}

/**
 * Installs consumer methods on an existing modelContext object.
 * This allows native producer APIs to expose consumer semantics without replacing the object.
 */
export function installConsumerShim(
  nativeContext: ModelContext,
  callTool: (params: {
    name: string;
    arguments?: Record<string, unknown>;
  }) => Promise<ToolResponse>,
  options: { hasNativeTesting: boolean; onToolRegistryMutated?: () => void }
): void {
  const target = nativeContext as ModelContext &
    MayHaveConsumerShimMarker & {
      callTool?: (params: {
        name: string;
        arguments?: Record<string, unknown>;
      }) => Promise<ToolResponse>;
      registerTool?: (...args: unknown[]) => unknown;
      provideContext?: (...args: unknown[]) => unknown;
      unregisterTool?: (...args: unknown[]) => unknown;
      clearContext?: (...args: unknown[]) => unknown;
    };

  if (target[CONSUMER_SHIM_MARKER_PROPERTY] === true) {
    return;
  }

  let installedCallToolShim = false;
  if (typeof target.callTool !== 'function') {
    try {
      Object.defineProperty(target, 'callTool', {
        configurable: true,
        writable: true,
        value: callTool,
      });
      installedCallToolShim = true;
    } catch (error) {
      nativeLogger.warn('Failed to install modelContext.callTool shim:', error);
    }
  }

  // If native testing callbacks are unavailable, patch producer mutation methods so
  // toolschanged listeners still receive notifications for same-page registrations.
  if (!options.hasNativeTesting) {
    const queueToolsChanged = () => {
      if (options.onToolRegistryMutated) {
        queueMicrotask(options.onToolRegistryMutated);
        return;
      }
      queueMicrotask(() => dispatchToolsChangedEvent(nativeContext));
    };

    const wrapMethod = (
      methodName: 'provideContext' | 'registerTool' | 'unregisterTool' | 'clearContext'
    ) => {
      const original = target[methodName];
      if (typeof original !== 'function') {
        return;
      }

      try {
        Object.defineProperty(target, methodName, {
          configurable: true,
          writable: true,
          value: (...args: unknown[]) => {
            const result = original.apply(target, args);

            if (
              methodName === 'registerTool' &&
              result &&
              typeof result === 'object' &&
              'unregister' in result
            ) {
              const registration = result as { unregister?: () => void };
              if (typeof registration.unregister === 'function') {
                const originalUnregister = registration.unregister.bind(registration);
                registration.unregister = () => {
                  originalUnregister();
                  queueToolsChanged();
                };
              }
            }

            queueToolsChanged();
            return result;
          },
        });
      } catch (error) {
        nativeLogger.warn(`Failed to wrap modelContext.${methodName} for "toolschanged":`, error);
      }
    };

    wrapMethod('provideContext');
    wrapMethod('registerTool');
    wrapMethod('unregisterTool');
    wrapMethod('clearContext');
  }

  try {
    Object.defineProperty(target, CONSUMER_SHIM_MARKER_PROPERTY, {
      configurable: true,
      enumerable: false,
      writable: false,
      value: true,
    });
    if (installedCallToolShim) {
      Object.defineProperty(target, CONSUMER_CALL_TOOL_SHIM_MARKER_PROPERTY, {
        configurable: true,
        enumerable: false,
        writable: false,
        value: true,
      });
    }
  } catch {
    // Best-effort marker only.
  }
}

/**
 * Adapter that wraps the native Chromium Web Model Context API.
 * Synchronizes tool changes from the native API to the MCP bridge,
 * enabling MCP clients to stay in sync with the native tool registry.
 */
export class NativeModelContextAdapter implements InternalModelContext {
  private nativeContext: ModelContext;
  private nativeTesting: ModelContextTesting | undefined;
  private bridge: MCPBridge;
  private syncInProgress = false;
  private hasCompletedInitialToolSync = false;

  constructor(bridge: MCPBridge, nativeContext: ModelContext, nativeTesting?: ModelContextTesting) {
    this.bridge = bridge;
    this.nativeContext = nativeContext;
    this.nativeTesting = nativeTesting;

    if (this.nativeTesting) {
      this.nativeTesting.registerToolsChangedCallback(() => {
        this.syncToolsFromNative();
      });
    }

    this.syncToolsFromNative();
  }

  private syncToolsFromNative(): void {
    if (this.syncInProgress) {
      return;
    }

    this.syncInProgress = true;

    try {
      const nativeTestingTools = this.nativeTesting?.listTools();
      const nativeTools = this.nativeContext.listTools();

      this.bridge.tools.clear();

      const sourceTools = nativeTestingTools ?? nativeTools;
      for (const toolInfo of sourceTools) {
        try {
          const inputSchema =
            nativeTestingTools &&
            'inputSchema' in toolInfo &&
            typeof toolInfo.inputSchema === 'string'
              ? (JSON.parse(toolInfo.inputSchema) as InputSchema)
              : ((toolInfo as { inputSchema: InputSchema }).inputSchema ?? { type: 'object' });

          const validatedTool: ValidatedToolDescriptor = {
            name: toolInfo.name,
            description: toolInfo.description,
            inputSchema,
            execute: async (args: Record<string, unknown>) => {
              return this.executeTool(toolInfo.name, args);
            },
            inputValidator: jsonSchemaToZod(inputSchema),
          };

          this.bridge.tools.set(toolInfo.name, validatedTool);
        } catch (error) {
          nativeLogger.error(`Failed to sync tool "${toolInfo.name}":`, error);
        }
      }

      this.notifyMCPServers();

      if (this.hasCompletedInitialToolSync) {
        dispatchToolsChangedEvent(this.nativeContext);
      } else {
        this.hasCompletedInitialToolSync = true;
      }
    } finally {
      this.syncInProgress = false;
    }
  }

  /**
   * Public refresh hook for consumer shims that detect native tool mutations
   * without modelContextTesting callbacks.
   */
  refreshToolsFromNative(): void {
    this.syncToolsFromNative();
  }

  private async executeToolViaNative(
    toolName: string,
    args: Record<string, unknown>
  ): Promise<ToolResponse> {
    const nativeWithConsumer = this.nativeContext as ModelContext &
      MayHaveConsumerShimMarker & {
        callTool?: (params: {
          name: string;
          arguments?: Record<string, unknown>;
        }) => Promise<unknown>;
        executeTool?: (name: string, args: Record<string, unknown>) => Promise<unknown>;
      };

    if (
      typeof nativeWithConsumer.callTool === 'function' &&
      nativeWithConsumer[CONSUMER_CALL_TOOL_SHIM_MARKER_PROPERTY] !== true
    ) {
      const result = await nativeWithConsumer.callTool({ name: toolName, arguments: args });
      if (
        result &&
        typeof result === 'object' &&
        'content' in result &&
        Array.isArray((result as { content?: unknown }).content)
      ) {
        return result as ToolResponse;
      }
      return this.convertToToolResponse(result);
    }

    if (this.nativeTesting) {
      const result = await this.nativeTesting.executeTool(toolName, JSON.stringify(args));
      return this.convertToToolResponse(result);
    }

    if (typeof nativeWithConsumer.executeTool === 'function') {
      const result = await nativeWithConsumer.executeTool(toolName, args);
      return this.convertToToolResponse(result);
    }

    throw new Error(
      '[Native Adapter] Tool execution is not supported by this native implementation'
    );
  }

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

  provideContext(context: ModelContextInput): void {
    const { tools, ...rest } = context;
    const normalizedContext: ModelContextInput = { ...rest };
    if (tools) {
      normalizedContext.tools = tools.map((tool) => ({
        ...tool,
        inputSchema: normalizeSchema(tool.inputSchema).jsonSchema,
      }));
    }
    this.nativeContext.provideContext(normalizedContext);
  }

  registerTool<
    TInputSchema extends ZodSchemaObject = Record<string, never>,
    TOutputSchema extends ZodSchemaObject = Record<string, never>,
  >(tool: ToolDescriptor<TInputSchema, TOutputSchema>): { unregister: () => void } {
    const normalizedTool = {
      ...tool,
      inputSchema: normalizeSchema(tool.inputSchema).jsonSchema,
    };
    const result = this.nativeContext.registerTool(normalizedTool);
    return result;
  }

  unregisterTool(name: string): void {
    this.nativeContext.unregisterTool(name);
  }

  clearContext(): void {
    this.nativeContext.clearContext();
  }

  async executeTool(
    toolName: string,
    args: Record<string, unknown>,
    _options?: { skipValidation?: boolean }
  ): Promise<ToolResponse> {
    try {
      return await this.executeToolViaNative(toolName, args);
    } catch (error) {
      nativeLogger.error(`Error executing tool "${toolName}":`, error);
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

  listTools() {
    return Array.from(this.bridge.tools.values()).map((tool) => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema,
      ...(tool.outputSchema && { outputSchema: tool.outputSchema }),
      ...(tool.annotations && { annotations: tool.annotations }),
    }));
  }

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

  registerResource(_resource: ResourceDescriptor): { unregister: () => void } {
    nativeLogger.warn('registerResource is not supported by native API');
    return { unregister: () => {} };
  }

  unregisterResource(_uri: string): void {
    nativeLogger.warn('unregisterResource is not supported by native API');
  }

  listResources(): Resource[] {
    return [];
  }

  listResourceTemplates(): Array<{
    uriTemplate: string;
    name: string;
    description?: string;
    mimeType?: string;
  }> {
    return [];
  }

  async readResource(_uri: string): Promise<{ contents: ResourceContents[] }> {
    throw new Error('[Native Adapter] readResource is not supported by native API');
  }

  registerPrompt<TArgsSchema extends ZodSchemaObject = Record<string, never>>(
    _prompt: PromptDescriptor<TArgsSchema>
  ): { unregister: () => void } {
    nativeLogger.warn('registerPrompt is not supported by native API');
    return { unregister: () => {} };
  }

  unregisterPrompt(_name: string): void {
    nativeLogger.warn('unregisterPrompt is not supported by native API');
  }

  listPrompts(): Prompt[] {
    return [];
  }

  async getPrompt(
    _name: string,
    _args?: Record<string, unknown>
  ): Promise<{ messages: PromptMessage[] }> {
    throw new Error('[Native Adapter] getPrompt is not supported by native API');
  }

  addEventListener(
    type: 'toolcall' | 'toolschanged',
    listener: ((event: ToolCallEvent) => void | Promise<void>) | (() => void),
    options?: boolean | AddEventListenerOptions
  ): void {
    if (type === 'toolcall') {
      this.nativeContext.addEventListener(
        'toolcall',
        listener as (event: ToolCallEvent) => void | Promise<void>,
        options
      );
      return;
    }

    this.nativeContext.addEventListener('toolschanged', listener as () => void, options);
  }

  removeEventListener(
    type: 'toolcall' | 'toolschanged',
    listener: ((event: ToolCallEvent) => void | Promise<void>) | (() => void),
    options?: boolean | EventListenerOptions
  ): void {
    if (type === 'toolcall') {
      this.nativeContext.removeEventListener(
        'toolcall',
        listener as (event: ToolCallEvent) => void | Promise<void>,
        options
      );
      return;
    }

    this.nativeContext.removeEventListener('toolschanged', listener as () => void, options);
  }

  dispatchEvent(event: Event): boolean {
    return this.nativeContext.dispatchEvent(event);
  }

  async createMessage(params: SamplingRequestParams): Promise<SamplingResult> {
    return requireCreateMessageCapability(this.bridge.tabServer)(params);
  }

  async elicitInput(params: ElicitationParams): Promise<ElicitationResult> {
    return requireElicitInputCapability(this.bridge.tabServer)(params);
  }
}
