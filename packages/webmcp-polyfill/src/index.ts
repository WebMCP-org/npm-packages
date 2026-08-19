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
import {
  installDeclarativeForms,
  isAgentInvokedSubmitEvent,
  respondWithAgentSubmitEvent,
} from './declarative-forms.js';

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
let cleanupDeclarativeForms: (() => void) | null = null;

function currentOrigin(): string {
  return typeof globalThis.origin === 'string'
    ? globalThis.origin
    : (globalThis.location?.origin ?? '');
}

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
   *
   * Off by default so the polyfill stays spec-pure; modelContextTesting is a removed
   * Chromium preview API. `@mcp-b/global` deliberately opts in (its own default is true).
   * @default false
   */
  installTestingShim?: boolean;
}

class StrictWebMCPContext extends EventTarget implements ModelContext {
  // ECMAScript #private, not TypeScript `private`: TypeScript's modifier is
  // erased at build time and leaves ordinary own enumerable properties, which
  // leak through Object.keys/for..in/spread and make JSON.stringify throw on
  // the ownerDocument cycle. Chrome's ModelContext instance has no own keys.
  readonly #tools = new Map<string, PolyfillToolDescriptor>();
  #testingShim: PolyfillTestingShim | null = null;
  #ontoolchangeHandler: ((this: ModelContext, ev: Event) => unknown) | null = null;
  readonly #ontoolchangeListener: EventListener = (event) => {
    this.#ontoolchangeHandler?.call(this, event);
  };
  readonly #domException: typeof DOMException;
  readonly #ownerDocument: Document | null;

  constructor(ownerDocument: Document | null) {
    super();
    this.#ownerDocument = ownerDocument;
    this.#domException = ownerDocument?.defaultView?.DOMException ?? DOMException;
    // The sole deliberate exception to "Chrome's ModelContext has no own keys":
    // this is the documented polyfill-vs-native check, read by
    // e2e/web-standards-showcase/src/api/detection.ts and the e2e specs. Keeping
    // it non-enumerable means the instance still spreads, enumerates, and
    // JSON.stringify()s exactly like Chrome's.
    Object.defineProperty(this, POLYFILL_MARKER_PROPERTY, {
      value: true,
      enumerable: false,
      writable: false,
      configurable: false,
    });
  }

  get ontoolchange(): ((this: ModelContext, ev: Event) => unknown) | null {
    return this.#ontoolchangeHandler;
  }

  set ontoolchange(handler: ((this: ModelContext, ev: Event) => unknown) | null) {
    const listener = typeof handler === 'function' ? handler : null;
    if (listener === null) {
      this.#ontoolchangeHandler = null;
      super.removeEventListener('toolchange', this.#ontoolchangeListener);
      return;
    }

    if (this.#ontoolchangeHandler === null) {
      super.addEventListener('toolchange', this.#ontoolchangeListener);
    }
    this.#ontoolchangeHandler = listener;
  }

  // The `= {}` defaults on `options` here and in getTools/executeTool are
  // load-bearing: a defaulted parameter is excluded from Function.length, which
  // is what gives these three the arity WebIDL requires and idlharness checks
  // (1, 0, 2). The `options?.` reads stay too — a default only fills in
  // `undefined`, so an explicitly passed `null` still reaches the body.
  async registerTool<TArgs extends WebMcpToolInput>(
    tool: ModelContextTool<TArgs>,
    options: ModelContextRegisterToolOptions = {}
  ): Promise<void> {
    validateWebMcpAccess(this.#ownerDocument);
    const signal = options?.signal;
    const normalized = normalizeToolDescriptor(tool, this.#tools);
    signal?.throwIfAborted();
    validatePotentiallyTrustworthyOrigins(options?.exposedTo);
    signal?.throwIfAborted();
    if (options?.exposedTo?.length) {
      throw new this.#domException(
        'Cross-document tool exposure requires native WebMCP',
        'NotSupportedError'
      );
    }
    this.#tools.set(normalized.name, normalized);

    if (signal) {
      const abort = () => {
        if (this.#removeTool(normalized.name, normalized)) void this.#notifyToolsChanged();
      };
      normalized[REGISTRATION_SIGNAL_SYMBOL] = signal;
      normalized[REGISTRATION_ABORT_SYMBOL] = abort;
      signal.addEventListener('abort', abort, { once: true });
    }

    await this.#notifyToolsChanged();
    if (signal?.aborted) throw signal.reason;
  }

  async getTools(options: ModelContextGetToolOptions = {}): Promise<RegisteredTool[]> {
    validateWebMcpAccess(this.#ownerDocument);
    validatePotentiallyTrustworthyOrigins(options?.fromOrigins);
    if (options?.fromOrigins?.length) {
      throw new this.#domException(
        'Cross-document tool discovery requires native WebMCP',
        'NotSupportedError'
      );
    }
    const tools = [...this.#tools.values()]
      .map((tool) => ({
        name: tool.name,
        title: tool.title ?? '',
        description: tool.description,
        ...(tool[REGISTERED_INPUT_SCHEMA_SYMBOL] === undefined
          ? {}
          : { inputSchema: tool[REGISTERED_INPUT_SCHEMA_SYMBOL] }),
        origin: currentOrigin(),
        window: globalThis.window,
        ...(tool.annotations ? { annotations: toWebMcpAnnotations(tool.annotations) } : {}),
      }))
      .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    await new Promise((resolve) => setTimeout(resolve, 0));
    return tools;
  }

  async executeTool(
    tool: RegisteredTool,
    inputArgsJson: string,
    options: ChromeModelContextExecuteToolOptions = {}
  ): Promise<string | null> {
    validateWebMcpAccess(this.#ownerDocument);
    if (tool === null || typeof tool !== 'object') {
      throw new TypeError('RegisteredTool must be an object');
    }
    for (const required of ['name', 'description', 'window', 'origin'] as const) {
      if (!(required in tool)) {
        throw new TypeError(`RegisteredTool.${required} is required`);
      }
    }
    validateExecutableOrigin(tool.origin);
    if (tool.window !== globalThis.window || tool.origin !== currentOrigin()) {
      throw createUnknownError(`Tool not found: ${tool.name}`);
    }
    return this.#invokeToolByName(tool.name, inputArgsJson, options);
  }

  // Everything below is non-standard. `ModelContext.prototype` must expose only
  // the WebIDL members above, so the polyfill's own plumbing is either #private
  // (which gets no prototype slot at all) or static. The statics hang off this
  // module-private class binding, not off the exposed `ModelContext` interface
  // object, so no page script can reach them.

  /** @internal Used by initializeWebMCPPolyfill */
  static getTestingShim(context: StrictWebMCPContext): PolyfillTestingShim {
    context.#testingShim ??= new PolyfillTestingShim(context);
    return context.#testingShim;
  }

  /** @internal Used by PolyfillTestingShim */
  static getToolInfos(context: StrictWebMCPContext): ModelContextTestingToolInfo[] {
    return [...context.#tools.values()].map((tool) => ({
      name: tool.name,
      description: tool.description,
      ...(tool[REGISTERED_INPUT_SCHEMA_SYMBOL] === undefined
        ? {}
        : { inputSchema: tool[REGISTERED_INPUT_SCHEMA_SYMBOL] }),
    }));
  }

  /** @internal Used by PolyfillTestingShim */
  static executeToolForTesting(
    context: StrictWebMCPContext,
    toolName: string,
    inputArgsJson: string,
    options?: ChromeModelContextExecuteToolOptions
  ): Promise<string | null> {
    validateWebMcpAccess(context.#ownerDocument);
    return context.#invokeToolByName(toolName, inputArgsJson, options);
  }

  /** @internal Used by cleanupWebMCPPolyfill */
  static dispose(context: StrictWebMCPContext): void {
    for (const name of context.#tools.keys()) context.#removeTool(name);
    context.ontoolchange = null;
    context.#testingShim?.dispose();
  }

  #removeTool(name: string, expected?: PolyfillToolDescriptor): boolean {
    const registered = this.#tools.get(name);
    if (!registered || (expected && registered !== expected)) return false;
    const signal = registered[REGISTRATION_SIGNAL_SYMBOL];
    const abort = registered[REGISTRATION_ABORT_SYMBOL];
    if (signal && abort) signal.removeEventListener('abort', abort);
    return this.#tools.delete(name);
  }

  async #invokeToolByName(
    toolName: string,
    inputArgsJson: string,
    options: ChromeModelContextExecuteToolOptions | undefined
  ): Promise<string | null> {
    options?.signal?.throwIfAborted();

    const tool = this.#tools.get(toolName);
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

  async #notifyToolsChanged(): Promise<void> {
    // ponytail: the platform does not expose its WebMCP task source; a timer
    // preserves task (rather than microtask) ordering for local registrations.
    await new Promise((resolve) => setTimeout(resolve, 0));
    this.dispatchEvent(new Event('toolchange'));
    this.#testingShim?.dispatchToolChange();
  }
}

// A function *expression*, not a method shorthand: WebIDL interface objects must
// pass the IsConstructor check, and method shorthands have no [[Construct]].
const modelContextConstructor = function ModelContext(): never {
  throw new TypeError('Illegal constructor');
};

// Pinned explicitly: minifiers rename function expressions, and WebIDL requires
// the interface object's `name` to be the interface identifier.
Object.defineProperty(modelContextConstructor, 'name', { value: 'ModelContext' });
Object.defineProperty(modelContextConstructor, 'prototype', {
  value: StrictWebMCPContext.prototype,
  writable: false,
});
// WebIDL: an interface object's [[Prototype]] is the inherited interface's
// interface object. `interface ModelContext : EventTarget` therefore requires
// Object.getPrototypeOf(ModelContext) === EventTarget, not Function.prototype.
Object.setPrototypeOf(modelContextConstructor, EventTarget);
Object.defineProperty(StrictWebMCPContext.prototype, 'constructor', {
  configurable: true,
  writable: true,
  value: modelContextConstructor,
});
Object.defineProperty(StrictWebMCPContext.prototype, Symbol.toStringTag, {
  configurable: true,
  value: 'ModelContext',
});

// WebIDL members are enumerable on the interface prototype object; ECMAScript
// class members are not. `executeTool` is a Chrome extension, not spec IDL.
for (const member of ['registerTool', 'getTools', 'executeTool', 'ontoolchange'] as const) {
  const descriptor = Object.getOwnPropertyDescriptor(StrictWebMCPContext.prototype, member);
  if (descriptor) {
    Object.defineProperty(StrictWebMCPContext.prototype, member, {
      ...descriptor,
      enumerable: true,
    });
  }
}

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

  readonly #context: StrictWebMCPContext;

  constructor(context: StrictWebMCPContext) {
    super();
    this.#context = context;
  }

  listTools(): ModelContextTestingToolInfo[] {
    return StrictWebMCPContext.getToolInfos(this.#context);
  }

  executeTool(
    toolName: string,
    inputArgsJson: string,
    options?: ChromeModelContextExecuteToolOptions
  ): Promise<string | null> {
    return StrictWebMCPContext.executeToolForTesting(
      this.#context,
      toolName,
      inputArgsJson,
      options
    );
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

/**
 * Backing store for the `Document.prototype.modelContext` getter.
 *
 * WebIDL puts `[SameObject] readonly attribute ModelContext modelContext` on
 * the Document *interface prototype object*, not on the document instance, and
 * Chrome matches that. One shared accessor therefore needs somewhere to keep
 * the per-document value, and keying it by document is what makes repeated
 * reads return the identical object, as `[SameObject]` requires.
 */
const documentModelContexts = new WeakMap<Document, ModelContext>();

// A method shorthand, so it has no `prototype` and is not constructable, like a
// native getter. `name` is pinned because Chrome reports "get modelContext" and
// minifiers rename otherwise.
const { modelContext: documentModelContextGetter } = {
  modelContext(this: Document): ModelContext | undefined {
    // WebIDL brand check: the getter is only callable on a Document.
    // Document.prototype is not one, so reading it throws, as Chrome does.
    if (!(this instanceof Document)) {
      throw new TypeError('Illegal invocation');
    }
    return documentModelContexts.get(this);
  },
};
Object.defineProperty(documentModelContextGetter, 'name', { value: 'get modelContext' });

function defineDocumentModelContext(target: Document, value: ModelContext): void {
  documentModelContexts.set(target, value);
  if (Object.hasOwn(Document.prototype, 'modelContext')) return;
  installProperty(Document.prototype, 'modelContext', {
    configurable: true,
    enumerable: true,
    get: documentModelContextGetter,
  });
}

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

function installSubmitEventPolyfill(): void {
  const prototype = SubmitEvent.prototype;
  if (!('agentInvoked' in prototype)) {
    installProperty(prototype, 'agentInvoked', {
      configurable: true,
      enumerable: true,
      get(this: SubmitEvent) {
        return isAgentInvokedSubmitEvent(this);
      },
    });
  }
  if (!('respondWith' in prototype)) {
    installProperty(prototype, 'respondWith', {
      configurable: true,
      enumerable: true,
      writable: true,
      value(this: SubmitEvent, agentResponse: Promise<unknown>) {
        respondWithAgentSubmitEvent(this, agentResponse);
      },
    });
  }
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
    defineDocumentModelContext(doc, navigatorModelContext);
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

  defineDocumentModelContext(doc, context);

  // Reset the one-shot warning flag so a fresh install warns again on first access.
  navigatorModelContextDeprecationWarned = false;
  defineDeprecatedNavigatorModelContext(nav, context);
  installSubmitEventPolyfill();

  if (options?.installTestingShim && !nav.modelContextTesting) {
    installProperty(nav, 'modelContextTesting', {
      configurable: true,
      enumerable: true,
      writable: false,
      value: StrictWebMCPContext.getTestingShim(context),
    });
  }

  cleanupDeclarativeForms = installDeclarativeForms(doc, context);
}

export function cleanupWebMCPPolyfill(): void {
  cleanupDeclarativeForms?.();
  cleanupDeclarativeForms = null;
  if (installedContext) StrictWebMCPContext.dispose(installedContext);
  installedContext = null;
  for (const { target, key, previous } of [...installedProperties].reverse()) {
    if (previous) Object.defineProperty(target, key, previous);
    else Reflect.deleteProperty(target, key);
  }
  installedProperties.length = 0;
  navigatorModelContextDeprecationWarned = false;
}
