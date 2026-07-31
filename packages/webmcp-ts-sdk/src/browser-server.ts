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
} from '@mcp-b/webmcp-polyfill/schema';
import type { NormalizedInputSchema } from '@mcp-b/webmcp-polyfill/schema';
import type {
  ChromeModelContextExecuteToolOptions,
  ChromeModelContextExtensions,
  InputSchema,
  JsonSchemaForInference,
  ModelContextClient,
  ModelContextCore,
  ModelContextGetToolOptions,
  ModelContextRegisterToolOptions,
  ModelContextTool,
  ModelContextToolReference,
  ModelContextWithExtensions,
  RegisteredTool,
  ToolAnnotations,
  ToolDescriptor,
  ToolDescriptorFromSchema,
  ToolListItem,
  ToolRawResult,
} from '@mcp-b/webmcp-types';
import {
  fromJsonSchema,
  isInputRequiredResult,
  McpServer,
  mergeCapabilities,
  ProtocolError,
  ProtocolErrorCode,
  ResourceTemplate,
  type CreateMessageRequest,
  type CreateMessageRequestParamsBase,
  type CreateMessageRequestParamsWithTools,
  type CreateMessageResult,
  type CreateMessageResultWithTools,
  type ElicitRequest,
  type ElicitResult,
  type GetPromptResult,
  type Implementation,
  type ReadResourceResult,
  type RegisteredPrompt as McpRegisteredPrompt,
  type RegisteredResource as McpRegisteredResource,
  type RegisteredResourceTemplate as McpRegisteredResourceTemplate,
  type RegisteredTool as McpRegisteredTool,
  type RequestOptions,
  type ServerOptions,
  type StandardSchemaWithJSON,
  type ToolAnnotations as McpToolAnnotations,
  type Transport,
  type Variables,
} from '@modelcontextprotocol/server';

const DEFAULT_INPUT_SCHEMA = normalizeInputSchema(undefined).inputSchema;
const DEFAULT_CLIENT_REQUEST_TIMEOUT = 10_000;
export const SERVER_MARKER_PROPERTY = '__isBrowserMcpServer' as const;

interface RegisteredWebMcpTool {
  title?: string;
  description?: string;
  inputSchema: InputSchema;
  registeredInputSchema?: string;
  outputSchema?: JsonSchemaForInference;
  annotations?: ToolAnnotations;
  execute: (args: Record<string, unknown>, signal?: AbortSignal) => Promise<unknown>;
  mcpHandle: McpRegisteredTool | undefined;
  abortSignal?: AbortSignal;
  abortListener?: () => void;
}

interface RegisteredWebMcpResource {
  descriptor: ResourceDescriptor;
  mcpHandle: McpRegisteredResource | McpRegisteredResourceTemplate;
  template?: ResourceTemplate;
}

interface RegisteredWebMcpPrompt {
  descriptor: PromptDescriptor;
  argsSchema?: StandardSchemaWithJSON<Record<string, string>>;
  mcpHandle: McpRegisteredPrompt;
}

export interface BrowserMcpServerOptions extends ServerOptions {
  native?: ModelContextCore;
}

type NativeStandardToolsApi = ModelContextCore & {
  executeTool: NonNullable<ChromeModelContextExtensions['executeTool']>;
};
type NativeRegisterToolFn = (
  tool: ModelContextTool,
  options?: ModelContextRegisterToolOptions
) => void | PromiseLike<void>;
type NativeUnregisterToolFn = (nameOrTool: string | ModelContextToolReference) => void;

interface NativeToolCleanup {
  abort(): void;
  nativeSignalAccepted: boolean;
}

interface NativeBackfilledTool {
  source: RegisteredTool;
  item: ToolListItem;
  fingerprint: string;
}

function parseNativeToolInputSchema(inputSchema: string | undefined): InputSchema | undefined {
  if (inputSchema === undefined) return DEFAULT_INPUT_SCHEMA;
  try {
    const parsed = JSON.parse(inputSchema) as unknown;
    if (isPlainObject(parsed)) return parsed as InputSchema;
  } catch {
    // Invalid native metadata is skipped by the reconciliation boundary.
  }
  return undefined;
}

