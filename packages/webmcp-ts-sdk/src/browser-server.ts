import type { WebMCP } from 'webmcp-types';
import { installWebMCP } from '@mcp-b/webmcp-polyfill';
import {
  coerceWebMcpToolDescriptor,
  createInvalidStateError,
  isPlainObject,
  serializeInputSchema,
  type ToolRegistrationDictionary,
} from './normalize.js';
import {
  isMcpStandardSchema,
  normalizeInputSchema,
  normalizeToolResponse,
  type NormalizedInputSchema,
} from './schema.js';
import type {
  ModelContext,
  ModelContextGetToolOptions,
  ModelContextRegisterToolOptions,
  ModelContextWithExtensions,
  RegisteredTool,
} from './model-context.js';
import type {
  CallToolResult,
  InputSchema,
  RegistrationHandle,
  WebMcpToolInput,
  WebMcpToolObjectInput,
} from './common.js';
import type { ModelContextTool, ToolDescriptor, ToolListItem } from './tool.js';
import {
  fromJsonSchema,
  isInputRequiredResult,
  McpServer,
  mergeCapabilities,
  ResourceTemplate,
  type GetPromptResult,
  type Implementation,
  type ReadResourceResult,
  type ResourceMetadata,
  type RegisteredPrompt as McpRegisteredPrompt,
  type RegisteredResource as McpRegisteredResource,
  type RegisteredResourceTemplate as McpRegisteredResourceTemplate,
  type RegisteredTool as McpRegisteredTool,
  type ServerOptions,
  type StandardSchemaWithJSON,
  type Transport,
  type Variables,
} from '@modelcontextprotocol/server';

const DEFAULT_INPUT_SCHEMA = normalizeInputSchema(undefined).inputSchema;
const SERVER_MARKER_PROPERTY = '__isBrowserMcpServer' as const;

export function isBrowserMcpServer(context: unknown): context is BrowserMcpServer {
  return (
    typeof context === 'object' &&
    context !== null &&
    SERVER_MARKER_PROPERTY in context &&
    context[SERVER_MARKER_PROPERTY] === true
  );
}

export interface PeerOriginTransport extends Transport {
  clientOrigin?: string | undefined;
  onclientorigin?: ((origin: string) => void) | undefined;
}

function isPeerOriginTransport(transport: Transport): transport is PeerOriginTransport {
  return (
    'clientOrigin' in transport &&
    (transport.clientOrigin === undefined || typeof transport.clientOrigin === 'string') &&
    (!('onclientorigin' in transport) ||
      transport.onclientorigin === undefined ||
      typeof transport.onclientorigin === 'function')
  );
}

interface RegisteredWebMcpTool {
  item: ToolListItem;
  mcpHandle: McpRegisteredTool | undefined;
  exposedTo?: readonly string[];
  abortSignal?: AbortSignal;
  abortListener?: () => void;
}

type McpRegistration = McpRegisteredPrompt | McpRegisteredResource | McpRegisteredResourceTemplate;
type ModelContextEventHandler = ModelContext['ontoolchange'];

export interface BrowserMcpServerOptions extends ServerOptions {
  /** Underlying context. Defaults to document.modelContext, installing upstream if needed. */
  native?: ModelContext;
}

interface NativeBackfilledTool {
  source: RegisteredTool;
  item: ToolListItem;
  fingerprint: string;
}

function parseNativeToolResult(serialized: string): CallToolResult | WebMcpToolObjectInput {
  let result: unknown;
  try {
    result = JSON.parse(serialized);
  } catch {
    // Native declarative tools return plain text for string responses.
    result = serialized;
  }
  if (isPlainObject(result)) return result;
  // Strings cross as their content; every other value keeps its original text.
  return { content: [{ type: 'text', text: typeof result === 'string' ? result : serialized }] };
}

/** Runs `operation` in a microtask; rejects with the reason as soon as `signal` aborts. */
function withAbortSignal<T>(operation: () => T | PromiseLike<T>, signal: AbortSignal): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    signal.throwIfAborted();
    const onAbort = () => reject(signal.reason);
    signal.addEventListener('abort', onAbort, { once: true });
    Promise.resolve()
      .then(operation)
      .then(resolve, reject)
      .finally(() => signal.removeEventListener('abort', onAbort));
  });
}

