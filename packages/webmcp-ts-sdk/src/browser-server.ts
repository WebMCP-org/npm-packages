import {
  coerceWebMcpToolDescriptor,
  createInvalidStateError,
  createToolInvocationFailedError,
  createUnknownError,
  isPlainObject,
  normalizeToolResponse,
  normalizeInputSchema,
  parseChromeToolInput,
  serializeChromeToolResult,
  toWebMcpAnnotations,
  validateExecutableOrigin,
  validatePotentiallyTrustworthyOrigins,
  validateWebMcpAccess,
  validateWebMcpToolDescriptor,
  withAbortSignal,
} from '@mcp-b/webmcp-polyfill/schema';
import type { NormalizedInputSchema } from '@mcp-b/webmcp-polyfill/schema';
import type {
  ChromeModelContextExecuteToolOptions,
  ChromeModelContextExtensions,
  InputSchema,
  ModelContext,
  ModelContextGetToolOptions,
  ModelContextRegisterToolOptions,
  ModelContextTool,
  ModelContextWithExtensions,
  RegistrationHandle,
  RegisteredTool,
  ToolAnnotations,
  ToolDescriptor,
  ToolListItem,
  WebMcpToolInput,
} from '@mcp-b/webmcp-types';
import {
  fromJsonSchema,
  isInputRequiredResult,
  McpServer,
  mergeCapabilities,
  ResourceTemplate,
  type GetPromptResult,
  type Implementation,
  type ReadResourceResult,
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

interface RegisteredWebMcpTool {
  item: ToolListItem;
  registeredInputSchema?: string;
  execute: (args: WebMcpToolInput, signal?: AbortSignal) => Promise<unknown>;
  mcpHandle: McpRegisteredTool | undefined;
  exposedTo?: readonly string[];
  abortSignal?: AbortSignal;
  abortListener?: () => void;
}

type McpRegistration = McpRegisteredPrompt | McpRegisteredResource | McpRegisteredResourceTemplate;

export interface BrowserMcpServerOptions extends ServerOptions {
  native?: ModelContext;
}

type NativeStandardToolsApi = ModelContext & {
  executeTool: NonNullable<ChromeModelContextExtensions['executeTool']>;
};
type NativeRegisterToolFn = (
  tool: ModelContextTool<WebMcpToolInput>,
  options?: ModelContextRegisterToolOptions
) => Promise<void>;

interface NativeBackfilledTool {
  source: RegisteredTool;
  item: ToolListItem;
  fingerprint: string;
}

function parseNativeToolResult(serialized: string | null): unknown {
  if (serialized === null) {
    return {
      content: [{ type: 'text', text: 'Tool execution interrupted by navigation' }],
      isError: true,
    };
  }

  let result: unknown;
  try {
    result = JSON.parse(serialized);
  } catch {
    return normalizeToolResponse(serialized);
  }
  return isInputRequiredResult(result) ? result : normalizeToolResponse(result);
}

function toMcpInputSchema(
  normalized: NormalizedInputSchema
): StandardSchemaWithJSON<Record<string, unknown>> {
  // normalizeInputSchema() attaches a non-enumerable `~standard` when the caller supplied a
  // Standard Schema validator, so reuse it instead of recompiling the JSON Schema projection.
  const standardSchema = Object.getOwnPropertyDescriptor(normalized.inputSchema, '~standard');
  return standardSchema && !standardSchema.enumerable
    ? (normalized.inputSchema as unknown as StandardSchemaWithJSON<Record<string, unknown>>)
    : fromJsonSchema<Record<string, unknown>>(
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

function toNativeTool(
  tool: ToolDescriptor<WebMcpToolInput>,
  inputSchema: InputSchema | undefined,
  execute: ModelContextTool<WebMcpToolInput>['execute']
): ModelContextTool<WebMcpToolInput> {
  const annotations = tool.annotations ? toWebMcpAnnotations(tool.annotations) : undefined;
  return {
    name: tool.name,
    ...(tool.title !== undefined ? { title: tool.title } : {}),
    description: tool.description,
    ...(inputSchema !== undefined ? { inputSchema } : {}),
    ...(annotations ? { annotations } : {}),
    execute,
  };
}

/**
 * Thin WebMCP-to-MCP v2 adapter.
 *
 * The official v2 `McpServer` owns MCP registration, validation, and transport
 * behavior. This class only adds the document-facing WebMCP contract and native
 * Chrome mirroring.
 */
export class BrowserMcpServer extends EventTarget implements ModelContextWithExtensions {
  readonly [SERVER_MARKER_PROPERTY] = true as const;
  readonly mcpServer: McpServer;

  private readonly native: ModelContext | undefined;
  private readonly ownerDocument: Document | null;
  private readonly tools = new Map<string, RegisteredWebMcpTool>();
  private peerOrigin: string | undefined;
  private readonly registrations = new Set<McpRegistration>();
  private readonly nativeToolAbortControllers = new Map<string, AbortController>();
  private readonly nativeBackfilledTools = new Map<string, NativeBackfilledTool>();
  private readonly pendingTools = new Map<string, AbortController>();
  private readonly removingNativeTools = new Set<string>();
  private nativeSyncQueue: Promise<void> = Promise.resolve();
  private nativeToolChangeQueue: Promise<void> = Promise.resolve();
  private nativeToolChangeListener: EventListener | undefined;
  private closed = false;
  private closePromise: Promise<void> | undefined;
  private ontoolchangeHandler: ((this: ModelContext, event: Event) => unknown) | null = null;
  private readonly ontoolchangeListener: EventListener = (event) => {
    this.ontoolchangeHandler?.call(this, event);
  };

  constructor(serverInfo: Implementation, options: BrowserMcpServerOptions = {}) {
    super();
    const { native, ...serverOptions } = options;
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
    if (
      native &&
      typeof native.addEventListener === 'function' &&
      typeof native.removeEventListener === 'function'
    ) {
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
  }

  get ontoolchange(): ((this: ModelContext, event: Event) => unknown) | null {
    return this.ontoolchangeHandler;
  }

  set ontoolchange(handler: ((this: ModelContext, event: Event) => unknown) | null) {
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

  private getNativeStandardToolsApi(): NativeStandardToolsApi | undefined {
    const candidate: (ModelContext & Partial<ChromeModelContextExtensions>) | undefined =
      this.native;
    return candidate && typeof candidate.executeTool === 'function'
      ? (candidate as NativeStandardToolsApi)
      : undefined;
  }

  private async registerNativeToolMirror(
    tool: ToolDescriptor<WebMcpToolInput>,
    normalized: NormalizedInputSchema,
    options: ModelContextRegisterToolOptions,
    execute: RegisteredWebMcpTool['execute'],
    controller: AbortController
  ): Promise<void> {
    if (!this.native) return;

    // The overload set keys on a statically known inputSchema; mirrored tools carry a dynamic one.
    const nativeRegister = this.native.registerTool as unknown as NativeRegisterToolFn;
    const signal = options.signal
      ? AbortSignal.any([options.signal, controller.signal])
      : controller.signal;

    const nativeInputSchema =
      normalized.registeredInputSchema === undefined
        ? undefined
        : (JSON.parse(normalized.registeredInputSchema) as InputSchema);
    this.nativeToolAbortControllers.set(tool.name, controller);
    try {
      await nativeRegister.call(
        this.native,
        toNativeTool(tool, nativeInputSchema, (input) => execute(input)),
        { ...options, signal }
      );
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
    executeTool: RegisteredWebMcpTool['execute'],
    exposedTo: readonly string[] | undefined
  ): RegisteredWebMcpTool {
    const outputSchema =
      tool.outputSchema === undefined ? undefined : structuredClone(tool.outputSchema);
    const mcpOutputSchema =
      outputSchema === undefined
        ? undefined
        : fromJsonSchema(outputSchema as Parameters<typeof fromJsonSchema>[0]);
    const mcpAnnotations = toMcpAnnotations(tool.annotations);
    const mcpCompatibleInput =
      normalized.inputSchema.type === undefined || normalized.inputSchema.type === 'object';
    const mcpHandle = mcpCompatibleInput
      ? this.mcpServer.registerTool(
          tool.name,
          {
            ...(tool.title !== undefined ? { title: tool.title } : {}),
            description: tool.description,
            inputSchema: toMcpInputSchema(normalized),
            ...(mcpOutputSchema ? { outputSchema: mcpOutputSchema } : {}),
            ...(mcpAnnotations ? { annotations: mcpAnnotations } : {}),
          },
          async (args, context) => {
            const result = await executeTool(args, context.mcpReq.signal);
            if (isInputRequiredResult(result)) {
              throw new Error(
                `WebMCP tool "${tool.name}" returned input_required. Multi-round tool flows require BrowserMcpServer.mcpServer.registerTool().`
              );
            }
            return normalizeToolResponse(result);
          }
        )
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
      ...(tool.title !== undefined ? { title: tool.title } : {}),
      description: tool.description,
      inputSchema: normalized.inputSchema,
      ...(outputSchema === undefined ? {} : { outputSchema }),
      ...(tool.annotations ? { annotations: tool.annotations } : {}),
    };
    return {
      item,
      ...(normalized.registeredInputSchema !== undefined
        ? { registeredInputSchema: normalized.registeredInputSchema }
        : {}),
      execute: executeTool,
      mcpHandle,
      ...(exposedTo?.length ? { exposedTo } : {}),
    };
  }

  readonly registerTool: ModelContextWithExtensions['registerTool'] = async (
    toolValue: unknown,
    optionsValue: ModelContextRegisterToolOptions | null = {}
  ): Promise<void> => {
    const options = optionsValue ?? {};
    validateWebMcpAccess(this.ownerDocument);
    if (this.closed) throw createInvalidStateError('BrowserMcpServer is closed');
    if (!isPlainObject(toolValue)) {
      throw new TypeError('registerTool(tool) requires a tool object');
    }
    const tool = coerceWebMcpToolDescriptor(toolValue);
    const normalized = this.validateToolDescriptor(tool);
    options.signal?.throwIfAborted();
    validatePotentiallyTrustworthyOrigins(options.exposedTo);
    options.signal?.throwIfAborted();
    const execute: RegisteredWebMcpTool['execute'] = async (args, signal) => {
      signal?.throwIfAborted();
      return withAbortSignal(
        Promise.resolve().then(() => Reflect.apply(tool.execute, undefined, [args])),
        signal
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
      registered = this.registerToolInMcp(tool, normalized, execute, options.exposedTo);
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
      if (this.native) await this.nativeToolChangeQueue;
      else await this.notifyProducerToolsChanged();
    }
    if (this.closed) throw createInvalidStateError('BrowserMcpServer is closed');
    options.signal?.throwIfAborted();
  };

  private removeTool(name: string, options?: { skipNative?: boolean; notify?: boolean }): void {
    const registered = this.tools.get(name);
    if (registered) {
      if (registered.abortSignal && registered.abortListener) {
        registered.abortSignal.removeEventListener('abort', registered.abortListener);
      }
      this.tools.delete(name);
      this.nativeBackfilledTools.delete(name);
      registered.mcpHandle?.remove();
      if ((options?.notify ?? true) && !this.native) {
        void this.notifyProducerToolsChanged();
      }
    }
    if (!options?.skipNative) this.abortNativeToolMirror(name);
  }

  syncNativeTools(): Promise<void> {
    const sync = this.nativeSyncQueue.then(async () => {
      if (this.closed) return;
      const native = this.getNativeStandardToolsApi();
      if (native) await this.backfillNativeStandardTools(native);
    });
    this.nativeSyncQueue = sync.then(
      () => undefined,
      () => undefined
    );
    return sync;
  }

  private async backfillNativeStandardTools(native: NativeStandardToolsApi): Promise<void> {
    const tools = await native.getTools();
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
          // An object since webmcp#241; a serialized string from older Chrome. The
          // round-trip detaches the object from the page's graph and rejects non-JSON.
          const serialized =
            typeof tool.inputSchema === 'string'
              ? tool.inputSchema
              : JSON.stringify(tool.inputSchema);
          const parsed: unknown = JSON.parse(serialized);
          inputSchema = isPlainObject(parsed) ? (parsed as InputSchema) : undefined;
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
        ...(tool.title !== undefined ? { title: tool.title } : {}),
        description: tool.description,
        inputSchema,
        ...(tool.annotations ? { annotations: tool.annotations } : {}),
      };
      nextTools.set(tool.name, {
        source: tool,
        item,
        fingerprint: JSON.stringify(item),
      });
    }

    for (const [name, current] of this.nativeBackfilledTools) {
      const next = nextTools.get(name);
      if (!next || next.fingerprint !== current.fingerprint) {
        this.removeTool(name, { skipNative: true, notify: false });
        continue;
      }
      this.nativeBackfilledTools.set(name, next);
    }

    for (const [name, next] of nextTools) {
      if (this.tools.has(name)) continue;
      const execute = async (args: WebMcpToolInput, signal?: AbortSignal) => {
        const currentTool = this.nativeBackfilledTools.get(name)?.source;
        if (!currentTool) throw new Error(`Native tool not found: ${name}`);
        const input = JSON.stringify(args);
        return parseNativeToolResult(
          signal
            ? await native.executeTool.call(this.native, currentTool, input, { signal })
            : await native.executeTool.call(this.native, currentTool, input)
        );
      };
      const tool: ToolDescriptor<WebMcpToolInput> = {
        name,
        ...(next.item.title !== undefined ? { title: next.item.title } : {}),
        description: next.item.description,
        inputSchema: next.item.inputSchema,
        ...(next.item.annotations ? { annotations: next.item.annotations } : {}),
        execute: (args) => execute(args),
      };
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
    const config = {
      ...(registeredDescriptor.description !== undefined
        ? { description: registeredDescriptor.description }
        : {}),
      ...(registeredDescriptor.mimeType !== undefined
        ? { mimeType: registeredDescriptor.mimeType }
        : {}),
    };
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
    const registeredDescriptor = {
      ...descriptor,
      ...(descriptor.argsSchema === undefined
        ? {}
        : { argsSchema: structuredClone(descriptor.argsSchema) }),
    };
    const argsSchema =
      registeredDescriptor.argsSchema === undefined
        ? undefined
        : fromJsonSchema<Record<string, string>>(
            registeredDescriptor.argsSchema as Parameters<typeof fromJsonSchema>[0]
          );
    const mcpHandle = this.mcpServer.registerPrompt(
      registeredDescriptor.name,
      {
        ...(registeredDescriptor.description !== undefined
          ? { description: registeredDescriptor.description }
          : {}),
        ...(argsSchema ? { argsSchema } : {}),
      },
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
    validateWebMcpAccess(this.ownerDocument);
    if (this.closed) throw createInvalidStateError('BrowserMcpServer is closed');
    if (this.native) {
      return this.native.getTools(options);
    }
    validatePotentiallyTrustworthyOrigins(options?.fromOrigins);
    if (options?.fromOrigins?.length) {
      throw new DOMException(
        'Cross-document tool discovery requires native WebMCP',
        'NotSupportedError'
      );
    }

    const origin = globalThis.location?.origin ?? '';
    const currentWindow = globalThis.window;

    const tools = [...this.tools.values()]
      .map(({ item, registeredInputSchema }) => {
        // A fresh object per call, aligned with the polyfill's post-webmcp#241
        // shape. A custom toJSON can serialize to non-object JSON; omit those
        // rather than emit a value consumers would mistake for a pre-154
        // serialized string.
        const parsed: unknown =
          registeredInputSchema === undefined ? undefined : JSON.parse(registeredInputSchema);
        return {
          name: item.name,
          title: item.title ?? '',
          description: item.description,
          ...(isPlainObject(parsed) ? { inputSchema: parsed } : {}),
          origin,
          window: currentWindow,
          ...(item.annotations ? { annotations: toWebMcpAnnotations(item.annotations) } : {}),
        };
      })
      .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    await new Promise((resolve) => setTimeout(resolve, 0));
    return tools;
  }

  async executeTool(
    tool: RegisteredTool,
    inputArgsJson: string,
    options?: ChromeModelContextExecuteToolOptions
  ): Promise<string | null> {
    validateWebMcpAccess(this.ownerDocument);
    if (this.closed) throw createInvalidStateError('BrowserMcpServer is closed');
    const native = this.getNativeStandardToolsApi();
    if (native) {
      return native.executeTool.call(this.native, tool, inputArgsJson, options);
    }

    if (tool === null || typeof tool !== 'object') {
      throw new TypeError('RegisteredTool must be an object');
    }
    for (const required of ['name', 'description', 'window', 'origin'] as const) {
      if (!(required in tool)) {
        throw new TypeError(`RegisteredTool.${required} is required`);
      }
    }
    validateExecutableOrigin(tool.origin);
    const origin = globalThis.location?.origin ?? '';
    const currentWindow = globalThis.window;
    if (tool.origin !== origin || tool.window !== currentWindow) {
      throw createUnknownError(`Native tool not found: ${tool.name}`);
    }
    options?.signal?.throwIfAborted();
    const registered = this.tools.get(tool.name);
    if (!registered) throw createUnknownError(`Tool not found: ${tool.name}`);
    const args = parseChromeToolInput(inputArgsJson);
    try {
      const result = await withAbortSignal(
        registered.execute(args, options?.signal),
        registered.abortSignal,
        () => createUnknownError('Tool unregistered')
      );
      return serializeChromeToolResult(result);
    } catch (error) {
      if (options?.signal?.aborted && error === options.signal.reason) throw error;
      if (registered.abortSignal?.aborted) throw error;
      throw createToolInvocationFailedError(error);
    }
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
      const visible = this.peerOrigin !== undefined && exposedTo.includes(this.peerOrigin);
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
    if (!('clientOrigin' in transport)) return;
    const peered = transport as Transport & {
      clientOrigin?: string;
      onclientorigin?: (origin: string) => void;
    };
    this.peerOrigin = peered.clientOrigin;
    this.applyToolExposure();
    const previous = peered.onclientorigin;
    peered.onclientorigin = (origin) => {
      previous?.(origin);
      this.peerOrigin = origin;
      this.applyToolExposure();
    };
  }

  connect(transport: Transport): Promise<void> {
    if (this.closed) return Promise.reject(createInvalidStateError('BrowserMcpServer is closed'));
    this.observePeerOrigin(transport);
    return this.mcpServer.connect(transport);
  }

  close(): Promise<void> {
    if (this.closePromise) return this.closePromise;
    this.closed = true;
    this.closePromise = (async () => {
      if (this.native && this.nativeToolChangeListener) {
        this.native.removeEventListener('toolchange', this.nativeToolChangeListener);
        this.nativeToolChangeListener = undefined;
      }
      for (const name of this.nativeToolAbortControllers.keys()) {
        this.abortNativeToolMirror(name);
      }
      for (const name of this.tools.keys()) {
        this.removeTool(name, { notify: false });
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
