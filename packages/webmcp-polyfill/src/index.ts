import type {
  ChromeModelContextExecuteToolOptions,
  ModelContext,
  ModelContextGetToolOptions,
  ModelContextRegisterToolOptions,
  ModelContextTesting,
  ModelContextTestingToolInfo,
  ModelContextTool,
  RegisteredTool,
  WebMcpToolInput,
} from '@mcp-b/webmcp-types';
import {
  coerceWebMcpToolDescriptor,
  createInvalidStateError,
  createToolInvocationFailedError,
  createUnknownError,
  parseChromeToolInput,
  serializeChromeToolResult,
  serializeInputSchema,
  toWebMcpAnnotations,
  validateExecutableOrigin,
  validatePotentiallyTrustworthyOrigins,
  validateWebMcpAccess,
  validateWebMcpToolDescriptor,
  withAbortSignal,
} from './schema.js';

const POLYFILL_MARKER_PROPERTY = '__isWebMCPPolyfill' as const;
const REGISTERED_INPUT_SCHEMA_SYMBOL = Symbol('registeredInputSchema');
const REGISTRATION_SIGNAL_SYMBOL = Symbol('registrationSignal');
const REGISTRATION_ABORT_SYMBOL = Symbol('registrationAbort');

interface PolyfillToolDescriptor extends Omit<ModelContextTool<WebMcpToolInput>, 'execute'> {
  execute(input: WebMcpToolInput): unknown;
  [REGISTERED_INPUT_SCHEMA_SYMBOL]?: string;
  [REGISTRATION_SIGNAL_SYMBOL]?: AbortSignal;
  [REGISTRATION_ABORT_SYMBOL]?: () => void;
}

interface InstalledProperty {
  target: object;
  key: PropertyKey;
  previous: PropertyDescriptor | undefined;
}

const installedProperties: InstalledProperty[] = [];
let installedContext: StrictWebMCPContext | null = null;

function installProperty(target: object, key: PropertyKey, descriptor: PropertyDescriptor): void {
  const previous = Object.getOwnPropertyDescriptor(target, key);
  try {
    Object.defineProperty(target, key, descriptor);
  } catch (error) {
    cleanupWebMCPPolyfill();
    throw error;
  }
  installedProperties.push({ target, key, previous });
}

export interface WebMCPPolyfillInitOptions {
  /**
   * Controls installation of navigator.modelContextTesting when this polyfill provides modelContext.
   * The shim is testing-only and never replaces an existing implementation.
   * @default false
   */
  installTestingShim?: boolean;
}

class StrictWebMCPContext extends EventTarget implements ModelContext {
  readonly [POLYFILL_MARKER_PROPERTY] = true;
  private readonly tools = new Map<string, PolyfillToolDescriptor>();
  private testingShim: PolyfillTestingShim | null = null;
  private _ontoolchange: ((this: ModelContext, ev: Event) => unknown) | null = null;
  private readonly ontoolchangeListener: EventListener = (event) => {
    this._ontoolchange?.call(this, event);
  };
  private readonly DOMExceptionConstructor: typeof DOMException;

  constructor(private readonly ownerDocument: Document | null) {
    super();
    this.DOMExceptionConstructor = ownerDocument?.defaultView?.DOMException ?? DOMException;
  }

  get ontoolchange(): ((this: ModelContext, ev: Event) => unknown) | null {
    return this._ontoolchange;
  }

  set ontoolchange(handler: ((this: ModelContext, ev: Event) => unknown) | null) {
    const listener = typeof handler === 'function' ? handler : null;
    if (listener === null) {
      this._ontoolchange = null;
      super.removeEventListener('toolchange', this.ontoolchangeListener);
      return;
    }

    if (this._ontoolchange === null) {
      super.addEventListener('toolchange', this.ontoolchangeListener);
    }
    this._ontoolchange = listener;
  }

