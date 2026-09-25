/*!
 * Copyright (c) 2026 WebMCP polyfill contributors
 * SPDX-License-Identifier: MIT
 */

import type { WebMCP } from 'webmcp-types';
import {
  FrameBridge,
  activeWindow,
  annotationNames,
  executionError,
  readToolsPolicy,
  type ToolMetadata,
} from './frames.js';
export type { WebMCP } from 'webmcp-types';

// Detached windows may stop exposing these bindings.
const NativeDOMException = globalThis.DOMException;
const getWindow = Object.getOwnPropertyDescriptor(globalThis, 'window')?.get;

interface StoredTool {
  metadata: ToolMetadata;
  execute: WebMCP.ToolExecuteCallback<object>;
  exposedTo: string[];
}

const contexts = new WeakMap<Document, ModelContextPolyfill>();

/**
 * Install WebMCP in the current window.
 *
 * Does nothing outside a secure browser context or when `document.modelContext`
 * already exists, including partial native implementations. Call before registering
 * tools in each frame; repeated calls preserve existing contexts and registrations.
 *
 * Installing joins cross-frame discovery: the window listens for the polyfill's messages and
 * announces itself to the other frames of its tree.
 *
 * @throws {TypeError} If the window or Document prototype prevents installation.
 * @example
 * import { installWebMCP } from "webmcp-polyfill";
 * installWebMCP();
 *
 * @see https://webmachinelearning.github.io/webmcp/#document-extension
 * @see https://github.com/webmachinelearning/webmcp-polyfill/blob/main/TESTING.md
 */
export function installWebMCP(): void {
  if (typeof document === 'undefined' || !globalThis.isSecureContext) {
    return;
  }
  if ('modelContext' in document) {
    return;
  }

  const documentPrototype = Document.prototype;
  const getDefaultView = Object.getOwnPropertyDescriptor(documentPrototype, 'defaultView')!.get!;
  const constructorDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'ModelContext');
  if (
    !Object.isExtensible(documentPrototype) ||
    (constructorDescriptor && !constructorDescriptor.configurable) ||
    (!constructorDescriptor && !Object.isExtensible(globalThis))
  ) {
    throw new TypeError('Cannot install WebMCP on this realm');
  }

  Object.defineProperty(globalThis, 'ModelContext', {
    value: modelContextConstructor,
    configurable: true,
    writable: true,
  });

  // A method is non-constructible; defaultView supplies the native Document brand check.
  const { getModelContext } = {
    getModelContext(this: Document): WebMCP.ModelContext {
      getDefaultView.call(this);
      let context = contexts.get(this);
      if (!context) {
        context = new ModelContextPolyfill(this);
        contexts.set(this, context);
      }
      return context;
    },
  };
  Object.defineProperty(getModelContext, 'name', { value: 'get modelContext' });
  Object.defineProperty(documentPrototype, 'modelContext', {
    configurable: true,
    enumerable: true,
    get: getModelContext,
  });
  // Frames must answer discovery even before their first local API call.
  void document.modelContext;
}

