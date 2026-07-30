import type {
  InputSchema,
  ModelContext,
  ModelContextGetToolOptions,
  ModelContextRegisterToolOptions,
  ModelContextTesting,
  ModelContextTestingExecuteToolOptions,
  ModelContextTestingToolInfo,
  ModelContextToolInfo,
  ModelContextToolReference,
  ToolDescriptor,
  ToolResponse,
} from '@mcp-b/webmcp-types';
import {
  coerceWebMcpToolDescriptor,
  createInvalidStateError,
  createUnknownError,
  isPlainObject,
  normalizeToolResponse,
  normalizeInputSchema,
  parseChromeToolInput,
  serializeChromeToolResult,
  toWebMcpAnnotations,
  validateExecutableOrigin,
  validateOriginAgentCluster,
  validatePotentiallyTrustworthyOrigins,
  validateWebMcpToolDescriptor,
  withAbortSignal,
  withRegistrationLifetime,
} from './schema.js';

const TOOL_INVOCATION_FAILED_MESSAGE =
  'Tool was executed but the invocation failed. For example, the script function threw an error';
const POLYFILL_MARKER_PROPERTY = '__isWebMCPPolyfill' as const;
const REGISTERED_INPUT_SCHEMA_SYMBOL = Symbol('registeredInputSchema');
const REGISTRATION_SIGNAL_SYMBOL = Symbol('registrationSignal');
const REGISTRATION_ABORT_SYMBOL = Symbol('registrationAbort');

interface PolyfillToolDescriptor extends ToolDescriptor<Record<string, unknown>, unknown, string> {
  inputSchema: InputSchema;
  [REGISTERED_INPUT_SCHEMA_SYMBOL]?: string;
  [REGISTRATION_SIGNAL_SYMBOL]?: AbortSignal;
  [REGISTRATION_ABORT_SYMBOL]?: () => void;
}

interface InstallState {
  installed: boolean;
  previousNavigatorModelContextDescriptor: PropertyDescriptor | undefined;
  previousNavigatorModelContextTestingDescriptor: PropertyDescriptor | undefined;
  previousDocumentModelContextDescriptor: PropertyDescriptor | undefined;
  installedNavigatorModelContext: boolean;
  installedNavigatorModelContextTesting: boolean;
  installedDocumentModelContext: boolean;
}

const installState: InstallState = {
  installed: false,
  previousNavigatorModelContextDescriptor: undefined,
  previousNavigatorModelContextTestingDescriptor: undefined,
  previousDocumentModelContextDescriptor: undefined,
  installedNavigatorModelContext: false,
  installedNavigatorModelContextTesting: false,
  installedDocumentModelContext: false,
};

export interface WebMCPPolyfillInitOptions {
  /**
   * Controls whether the polyfill auto-initializes when loaded.
   * Set to false to prevent auto-initialization; then call initializeWebMCPPolyfill() manually.
   * @default true
   */
  autoInitialize?: boolean;

  /**
   * Controls installation of navigator.modelContextTesting when this polyfill provides modelContext.
   * - true or 'if-missing' (default): install only when modelContextTesting is missing.
   * - 'always': install even when modelContextTesting already exists.
   * - false: do not install.
   * @default 'if-missing'
   */
  installTestingShim?: boolean | 'always' | 'if-missing';
}

class StrictWebMCPContext extends EventTarget {
  readonly [POLYFILL_MARKER_PROPERTY] = true;
  private tools = new Map<string, PolyfillToolDescriptor>();
  private testingShim: PolyfillTestingShim | null = null;
  private _ontoolchange: ((this: ModelContext, ev: Event) => unknown) | null = null;
  private ontoolchangeListenerInstalled = false;
  private unregisterToolDeprecationWarned = false;
  private crossOriginDiscoveryWarned = false;
  private crossOriginExposureWarned = false;

  get ontoolchange(): ((this: ModelContext, ev: Event) => unknown) | null {
    return this._ontoolchange;
  }

  set ontoolchange(handler: ((this: ModelContext, ev: Event) => unknown) | null) {
    this._ontoolchange = handler;
    if (handler && !this.ontoolchangeListenerInstalled) {
      this.ontoolchangeListenerInstalled = true;
      super.addEventListener('toolchange', (event) => {
        this._ontoolchange?.call(this as unknown as ModelContext, event);
      });
    }
  }