  async registerTool<TArgs extends WebMcpToolInput>(
    tool: ModelContextTool<TArgs>,
    options?: ModelContextRegisterToolOptions
  ): Promise<void> {
    validateWebMcpAccess(this.ownerDocument);
    const signal = options?.signal;
    const normalized = normalizeToolDescriptor(tool, this.tools);
    signal?.throwIfAborted();
    validatePotentiallyTrustworthyOrigins(options?.exposedTo);
    signal?.throwIfAborted();
    if (options?.exposedTo?.length) {
      throw new this.DOMExceptionConstructor(
        'Cross-document tool exposure requires native WebMCP',
        'NotSupportedError'
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

  private removeTool(name: string, expected?: PolyfillToolDescriptor): boolean {
    const registered = this.tools.get(name);
    if (!registered || (expected && registered !== expected)) return false;
    const signal = registered[REGISTRATION_SIGNAL_SYMBOL];
    const abort = registered[REGISTRATION_ABORT_SYMBOL];
    if (signal && abort) signal.removeEventListener('abort', abort);
    return this.tools.delete(name);
  }

  async getTools(options?: ModelContextGetToolOptions): Promise<RegisteredTool[]> {
    validateWebMcpAccess(this.ownerDocument);
    validatePotentiallyTrustworthyOrigins(options?.fromOrigins);
    if (options?.fromOrigins?.length) {
      throw new this.DOMExceptionConstructor(
        'Cross-document tool discovery requires native WebMCP',
        'NotSupportedError'
      );
    }
    const tools = this.getRegisteredToolInfos();
    await new Promise((resolve) => setTimeout(resolve, 0));
    return tools;
  }

  async executeTool(
    tool: RegisteredTool,
    inputArgsJson: string,
    options?: ChromeModelContextExecuteToolOptions
  ): Promise<string | null> {
    validateWebMcpAccess(this.ownerDocument);
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
    return this.invokeToolByName(tool.name, inputArgsJson, options);
  }

  getTestingShim(): PolyfillTestingShim {
    if (!this.testingShim) {
      this.testingShim = new PolyfillTestingShim(this);
    }
    return this.testingShim;
  }

  /** @internal Used by PolyfillTestingShim */
  getToolInfos(): ModelContextTestingToolInfo[] {
    return [...this.tools.values()].map((tool) => ({
      name: tool.name,
      description: tool.description,
      ...(tool[REGISTERED_INPUT_SCHEMA_SYMBOL] === undefined
        ? {}
        : { inputSchema: tool[REGISTERED_INPUT_SCHEMA_SYMBOL] }),
    }));
  }

  /** @internal Used by getTools() */
  getRegisteredToolInfos(): RegisteredTool[] {
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
    options?: ChromeModelContextExecuteToolOptions
  ): Promise<string | null> {
    validateWebMcpAccess(this.ownerDocument);
    return this.invokeToolByName(toolName, inputArgsJson, options);
  }

  private async invokeToolByName(
    toolName: string,
    inputArgsJson: string,
    options: ChromeModelContextExecuteToolOptions | undefined
  ): Promise<string | null> {
    options?.signal?.throwIfAborted();

    const tool = this.tools.get(toolName);
    if (!tool) {
      throw createUnknownError(`Tool not found: ${toolName}`);
    }

    const args = parseChromeToolInput(inputArgsJson);
    options?.signal?.throwIfAborted();
    if (tool[REGISTRATION_SIGNAL_SYMBOL]?.aborted) throw createUnknownError('Tool unregistered');

    let rawResult: unknown;
    try {
      const registrationSignal = tool[REGISTRATION_SIGNAL_SYMBOL];
      const execution = withAbortSignal(
        Promise.resolve(tool.execute(args)),
        registrationSignal,
        () => createUnknownError('Tool unregistered')
      );
      rawResult = await withAbortSignal(execution, options?.signal);
    } catch (error) {
      if (options?.signal?.aborted && error === options.signal.reason) throw error;
      if (tool[REGISTRATION_SIGNAL_SYMBOL]?.aborted) throw error;
      throw createToolInvocationFailedError(error);
    }

    return serializeChromeToolResult(rawResult);
  }

  private async notifyToolsChanged(): Promise<void> {
    // ponytail: the platform does not expose its WebMCP task source; a timer
    // preserves task (rather than microtask) ordering for local registrations.
    await new Promise((resolve) => setTimeout(resolve, 0));
    this.dispatchEvent(new Event('toolchange'));
    this.testingShim?.dispatchToolChange();
  }

  dispose(): void {
    for (const name of this.tools.keys()) this.removeTool(name);
    this.ontoolchange = null;
    this.testingShim?.dispose();
  }
}

const modelContextConstructor = {
  ModelContext(): never {
    throw new TypeError('Illegal constructor');
  },
}.ModelContext;

Object.defineProperty(modelContextConstructor, 'prototype', {
  value: StrictWebMCPContext.prototype,
});
Object.defineProperty(StrictWebMCPContext.prototype, 'constructor', {
  configurable: true,
  writable: true,
  value: modelContextConstructor,
});
Object.defineProperty(StrictWebMCPContext.prototype, Symbol.toStringTag, {
  configurable: true,
  value: 'ModelContext',
});

/**
 * EventTarget-based testing shim matching the native Chromium ModelContextTesting surface.
 *
 * Fires `toolchange` events and supports the `ontoolchange` handler property.
 */
class PolyfillTestingShim extends EventTarget implements ModelContextTesting {
  private _ontoolchange: ((this: ModelContextTesting, ev: Event) => unknown) | null = null;
  private readonly ontoolchangeListener: EventListener = (event) => {
    this._ontoolchange?.call(this, event);
  };

  constructor(private readonly context: StrictWebMCPContext) {
    super();
  }

  listTools(): ModelContextTestingToolInfo[] {
    return this.context.getToolInfos();
  }

  executeTool(
    toolName: string,
    inputArgsJson: string,
    options?: ChromeModelContextExecuteToolOptions
  ): Promise<string | null> {
    return this.context.executeToolForTesting(toolName, inputArgsJson, options);
  }

  get ontoolchange(): ((this: ModelContextTesting, ev: Event) => unknown) | null {
    return this._ontoolchange;
  }

  set ontoolchange(handler: ((this: ModelContextTesting, ev: Event) => unknown) | null) {
    const listener = typeof handler === 'function' ? handler : null;
    if (listener === null) {
      this._ontoolchange = null;
      super.removeEventListener('toolchange', this.ontoolchangeListener);
      return;
    }

    if (this._ontoolchange === null) {
      super.addEventListener('toolchange', this.ontoolchangeListener);
    }
    this._ontoolchange = listener;
  }

  /** @internal Called by StrictWebMCPContext when tools change. */
  dispatchToolChange(): void {
    this.dispatchEvent(new Event('toolchange'));
  }

  dispose(): void {
    this.ontoolchange = null;
  }
}

function normalizeToolDescriptor<TArgs extends WebMcpToolInput>(
  tool: ModelContextTool<TArgs>,
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

  const registeredInputSchema =
    coerced.inputSchema === undefined ? undefined : serializeInputSchema(coerced.inputSchema);

  return {
    name: coerced.name,
    ...(coerced.title === undefined ? {} : { title: coerced.title }),
    description: coerced.description,
    ...(coerced.inputSchema === undefined ? {} : { inputSchema: coerced.inputSchema }),
    ...(coerced.annotations === undefined ? {} : { annotations: coerced.annotations }),
    execute: (input) => Reflect.apply(coerced.execute, undefined, [input]),
    ...(registeredInputSchema !== undefined
      ? { [REGISTERED_INPUT_SCHEMA_SYMBOL]: registeredInputSchema }
      : {}),
  };
}

let navigatorModelContextDeprecationWarned = false;

// Per webmachinelearning/webmcp#173 / PR #184, the modelContext getter moved
// from Navigator to Document. We install on document.modelContext as the
// primary surface and expose navigator.modelContext as a deprecated alias that
// returns the same instance and logs a one-time console warning on first
// access. This mirrors the deprecation behavior shipped in Chrome 150.
function defineDeprecatedNavigatorModelContext(target: Navigator, value: ModelContext): void {
  installProperty(target, 'modelContext', {
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
  const nav = typeof navigator === 'undefined' ? null : navigator;
  const doc = typeof document === 'undefined' ? null : document;
  if (!nav || !doc || typeof window === 'undefined') return;

  if (doc.modelContext) return;

  const navigatorModelContext = nav.modelContext;

  if (installedProperties.length > 0) {
    cleanupWebMCPPolyfill();
  }

  if (navigatorModelContext) {
    installProperty(doc, 'modelContext', {
      configurable: true,
      enumerable: true,
      writable: false,
      value: navigatorModelContext,
    });
    return;
  }

  const previousDescriptor = Object.getOwnPropertyDescriptor(window, 'ModelContext');
  if (previousDescriptor && !previousDescriptor.configurable) {
    if (!Object.is(Reflect.get(window, 'ModelContext'), modelContextConstructor)) {
      throw new TypeError('Cannot install ModelContext over a non-configurable global');
    }
  } else {
    installProperty(window, 'ModelContext', {
      configurable: true,
      enumerable: false,
      writable: true,
      value: modelContextConstructor,
    });
  }

  const context = new StrictWebMCPContext(doc);
  installedContext = context;
  const modelContext: ModelContext = context;

  installProperty(doc, 'modelContext', {
    configurable: true,
    enumerable: true,
    writable: false,
    value: modelContext,
  });

  // Reset the one-shot warning flag so a fresh install warns again on first access.
  navigatorModelContextDeprecationWarned = false;
  defineDeprecatedNavigatorModelContext(nav, modelContext);

  if (options?.installTestingShim && !nav.modelContextTesting) {
    installProperty(nav, 'modelContextTesting', {
      configurable: true,
      enumerable: true,
      writable: false,
      value: context.getTestingShim(),
    });
  }
}

export function cleanupWebMCPPolyfill(): void {
  installedContext?.dispose();
  installedContext = null;
  for (const { target, key, previous } of [...installedProperties].reverse()) {
    if (previous) Object.defineProperty(target, key, previous);
    else Reflect.deleteProperty(target, key);
  }
  installedProperties.length = 0;
  navigatorModelContextDeprecationWarned = false;
}