class ModelContextPolyfill extends EventTarget implements WebMCP.ModelContext {
  readonly #document: Document;
  readonly #tools = new Map<string, StoredTool>();
  // Only a document that was active when its context was created has a bridge.
  readonly #frames?: FrameBridge;
  #toolchangeHandler: WebMCP.ModelContext['ontoolchange'] = null;
  readonly #toolchangeListener = (event: Event): void => {
    const handler = this.#toolchangeHandler;
    // An EventHandler keeps a non-callable object but never invokes it.
    if (typeof handler !== 'function') {
      return;
    }
    const result = Reflect.apply(handler, this, [event]);
    if (result === false) {
      Event.prototype.preventDefault.call(event);
    }
  };

  constructor(owner: Document) {
    super();
    this.#document = owner;
    const view = activeWindow(owner);
    if (!view) {
      return;
    }
    this.#frames = new FrameBridge(view, {
      getTools: (callerOrigin) => this.#exposedTools(callerOrigin),
      execute: (callerOrigin, name, serializedInput, signal) => {
        const ownerOrigin = requireActiveWindow(owner).origin;
        return this.#executeLocal(name, serializedInput, ownerOrigin, callerOrigin, signal);
      },
      changed: () => this.#queueToolChange(),
    });
  }

  get ontoolchange(): WebMCP.ModelContext['ontoolchange'] {
    return this.#toolchangeHandler;
  }

  set ontoolchange(handler: WebMCP.ModelContext['ontoolchange']) {
    // [LegacyTreatNonObjectAsNull]: only a non-object becomes null.
    const nextHandler = isObject(handler) ? handler : null;
    // Replacing a handler preserves its listener position; clearing it removes that position.
    if (!this.#toolchangeHandler && nextHandler) {
      this.addEventListener('toolchange', this.#toolchangeListener);
    }
    if (this.#toolchangeHandler && !nextHandler) {
      this.removeEventListener('toolchange', this.#toolchangeListener);
    }
    this.#toolchangeHandler = nextHandler;
  }

  // Default parameters preserve Web IDL's required-argument counts in function.length.
  // Each operation reads #document first, so an invalid receiver throws before arguments are read.
  async registerTool(
    tool: object,
    options: WebMCP.ModelContextRegisterToolOptions = {}
  ): Promise<void> {
    const ownerDocument = this.#document;
    const { name, title, description, annotations, inputSchema, execute } =
      readToolDefinition(tool);
    const settings = readDictionary(options);
    const exposedTo = readOriginSequence(settings.exposedTo);
    const registrationSignal = readAbortSignal(settings.signal);

    requireActiveWindow(ownerDocument);
    const requireUnusedName = (): void => {
      if (this.#tools.has(name)) {
        throw new NativeDOMException(
          `A tool named ${name} is already registered`,
          'InvalidStateError'
        );
      }
    };

    // Duplicate, then name, then description: the draft's order.
    requireUnusedName();
    if (!/^[A-Za-z0-9_.-]{1,128}$/u.test(name)) {
      throw new NativeDOMException(
        `Tool names are 1 to 128 characters of ASCII alphanumerics, "_", "-" or ".": ${name}`,
        'InvalidStateError'
      );
    }
    if (!description) {
      throw new NativeDOMException('A tool description cannot be empty', 'InvalidStateError');
    }
    const serializedSchema = inputSchema === undefined ? undefined : serializeJSON(inputSchema);
    registrationSignal?.throwIfAborted();
    const exposedOrigins = parseOrigins(exposedTo);

    const storedTool: StoredTool = {
      metadata: { name, title, description, annotations, serializedSchema },
      execute,
      exposedTo: exposedOrigins,
    };

    const frames = await this.#requireFrames();
    registrationSignal?.throwIfAborted();
    // Another registration can complete while frame permissions are being checked.
    requireUnusedName();

    return new Promise<void>((resolve, reject) => {
      // Abort unregisters the tool and also rejects any pending registration.
      registrationSignal?.addEventListener(
        'abort',
        () => {
          this.#tools.delete(name);
          void frames.notify(exposedOrigins);
          reject(registrationSignal.reason);
        },
        { once: true }
      );

      this.#tools.set(name, storedTool);
      frames.notify(exposedOrigins).then(resolve, reject);
    });
  }

  async getTools(
    options: WebMCP.ModelContextGetToolOptions = {}
  ): Promise<WebMCP.RegisteredTool[]> {
    const ownerDocument = this.#document;
    const settings = readDictionary(options);
    const fromOrigins = readOriginSequence(settings.fromOrigins);

    requireActiveWindow(ownerDocument);
    const frames = await this.#requireFrames();
    const requestedOrigins = parseOrigins(fromOrigins);

    const tools = await frames.getTools(requestedOrigins);

    // Compare code units; localeCompare() would change the draft's sort order.
    tools.sort((left, right) => {
      if (left.name === right.name) {
        return 0;
      }
      return left.name < right.name ? -1 : 1;
    });

    // The draft resolves from a queued task.
    return new Promise((resolve) => {
      queueTask(() => resolve(tools));
    });
  }

  async executeTool(
    tool: WebMCP.RegisteredTool,
    inputObject: object = {},
    options: WebMCP.ModelContextExecuteToolOptions = {}
  ): Promise<string> {
    const ownerDocument = this.#document;
    const target = readExecutionTarget(tool);
    const settings = readDictionary(options);
    const callerSignal = readAbortSignal(settings.signal);

    requireActiveWindow(ownerDocument);
    const expectedOrigin = URL.parse(target.origin)?.origin;
    if (!expectedOrigin || expectedOrigin === 'null') {
      throw new NativeDOMException('Invalid or opaque origin', 'NotSupportedError');
    }
    if (!isObject(inputObject)) {
      throw new TypeError('inputObject must be an object');
    }

    const serializedInput = serializeJSON(inputObject);
    callerSignal?.throwIfAborted();
    const frames = await this.#requireFrames();
    callerSignal?.throwIfAborted();
    const callerWindow = requireActiveWindow(ownerDocument);
    if (target.window !== callerWindow) {
      return frames.execute(
        target.window,
        expectedOrigin,
        target.name,
        serializedInput,
        callerSignal
      );
    }

    return this.#executeLocal(
      target.name,
      serializedInput,
      expectedOrigin,
      callerWindow.origin,
      callerSignal
    );
  }

  #executeLocal(
    name: string,
    serializedInput: string,
    expectedOrigin: string,
    callerOrigin: string,
    callerSignal?: AbortSignal
  ): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      callerSignal?.throwIfAborted();
      const callbackController = new AbortController();
      // A callback that already finished must not be aborted by a late cancellation.
      let callbackFinished = false;

      const onCallerAbort = (): void => {
        reject(callerSignal!.reason);

        // Reject the caller first; the running callback receives a default AbortError.
        queueTask(() => {
          if (!callbackFinished) {
            callbackController.abort();
          }
        });
      };

      const rejectExecution = (): void => {
        callbackFinished = true;
        queueTask(() => {
          callerSignal?.removeEventListener('abort', onCallerAbort);
          reject(executionError());
        });
      };

      const completeExecution = (value: unknown): void => {
        callbackFinished = true;
        // A cancelled call must not run the author's toJSON during serialization.
        if (callerSignal?.aborted) {
          return;
        }

        try {
          const serializedResult = serializeJSON(value);
          queueTask(() => {
            callerSignal?.removeEventListener('abort', onCallerAbort);
            resolve(serializedResult);
          });
        } catch {
          rejectExecution();
        }
      };

      const dispatchTool = (): void => {
        if (callerSignal?.aborted) {
          return;
        }

        try {
          const ownerWindow = requireActiveWindow(this.#document);
          const storedTool = this.#tools.get(name);
          if (
            !storedTool ||
            expectedOrigin !== ownerWindow.origin ||
            !isExposedTo(storedTool, ownerWindow.origin, callerOrigin)
          ) {
            rejectExecution();
            return;
          }

          const input: unknown = JSON.parse(serializedInput);
          if (!isObject(input)) {
            rejectExecution();
            return;
          }

          // The callback runs without the registration object as its receiver.
          const execute = storedTool.execute;
          const callbackResult = execute(input, { signal: callbackController.signal });
          Promise.resolve(callbackResult).then(completeExecution, rejectExecution);
        } catch {
          rejectExecution();
        }
      };

      callerSignal?.addEventListener('abort', onCallerAbort, { once: true });
      queueTask(dispatchTool);
    });
  }

  async #requireFrames(): Promise<FrameBridge> {
    const frames = this.#frames;
    if (!frames || !(await frames.allowed())) {
      throw new NativeDOMException('WebMCP is disabled by Permissions Policy', 'NotAllowedError');
    }
    requireActiveWindow(this.#document);
    return frames;
  }

  #exposedTools(callerOrigin: string): ToolMetadata[] {
    const ownerOrigin = requireActiveWindow(this.#document).origin;
    const exposed = [];
    for (const storedTool of this.#tools.values()) {
      if (!isExposedTo(storedTool, ownerOrigin, callerOrigin)) {
        continue;
      }
      exposed.push(storedTool.metadata);
    }
    return exposed;
  }

  #queueToolChange(): Promise<void> {
    return new Promise((resolve) => {
      queueTask(() => {
        this.dispatchEvent(new Event('toolchange'));
        resolve();
      });
    });
  }
}