  async registerTool(
    tool: ToolDescriptor,
    options?: ModelContextRegisterToolOptions
  ): Promise<void> {
    validateOriginAgentCluster();
    const signal = options?.signal;
    const normalized = normalizeToolDescriptor(tool, this.tools);
    signal?.throwIfAborted();
    validatePotentiallyTrustworthyOrigins(options?.exposedTo);
    if (options?.exposedTo?.length && !this.crossOriginExposureWarned) {
      this.crossOriginExposureWarned = true;
      console.warn(
        '[WebMCPPolyfill] Cross-document exposedTo enforcement requires native WebMCP and is not available in the local polyfill.'
      );
    }
    this.tools.set(normalized.name, normalized);

    if (signal) {
      const abort = () => {
        if (this.removeTool(normalized.name, normalized)) void this.notifyToolsChanged();
      };
      normalized[REGISTRATION_SIGNAL_SYMBOL] = signal;
      normalized[REGISTRATION_ABORT_SYMBOL] = abort;
      signal.addEventListener('abort', abort, { once: true });
    }

    await this.notifyToolsChanged();
    if (signal?.aborted) throw signal.reason;
  }

  unregisterTool(nameOrTool: string | ModelContextToolReference): void {
    this.warnUnregisterToolDeprecationOnce();

    const name = getToolNameForUnregister(nameOrTool);
    if (this.removeTool(name)) void this.notifyToolsChanged();
  }

  private removeTool(name: string, expected?: PolyfillToolDescriptor): boolean {
    const registered = this.tools.get(name);
    if (!registered || (expected && registered !== expected)) return false;
    const signal = registered[REGISTRATION_SIGNAL_SYMBOL];
    const abort = registered[REGISTRATION_ABORT_SYMBOL];
    if (signal && abort) signal.removeEventListener('abort', abort);
    return this.tools.delete(name);
  }

  async getTools(options?: ModelContextGetToolOptions): Promise<ModelContextToolInfo[]> {
    validateOriginAgentCluster();
    validatePotentiallyTrustworthyOrigins(options?.fromOrigins);
    if (options?.fromOrigins?.length && !this.crossOriginDiscoveryWarned) {
      this.crossOriginDiscoveryWarned = true;
      console.warn(
        '[WebMCPPolyfill] Cross-document getTools({ fromOrigins }) discovery requires native WebMCP and is not available in the local polyfill.'
      );
    }
    const tools = this.getRegisteredToolInfos();
    await new Promise((resolve) => setTimeout(resolve, 0));
    return tools;
  }

  async executeTool(
    tool: ModelContextToolInfo,
    inputArgsJson: string,
    options?: ModelContextTestingExecuteToolOptions
  ): Promise<string | null> {
    validateOriginAgentCluster();
    if (tool === null || typeof tool !== 'object') {
      throw new TypeError('RegisteredTool must be an object');
    }
    for (const required of ['name', 'description', 'window', 'origin'] as const) {
      if (!(required in tool)) {
        throw new TypeError(`RegisteredTool.${required} is required`);
      }
    }
    validateExecutableOrigin(tool.origin);
    if (tool.window !== globalThis.window || tool.origin !== (globalThis.location?.origin ?? '')) {
      throw createUnknownError(`Tool not found: ${tool.name}`);
    }
    return this.executeToolByName(tool.name, inputArgsJson, options, false);
  }

  getTestingShim(): PolyfillTestingShim {
    if (!this.testingShim) {
      this.testingShim = new PolyfillTestingShim(this);
    }
    return this.testingShim;
  }

  /** @internal Used by PolyfillTestingShim */
  getToolInfos(): ModelContextTestingToolInfo[] {
    return [...this.tools.values()].map((tool) => {
      let inputSchema: string;
      try {
        inputSchema = JSON.stringify(tool.inputSchema ?? { type: 'object' });
      } catch {
        inputSchema = '{"type":"object"}';
      }
      return { name: tool.name, description: tool.description, inputSchema };
    });
  }

  /** @internal Used by getTools() */
  getRegisteredToolInfos(): ModelContextToolInfo[] {
    return [...this.tools.values()]
      .map((tool) => ({
        name: tool.name,
        title: tool.title ?? '',
        description: tool.description,
        ...(tool[REGISTERED_INPUT_SCHEMA_SYMBOL] !== undefined
          ? { inputSchema: tool[REGISTERED_INPUT_SCHEMA_SYMBOL] }
          : {}),
        origin: globalThis.location?.origin ?? '',
        window: globalThis.window,
        ...(tool.annotations ? { annotations: toWebMcpAnnotations(tool.annotations) } : {}),
      }))
      .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  }

