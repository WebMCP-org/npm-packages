import type { WebMCP } from 'webmcp-types';
import { installWebMCP } from '@mcp-b/webmcp-polyfill';
import {
  coerceWebMcpToolDescriptor,
  createInvalidStateError,
  isPlainObject,
  isMcpStandardSchema,
  normalizeToolResponse,
  normalizeInputSchema,
  serializeInputSchema,
  toWebMcpAnnotations,
  validateWebMcpToolDescriptor,
  withAbortSignal,
} from './schema.js';
import type { NormalizedInputSchema, ToolRegistrationDictionary } from './schema.js';
import type {
  ModelContext,
  ModelContextGetToolOptions,
  ModelContextRegisterToolOptions,
  ModelContextWithExtensions,
  RegisteredTool,
} from './model-context.js';
import type {
  InputSchema,
  RegistrationHandle,
  WebMcpToolInput,
  WebMcpToolObjectInput,
} from './common.js';
import type { ModelContextTool, ToolAnnotations, ToolDescriptor, ToolListItem } from './tool.js';
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
  type ToolAnnotations as McpToolAnnotations,
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

export interface BrowserMcpServerOptions extends ServerOptions {
  /** Underlying context. Defaults to document.modelContext, installing upstream if needed. */
  native?: ModelContext;
}

interface NativeBackfilledTool {
  source: RegisteredTool;
  item: ToolListItem;
  fingerprint: string;
}

function parseNativeToolResult(serialized: string) {
  let result: unknown;
  try {
    result = JSON.parse(serialized);
  } catch {
    // Native declarative forms return plain text for string responses.
    return normalizeToolResponse(serialized);
  }
  return isInputRequiredResult(result) ? result : normalizeToolResponse(result);
}

function toMcpInputSchema(
  normalized: NormalizedInputSchema
): StandardSchemaWithJSON<WebMcpToolObjectInput> {
  // normalizeInputSchema() attaches a non-enumerable `~standard` when the caller supplied a
  // Standard Schema validator, so reuse it instead of recompiling the JSON Schema projection.
  const standardSchema = Object.getOwnPropertyDescriptor(normalized.inputSchema, '~standard');
  if (standardSchema && !standardSchema.enumerable && isMcpStandardSchema(normalized.inputSchema)) {
    return normalized.inputSchema;
  }
  // SAFETY: normalizeInputSchema supplies the built-in object schema or a serialized and reparsed
  // JSON object from the caller/StandardJSONSchema converter. The StandardJSONSchema output owner
  // permits modern and extension keywords beyond the SDK's narrower declaration. This bridge only
  // hands that object to the SDK compiler; its dialect selection and keyword/data validation remain
  // authoritative, rather than claiming that serialization validated each schema keyword.
  return fromJsonSchema<WebMcpToolObjectInput>(
    normalized.inputSchema as Parameters<typeof fromJsonSchema>[0]
  );
}

function toMcpAnnotations(
  annotations: ToolAnnotations | undefined
): McpToolAnnotations | undefined {
  if (!annotations) return undefined;
  const { untrustedContentHint: _untrustedContentHint, ...mcpAnnotations } = annotations;
  return mcpAnnotations;
}

function parseNativeInputSchema(
  serialized: string | undefined
): WebMCP.ModelContextTool['inputSchema'] {
  if (serialized === undefined) return undefined;
  const schema: unknown = JSON.parse(serialized);
  if (!isPlainObject(schema)) {
    throw new TypeError('inputSchema must be an object');
  }
  return schema;
}