function isExposedTo(tool: StoredTool, ownerOrigin: string, callerOrigin: string): boolean {
  return ownerOrigin === callerOrigin || tool.exposedTo.includes(callerOrigin);
}

// Web IDL exposes a non-constructible interface with enumerable prototype members.
const modelContextConstructor = function ModelContext(): never {
  throw new TypeError('Illegal constructor');
};
// Preserve the public name through minification.
Object.defineProperty(modelContextConstructor, 'name', { value: 'ModelContext' });
Object.defineProperty(modelContextConstructor, 'prototype', {
  value: ModelContextPolyfill.prototype,
  writable: false,
});
Object.setPrototypeOf(modelContextConstructor, EventTarget);
Object.defineProperties(ModelContextPolyfill.prototype, {
  constructor: { value: modelContextConstructor, configurable: true, writable: true },
  [Symbol.toStringTag]: { value: 'ModelContext', configurable: true },
  registerTool: { enumerable: true },
  getTools: { enumerable: true },
  executeTool: { enumerable: true },
  ontoolchange: { enumerable: true },
});

// Web IDL reads and converts dictionary members in lexicographical order.
function readToolDefinition(value: unknown) {
  const descriptor = readDictionary(value);
  const annotations = readAnnotations(descriptor.annotations);
  const description = toDOMString(requireMember(descriptor.description, 'description'));
  const callback = requireMember(descriptor.execute, 'execute');
  if (typeof callback !== 'function') {
    throw new TypeError('execute must be a function');
  }
  // SAFETY: callability is checked above; inputs and results are converted at invocation.
  const execute = callback as WebMCP.ToolExecuteCallback<object>;
  const inputSchema = readInputSchema(descriptor.inputSchema);
  const name = toDOMString(requireMember(descriptor.name, 'name'));
  const rawTitle = descriptor.title;
  const title = rawTitle === undefined ? '' : toUSVString(rawTitle);

  return { name, title, description, annotations, inputSchema, execute };
}