  /** @internal Used by PolyfillTestingShim */
  async executeToolForTesting(
    toolName: string,
    inputArgsJson: string,
    options?: ModelContextTestingExecuteToolOptions
  ): Promise<string | null> {
    return this.executeToolByName(toolName, inputArgsJson, options, true);
  }

  private async executeToolByName(
    toolName: string,
    inputArgsJson: string,
    options: ModelContextTestingExecuteToolOptions | undefined,
    normalizeResult: boolean
  ): Promise<string | null> {
    options?.signal?.throwIfAborted();

    const tool = this.tools.get(toolName);
    if (!tool) {
      throw createUnknownError(`Tool not found: ${toolName}`);
    }

    const args = parseChromeToolInput(inputArgsJson);
    options?.signal?.throwIfAborted();
    if (tool[REGISTRATION_SIGNAL_SYMBOL]?.aborted) throw createUnknownError('Tool unregistered');

    try {
      const execute = tool.execute as (input: Record<string, unknown>) => unknown;
      const execution = withRegistrationLifetime(
        Promise.resolve(execute(args)),
        tool[REGISTRATION_SIGNAL_SYMBOL]
      );
      const rawResult = await withAbortSignal(execution, options?.signal);
      if (normalizeResult) {
        return toSerializedTestingResult(normalizeToolResponse(rawResult));
      }
      return serializeChromeToolResult(rawResult);
    } catch (error) {
      if (options?.signal?.aborted && error === options.signal.reason) throw error;
      const detail =
        error instanceof Error
          ? `${TOOL_INVOCATION_FAILED_MESSAGE}: ${error.message}`
          : TOOL_INVOCATION_FAILED_MESSAGE;
      throw createUnknownError(detail);
    }
  }

  private notifyToolsChanged(): Promise<void> {
    return new Promise((resolve) => {
      // ponytail: the platform does not expose its WebMCP task source; a timer
      // preserves task (rather than microtask) ordering for local registrations.
      setTimeout(() => {
        this.dispatchEvent(new Event('toolchange'));
        this.testingShim?.dispatchToolChange();
        resolve();
      }, 0);
    });
  }

  private warnUnregisterToolDeprecationOnce(): void {
    if (this.unregisterToolDeprecationWarned) {
      return;
    }

    this.unregisterToolDeprecationWarned = true;
    console.warn(
      '[WebMCPPolyfill] document.modelContext.unregisterTool() is deprecated. The April 23, 2026 WebMCP draft removed it in favor of registerTool(tool, { signal }) — pass an AbortSignal and abort it to unregister.'
    );
  }
}

/**
 * EventTarget-based testing shim matching the native Chromium ModelContextTesting surface.
 *
 * Fires `toolchange` events and supports the `ontoolchange` handler property,
 * matching the native Chromium 148 API. The deprecated `registerToolsChangedCallback`
 * is kept as a compat layer that wraps `addEventListener`.
 */
class PolyfillTestingShim extends EventTarget implements ModelContextTesting {
  private context: StrictWebMCPContext;
  private _ontoolchange: ((this: ModelContextTesting, ev: Event) => unknown) | null = null;
  private ontoolchangeListenerInstalled = false;

  constructor(context: StrictWebMCPContext) {
    super();
    this.context = context;
  }

  listTools(): ModelContextTestingToolInfo[] {
    return this.context.getToolInfos();
  }

  executeTool(
    toolName: string,
    inputArgsJson: string,
    options?: ModelContextTestingExecuteToolOptions
  ): Promise<string | null> {
    return this.context.executeToolForTesting(toolName, inputArgsJson, options);
  }

  getCrossDocumentScriptToolResult(): Promise<string> {
    return Promise.resolve('[]');
  }

  get ontoolchange(): ((this: ModelContextTesting, ev: Event) => unknown) | null {
    return this._ontoolchange;
  }

