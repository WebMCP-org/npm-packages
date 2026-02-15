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
  ModelContextOptions,
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
  "navigator.modelContextTesting is deprecated for long-term consumer usage, but remains the native testing path in Chromium early preview. Prefer navigator.modelContext.callTool() and addEventListener('toolschanged', ...) for in-page consumers.";

interface NativeToolsChangedCallbackMultiplexer {
  addInternalCallback(callback: () => void): void;
}

const nativeToolsChangedMultiplexerByTesting = new WeakMap<
  ModelContextTesting,
  NativeToolsChangedCallbackMultiplexer
>();

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

function safelyInvokeToolsChangedCallback(
  callback: () => void,
  source: 'internal' | 'external'
): void {
  try {
    callback();
  } catch (error) {
    nativeLogger.warn(`Error in ${source} registerToolsChangedCallback callback:`, error);
  }
}

/**
 * Installs a callback multiplexer around native registerToolsChangedCallback().
 *
 * The multiplexer keeps internal bridge-sync listeners pinned while preserving
 * external replacement semantics (latest external callback wins).
 */
function installToolsChangedCallbackMultiplexer(
  nativeTesting: ModelContextTesting
): NativeToolsChangedCallbackMultiplexer | null {
  const existingMultiplexer = nativeToolsChangedMultiplexerByTesting.get(nativeTesting);
  if (existingMultiplexer) {
    return existingMultiplexer;
  }

  const target = nativeTesting as ModelContextTesting;

  const originalRegister = target.registerToolsChangedCallback;
  if (typeof originalRegister !== 'function') {
    return null;
  }

  const boundOriginalRegister = originalRegister.bind(target) as (callback: () => void) => void;
  const internalCallbacks = new Set<() => void>();
  let externalCallback: (() => void) | null = null;

  const composedCallback = () => {
    for (const callback of internalCallbacks) {
      safelyInvokeToolsChangedCallback(callback, 'internal');
    }

    if (externalCallback) {
      safelyInvokeToolsChangedCallback(externalCallback, 'external');
    }
  };

  const wrappedRegister = (callback: () => void) => {
    if (typeof callback !== 'function') {
      // Delegate invalid-input errors to the native implementation.
      boundOriginalRegister(callback as unknown as () => void);
      return;
    }

    externalCallback = callback;
    boundOriginalRegister(composedCallback);
  };

  try {
    Object.defineProperty(target, 'registerToolsChangedCallback', {
      configurable: true,
      writable: true,
      value: wrappedRegister,
    });
  } catch (error) {
    nativeLogger.warn('Failed to install registerToolsChangedCallback multiplexer:', error);
    return null;
  }

  try {
    boundOriginalRegister(composedCallback);
  } catch (error) {
    nativeLogger.warn('Failed to prime registerToolsChangedCallback multiplexer:', error);

    try {
      Object.defineProperty(target, 'registerToolsChangedCallback', {
        configurable: true,
        writable: true,
        value: originalRegister,
      });
    } catch {
      // Best-effort rollback only.
    }
    return null;
  }

  const multiplexer: NativeToolsChangedCallbackMultiplexer = {
    addInternalCallback(callback: () => void): void {
      internalCallbacks.add(callback);
      boundOriginalRegister(composedCallback);
    },
  };

  nativeToolsChangedMultiplexerByTesting.set(nativeTesting, multiplexer);

  return multiplexer;
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
  options: {
    hasNativeTesting: boolean;
    onBeforeProducerMutation?: (
      methodName: 'provideContext' | 'registerTool' | 'unregisterTool' | 'clearContext',
      args: unknown[]
    ) => void;
    onToolRegistryMutated?: () => void;
  }
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
      addEventListener?: (...args: unknown[]) => unknown;
      removeEventListener?: (...args: unknown[]) => unknown;
      dispatchEvent?: (...args: unknown[]) => unknown;
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

  // Some Chromium preview builds expose modelContext without full EventTarget methods.
  // Install minimal event shims so toolschanged listeners remain functional.
  const localEventTarget = new EventTarget();
  const ensureEventMethod = (
    methodName: 'addEventListener' | 'removeEventListener' | 'dispatchEvent'
  ) => {
    if (typeof target[methodName] === 'function') {
      return;
    }

    try {
      Object.defineProperty(target, methodName, {
        configurable: true,
        writable: true,
        value: (...args: unknown[]) =>
          (localEventTarget[methodName] as (...a: unknown[]) => unknown).apply(
            localEventTarget,
            args
          ),
      });
    } catch (error) {
      nativeLogger.warn(`Failed to install modelContext.${methodName} shim:`, error);
    }
  };

  ensureEventMethod('addEventListener');
  ensureEventMethod('removeEventListener');
  ensureEventMethod('dispatchEvent');

  // If native testing callbacks are unavailable OR a bridge refresh callback is provided,
  // patch producer mutation methods so toolschanged listeners still receive notifications
  // for same-page registrations. This also protects bridge sync if another consumer
  // replaces registerToolsChangedCallback in native testing implementations.
  if (!options.hasNativeTesting || options.onToolRegistryMutated) {
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
          value: (...rawArgs: unknown[]) => {
            const args = methodName === 'provideContext' && rawArgs.length === 0 ? [{}] : rawArgs;

            options.onBeforeProducerMutation?.(methodName, args);

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
 * The polyfill-only method names that may not exist on the native context.
 * Each stub delegates to the corresponding method on the adapter.
 */
const POLYFILL_METHOD_NAMES = [
  'listTools',
  'registerPrompt',
  'unregisterPrompt',
  'listPrompts',
  'getPrompt',
  'registerResource',
  'unregisterResource',
  'listResources',
  'listResourceTemplates',
  'readResource',
] as const;

/**
 * Installs safe stub methods on the native context for any polyfill API methods
 * that don't exist natively. Each stub delegates to the adapter so that
 * websites calling e.g. `navigator.modelContext.registerPrompt(...)` get
 * consistent behavior instead of a TypeError.
 */
export function installMissingMethodStubs(
  nativeContext: ModelContext,
  adapter: NativeModelContextAdapter
): void {
  const target = nativeContext as unknown as Record<string, unknown>;

  for (const methodName of POLYFILL_METHOD_NAMES) {
    if (typeof target[methodName] === 'function') {
      continue;
    }

    const adapterMethod = (adapter as unknown as Record<string, unknown>)[methodName];
    if (typeof adapterMethod !== 'function') {
      continue;
    }

    try {
      Object.defineProperty(target, methodName, {
        configurable: true,
        writable: true,
        value: (...args: unknown[]) =>
          (adapterMethod as (...a: unknown[]) => unknown).apply(adapter, args),
      });
    } catch (error) {
      nativeLogger.warn(`Failed to install modelContext.${methodName} stub:`, error);
    }
  }
}

/**
 * Adapter that wraps the native Chromium Web Model Context API.
 * Synchronizes tool changes from the native API to the MCP bridge,
 * enabling MCP clients to stay in sync with the native tool registry.
 */
export class NativeModelContextAdapter implements InternalModelContext {
  private nativeContext: ModelContext;
  private nativeTesting: ModelContextTesting;
  private bridge: MCPBridge;
  private syncInProgress = false;
  private hasCompletedInitialToolSync = false;
  private readonly nativeProvideContext: (context?: ModelContextOptions) => void;
  private readonly nativeRegisterTool: (tool: unknown) => void;
  private readonly nativeUnregisterTool: (name: string) => void;
  private readonly nativeClearContext: () => void;
  private readonly nativeAddEventListener: EventTarget['addEventListener'] | null;
  private readonly nativeRemoveEventListener: EventTarget['removeEventListener'] | null;
  private readonly nativeDispatchEvent: EventTarget['dispatchEvent'] | null;
  private readonly fallbackEventTarget = new EventTarget();
  private syncSequence = 0;

  private static readonly DEFAULT_INPUT_SCHEMA: InputSchema = { type: 'object', properties: {} };

  constructor(bridge: MCPBridge, nativeContext: ModelContext, nativeTesting: ModelContextTesting) {
    this.bridge = bridge;
    this.nativeContext = nativeContext;
    this.nativeTesting = nativeTesting;
    this.nativeProvideContext = nativeContext.provideContext.bind(nativeContext);
    this.nativeRegisterTool = nativeContext.registerTool.bind(nativeContext) as (
      tool: unknown
    ) => void;
    this.nativeUnregisterTool = nativeContext.unregisterTool.bind(nativeContext);
    this.nativeClearContext = nativeContext.clearContext.bind(nativeContext);
    this.nativeAddEventListener =
      typeof nativeContext.addEventListener === 'function'
        ? nativeContext.addEventListener.bind(nativeContext)
        : null;
    this.nativeRemoveEventListener =
      typeof nativeContext.removeEventListener === 'function'
        ? nativeContext.removeEventListener.bind(nativeContext)
        : null;
    this.nativeDispatchEvent =
      typeof nativeContext.dispatchEvent === 'function'
        ? nativeContext.dispatchEvent.bind(nativeContext)
        : null;

    const multiplexer = installToolsChangedCallbackMultiplexer(this.nativeTesting);
    const syncFromNative = () => {
      this.syncToolsFromNative('nativeTesting.registerToolsChangedCallback');
    };
    if (multiplexer) {
      multiplexer.addInternalCallback(syncFromNative);
    } else {
      this.nativeTesting.registerToolsChangedCallback(syncFromNative);
    }

    this.syncToolsFromNative('constructor.initial');
  }

  private traceToolFlow(stage: string, details: Record<string, unknown>): void {
    nativeLogger.debug(`[ToolFlow] ${stage}`, details);
  }

  private syncToolsFromNative(source: string): void {
    const syncId = ++this.syncSequence;
    if (this.syncInProgress) {
      this.traceToolFlow('sync_skipped_in_progress', { syncId, source });
      return;
    }

    this.syncInProgress = true;
    const startTime = Date.now();
    this.traceToolFlow('sync_start', {
      syncId,
      source,
    });

    try {
      const listToolsStart = Date.now();
      const nativeTestingTools = this.nativeTesting.listTools();
      this.traceToolFlow('sync_native_listTools_result', {
        syncId,
        source,
        durationMs: Date.now() - listToolsStart,
        nativeToolsCount: nativeTestingTools.length,
      });

      this.bridge.tools.clear();

      for (const toolInfo of nativeTestingTools) {
        try {
          const inputSchema =
            typeof toolInfo.inputSchema === 'string'
              ? (JSON.parse(toolInfo.inputSchema) as InputSchema)
              : ({ type: 'object', properties: {} } as InputSchema);

          const validatedTool: ValidatedToolDescriptor = {
            name: toolInfo.name,
            description: toolInfo.description,
            inputSchema,
            execute: async (args: Record<string, unknown>, _context) => {
              return this.executeTool(toolInfo.name, args);
            },
            inputValidator: jsonSchemaToZod(inputSchema),
          };

          this.bridge.tools.set(toolInfo.name, validatedTool);
        } catch (error) {
          nativeLogger.error(`Failed to sync tool "${toolInfo.name}":`, error);
        }
      }

      this.traceToolFlow('sync_bridge_rebuilt', {
        syncId,
        source,
        bridgeToolsCount: this.bridge.tools.size,
      });
      this.notifyMCPServers(syncId, source);

      if (this.hasCompletedInitialToolSync) {
        dispatchToolsChangedEvent(this.nativeContext);
      } else {
        this.hasCompletedInitialToolSync = true;
      }
    } finally {
      this.traceToolFlow('sync_end', {
        syncId,
        source,
        durationMs: Date.now() - startTime,
        bridgeToolsCount: this.bridge.tools.size,
      });
      this.syncInProgress = false;
    }
  }

  /**
   * Public refresh hook for explicit sync requests.
   */
  refreshToolsFromNative(): void {
    this.syncToolsFromNative('consumerShim.onToolRegistryMutated');
  }

  private normalizeToolForNativeRegistration<
    TInputSchema extends ZodSchemaObject = Record<string, never>,
    TOutputSchema extends ZodSchemaObject = Record<string, never>,
  >(
    tool: ToolDescriptor<TInputSchema, TOutputSchema>
  ): ToolDescriptor<TInputSchema, TOutputSchema> {
    if (!tool || typeof tool !== 'object' || typeof tool.name !== 'string') {
      throw new TypeError('Invalid tool registration');
    }

    const inputSchema = tool.inputSchema ?? NativeModelContextAdapter.DEFAULT_INPUT_SCHEMA;
    const normalizedInput = normalizeSchema(inputSchema, { strict: true });
    const normalizedOutput = tool.outputSchema
      ? normalizeSchema(tool.outputSchema, { strict: true })
      : null;

    return {
      ...tool,
      inputSchema: normalizedInput.jsonSchema,
      ...(normalizedOutput && { outputSchema: normalizedOutput.jsonSchema }),
    } as ToolDescriptor<TInputSchema, TOutputSchema>;
  }

  prepareProducerMutation(
    methodName: 'provideContext' | 'registerTool' | 'unregisterTool' | 'clearContext',
    args: unknown[]
  ): void {
    if (methodName === 'clearContext' || methodName === 'unregisterTool') {
      return;
    }

    if (methodName === 'provideContext') {
      const context = (args[0] ?? {}) as ModelContextOptions;
      if (!context || typeof context !== 'object') {
        throw new TypeError('provideContext options must be an object');
      }

      const { tools, ...rest } = context;
      if (!tools) {
        args[0] = { ...rest };
        return;
      }

      const seen = new Set<string>();
      const normalizedTools = tools.map((tool) => {
        if (seen.has(tool.name)) {
          throw new Error(
            `[Web Model Context] Tool name collision: "${tool.name}" is already registered in provideContext(). ` +
              'Each tool name in provideContext(options.tools) must be unique.'
          );
        }
        seen.add(tool.name);
        return this.normalizeToolForNativeRegistration(tool as ToolDescriptor);
      });

      args[0] = {
        ...rest,
        tools: normalizedTools,
      } as ModelContextOptions;
      return;
    }

    const tool = this.normalizeToolForNativeRegistration(args[0] as ToolDescriptor);
    if (this.bridge.tools.has(tool.name)) {
      throw new Error(`Tool already registered: ${tool.name}`);
    }
    args[0] = tool;
  }

  private stringifyInputArgs(args: Record<string, unknown>): string {
    try {
      const serialized = JSON.stringify(args);
      if (serialized === undefined) {
        throw new TypeError('Serialized arguments were undefined');
      }
      return serialized;
    } catch (error) {
      throw new TypeError(
        `[Native Adapter] Failed to serialize tool arguments: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  private async executeToolViaNative(
    toolName: string,
    args: Record<string, unknown>
  ): Promise<ToolResponse> {
    const result = await this.nativeTesting.executeTool(toolName, this.stringifyInputArgs(args));
    return this.convertToToolResponse(result);
  }

  private asToolResponse(value: unknown): ToolResponse | null {
    if (!value || typeof value !== 'object') {
      return null;
    }

    const candidate = value as Partial<ToolResponse>;
    if (!Array.isArray(candidate.content)) {
      return null;
    }

    return candidate as ToolResponse;
  }

  private convertToToolResponse(result: unknown): ToolResponse {
    if (typeof result === 'string') {
      try {
        const parsed = JSON.parse(result) as unknown;
        const parsedToolResponse = this.asToolResponse(parsed);
        if (parsedToolResponse) {
          return parsedToolResponse;
        }

        if (parsed === null || parsed === undefined) {
          return { content: [{ type: 'text', text: '' }] };
        }

        if (typeof parsed === 'object') {
          return {
            content: [{ type: 'text', text: JSON.stringify(parsed, null, 2) }],
            structuredContent: parsed as NonNullable<ToolResponse['structuredContent']>,
          };
        }

        return { content: [{ type: 'text', text: String(parsed) }] };
      } catch {
        // Not a JSON payload; treat as plain text.
      }

      return { content: [{ type: 'text', text: result }] };
    }

    if (result === undefined || result === null) {
      return { content: [{ type: 'text', text: '' }] };
    }

    if (typeof result === 'object') {
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        structuredContent: result as NonNullable<ToolResponse['structuredContent']>,
      };
    }

    return {
      content: [{ type: 'text', text: String(result) }],
    };
  }

  private notifyMCPServers(syncId: number, source: string): void {
    this.traceToolFlow('notify_tools_list_changed_start', {
      syncId,
      source,
      bridgeToolsCount: this.bridge.tools.size,
    });
    // TODO: Keep MCP tools/list_changed notifications sourced only from
    // modelContextTesting.registerToolsChangedCallback in global.ts.
    // if (this.bridge.tabServer?.notification) {
    //   this.bridge.tabServer.notification({
    //     method: 'notifications/tools/list_changed',
    //     params: {},
    //   });
    //   this.traceToolFlow('notify_tools_list_changed_sent_tabServer', {
    //     syncId,
    //     source,
    //   });
    // }
    //
    // if (this.bridge.iframeServer?.notification) {
    //   this.bridge.iframeServer.notification({
    //     method: 'notifications/tools/list_changed',
    //     params: {},
    //   });
    //   this.traceToolFlow('notify_tools_list_changed_sent_iframeServer', {
    //     syncId,
    //     source,
    //   });
    // }
  }

  provideContext(context: ModelContextOptions = {}): void {
    const { tools, ...rest } = context;
    const normalizedContext: ModelContextOptions = { ...rest };
    if (tools) {
      normalizedContext.tools = tools.map((tool) => {
        const inputSchema = tool.inputSchema ?? NativeModelContextAdapter.DEFAULT_INPUT_SCHEMA;
        const normalizedInput = normalizeSchema(inputSchema, { strict: true });
        const normalizedOutput = tool.outputSchema
          ? normalizeSchema(tool.outputSchema, { strict: true })
          : null;

        return {
          ...tool,
          inputSchema: normalizedInput.jsonSchema,
          ...(normalizedOutput && { outputSchema: normalizedOutput.jsonSchema }),
        };
      });
    }

    this.nativeProvideContext(normalizedContext);
    this.syncToolsFromNative('adapter.provideContext');
  }

  registerTool<
    TInputSchema extends ZodSchemaObject = Record<string, never>,
    TOutputSchema extends ZodSchemaObject = Record<string, never>,
  >(tool: ToolDescriptor<TInputSchema, TOutputSchema>): void {
    const normalizedTool = this.normalizeToolForNativeRegistration(tool);
    if (this.bridge.tools.has(normalizedTool.name)) {
      throw new Error(`Tool already registered: ${normalizedTool.name}`);
    }
    this.nativeRegisterTool(normalizedTool);
    this.syncToolsFromNative('adapter.registerTool');
  }

  unregisterTool(name: string): void {
    this.nativeUnregisterTool(name);
    this.syncToolsFromNative('adapter.unregisterTool');
  }

  clearContext(): void {
    this.nativeClearContext();
    this.syncToolsFromNative('adapter.clearContext');
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
      if (this.nativeAddEventListener) {
        this.nativeAddEventListener('toolcall', listener as EventListener, options);
      } else {
        this.fallbackEventTarget.addEventListener('toolcall', listener as EventListener, options);
      }
      return;
    }

    if (this.nativeAddEventListener) {
      this.nativeAddEventListener('toolschanged', listener as () => void, options);
    } else {
      this.fallbackEventTarget.addEventListener('toolschanged', listener as EventListener, options);
    }
  }

  removeEventListener(
    type: 'toolcall' | 'toolschanged',
    listener: ((event: ToolCallEvent) => void | Promise<void>) | (() => void),
    options?: boolean | EventListenerOptions
  ): void {
    if (type === 'toolcall') {
      if (this.nativeRemoveEventListener) {
        this.nativeRemoveEventListener('toolcall', listener as EventListener, options);
      } else {
        this.fallbackEventTarget.removeEventListener(
          'toolcall',
          listener as EventListener,
          options
        );
      }
      return;
    }

    if (this.nativeRemoveEventListener) {
      this.nativeRemoveEventListener('toolschanged', listener as () => void, options);
    } else {
      this.fallbackEventTarget.removeEventListener(
        'toolschanged',
        listener as EventListener,
        options
      );
    }
  }

  dispatchEvent(event: Event): boolean {
    if (this.nativeDispatchEvent) {
      return this.nativeDispatchEvent(event);
    }
    return this.fallbackEventTarget.dispatchEvent(event);
  }

  async createMessage(params: SamplingRequestParams): Promise<SamplingResult> {
    return requireCreateMessageCapability(this.bridge.tabServer)(params);
  }

  async elicitInput(params: ElicitationParams): Promise<ElicitationResult> {
    return requireElicitInputCapability(this.bridge.tabServer)(params);
  }
}