// Convert the whole RegisteredTool dictionary, even members not used for dispatch.
function readExecutionTarget(value: unknown) {
  const descriptor = readDictionary(value);
  readAnnotations(descriptor.annotations);
  toDOMString(requireMember(descriptor.description, 'description'));
  readInputSchema(descriptor.inputSchema);
  const name = toDOMString(requireMember(descriptor.name, 'name'));
  const origin = toUSVString(requireMember(descriptor.origin, 'origin'));
  const title = descriptor.title;
  if (title !== undefined) {
    toDOMString(title);
  }
  const targetWindow = requireMember(descriptor.window, 'window');
  if (!isObject(targetWindow)) {
    throw new TypeError('window must be a Window');
  }
  getWindow!.call(targetWindow);

  // SAFETY: the native getter above validated the Window brand without changing identity.
  return { name, origin, window: targetWindow as Window };
}

function readInputSchema(value: unknown): object | undefined {
  if (value !== undefined && !isObject(value)) {
    throw new TypeError('inputSchema must be an object');
  }
  return value;
}

function isObject(value: unknown): value is object {
  return (typeof value === 'object' && value !== null) || typeof value === 'function';
}

// https://webidl.spec.whatwg.org/#es-dictionary
function readDictionary(value: unknown): Record<PropertyKey, unknown> {
  if (value == null) {
    return {};
  }
  if (!isObject(value)) {
    throw new TypeError('Expected a dictionary');
  }
  // SAFETY: the object check permits property reads; each member still needs conversion.
  return value as Record<PropertyKey, unknown>;
}

function readAnnotations(value: unknown): WebMCP.ToolAnnotations | undefined {
  if (value === undefined) {
    return undefined;
  }
  const dictionary = readDictionary(value);
  const annotations: WebMCP.ToolAnnotations = {};
  for (const name of annotationNames) {
    annotations[name] = Boolean(dictionary[name]);
  }
  return annotations;
}

// https://webidl.spec.whatwg.org/#es-DOMString
function toDOMString(value: unknown): string {
  if (typeof value === 'symbol') {
    throw new TypeError('Cannot convert a Symbol to a string');
  }
  return String(value);
}

// https://webidl.spec.whatwg.org/#es-USVString
function toUSVString(value: unknown): string {
  return toDOMString(value).toWellFormed();
}