  set ontoolchange(handler: ((this: ModelContextTesting, ev: Event) => unknown) | null) {
    this._ontoolchange = handler;
    if (handler && !this.ontoolchangeListenerInstalled) {
      this.ontoolchangeListenerInstalled = true;
      super.addEventListener('toolchange', (event) => {
        this._ontoolchange?.call(this, event);
      });
    }
  }

  /**
   * @deprecated Use `addEventListener('toolchange', callback)` instead.
   * Kept for backward compatibility with older polyfill consumers.
   */
  registerToolsChangedCallback(callback: () => void): void {
    if (typeof callback !== 'function') {
      throw new TypeError(
        "Failed to execute 'registerToolsChangedCallback' on 'ModelContextTesting': parameter 1 is not of type 'Function'."
      );
    }
    this.addEventListener('toolchange', callback);
  }

  /** @internal Called by StrictWebMCPContext when tools change. */
  dispatchToolChange(): void {
    this.dispatchEvent(new Event('toolchange'));
    // Deprecated compat: fire old event name so existing listeners keep working
    this.dispatchEvent(new Event('toolschanged'));
  }
}

function getToolNameForUnregister(nameOrTool: string | ModelContextToolReference): string {
  if (typeof nameOrTool === 'string') {
    return nameOrTool;
  }

  if (isPlainObject(nameOrTool) && typeof nameOrTool.name === 'string') {
    return nameOrTool.name;
  }

  throw new TypeError(
    "Failed to execute 'unregisterTool' on 'ModelContext': parameter 1 must be a string or an object with a string name."
  );
}

function normalizeToolDescriptor(
  tool: ToolDescriptor,
  existing: Map<string, PolyfillToolDescriptor>
): PolyfillToolDescriptor {
  if (!tool || typeof tool !== 'object') {
    throw new TypeError('registerTool(tool) requires a tool object');
  }

  const coerced = coerceWebMcpToolDescriptor(tool);

  validateWebMcpToolDescriptor(coerced);

  if (existing.has(coerced.name)) {
    throw createInvalidStateError(`Tool already registered: ${coerced.name}`);
  }

  const normalizedInputSchema = normalizeInputSchema(coerced.inputSchema);

  const registeredInputSchema = normalizedInputSchema.registeredInputSchema;

  return {
    ...coerced,
    inputSchema: normalizedInputSchema.inputSchema,
    ...(registeredInputSchema !== undefined
      ? { [REGISTERED_INPUT_SCHEMA_SYMBOL]: registeredInputSchema }
      : {}),
  };
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
    const firstText = getFirstTextBlock(result);
    const message = firstText?.replace(/^Error:\s*/i, '').trim() || TOOL_INVOCATION_FAILED_MESSAGE;
    throw createUnknownError(message);
  }

  const metadata = (result as ToolResponse & { metadata?: { willNavigate?: boolean } }).metadata;
  if (metadata && typeof metadata === 'object' && metadata.willNavigate) {
    return null;
  }

  try {
    return JSON.stringify(result);
  } catch {
    throw createUnknownError(TOOL_INVOCATION_FAILED_MESSAGE);
  }
}

function getNavigator(): Navigator | null {
  if (typeof navigator !== 'undefined') {
    return navigator;
  }

  return null;
}

function getDocument(): Document | null {
  if (typeof document !== 'undefined') {
    return document;
  }

  return null;
}

function defineDocumentModelContextProperty(target: Document, value: ModelContext): void {
  Object.defineProperty(target, 'modelContext', {
    configurable: true,
    enumerable: true,
    writable: false,
    value,
  });
}

let navigatorModelContextDeprecationWarned = false;

// Per webmachinelearning/webmcp#173 / PR #184, the modelContext getter moved
// from Navigator to Document. We install on document.modelContext as the
// primary surface and expose navigator.modelContext as a deprecated alias that
// returns the same instance and logs a one-time console warning on first
// access. This mirrors the deprecation behavior shipped in Chrome 150.
function defineDeprecatedNavigatorModelContext(target: Navigator, value: ModelContext): void {
  Object.defineProperty(target, 'modelContext', {
    configurable: true,
    enumerable: true,
    get() {
      if (!navigatorModelContextDeprecationWarned) {
        navigatorModelContextDeprecationWarned = true;
        console.warn(
          '[WebMCPPolyfill] navigator.modelContext is deprecated. The May 27, 2026 WebMCP draft moved the modelContext getter from Navigator to Document — use document.modelContext instead. See https://github.com/webmachinelearning/webmcp/pull/184.'
        );
      }
      return value;
    },
  });
}