function toMcpInputSchema(
  normalized: NormalizedInputSchema
): StandardSchemaWithJSON<WebMcpToolObjectInput> {
  // normalizeInputSchema() keeps the caller's Standard Schema validator on the converted
  // schema, so reuse it instead of recompiling the JSON Schema projection.
  if (isMcpStandardSchema(normalized.inputSchema)) return normalized.inputSchema;
  // SAFETY: normalizeInputSchema returns a plain JSON object whose keywords may exceed the SDK's
  // declared JSON Schema type; fromJsonSchema compiles it and validates its dialect at runtime.
  return fromJsonSchema<WebMcpToolObjectInput>(
    normalized.inputSchema as Parameters<typeof fromJsonSchema>[0]
  );
}

/**
 * Thin WebMCP-to-MCP v2 adapter.
 *
 * The official v2 `McpServer` owns MCP registration, validation, and transport
 * behavior. This class extends the upstream WebMCP context with MCP capabilities.
 */
export class BrowserMcpServer extends EventTarget implements ModelContextWithExtensions {
  readonly [SERVER_MARKER_PROPERTY] = true as const;
  readonly mcpServer: McpServer;

  private readonly native: ModelContext | undefined;
  private readonly ownerDocument: Document | null;
  private readonly tools = new Map<string, RegisteredWebMcpTool>();
  private peerOrigin: string | undefined;
  private stopObservingPeerOrigin: (() => void) | undefined;
  private readonly registrations = new Set<McpRegistration>();
  private readonly nativeToolAbortControllers = new Map<string, AbortController>();
  private readonly nativeBackfilledTools = new Map<string, NativeBackfilledTool>();
  private readonly pendingTools = new Map<string, AbortController>();
  private readonly removingNativeTools = new Set<string>();
  private nativeSyncQueue: Promise<void> = Promise.resolve();
  private nativeToolChangeQueue: Promise<void> = Promise.resolve();
  private readonly nativeToolChangeListener: () => void;
  private closed = false;
  private closePromise: Promise<void> | undefined;
  private readonly eventHandlers = new Map<string, NonNullable<ModelContextEventHandler>>();
  private readonly eventHandlerListener: EventListener = (event) => {
    this.eventHandlers.get(event.type)?.call(this, event);
  };
  // Lifecycle events fire at the underlying context; listeners on the extended
  // document context see them through this target.
  private readonly nativeLifecycleListener: EventListener = (event) => {
    if (this.closed) return;
    const mirrored = new Event(event.type);
    if ('toolName' in event) {
      Object.defineProperty(mirrored, 'toolName', { enumerable: true, value: event.toolName });
    }
    this.dispatchEvent(mirrored);
  };

  constructor(serverInfo: Implementation, options: BrowserMcpServerOptions = {}) {
    super();
    const { native: suppliedContext, ...serverOptions } = options;
    if (!suppliedContext && !globalThis.document?.modelContext) installWebMCP();
    this.mcpServer = new McpServer(serverInfo, {
      ...serverOptions,
      capabilities: mergeCapabilities(serverOptions.capabilities ?? {}, {
        tools: { listChanged: true },
        resources: { listChanged: true },
        prompts: { listChanged: true },
      }),
    });
    // Outside a secure document no context exists; the server then serves MCP only.
    this.native = suppliedContext ?? globalThis.document?.modelContext;
    this.ownerDocument = globalThis.document ?? null;
    this.nativeToolChangeListener = () => {
      if (this.closed) return;
      this.nativeToolChangeQueue = this.nativeToolChangeQueue.then(async () => {
        try {
          await this.syncNativeTools();
        } catch (error) {
          console.warn('[BrowserMcpServer] Native WebMCP tool reconciliation failed:', error);
        }
        await this.notifyProducerToolsChanged();
      });
    };
    this.native?.addEventListener('toolchange', this.nativeToolChangeListener);
    this.native?.addEventListener('toolactivated', this.nativeLifecycleListener);
    this.native?.addEventListener('toolcancel', this.nativeLifecycleListener);
  }

  private getEventHandler(type: string): ModelContextEventHandler {
    return this.eventHandlers.get(type) ?? null;
  }

  private setEventHandler(type: string, handler: ModelContextEventHandler): void {
    if (typeof handler === 'function') {
      if (!this.eventHandlers.has(type)) super.addEventListener(type, this.eventHandlerListener);
      this.eventHandlers.set(type, handler);
    } else if (this.eventHandlers.delete(type)) {
      super.removeEventListener(type, this.eventHandlerListener);
    }
  }