function requireMember(value: unknown, name: string): unknown {
  if (value === undefined) {
    throw new TypeError(`${name} is required`);
  }
  return value;
}

function serializeJSON(value: unknown): string {
  const result = JSON.stringify(value);
  if (result === undefined) {
    throw new TypeError('Value is not JSON-serializable');
  }
  return result;
}

function readAbortSignal(value: unknown): AbortSignal | undefined {
  if (value === undefined) {
    return undefined;
  }
  // SAFETY: any() validates the native brand across realms before we use the signal.
  // Composition also survives stopImmediatePropagation() on the original signal.
  return AbortSignal.any([value as AbortSignal]);
}

// https://webidl.spec.whatwg.org/#es-sequence
function readOriginSequence(value: unknown): string[] {
  if (value === undefined) {
    return [];
  }
  if (!isObject(value)) {
    throw new TypeError('Origins must be a sequence');
  }
  const getIterator = readDictionary(value)[Symbol.iterator];
  if (typeof getIterator !== 'function') {
    throw new TypeError('Origins must be a sequence');
  }
  // Use the cached method and original receiver without reading the method's own properties.
  const iterable = {
    [Symbol.iterator]() {
      const iterator: unknown = Reflect.apply(getIterator, value, []);
      if (!isObject(iterator)) {
        throw new TypeError('Iterator must be an object');
      }
      const next = readDictionary(iterator).next;
      if (typeof next !== 'function') {
        throw new TypeError('Iterator next must be a function');
      }
      // Web IDL does not close the iterator when an item's conversion fails.
      return {
        next() {
          return Reflect.apply(next, iterator, []);
        },
      };
    },
  };
  return Array.from(iterable, toUSVString);
}

function parseOrigins(origins: string[]): string[] {
  return origins.map((value) => {
    // A blob: URL carries its creator's origin.
    const origin = URL.parse(value)?.origin;
    if (origin === undefined) {
      throw new NativeDOMException('Invalid origin', 'SecurityError');
    }
    // An opaque origin, such as a file: URL's, serializes as "null" and does not parse.
    const url = URL.parse(origin);
    if (!url || !isPotentiallyTrustworthy(url)) {
      throw new NativeDOMException('Origin is not potentially trustworthy', 'SecurityError');
    }
    return origin;
  });
}

// https://w3c.github.io/webappsec-secure-contexts/#is-origin-trustworthy
// Scheme and host checks cannot recognize browser-specific trusted origins.
function isPotentiallyTrustworthy({ protocol, hostname }: URL): boolean {
  if (['https:', 'wss:'].includes(protocol)) {
    return true;
  }
  const isLoopback =
    hostname === '[::1]' ||
    // URL canonicalizes numeric hosts; exclude domains such as 127.example.test.
    /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname);
  const isLocalhost =
    hostname === 'localhost' ||
    hostname === 'localhost.' ||
    hostname.endsWith('.localhost') ||
    hostname.endsWith('.localhost.');
  return ['http:', 'ws:'].includes(protocol) && (isLoopback || isLocalhost);
}

function requireActiveWindow(owner: Document): Window {
  const view = activeWindow(owner);
  if (!view) {
    throw new NativeDOMException('The document is not fully active', 'InvalidStateError');
  }
  if (view.originAgentCluster === false && view.location.protocol !== 'file:') {
    throw new NativeDOMException('An origin-keyed agent cluster is required', 'SecurityError');
  }

  // Synchronous where the browser exposes the policy; FrameBridge.allowed() covers the rest.
  if (readToolsPolicy(owner) === false) {
    throw new NativeDOMException('WebMCP is disabled by Permissions Policy', 'NotAllowedError');
  }
  return view;
}

// Message tasks approximate the WebMCP task source. Chained zero-delay timers are clamped to
// 4 ms, and one port keeps the tasks in order. Created on first use so an import stays inert.
let taskPort: MessagePort | undefined;
const queuedTasks: (() => void)[] = [];

function queueTask(callback: () => void): void {
  if (!taskPort) {
    const channel = new MessageChannel();
    channel.port1.onmessage = () => queuedTasks.shift()?.();
    taskPort = channel.port2;
  }
  queuedTasks.push(callback);
  taskPort.postMessage(undefined);
}