export function initializeWebMCPPolyfill(options?: WebMCPPolyfillInitOptions): void {
  if (globalThis.isSecureContext === false) return;
  const nav = getNavigator();
  const doc = getDocument();
  if (!nav && !doc) {
    return;
  }

  if (doc?.modelContext) return;

  const navigatorModelContext = nav?.modelContext;

  if (installState.installed) {
    cleanupWebMCPPolyfill();
  }

  if (navigatorModelContext) {
    if (doc) {
      installState.previousDocumentModelContextDescriptor = Object.getOwnPropertyDescriptor(
        doc,
        'modelContext'
      );
      defineDocumentModelContextProperty(doc, navigatorModelContext);
      installState.installedDocumentModelContext = true;
      installState.installed = true;
    }
    return;
  }

  const context = new StrictWebMCPContext();
  const modelContext = context as unknown as ModelContext;

  if (doc) {
    installState.previousDocumentModelContextDescriptor = Object.getOwnPropertyDescriptor(
      doc,
      'modelContext'
    );
    defineDocumentModelContextProperty(doc, modelContext);
    installState.installedDocumentModelContext = true;
  }

  if (nav) {
    installState.previousNavigatorModelContextDescriptor = Object.getOwnPropertyDescriptor(
      nav,
      'modelContext'
    );
    installState.previousNavigatorModelContextTestingDescriptor = Object.getOwnPropertyDescriptor(
      nav,
      'modelContextTesting'
    );

    // Reset the one-shot warning flag so a fresh install warns again on first access.
    navigatorModelContextDeprecationWarned = false;
    defineDeprecatedNavigatorModelContext(nav, modelContext);
    installState.installedNavigatorModelContext = true;

    const installTestingShim = options?.installTestingShim ?? 'if-missing';
    const hasModelContextTesting = Boolean(nav.modelContextTesting);
    const shouldInstallTestingShim =
      installTestingShim === 'always' ||
      ((installTestingShim === true || installTestingShim === 'if-missing') &&
        !hasModelContextTesting);

    if (shouldInstallTestingShim) {
      Object.defineProperty(nav, 'modelContextTesting', {
        configurable: true,
        enumerable: true,
        writable: false,
        value: context.getTestingShim(),
      });
      installState.installedNavigatorModelContextTesting = true;
    }
  }

  installState.installed = true;
}

export function cleanupWebMCPPolyfill(): void {
  if (!installState.installed) {
    return;
  }

  const restore = (
    target: Navigator | Document,
    key: string,
    previousDescriptor: PropertyDescriptor | undefined
  ) => {
    if (previousDescriptor) {
      Object.defineProperty(target, key, previousDescriptor);
      return;
    }

    Reflect.deleteProperty(target, key);
  };

  const nav = getNavigator();
  const doc = getDocument();

  if (doc && installState.installedDocumentModelContext) {
    restore(doc, 'modelContext', installState.previousDocumentModelContextDescriptor);
  }
  if (nav && installState.installedNavigatorModelContext) {
    restore(nav, 'modelContext', installState.previousNavigatorModelContextDescriptor);
  }
  if (nav && installState.installedNavigatorModelContextTesting) {
    restore(
      nav,
      'modelContextTesting',
      installState.previousNavigatorModelContextTestingDescriptor
    );
  }

  installState.installed = false;
  installState.previousDocumentModelContextDescriptor = undefined;
  installState.previousNavigatorModelContextDescriptor = undefined;
  installState.previousNavigatorModelContextTestingDescriptor = undefined;
  installState.installedDocumentModelContext = false;
  installState.installedNavigatorModelContext = false;
  installState.installedNavigatorModelContextTesting = false;
  navigatorModelContextDeprecationWarned = false;
}

export { initializeWebMCPPolyfill as initializeWebModelContextPolyfill };

declare global {
  interface Window {
    __webMCPPolyfillOptions?: WebMCPPolyfillInitOptions;
  }
}

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  const options = window.__webMCPPolyfillOptions;
  const shouldAutoInitialize = options?.autoInitialize !== false;

  if (shouldAutoInitialize) {
    try {
      initializeWebMCPPolyfill(options);
    } catch (error) {
      console.error('[WebMCPPolyfill] Auto-initialization failed:', error);
    }
  }
}