  get ontoolchange(): ModelContextEventHandler {
    return this.getEventHandler('toolchange');
  }

  set ontoolchange(handler: ModelContextEventHandler) {
    this.setEventHandler('toolchange', handler);
  }

  get ontoolactivated(): ModelContextEventHandler {
    return this.getEventHandler('toolactivated');
  }

  set ontoolactivated(handler: ModelContextEventHandler) {
    this.setEventHandler('toolactivated', handler);
  }

  get ontoolcancel(): ModelContextEventHandler {
    return this.getEventHandler('toolcancel');
  }

  set ontoolcancel(handler: ModelContextEventHandler) {
    this.setEventHandler('toolcancel', handler);
  }

  private async notifyProducerToolsChanged(): Promise<void> {
    if (this.closed) return;
    // Preserve task ordering because WebMCP does not expose its platform task source.
    await new Promise((resolve) => setTimeout(resolve, 0));
    if (!this.closed) this.dispatchEvent(new Event('toolchange'));
  }

  private async registerNativeToolMirror(
    tool: ToolDescriptor<WebMcpToolInput>,
    normalized: NormalizedInputSchema,
    options: ModelContextRegisterToolOptions,
    execute: ModelContextTool<WebMcpToolInput>['execute'],
    controller: AbortController
  ): Promise<void> {
    const native = this.native;
    if (!native) return;
    const signal = options.signal
      ? AbortSignal.any([options.signal, controller.signal])
      : controller.signal;
    const nativeTool: WebMCP.ModelContextTool = {
      name: tool.name,
      description: tool.description,
      execute,
    };
    if (tool.title !== undefined) nativeTool.title = tool.title;
    if (normalized.registeredInputSchema !== undefined) {
      const inputSchema: unknown = JSON.parse(normalized.registeredInputSchema);
      if (!isPlainObject(inputSchema)) throw new TypeError('inputSchema must be an object');
      nativeTool.inputSchema = inputSchema;
    }
    if (tool.annotations) nativeTool.annotations = tool.annotations;

    this.nativeToolAbortControllers.set(tool.name, controller);
    try {
      await native.registerTool(nativeTool, { ...options, signal });
    } catch (error) {
      controller.abort();
      if (this.nativeToolAbortControllers.get(tool.name) === controller) {
        this.nativeToolAbortControllers.delete(tool.name);
      }
      // A frame without allow="tools" can still serve the tool over MCP, as in 5.x.
      if (error instanceof DOMException && error.name === 'NotAllowedError') {
        console.warn(
          `[BrowserMcpServer] Tool "${tool.name}" is available over MCP only: ${error.message}. Grant allow="tools" on the iframe to expose it to WebMCP.`
        );
        return;
      }
      throw error;
    }
    if (this.nativeToolAbortControllers.get(tool.name) === controller) {
      this.removingNativeTools.delete(tool.name);
    }
  }

  private abortNativeToolMirror(
    name: string,
    controller = this.nativeToolAbortControllers.get(name)
  ): void {
    if (!controller || this.nativeToolAbortControllers.get(name) !== controller) return;
    this.removingNativeTools.add(name);
    controller.abort();
    this.nativeToolAbortControllers.delete(name);
  }