function toToolListItemFromNativeToolInfo(tool: RegisteredTool): ToolListItem | undefined {
  const inputSchema = parseNativeToolInputSchema(tool.inputSchema);
  if (!inputSchema) return undefined;
  return {
    name: tool.name,
    ...(tool.title !== undefined ? { title: tool.title } : {}),
    description: tool.description ?? '',
    inputSchema,
    ...(tool.annotations ? { annotations: tool.annotations } : {}),
  };
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

function withDefaultTimeout(options?: RequestOptions): RequestOptions {
  return options?.signal
    ? options
    : { ...options, timeout: options?.timeout ?? DEFAULT_CLIENT_REQUEST_TIMEOUT };
}

function toMcpInputSchema(
  normalized: NormalizedInputSchema
): StandardSchemaWithJSON<Record<string, unknown>> {
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
  tool: ToolDescriptor,
  inputSchema: InputSchema | undefined,
  execute: ModelContextTool['execute']
): ModelContextTool {
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
  readonly server: McpServer['server'];

  private readonly mcpServer: McpServer;
  private readonly native: ModelContextCore | undefined;
  private readonly tools = new Map<string, RegisteredWebMcpTool>();
  private readonly resources = new Map<string, RegisteredWebMcpResource>();
  private readonly prompts = new Map<string, RegisteredWebMcpPrompt>();
  private readonly nativeToolCleanups = new Map<string, NativeToolCleanup>();
  private readonly nativeBackfilledTools = new Map<string, NativeBackfilledTool>();
  private nativeSyncQueue: Promise<void> = Promise.resolve();
  private nativeToolChangeListener: EventListener | undefined;
  private closed = false;
  private ontoolchangeHandler: ((this: ModelContextCore, event: Event) => unknown) | null = null;
  private ontoolchangeListenerInstalled = false;
  private unregisterToolDeprecationWarned = false;
  private crossOriginDiscoveryWarned = false;
  private crossOriginExposureWarned = false;

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
    this.server = this.mcpServer.server;
    this.native = native;

    this.registerTool = this.registerTool.bind(this);
    this.unregisterTool = this.unregisterTool.bind(this);
    this.listTools = this.listTools.bind(this);
    this.getTools = this.getTools.bind(this);
    this.executeTool = this.executeTool.bind(this);
    this.registerResource = this.registerResource.bind(this);
    this.listResources = this.listResources.bind(this);
    this.readResource = this.readResource.bind(this);
    this.registerPrompt = this.registerPrompt.bind(this);
    this.listPrompts = this.listPrompts.bind(this);
    this.getPrompt = this.getPrompt.bind(this);
    this.createMessage = this.createMessage.bind(this);
    this.elicitInput = this.elicitInput.bind(this);
    this.ensureNativeToolChangeListener();
  }

  get ontoolchange(): ((this: ModelContextCore, event: Event) => unknown) | null {
    return this.ontoolchangeHandler;
  }

  set ontoolchange(handler: ((this: ModelContextCore, event: Event) => unknown) | null) {
    this.ontoolchangeHandler = handler;
    if (handler && !this.ontoolchangeListenerInstalled) {
      this.ontoolchangeListenerInstalled = true;
      super.addEventListener('toolchange', (event) => {
        this.ontoolchangeHandler?.call(this, event);
      });
    }
  }

  private notifyProducerToolsChanged(): Promise<void> {
    if (this.closed) return Promise.resolve();
    return new Promise((resolve) => {
      // ponytail: the platform does not expose its WebMCP task source; a timer
      // preserves task (rather than microtask) ordering for local registrations.
      setTimeout(() => {
        this.dispatchEvent(new Event('toolchange'));
        resolve();
      }, 0);
    });
  }

  private ensureNativeToolChangeListener(): void {
    if (!this.native || this.nativeToolChangeListener) return;
    this.nativeToolChangeListener = () => {
      if (this.closed) return;
      void this.notifyProducerToolsChanged();
      void this.syncNativeTools().catch((error: unknown) => {
        console.warn('[BrowserMcpServer] Native WebMCP tool reconciliation failed:', error);
      });
    };
    this.native.addEventListener('toolchange', this.nativeToolChangeListener);
  }

  private getNativeStandardToolsApi(): NativeStandardToolsApi | undefined {
    const candidate: (ModelContextCore & Partial<ChromeModelContextExtensions>) | undefined =
      this.native;
    return candidate && typeof candidate.executeTool === 'function'
      ? (candidate as NativeStandardToolsApi)
      : undefined;
  }

  private getNativeUnregisterTool(): NativeUnregisterToolFn | undefined {
    const native = this.native;
    if (!native || !('unregisterTool' in native)) return undefined;
    const unregisterTool = native.unregisterTool;
    return typeof unregisterTool === 'function'
      ? (nameOrTool) => unregisterTool.call(native, nameOrTool)
      : undefined;
  }

  private createNativeToolCleanup(options: ModelContextRegisterToolOptions): {
    options: ModelContextRegisterToolOptions;
    abort(): void;
  } {
    const controller = new AbortController();
    const sourceSignal = options.signal;
    const abort = () => controller.abort(sourceSignal?.reason);
    if (sourceSignal?.aborted) {
      abort();
    } else {
      sourceSignal?.addEventListener('abort', abort, { once: true });
    }

    return {
      options: {
        signal: controller.signal,
        ...(options.exposedTo ? { exposedTo: options.exposedTo } : {}),
      },
      abort: () => {
        sourceSignal?.removeEventListener('abort', abort);
        if (!controller.signal.aborted) controller.abort();
      },
    };
  }

  private async registerNativeToolMirror(
    tool: ToolDescriptor,
    normalized: NormalizedInputSchema,
    options: ModelContextRegisterToolOptions
  ): Promise<void> {
    if (!this.native) return;

    const nativeRegister = this.native.registerTool as unknown as NativeRegisterToolFn;
    const nativeUnregister = this.getNativeUnregisterTool();
    const cleanup = this.createNativeToolCleanup(options);

    const nativeCleanup: NativeToolCleanup = {
      abort: cleanup.abort,
      nativeSignalAccepted: nativeRegister.length >= 2 || !nativeUnregister,
    };

    try {
      const nativeInputSchema =
        normalized.registeredInputSchema === undefined
          ? undefined
          : (JSON.parse(normalized.registeredInputSchema) as InputSchema);
      const registration = nativeRegister.call(
        this.native,
        toNativeTool(tool, nativeInputSchema, (input) => this.executeRawTool(tool.name, input)),
        cleanup.options
      );
      this.nativeToolCleanups.set(tool.name, nativeCleanup);
      await registration;
    } catch (error) {
      cleanup.abort();
      if (this.nativeToolCleanups.get(tool.name) === nativeCleanup) {
        this.nativeToolCleanups.delete(tool.name);
      }
      throw error;
    }
  }

  private unregisterNativeToolMirror(
    name: string,
    options?: { preferAbortSignal?: boolean }
  ): void {
    const cleanup = this.nativeToolCleanups.get(name);
    this.nativeToolCleanups.delete(name);
    const nativeUnregister = this.getNativeUnregisterTool();

    if (options?.preferAbortSignal && cleanup?.nativeSignalAccepted) {
      cleanup.abort();
      return;
    }
    if (!nativeUnregister) {
      cleanup?.abort();
      return;
    }

    try {
      nativeUnregister(name);
    } finally {
      cleanup?.abort();
    }
  }

  private validateToolDescriptor(tool: ToolDescriptor): NormalizedInputSchema {
    validateWebMcpToolDescriptor(tool);
    if (this.tools.has(tool.name)) {
      throw createInvalidStateError(`Tool ${tool.name} is already registered`);
    }
    return normalizeInputSchema(tool.inputSchema);
  }

  private registerToolInMcp(
    tool: ToolDescriptor,
    normalized: NormalizedInputSchema,
    executeOverride?: (args: Record<string, unknown>, signal?: AbortSignal) => Promise<unknown>
  ): RegisteredWebMcpTool {
    const executeTool =
      executeOverride ??
      (async (args: Record<string, unknown>, signal?: AbortSignal): Promise<unknown> => {
        let active = true;
        const client: ModelContextClient = {
          requestUserInteraction: async (callback: () => Promise<unknown>): Promise<unknown> => {
            if (!active) {
              throw new Error(
                `ModelContextClient for tool "${tool.name}" is no longer active after execute() resolved`
              );
            }
            if (typeof callback !== 'function') {
              throw new TypeError('requestUserInteraction(callback) requires a function callback');
            }
            return callback();
          },
        };

        try {
          signal?.throwIfAborted();
          const result = await withAbortSignal(
            Promise.resolve().then(() => tool.execute(args, client)),
            signal
          );
          return result;
        } finally {
          active = false;
        }
      });
    const execute = async (
      args: Record<string, unknown>,
      signal?: AbortSignal
    ): Promise<unknown> => {
      const result = await executeTool(args, signal);
      if (isInputRequiredResult(result)) {
        throw new Error(
          `WebMCP tool "${tool.name}" returned input_required. Multi-round tool flows require direct McpServer registration.`
        );
      }
      return result;
    };
    const outputSchema = tool.outputSchema
      ? fromJsonSchema(tool.outputSchema as Parameters<typeof fromJsonSchema>[0])
      : undefined;
    const mcpAnnotations = toMcpAnnotations(tool.annotations);
    const mcpCompatibleInput = normalized.inputSchema.type === 'object';
    const mcpHandle = mcpCompatibleInput
      ? this.mcpServer.registerTool(
          tool.name,
          {
            ...(tool.title !== undefined ? { title: tool.title } : {}),
            description: tool.description,
            inputSchema: toMcpInputSchema(normalized),
            ...(outputSchema ? { outputSchema } : {}),
            ...(mcpAnnotations ? { annotations: mcpAnnotations } : {}),
          },
          async (args, context) => {
            const result = await execute(args, context.mcpReq.signal);
            return normalizeToolResponse(result);
          }
        )
      : undefined;
    if (!mcpCompatibleInput) {
      console.warn(
        `[BrowserMcpServer] Tool "${tool.name}" remains available through WebMCP but cannot be exposed over MCP because MCP input schemas require an object root.`
      );
    }

    return {
      ...(tool.title !== undefined ? { title: tool.title } : {}),
      description: tool.description,
      inputSchema: normalized.inputSchema,
      ...(normalized.registeredInputSchema !== undefined
        ? { registeredInputSchema: normalized.registeredInputSchema }
        : {}),
      ...(tool.outputSchema ? { outputSchema: tool.outputSchema } : {}),
      ...(tool.annotations ? { annotations: tool.annotations } : {}),
      execute,
      mcpHandle,
    };
  }

  registerTool<
    TInputSchema extends JsonSchemaForInference,
    TOutputSchema extends JsonSchemaForInference | undefined = undefined,
    TName extends string = string,
  >(
    tool: ToolDescriptorFromSchema<TInputSchema, TOutputSchema, TName>,
    options?: ModelContextRegisterToolOptions
  ): Promise<void>;
  registerTool<
    TInputSchema extends InputSchema,
    TArgs extends Record<string, unknown> = Record<string, unknown>,
    TName extends string = string,
  >(
    tool: ToolDescriptor<TArgs, ToolRawResult, TName> & {
      inputSchema: TInputSchema;
    } & (TInputSchema extends InputSchema
        ? string extends TInputSchema['type']
          ? unknown
          : never
        : unknown),
    options?: ModelContextRegisterToolOptions
  ): Promise<void>;
  registerTool<
    TArgs extends Record<string, unknown> = Record<string, unknown>,
    TName extends string = string,
  >(
    tool: Omit<ToolDescriptor<TArgs, ToolRawResult, TName>, 'inputSchema'> & {
      inputSchema?: undefined;
    },
    options?: ModelContextRegisterToolOptions
  ): Promise<void>;
  async registerTool(
    toolValue: unknown,
    options: ModelContextRegisterToolOptions = {}
  ): Promise<void> {
    validateOriginAgentCluster();
    if (this.closed) throw createInvalidStateError('BrowserMcpServer is closed');
    if (!isPlainObject(toolValue)) {
      throw new TypeError('registerTool(tool) requires a tool object');
    }
    const tool = coerceWebMcpToolDescriptor(toolValue as unknown as ToolDescriptor);
    const normalized = this.validateToolDescriptor(tool);
    options.signal?.throwIfAborted();
    validatePotentiallyTrustworthyOrigins(options.exposedTo);
    const registered = this.registerToolInMcp(tool, normalized);
    if (options.exposedTo?.length && !this.native && !this.crossOriginExposureWarned) {
      this.crossOriginExposureWarned = true;
      console.warn(
        '[BrowserMcpServer] Cross-document exposedTo enforcement requires native WebMCP and is not available in the local adapter.'
      );
    }
    this.tools.set(tool.name, registered);
    const abort = () => {
      if (this.tools.get(tool.name) === registered) {
        this.removeTool(tool.name, { preferAbortSignal: true });
      }
    };
    if (options.signal) {
      registered.abortSignal = options.signal;
      registered.abortListener = abort;
      options.signal.addEventListener('abort', abort, { once: true });
    }
    try {
      await this.registerNativeToolMirror(tool, normalized, options);
    } catch (error) {
      options.signal?.removeEventListener('abort', abort);
      if (this.tools.get(tool.name) === registered) {
        this.tools.delete(tool.name);
        registered.mcpHandle?.remove();
      }
      throw error;
    }
    if (this.closed) throw createInvalidStateError('BrowserMcpServer is closed');
    if (this.tools.get(tool.name) === registered && !this.native) {
      await this.notifyProducerToolsChanged();
    }
    options.signal?.throwIfAborted();
  }

  private removeTool(
    name: string,
    options?: { preferAbortSignal?: boolean; skipNative?: boolean; notify?: boolean }
  ): void {
    const registered = this.tools.get(name);
    if (registered) {
      if (registered.abortSignal && registered.abortListener) {
        registered.abortSignal.removeEventListener('abort', registered.abortListener);
      }
      this.tools.delete(name);
      this.nativeBackfilledTools.delete(name);
      registered.mcpHandle?.remove();
      if (options?.notify ?? !this.native) {
        void this.notifyProducerToolsChanged();
      }
    }
    if (this.native && !options?.skipNative) this.unregisterNativeToolMirror(name, options);
  }

  unregisterTool(nameOrTool: string | ModelContextToolReference): void {
    if (!this.unregisterToolDeprecationWarned) {
      this.unregisterToolDeprecationWarned = true;
      console.warn(
        '[BrowserMcpServer] unregisterTool() is deprecated; abort the signal passed to registerTool().'
      );
    }
    const name =
      typeof nameOrTool === 'string'
        ? nameOrTool
        : isPlainObject(nameOrTool) && typeof nameOrTool.name === 'string'
          ? nameOrTool.name
          : null;
    if (!name) {
      throw new TypeError(
        "Failed to execute 'unregisterTool' on 'ModelContext': expected a string or object with a string name."
      );
    }
    this.removeTool(name);
  }

  syncNativeTools(): Promise<number> {
    const sync = this.nativeSyncQueue.then(() => this.syncNativeToolsNow());
    this.nativeSyncQueue = sync.then(
      () => undefined,
      () => undefined
    );
    return sync;
  }

  private async syncNativeToolsNow(): Promise<number> {
    if (this.closed) return 0;
    this.ensureNativeToolChangeListener();

    const standard = this.getNativeStandardToolsApi();
    return standard ? this.backfillNativeStandardTools(standard) : 0;
  }

  private async backfillNativeStandardTools(native: NativeStandardToolsApi): Promise<number> {
    const tools = await native.getTools();
    if (this.closed) return 0;
    const previouslyTracked = new Set(this.nativeBackfilledTools.keys());
    const nextTools = new Map<string, NativeBackfilledTool>();
    for (const tool of tools) {
      // ponytail: MCP tool names are global, so keep the first valid visible tool.
      // Add origin-qualified aliases if MCP gains scoped tool identity.
      if (nextTools.has(tool.name)) continue;
      const item = toToolListItemFromNativeToolInfo(tool);
      if (!item) {
        console.warn(
          `[BrowserMcpServer] Native tool "${tool.name}" was not exposed over MCP because its input schema is malformed.`
        );
        continue;
      }
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
      const execute = async (args: Record<string, unknown>, signal?: AbortSignal) => {
        const currentTool = this.nativeBackfilledTools.get(name)?.source;
        if (!currentTool) throw new Error(`Native tool not found: ${name}`);
        const input = JSON.stringify(args);
        return parseNativeToolResult(
          signal
            ? await native.executeTool.call(this.native, currentTool, input, { signal })
            : await native.executeTool.call(this.native, currentTool, input)
        );
      };
      const tool: ToolDescriptor = {
        name,
        ...(next.item.title !== undefined ? { title: next.item.title } : {}),
        description: next.item.description,
        inputSchema: next.item.inputSchema,
        ...(next.item.annotations ? { annotations: next.item.annotations } : {}),
        execute: (args) => execute(args),
      };
      try {
        const normalized = this.validateToolDescriptor(tool);
        this.tools.set(tool.name, this.registerToolInMcp(tool, normalized, execute));
        this.nativeBackfilledTools.set(name, next);
      } catch (error) {
        console.warn(
          `[BrowserMcpServer] Native tool "${name}" was not exposed over MCP because its schema could not be compiled:`,
          error
        );
      }
    }

    return [...this.nativeBackfilledTools.keys()].filter((name) => !previouslyTracked.has(name))
      .length;
  }

  registerResource(descriptor: ResourceDescriptor): { unregister(): void } {
    if (this.closed) throw createInvalidStateError('BrowserMcpServer is closed');
    const config = {
      ...(descriptor.description !== undefined ? { description: descriptor.description } : {}),
      ...(descriptor.mimeType !== undefined ? { mimeType: descriptor.mimeType } : {}),
    };
    const template = descriptor.uri.includes('{')
      ? new ResourceTemplate(descriptor.uri, { list: undefined })
      : undefined;
    const mcpHandle = template
      ? this.mcpServer.registerResource(descriptor.name, template, config, async (uri, variables) =>
          descriptor.read(uri, variables)
        )
      : this.mcpServer.registerResource(descriptor.name, descriptor.uri, config, async (uri) =>
          descriptor.read(uri)
        );
    const registered = { descriptor, mcpHandle, ...(template ? { template } : {}) };
    this.resources.set(descriptor.uri, registered);
    let removed = false;
    return {
      unregister: () => {
        if (removed) return;
        removed = true;
        if (this.resources.get(descriptor.uri) !== registered) return;
        this.resources.delete(descriptor.uri);
        mcpHandle.remove();
      },
    };
  }

  listResources(): Array<{
    uri: string;
    name: string;
    description?: string;
    mimeType?: string;
  }> {
    return [...this.resources.values()].map(({ descriptor }) => ({
      uri: descriptor.uri,
      name: descriptor.name,
      ...(descriptor.description !== undefined ? { description: descriptor.description } : {}),
      ...(descriptor.mimeType !== undefined ? { mimeType: descriptor.mimeType } : {}),
    }));
  }

  async readResource(uri: string): Promise<ReadResourceResult> {
    const resource = this.resources.get(uri);
    if (resource) return resource.descriptor.read(new URL(uri));

    for (const candidate of this.resources.values()) {
      const variables = candidate.template?.uriTemplate.match(uri);
      if (variables) return candidate.descriptor.read(new URL(uri), variables);
    }

    throw new Error(`Resource not found: ${uri}`);
  }

  registerPrompt(descriptor: PromptDescriptor): { unregister(): void } {
    if (this.closed) throw createInvalidStateError('BrowserMcpServer is closed');
    const argsSchema = descriptor.argsSchema
      ? fromJsonSchema<Record<string, string>>(
          descriptor.argsSchema as Parameters<typeof fromJsonSchema>[0]
        )
      : undefined;
    const mcpHandle = this.mcpServer.registerPrompt(
      descriptor.name,
      {
        ...(descriptor.description !== undefined ? { description: descriptor.description } : {}),
        ...(argsSchema ? { argsSchema } : {}),
      },
      async (args) => descriptor.get(args ?? {})
    );
    const registered = { descriptor, ...(argsSchema ? { argsSchema } : {}), mcpHandle };
    this.prompts.set(descriptor.name, registered);
    let removed = false;
    return {
      unregister: () => {
        if (removed) return;
        removed = true;
        if (this.prompts.get(descriptor.name) !== registered) return;
        this.prompts.delete(descriptor.name);
        mcpHandle.remove();
      },
    };
  }

  listPrompts(): Array<{
    name: string;
    description?: string;
    arguments?: Array<{ name: string; description?: string; required?: boolean }>;
  }> {
    return [...this.prompts.values()].map(({ descriptor }) => ({
      name: descriptor.name,
      ...(descriptor.description !== undefined ? { description: descriptor.description } : {}),
      ...(descriptor.argsSchema?.properties
        ? {
            arguments: Object.entries(descriptor.argsSchema.properties).map(([name, property]) => ({
              name,
              ...(isPlainObject(property) && typeof property.description === 'string'
                ? { description: property.description }
                : {}),
              ...(descriptor.argsSchema?.required?.includes(name) ? { required: true } : {}),
            })),
          }
        : {}),
    }));
  }

  async getPrompt(name: string, args: Record<string, string> = {}): Promise<GetPromptResult> {
    const prompt = this.prompts.get(name);
    if (!prompt) throw new Error(`Prompt not found: ${name}`);
    if (!prompt.argsSchema) return prompt.descriptor.get(args);

    const validation = await prompt.argsSchema['~standard'].validate(args);
    if (validation.issues) {
      throw new ProtocolError(
        ProtocolErrorCode.InvalidParams,
        `Invalid arguments for prompt ${name}: ${validation.issues
          .map(({ message }) => message)
          .join('; ')}`
      );
    }
    return prompt.descriptor.get(validation.value);
  }

  listTools(): ToolListItem[] {
    return [...this.tools.entries()].map(([name, tool]) => ({
      name,
      ...(tool.title !== undefined ? { title: tool.title } : {}),
      description: tool.description ?? '',
      inputSchema: tool.inputSchema,
      ...(tool.outputSchema ? { outputSchema: tool.outputSchema } : {}),
      ...(tool.annotations ? { annotations: tool.annotations } : {}),
    }));
  }

  async getTools(options?: ModelContextGetToolOptions): Promise<RegisteredTool[]> {
    if (this.native) {
      return this.native.getTools(options);
    }
    validateOriginAgentCluster();
    validatePotentiallyTrustworthyOrigins(options?.fromOrigins);
    if (options?.fromOrigins?.length && !this.crossOriginDiscoveryWarned) {
      this.crossOriginDiscoveryWarned = true;
      console.warn(
        '[BrowserMcpServer] Cross-document getTools({ fromOrigins }) discovery requires native WebMCP and is not available in the local adapter.'
      );
    }

    const origin = globalThis.location?.origin ?? '';
    const currentWindow = globalThis.window;

    const tools = this.listTools()
      .map((tool) => {
        const registered = this.tools.get(tool.name);
        return {
          name: tool.name,
          title: registered?.title ?? '',
          description: tool.description,
          ...(registered?.registeredInputSchema !== undefined
            ? { inputSchema: registered.registeredInputSchema }
            : {}),
          origin,
          window: currentWindow,
          ...(tool.annotations ? { annotations: toWebMcpAnnotations(tool.annotations) } : {}),
        };
      })
      .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    await new Promise((resolve) => setTimeout(resolve, 0));
    return tools;
  }

  private async executeRawTool(
    name: string,
    args: Record<string, unknown> | undefined,
    signal?: AbortSignal
  ): Promise<unknown> {
    const tool = this.tools.get(name);
    if (!tool) throw new Error(`Tool not found: ${name}`);
    return tool.execute(args ?? {}, signal);
  }

  async executeTool(
    tool: RegisteredTool,
    inputArgsJson: string,
    options?: ChromeModelContextExecuteToolOptions
  ): Promise<string | null> {
    const native = this.getNativeStandardToolsApi();
    if (native) {
      return native.executeTool.call(this.native, tool, inputArgsJson, options);
    }

    validateOriginAgentCluster();
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
    const execution = withRegistrationLifetime(
      registered.execute(args, options?.signal),
      registered.abortSignal
    ).then(serializeChromeToolResult);
    return execution;
  }

  connect(transport: Transport): Promise<void> {
    if (this.closed) return Promise.reject(createInvalidStateError('BrowserMcpServer is closed'));
    return this.mcpServer.connect(transport);
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    if (this.native && this.nativeToolChangeListener) {
      this.native.removeEventListener('toolchange', this.nativeToolChangeListener);
      this.nativeToolChangeListener = undefined;
    }
    for (const name of this.nativeToolCleanups.keys()) {
      this.unregisterNativeToolMirror(name, { preferAbortSignal: true });
    }
    for (const name of this.tools.keys()) {
      this.removeTool(name, { skipNative: true, notify: false });
    }
    for (const { mcpHandle } of this.resources.values()) mcpHandle.remove();
    for (const { mcpHandle } of this.prompts.values()) mcpHandle.remove();
    this.resources.clear();
    this.prompts.clear();
    this.nativeBackfilledTools.clear();
    await this.mcpServer.close();
  }

  createMessage(
    params: CreateMessageRequestParamsBase,
    options?: RequestOptions
  ): Promise<CreateMessageResult>;
  createMessage(
    params: CreateMessageRequestParamsWithTools,
    options?: RequestOptions
  ): Promise<CreateMessageResultWithTools>;
  async createMessage(
    params: CreateMessageRequest['params'],
    options?: RequestOptions
  ): Promise<CreateMessageResult | CreateMessageResultWithTools> {
    return this.server.createMessage(params, withDefaultTimeout(options));
  }

  async elicitInput(
    params: ElicitRequest['params'],
    options?: RequestOptions
  ): Promise<ElicitResult> {
    return this.server.elicitInput(params, withDefaultTimeout(options));
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