function toNativeTool(
  tool: ToolDescriptor<WebMcpToolInput>,
  inputSchema: WebMCP.ModelContextTool['inputSchema'],
  execute: ModelContextTool<WebMcpToolInput>['execute']
): WebMCP.ModelContextTool {
  const annotations = tool.annotations ? toWebMcpAnnotations(tool.annotations) : undefined;
  const nativeTool: WebMCP.ModelContextTool = {
    name: tool.name,
    description: tool.description,
    execute,
  };
  if (tool.title !== undefined) nativeTool.title = tool.title;
  if (inputSchema !== undefined) nativeTool.inputSchema = inputSchema;
  if (annotations) nativeTool.annotations = annotations;
  return nativeTool;
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

  private readonly native: ModelContext;
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
  private readonly nativeToolChangeListener: EventListener;
  private closed = false;
  private closePromise: Promise<void> | undefined;
  private ontoolchangeHandler: ModelContext['ontoolchange'] = null;
  private readonly ontoolchangeListener: EventListener = (event) => {
    this.ontoolchangeHandler?.call(this, event);
  };

  constructor(serverInfo: Implementation, options: BrowserMcpServerOptions = {}) {
    super();
    const { native: suppliedContext, ...serverOptions } = options;
    if (!suppliedContext && !globalThis.document?.modelContext) installWebMCP();
    const native = suppliedContext ?? globalThis.document?.modelContext;
    if (!native) {
      throw new Error('BrowserMcpServer requires a WebMCP context in a secure document');
    }
    this.mcpServer = new McpServer(serverInfo, {
      ...serverOptions,
      capabilities: mergeCapabilities(serverOptions.capabilities ?? {}, {
        tools: { listChanged: true },
        resources: { listChanged: true },
        prompts: { listChanged: true },
      }),
    });
    this.native = native;
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
    native.addEventListener('toolchange', this.nativeToolChangeListener);
  }

  get ontoolchange(): ModelContext['ontoolchange'] {
    return this.ontoolchangeHandler;
  }

  set ontoolchange(handler: ModelContext['ontoolchange']) {
    const listener = typeof handler === 'function' ? handler : null;
    if (listener === null) {
      this.ontoolchangeHandler = null;
      super.removeEventListener('toolchange', this.ontoolchangeListener);
      return;
    }

    if (this.ontoolchangeHandler === null) {
      super.addEventListener('toolchange', this.ontoolchangeListener);
    }
    this.ontoolchangeHandler = listener;
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
    const signal = options.signal
      ? AbortSignal.any([options.signal, controller.signal])
      : controller.signal;

    const nativeInputSchema = parseNativeInputSchema(normalized.registeredInputSchema);
    this.nativeToolAbortControllers.set(tool.name, controller);
    try {
      await this.native.registerTool(toNativeTool(tool, nativeInputSchema, execute), {
        ...options,
        signal,
      });
    } catch (error) {
      controller.abort();
      if (this.nativeToolAbortControllers.get(tool.name) === controller) {
        this.nativeToolAbortControllers.delete(tool.name);
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

  private validateToolDescriptor(tool: ToolDescriptor<WebMcpToolInput>): NormalizedInputSchema {
    validateWebMcpToolDescriptor(tool);
    if (this.tools.has(tool.name) || this.pendingTools.has(tool.name)) {
      throw createInvalidStateError(`Tool already registered: ${tool.name}`);
    }
    return normalizeInputSchema(tool.inputSchema);
  }

  private registerToolInMcp(
    tool: ToolDescriptor<WebMcpToolInput>,
    normalized: NormalizedInputSchema,
    executeTool: ModelContextTool<WebMcpToolInput>['execute'],
    exposedTo: readonly string[] | undefined
  ): RegisteredWebMcpTool {
    const outputSchema =
      tool.outputSchema === undefined ? undefined : structuredClone(tool.outputSchema);
    const mcpOutputSchema = outputSchema === undefined ? undefined : fromJsonSchema(outputSchema);
    const mcpAnnotations = toMcpAnnotations(tool.annotations);
    const mcpCompatibleInput =
      normalized.inputSchema.type === undefined || normalized.inputSchema.type === 'object';
    const config: Omit<Parameters<McpServer['registerTool']>[1], 'inputSchema' | 'outputSchema'> & {
      inputSchema?: ReturnType<typeof toMcpInputSchema>;
      outputSchema?: NonNullable<typeof mcpOutputSchema>;
    } = {
      description: tool.description,
    };
    if (mcpCompatibleInput) config.inputSchema = toMcpInputSchema(normalized);
    if (tool.title !== undefined) config.title = tool.title;
    if (mcpOutputSchema) config.outputSchema = mcpOutputSchema;
    if (mcpAnnotations) config.annotations = mcpAnnotations;
    const mcpHandle = mcpCompatibleInput
      ? this.mcpServer.registerTool(tool.name, config, async (args, context) => {
          const result = await executeTool(args, { signal: context.mcpReq.signal });
          if (isInputRequiredResult(result)) {
            throw new Error(
              `WebMCP tool "${tool.name}" returned input_required. Multi-round tool flows require BrowserMcpServer.mcpServer.registerTool().`
            );
          }
          return normalizeToolResponse(result);
        })
      : undefined;
    // A restricted tool is never observable on the wire before its audience is
    // checked: the handle is disabled here, in the same synchronous step that created
    // it, and only applyToolExposure re-enables it.
    if (exposedTo?.length) mcpHandle?.disable();

    if (!mcpCompatibleInput) {
      console.warn(
        `[BrowserMcpServer] Tool "${tool.name}" remains available through WebMCP but cannot be exposed over MCP because MCP input schemas require an object root.`
      );
    }

    const item: ToolListItem = {
      name: tool.name,
      description: tool.description,
      inputSchema: normalized.inputSchema,
    };
    if (tool.title !== undefined) item.title = tool.title;
    if (outputSchema !== undefined) item.outputSchema = outputSchema;
    if (tool.annotations) item.annotations = tool.annotations;
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
    const normalized = this.validateToolDescriptor(tool);
    options.signal?.throwIfAborted();
    const callback = tool.execute;
    const execute: ModelContextTool<WebMcpToolInput>['execute'] = async (args, options) => {
      options.signal.throwIfAborted();
      return withAbortSignal(
        Promise.resolve().then(() => callback(args, options)),
        options.signal
      );
    };
    const controller = new AbortController();
    let registered: RegisteredWebMcpTool | undefined;
    const abort = () => {
      if (this.pendingTools.get(tool.name) === controller) {
        this.pendingTools.delete(tool.name);
      }
      if (registered && this.tools.get(tool.name) === registered) {
        this.removeTool(tool.name);
      } else {
        this.abortNativeToolMirror(tool.name, controller);
      }
    };
    options.signal?.addEventListener('abort', abort, { once: true });
    this.pendingTools.set(tool.name, controller);
    try {
      await this.registerNativeToolMirror(tool, normalized, options, execute, controller);
      if (this.closed) throw createInvalidStateError('BrowserMcpServer is closed');
      options.signal?.throwIfAborted();
      registered = this.registerToolInMcp(
        tool,
        normalized,
        execute,
        options.exposedTo?.map((origin) => {
          const parsedOrigin = new URL(origin).origin;
          // Keep exact extension identifiers when this browser cannot parse their origin.
          return parsedOrigin === 'null' ? origin : parsedOrigin;
        })
      );
      this.tools.set(tool.name, registered);
      this.applyToolExposure();
      if (options.signal?.aborted) {
        abort();
        options.signal.throwIfAborted();
      }
    } catch (error) {
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
    const sync = this.nativeSyncQueue.then(async () => {
      if (this.closed) return;
      await this.backfillNativeStandardTools(this.native);
    });
    this.nativeSyncQueue = sync.then(
      () => undefined,
      () => undefined
    );
    return sync;
  }

  private async backfillNativeStandardTools(native: ModelContext): Promise<void> {
    // MCP serves this frame's subtree. Importing ancestor or sibling tools
    // would feed iframe bridges back into their source and repeatedly prefix
    // the same tools. Descendants remain available to top-frame clients.
    const ownerWindow = this.ownerDocument?.defaultView;
    const tools = (await native.getTools()).filter((tool) => {
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
    const nextTools = new Map<string, NativeBackfilledTool>();
    const nativeNames = new Set(tools.map(({ name }) => name));
    for (const name of this.removingNativeTools) {
      if (!nativeNames.has(name)) this.removingNativeTools.delete(name);
    }
    for (const tool of tools) {
      // ponytail: MCP tool names are global, so keep the first valid visible tool.
      // Add origin-qualified aliases if MCP gains scoped tool identity.
      if (
        nextTools.has(tool.name) ||
        this.pendingTools.has(tool.name) ||
        this.removingNativeTools.has(tool.name)
      ) {
        continue;
      }
      let inputSchema: InputSchema | undefined = DEFAULT_INPUT_SCHEMA;
      if (tool.inputSchema !== undefined) {
        try {
          // Detach the schema from the page and reject values that cannot cross JSON.
          const serialized = serializeInputSchema(tool.inputSchema);
          const parsed: unknown = JSON.parse(serialized);
          inputSchema = isPlainObject(parsed) ? parsed : undefined;
        } catch {
          inputSchema = undefined;
        }
      }
      if (!inputSchema) {
        console.warn(
          `[BrowserMcpServer] Native tool "${tool.name}" was not exposed over MCP because its input schema is malformed.`
        );
        continue;
      }
      const item: ToolListItem = {
        name: tool.name,
        description: tool.description,
        inputSchema,
      };
      if (tool.title !== undefined) item.title = tool.title;
      if (tool.annotations) item.annotations = tool.annotations;
      nextTools.set(tool.name, {
        source: tool,
        item,
        fingerprint: JSON.stringify(item),
      });
    }

    for (const [name, current] of this.nativeBackfilledTools) {
      const next = nextTools.get(name);
      if (!next || next.fingerprint !== current.fingerprint) {
        this.removeTool(name, { skipNative: true });
        continue;
      }
      this.nativeBackfilledTools.set(name, next);
    }

    for (const [name, next] of nextTools) {
      if (this.tools.has(name)) continue;
      const execute: ModelContextTool<WebMcpToolInput>['execute'] = async (args, options) => {
        const currentTool = this.nativeBackfilledTools.get(name)?.source;
        if (!currentTool) throw new Error(`Native tool not found: ${name}`);
        return parseNativeToolResult(await native.executeTool(currentTool, args, options));
      };
      const tool: ToolDescriptor<WebMcpToolInput> = {
        name,
        description: next.item.description,
        inputSchema: next.item.inputSchema,
        execute,
      };
      if (next.item.title !== undefined) tool.title = next.item.title;
      if (next.item.annotations) tool.annotations = next.item.annotations;
      try {
        const normalized = this.validateToolDescriptor(tool);
        // Native getTools() does not report the allowlist a tool registered with, so a
        // backfilled mirror carries none and stays as widely exposed as it is today.
        this.tools.set(tool.name, this.registerToolInMcp(tool, normalized, execute, undefined));
        this.nativeBackfilledTools.set(name, next);
      } catch (error) {
        console.warn(
          `[BrowserMcpServer] Native tool "${name}" was not exposed over MCP because its schema could not be compiled:`,
          error
        );
      }
    }
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
    return this.native.getTools(options);
  }

  async executeTool(...args: Parameters<ModelContext['executeTool']>): Promise<string> {
    if (this.closed) throw createInvalidStateError('BrowserMcpServer is closed');
    return this.native.executeTool(...args);
  }

  /**
   * Re-evaluate which registered tools may appear on the wire.
   *
   * `exposedTo` narrows a tool to named embedder origins. The peer origin is only known
   * once a transport that reports one has heard from its peer, so a restricted tool stays
   * disabled until then — and stays disabled forever on transports that cannot name a peer
   * at all. Failing closed keeps a tool that asked for a narrow audience from reaching a
   * wider one; unrestricted tools are untouched and behave exactly as before.
   */
  private applyToolExposure(): void {
    for (const { exposedTo, mcpHandle } of this.tools.values()) {
      if (!exposedTo?.length || !mcpHandle) continue;
      // Opaque origins serialize identically and cannot identify an allowed peer.
      const visible =
        this.peerOrigin !== undefined &&
        this.peerOrigin !== 'null' &&
        exposedTo.includes(this.peerOrigin);
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
      this.native.removeEventListener('toolchange', this.nativeToolChangeListener);
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