  private registerToolInMcp(
    tool: ToolDescriptor<WebMcpToolInput>,
    normalized: NormalizedInputSchema,
    executeTool: ModelContextTool<WebMcpToolInput>['execute'],
    exposedTo?: readonly string[]
  ): RegisteredWebMcpTool {
    const item: ToolListItem = {
      name: tool.name,
      description: tool.description,
      inputSchema: normalized.inputSchema,
    };
    if (tool.title !== undefined) item.title = tool.title;
    if (tool.outputSchema !== undefined) item.outputSchema = structuredClone(tool.outputSchema);
    if (tool.annotations) item.annotations = tool.annotations;

    const config: Omit<Parameters<McpServer['registerTool']>[1], 'inputSchema' | 'outputSchema'> & {
      inputSchema?: ReturnType<typeof toMcpInputSchema>;
      outputSchema?: ReturnType<typeof fromJsonSchema>;
    } = {
      description: tool.description,
    };
    if (item.outputSchema !== undefined) config.outputSchema = fromJsonSchema(item.outputSchema);
    if (tool.title !== undefined) config.title = tool.title;
    if (tool.annotations) {
      const { untrustedContentHint: _untrustedContentHint, ...annotations } = tool.annotations;
      config.annotations = annotations;
    }
    let mcpHandle: McpRegisteredTool | undefined;
    if (normalized.inputSchema.type === undefined || normalized.inputSchema.type === 'object') {
      config.inputSchema = toMcpInputSchema(normalized);
      mcpHandle = this.mcpServer.registerTool(tool.name, config, async (args, context) => {
        const result = await executeTool(args, { signal: context.mcpReq.signal });
        if (isInputRequiredResult(result)) {
          throw new Error(
            `WebMCP tool "${tool.name}" returned input_required. Multi-round tool flows require BrowserMcpServer.mcpServer.registerTool().`
          );
        }
        return normalizeToolResponse(result);
      });
      // A tool is never observable on the wire before it is published: the handle is
      // disabled here, in the same synchronous step that created it, and only
      // applyToolExposure enables it.
      mcpHandle.disable();
    } else {
      console.warn(
        `[BrowserMcpServer] Tool "${tool.name}" remains available through WebMCP but cannot be exposed over MCP because MCP input schemas require an object root.`
      );
    }

    const registered: RegisteredWebMcpTool = { item, mcpHandle };
    if (exposedTo?.length) registered.exposedTo = exposedTo;
    return registered;
  }

  readonly registerTool: ModelContextWithExtensions['registerTool'] = async (
    toolValue: ToolRegistrationDictionary,
    optionsValue: ModelContextRegisterToolOptions | null = {}
  ): Promise<void> => {
    const { signal, exposedTo } = optionsValue ?? {};
    const options: ModelContextRegisterToolOptions = {};
    if (signal) options.signal = signal;
    if (exposedTo) options.exposedTo = [...exposedTo];
    if (this.closed) throw createInvalidStateError('BrowserMcpServer is closed');
    if (!isPlainObject(toolValue)) {
      throw new TypeError('registerTool(tool) requires a tool object');
    }
    const tool = coerceWebMcpToolDescriptor(toolValue);
    // Upstream keys names per document, so only local and pending registrations
    // collide; a mirror of another document's tool yields once native accepts.
    if (
      (this.tools.has(tool.name) && !this.nativeBackfilledTools.has(tool.name)) ||
      this.pendingTools.has(tool.name)
    ) {
      throw createInvalidStateError(`Tool already registered: ${tool.name}`);
    }
    const normalized = normalizeInputSchema(tool.inputSchema);
    options.signal?.throwIfAborted();
    const callback = tool.execute;
    const execute: ModelContextTool<WebMcpToolInput>['execute'] = (args, options) =>
      withAbortSignal(() => callback(args, options), options.signal);
    const controller = new AbortController();
    // An unparsable entry reaches the context, which rejects it with its own error.
    const exposedOrigins = options.exposedTo?.map((origin) => URL.parse(origin)?.origin ?? origin);
    // `registered` owns the MCP handle until the tool is published or the handle is released.
    let registered: RegisteredWebMcpTool | undefined;
    const abort = () => {
      if (this.pendingTools.get(tool.name) === controller) {
        this.pendingTools.delete(tool.name);
      }
      if (registered && this.tools.get(tool.name) === registered) {
        this.removeTool(tool.name);
      } else {
        registered?.mcpHandle?.remove();
        this.abortNativeToolMirror(tool.name, controller);
      }
      registered = undefined;
    };
    options.signal?.addEventListener('abort', abort, { once: true });
    this.pendingTools.set(tool.name, controller);
    try {
      // The MCP side compiles before other frames can see the tool. A mirror of
      // another document's tool keeps the MCP name until native accepts this one.
      if (!this.nativeBackfilledTools.has(tool.name)) {
        registered = this.registerToolInMcp(tool, normalized, execute, exposedOrigins);
      }
      options.signal?.throwIfAborted();
      await this.registerNativeToolMirror(tool, normalized, options, execute, controller);
      if (this.closed) throw createInvalidStateError('BrowserMcpServer is closed');
      options.signal?.throwIfAborted();
      this.removeTool(tool.name, { skipNative: true });
      registered ??= this.registerToolInMcp(tool, normalized, execute, exposedOrigins);
      this.tools.set(tool.name, registered);
      this.applyToolExposure();
      if (options.signal?.aborted) {
        abort();
        options.signal.throwIfAborted();
      }
    } catch (error) {
      registered?.mcpHandle?.remove();
      this.abortNativeToolMirror(tool.name, controller);
      options.signal?.removeEventListener('abort', abort);
      options.signal?.throwIfAborted();
      throw error;
    } finally {
      if (this.pendingTools.get(tool.name) === controller) {
        this.pendingTools.delete(tool.name);
      }
    }
    if (options.signal) {
      registered.abortSignal = options.signal;
      registered.abortListener = abort;
    }
    if (this.tools.get(tool.name) === registered) {
      await this.nativeToolChangeQueue;
    }
    if (this.closed) throw createInvalidStateError('BrowserMcpServer is closed');
    options.signal?.throwIfAborted();
  };

  private removeTool(name: string, options?: { skipNative?: boolean }): void {
    const registered = this.tools.get(name);
    if (registered) {
      if (registered.abortSignal && registered.abortListener) {
        registered.abortSignal.removeEventListener('abort', registered.abortListener);
      }
      this.tools.delete(name);
      this.nativeBackfilledTools.delete(name);
      registered.mcpHandle?.remove();
    }
    if (!options?.skipNative) this.abortNativeToolMirror(name);
  }

  syncNativeTools(): Promise<void> {
    const native = this.native;
    const sync = this.nativeSyncQueue.then(async () => {
      if (this.closed || !native) return;
      await this.backfillNativeStandardTools(native);
    });
    this.nativeSyncQueue = sync.then(
      () => undefined,
      () => undefined
    );
    return sync;
  }

  private async backfillNativeStandardTools(native: ModelContext): Promise<void> {
    // A top-level server serves its subtree; a framed one serves only its own
    // document, so an embedder cannot reach same-origin children through the
    // framed page, and ancestor or sibling tools never feed iframe bridges back
    // into their source.
    const ownerWindow = this.ownerDocument?.defaultView;
    const tools = (await native.getTools()).filter((tool) => {
      if (tool.window === ownerWindow) return true;
      if (ownerWindow?.parent !== ownerWindow) return false;
      let frame = tool.window;
      while (frame) {
        if (frame === ownerWindow) return true;
        const parent = frame.parent;
        if (parent === frame) break;
        frame = parent;
      }
      return false;
    });
    if (this.closed) return;
    // A removal completes once this document no longer registers the name; a
    // descendant's same-named tool is mirrored afterwards.
    for (const name of this.removingNativeTools) {
      if (!tools.some((tool) => tool.name === name && tool.window === ownerWindow)) {
        this.removingNativeTools.delete(name);
      }
    }
    const nextTools = new Map<string, NativeBackfilledTool>();
    for (const tool of tools) {
      // MCP tool names are global, so the first visible tool with a name wins.
      if (
        nextTools.has(tool.name) ||
        this.pendingTools.has(tool.name) ||
        this.removingNativeTools.has(tool.name)
      ) {
        continue;
      }
      // Detach the schema from the page; a value that cannot cross JSON stays undefined.
      let inputSchema: unknown;
      try {
        inputSchema = JSON.parse(serializeInputSchema(tool.inputSchema ?? DEFAULT_INPUT_SCHEMA));
      } catch {}
      if (!isPlainObject(inputSchema)) {
        console.warn(
          `[BrowserMcpServer] Native tool "${tool.name}" was not exposed over MCP because its input schema is malformed.`
        );
        continue;
      }
      const item: ToolListItem = { name: tool.name, description: tool.description, inputSchema };
      if (tool.title !== undefined) item.title = tool.title;
      if (tool.annotations) item.annotations = tool.annotations;
      nextTools.set(tool.name, { source: tool, item, fingerprint: JSON.stringify(item) });
    }

    for (const [name, current] of this.nativeBackfilledTools) {
      const next = nextTools.get(name);
      if (next?.fingerprint === current.fingerprint) this.nativeBackfilledTools.set(name, next);
      else this.removeTool(name, { skipNative: true });
    }

    for (const [name, next] of nextTools) {
      if (this.tools.has(name)) continue;
      const execute: ModelContextTool<WebMcpToolInput>['execute'] = async (args, options) => {
        const currentTool = this.nativeBackfilledTools.get(name)?.source;
        if (!currentTool) throw new Error(`Native tool not found: ${name}`);
        try {
          return parseNativeToolResult(await native.executeTool(currentTool, args, options));
        } catch (error) {
          // Upstream fires no toolchange when a frame is removed, so a failed call
          // into a closed window is the first signal to drop its mirrors.
          if (currentTool.window.closed) this.nativeToolChangeListener();
          throw error;
        }
      };
      const tool = { ...next.item, execute };
      try {
        // Native getTools() does not report a tool's exposedTo allowlist, so a
        // backfilled mirror is exposed to every MCP peer.
        const normalized = normalizeInputSchema(tool.inputSchema);
        this.tools.set(name, this.registerToolInMcp(tool, normalized, execute));
        this.nativeBackfilledTools.set(name, next);
      } catch (error) {
        console.warn(
          `[BrowserMcpServer] Native tool "${name}" was not exposed over MCP because its schema could not be compiled:`,
          error
        );
      }
    }
    this.applyToolExposure();
  }

  registerResource(descriptor: ResourceDescriptor): RegistrationHandle {
    if (this.closed) throw createInvalidStateError('BrowserMcpServer is closed');
    const registeredDescriptor = { ...descriptor };
    const config: ResourceMetadata = {};
    if (registeredDescriptor.description !== undefined) {
      config.description = registeredDescriptor.description;
    }
    if (registeredDescriptor.mimeType !== undefined)
      config.mimeType = registeredDescriptor.mimeType;
    const template = registeredDescriptor.uri.includes('{')
      ? new ResourceTemplate(registeredDescriptor.uri, { list: undefined })
      : undefined;
    const mcpHandle = template
      ? this.mcpServer.registerResource(
          registeredDescriptor.name,
          template,
          config,
          async (uri, variables) => registeredDescriptor.read(uri, variables)
        )
      : this.mcpServer.registerResource(
          registeredDescriptor.name,
          registeredDescriptor.uri,
          config,
          async (uri) => registeredDescriptor.read(uri)
        );
    this.registrations.add(mcpHandle);
    return {
      unregister: () => {
        if (this.registrations.delete(mcpHandle)) mcpHandle.remove();
      },
    };
  }

  registerPrompt(descriptor: PromptDescriptor): RegistrationHandle {
    if (this.closed) throw createInvalidStateError('BrowserMcpServer is closed');
    const registeredDescriptor = { ...descriptor };
    if (descriptor.argsSchema !== undefined) {
      registeredDescriptor.argsSchema = structuredClone(descriptor.argsSchema);
    }
    const argsSchema =
      registeredDescriptor.argsSchema === undefined
        ? undefined
        : fromJsonSchema<Record<string, string>>(
            // SAFETY: PromptDescriptor accepts WebMCP's JSON schema shape; the MCP schema
            // compiler validates supported keywords and values at this boundary.
            registeredDescriptor.argsSchema as Parameters<typeof fromJsonSchema>[0]
          );
    const config: Omit<Parameters<McpServer['registerPrompt']>[1], 'argsSchema'> & {
      argsSchema?: NonNullable<typeof argsSchema>;
    } = {};
    if (registeredDescriptor.description !== undefined) {
      config.description = registeredDescriptor.description;
    }
    if (argsSchema) config.argsSchema = argsSchema;
    const mcpHandle = this.mcpServer.registerPrompt(
      registeredDescriptor.name,
      config,
      async (args) => registeredDescriptor.get(args ?? {})
    );
    this.registrations.add(mcpHandle);
    return {
      unregister: () => {
        if (this.registrations.delete(mcpHandle)) mcpHandle.remove();
      },
    };
  }

  listTools(): ToolListItem[] {
    return structuredClone([...this.tools.values()].map(({ item }) => item));
  }

  async getTools(options?: ModelContextGetToolOptions): Promise<RegisteredTool[]> {
    if (this.closed) throw createInvalidStateError('BrowserMcpServer is closed');
    if (!this.native) throw createInvalidStateError('BrowserMcpServer has no WebMCP context');
    return this.native.getTools(options);
  }

  async executeTool(...args: Parameters<ModelContext['executeTool']>): Promise<string> {
    if (this.closed) throw createInvalidStateError('BrowserMcpServer is closed');
    if (!this.native) throw createInvalidStateError('BrowserMcpServer has no WebMCP context');
    return this.native.executeTool(...args);
  }

  /**
   * Re-evaluate which registered tools may appear on the wire.
   *
   * A published tool without `exposedTo` is enabled. `exposedTo` narrows a tool to named
   * embedder origins. The peer origin is only known once a transport that reports one has
   * heard from its peer, so a restricted tool stays disabled until then — and stays
   * disabled forever on transports that cannot name a peer at all. Failing closed keeps a
   * tool that asked for a narrow audience from reaching a wider one.
   */
  private applyToolExposure(): void {
    for (const { exposedTo, mcpHandle } of this.tools.values()) {
      if (!mcpHandle) continue;
      // Opaque origins serialize identically and cannot identify an allowed peer.
      const visible =
        !exposedTo?.length ||
        (this.peerOrigin !== undefined &&
          this.peerOrigin !== 'null' &&
          exposedTo.includes(this.peerOrigin));
      if (visible === mcpHandle.enabled) continue;
      if (visible) mcpHandle.enable();
      else mcpHandle.disable();
    }
  }

  /**
   * Follow the peer origin of transports that report one, so `exposedTo` can be scoped to
   * the embedder actually connected. Duck-typed rather than imported: the SDK must not take
   * a build dependency on `@mcp-b/transports`, and transports that never name a peer simply
   * leave every restricted tool disabled.
   */
  private observePeerOrigin(transport: Transport): void {
    this.stopObservingPeerOrigin?.();
    this.stopObservingPeerOrigin = undefined;
    this.peerOrigin = undefined;
    this.applyToolExposure();
    if (!isPeerOriginTransport(transport)) return;
    const peered = transport;
    this.peerOrigin = peered.clientOrigin;
    this.applyToolExposure();
    const previous = peered.onclientorigin;
    let observing = true;
    const onclientorigin = (origin: string) => {
      previous?.(origin);
      if (!observing) return;
      this.peerOrigin = origin;
      this.applyToolExposure();
    };
    peered.onclientorigin = onclientorigin;
    this.stopObservingPeerOrigin = () => {
      observing = false;
      if (peered.onclientorigin === onclientorigin) peered.onclientorigin = previous;
    };
  }

  async connect(transport: Transport): Promise<void> {
    if (this.closed) throw createInvalidStateError('BrowserMcpServer is closed');
    if (this.mcpServer.server.transport) {
      throw createInvalidStateError('BrowserMcpServer is already connected');
    }
    this.observePeerOrigin(transport);
    const stopObserving = this.stopObservingPeerOrigin;
    try {
      await this.mcpServer.connect(transport);
    } catch (error) {
      if (this.stopObservingPeerOrigin === stopObserving) {
        stopObserving?.();
        this.stopObservingPeerOrigin = undefined;
        this.peerOrigin = undefined;
        this.applyToolExposure();
      }
      if (this.mcpServer.server.transport === transport) await this.mcpServer.close();
      throw error;
    }
  }

  close(): Promise<void> {
    if (this.closePromise) return this.closePromise;
    this.closed = true;
    this.stopObservingPeerOrigin?.();
    this.stopObservingPeerOrigin = undefined;
    this.closePromise = (async () => {
      this.native?.removeEventListener('toolchange', this.nativeToolChangeListener);
      this.native?.removeEventListener('toolactivated', this.nativeLifecycleListener);
      this.native?.removeEventListener('toolcancel', this.nativeLifecycleListener);
      for (const name of this.nativeToolAbortControllers.keys()) {
        this.abortNativeToolMirror(name);
      }
      for (const name of this.tools.keys()) {
        this.removeTool(name);
      }
      for (const handle of this.registrations) handle.remove();
      this.registrations.clear();
      this.nativeBackfilledTools.clear();
      this.removingNativeTools.clear();
      await this.mcpServer.close();
    })();
    return this.closePromise;
  }
}

export interface ResourceDescriptor {
  uri: string;
  name: string;
  description?: string;
  mimeType?: string;
  read: (uri: URL, params?: Variables) => Promise<ReadResourceResult>;
}

export interface PromptDescriptor {
  name: string;
  description?: string;
  argsSchema?: InputSchema;
  get: (args: Record<string, string>) => Promise<GetPromptResult>;
}
