import type {
  InputSchema,
  JsonSchemaForInference,
  ModelContextClient,
  ModelContextCore,
  ModelContextExtensions,
  ModelContextOptions,
  ModelContextToolReference,
  ResourceContents,
  ToolDescriptor,
  ToolInputSchema,
  ToolListItem,
  ToolResponse,
} from '@mcp-b/webmcp-types';
import {
  type RegisteredToolDescriptor,
  WebMCPToolRegistry,
  normalizeToolResponse,
} from '@mcp-b/webmcp-polyfill';
import type { ServerOptions } from '@modelcontextprotocol/sdk/server/index.js';
import { McpServer as BaseMcpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { normalizeObjectSchema } from '@modelcontextprotocol/sdk/server/zod-compat.js';
import { toJsonSchemaCompat } from '@modelcontextprotocol/sdk/server/zod-json-schema-compat.js';
import type { RequestOptions } from '@modelcontextprotocol/sdk/shared/protocol.js';
import { mergeCapabilities } from '@modelcontextprotocol/sdk/shared/protocol.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import type {
  CreateMessageRequest,
  CreateMessageResult,
  ElicitRequest,
  ElicitResult,
  Implementation,
  PromptMessage,
} from '@modelcontextprotocol/sdk/types.js';
import {
  GetPromptRequestSchema,
  ListPromptsRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { PolyfillJsonSchemaValidator } from './polyfill-validator.js';

const DEFAULT_INPUT_SCHEMA: InputSchema = { type: 'object', properties: {} };
const DEFAULT_CLIENT_REQUEST_TIMEOUT = 10_000;

export const SERVER_MARKER_PROPERTY = '__isBrowserMcpServer' as const;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function withDefaultTimeout(options?: RequestOptions): RequestOptions {
  if (options?.signal) return options;
  return { ...options, signal: AbortSignal.timeout(DEFAULT_CLIENT_REQUEST_TIMEOUT) };
}

interface ParentRegisteredTool {
  description?: string;
  inputSchema?: unknown;
  outputSchema?: unknown;
  annotations?: unknown;
  handler: (args: Record<string, unknown>, extra: unknown) => Promise<ToolResponse>;
  enabled: boolean;
  remove: () => void;
}

interface ParentRegisteredResource {
  name: string;
  metadata?: { description?: string; mimeType?: string; title?: string };
  readCallback: (uri: URL, extra: unknown) => Promise<{ contents: ResourceContents[] }>;
  enabled: boolean;
  remove: () => void;
}

interface ParentRegisteredPrompt {
  title?: string;
  description?: string;
  argsSchema?: unknown;
  callback: (
    args: Record<string, unknown>,
    extra: unknown
  ) => Promise<{ messages: PromptMessage[] }>;
  enabled: boolean;
  remove: () => void;
}

export interface BrowserMcpServerOptions extends ServerOptions {
  native?: ModelContextCore;
}

type ParentRegisterToolFn = (
  name: string,
  config: Record<string, unknown>,
  cb: (args: Record<string, unknown>, extra: unknown) => Promise<ToolResponse>
) => void;

type ParentRegisterResourceFn = (
  name: string,
  uri: string,
  config: Record<string, unknown>,
  cb: (uri: URL, extra: unknown) => Promise<{ contents: ResourceContents[] }>
) => { remove: () => void };

type ParentRegisterPromptFn = (
  name: string,
  config: Record<string, unknown>,
  cb: (args: Record<string, unknown>, extra: unknown) => Promise<{ messages: PromptMessage[] }>
) => { remove: () => void };

type NativeToolsApi = ModelContextCore & Pick<ModelContextExtensions, 'listTools' | 'callTool'>;
type RegisteredToolHandle = { unregister: () => void };

/**
 * Browser-optimized MCP Server that speaks WebMCP natively.
 *
 * This server IS navigator.modelContext — it implements the WebMCP standard API
 * (provideContext, registerTool, unregisterTool, clearContext) while retaining
 * full MCP protocol capabilities (resources, prompts, elicitation, sampling)
 * via the inherited BaseMcpServer surface.
 *
 * When `native` is provided, all tool operations are mirrored to it so that
 * navigator.modelContextTesting (polyfill testing shim) stays in sync.
 */
export class BrowserMcpServer extends BaseMcpServer {
  readonly [SERVER_MARKER_PROPERTY] = true as const;

  private native: ModelContextCore | undefined;
  private toolRegistry = new WebMCPToolRegistry('[BrowserMcpServer]');
  private _promptSchemas = new Map<string, InputSchema>();
  private _jsonValidator: PolyfillJsonSchemaValidator;
  private _publicMethodsBound = false;
  private _provideContextDeprecationWarned = false;
  private _clearContextDeprecationWarned = false;

  constructor(serverInfo: Implementation, options?: BrowserMcpServerOptions) {
    const validator = new PolyfillJsonSchemaValidator();
    const enhancedOptions: ServerOptions = {
      capabilities: mergeCapabilities(options?.capabilities || {}, {
        tools: { listChanged: true },
        resources: { listChanged: true },
        prompts: { listChanged: true },
      }),
      jsonSchemaValidator: options?.jsonSchemaValidator ?? validator,
    };

    super(serverInfo, enhancedOptions);
    this._jsonValidator = validator;
    this.native = options?.native;
    this.bindPublicApiMethods();
  }

  /**
   * navigator.modelContext consumers may destructure methods (e.g. const { registerTool } = ...).
   * Bind methods once so they remain callable outside instance-method invocation syntax.
   */
  private bindPublicApiMethods(): void {
    if (this._publicMethodsBound) {
      return;
    }

    this.registerTool = this.registerTool.bind(this);
    this.unregisterTool = this.unregisterTool.bind(this);
    this.provideContext = this.provideContext.bind(this);
    this.clearContext = this.clearContext.bind(this);
    this.listTools = this.listTools.bind(this);
    this.callTool = this.callTool.bind(this);
    this.executeTool = this.executeTool.bind(this);

    this.registerResource = this.registerResource.bind(this);
    this.listResources = this.listResources.bind(this);
    this.readResource = this.readResource.bind(this);

    this.registerPrompt = this.registerPrompt.bind(this);
    this.listPrompts = this.listPrompts.bind(this);
    this.getPrompt = this.getPrompt.bind(this);

    this.createMessage = this.createMessage.bind(this);
    this.elicitInput = this.elicitInput.bind(this);

    this._publicMethodsBound = true;
  }

  private get _parentTools(): Record<string, ParentRegisteredTool> {
    return (this as unknown as { _registeredTools: Record<string, ParentRegisteredTool> })
      ._registeredTools;
  }

  private get _parentResources(): Record<string, ParentRegisteredResource> {
    return (this as unknown as { _registeredResources: Record<string, ParentRegisteredResource> })
      ._registeredResources;
  }

  private get _parentPrompts(): Record<string, ParentRegisteredPrompt> {
    return (this as unknown as { _registeredPrompts: Record<string, ParentRegisteredPrompt> })
      ._registeredPrompts;
  }

  /**
   * Converts a JSON Schema-like object to a transport-ready JSON Schema.
   * When `requireObjectType` is true (the default, for inputSchema), empty `{}`
   * schemas are normalized to `{ type: "object", properties: {} }` and schemas
   * missing a root `type` get `type: "object"` prepended — per MCP spec
   * requirements. When false (for outputSchema), no object-type normalization is
   * applied.
   */
  private toTransportSchema(schema: unknown, requireObjectType = true): InputSchema {
    if (!schema || typeof schema !== 'object') {
      if (requireObjectType) {
        console.warn(
          `[BrowserMcpServer] toTransportSchema received non-object schema (${typeof schema}), using default`
        );
        return DEFAULT_INPUT_SCHEMA;
      }
      return {} as InputSchema;
    }

    const normalized = normalizeObjectSchema(schema as Parameters<typeof normalizeObjectSchema>[0]);
    const jsonSchema = normalized
      ? (toJsonSchemaCompat(normalized, {
          strictUnions: true,
          pipeStrategy: 'input',
        }) as unknown as Record<string, unknown>)
      : (schema as Record<string, unknown>);

    if (Object.keys(jsonSchema).length === 0) {
      if (requireObjectType) {
        return DEFAULT_INPUT_SCHEMA;
      }
      return jsonSchema as InputSchema;
    }

    if (requireObjectType && jsonSchema.type === undefined) {
      return { type: 'object', ...jsonSchema } as InputSchema;
    }

    return jsonSchema as InputSchema;
  }

  private getNativeToolsApi(): NativeToolsApi | undefined {
    if (!this.native) {
      return undefined;
    }

    const candidate = this.native as ModelContextCore &
      Partial<Pick<ModelContextExtensions, 'listTools' | 'callTool'>>;
    if (typeof candidate.listTools !== 'function' || typeof candidate.callTool !== 'function') {
      return undefined;
    }

    return candidate as NativeToolsApi;
  }

  private toTransportToolDescriptor(tool: RegisteredToolDescriptor): ToolDescriptor {
    const { standardValidator: _standardValidator, ...descriptor } = tool;
    return descriptor;
  }

  private registerToolInServer(tool: ToolDescriptor): RegisteredToolHandle {
    const inputSchema = this.toTransportSchema(tool.inputSchema);
    const outputSchema =
      tool.outputSchema !== undefined
        ? (this.toTransportSchema(tool.outputSchema, false) as JsonSchemaForInference)
        : undefined;

    // Cast needed: parent expects Zod-compatible schemas, we pass JSON Schema objects.
    (super.registerTool as unknown as ParentRegisterToolFn)(
      tool.name,
      {
        description: tool.description,
        inputSchema,
        ...(outputSchema ? { outputSchema } : {}),
        ...(tool.annotations ? { annotations: tool.annotations } : {}),
      },
      async (args: Record<string, unknown>) => {
        const client: ModelContextClient = {
          requestUserInteraction: async (cb: () => Promise<unknown>) => cb(),
        };
        return normalizeToolResponse(await tool.execute(args, client));
      }
    );
    return {
      unregister: () => this.unregisterTool(tool.name),
    };
  }

  /**
   * Register tools from an external list that were not registered through this server.
   * Skips any tool already registered. Returns the number of tools added.
   *
   * Used during initialization to absorb tools that were registered on the native/polyfill
   * context before this server was installed as navigator.modelContext.
   */
  backfillTools(
    tools: readonly ToolListItem[],
    execute: (name: string, args: Record<string, unknown>) => Promise<ToolResponse>
  ): number {
    let synced = 0;

    for (const sourceTool of tools) {
      if (!sourceTool?.name || this._parentTools[sourceTool.name]) {
        continue;
      }

      const toolDescriptor: ToolDescriptor = {
        name: sourceTool.name,
        description: sourceTool.description ?? '',
        inputSchema: sourceTool.inputSchema ?? DEFAULT_INPUT_SCHEMA,
        execute: async (args: Record<string, unknown>) => execute(sourceTool.name, args),
      };

      if (sourceTool.outputSchema) {
        toolDescriptor.outputSchema = sourceTool.outputSchema;
      }
      if (sourceTool.annotations) {
        toolDescriptor.annotations = sourceTool.annotations;
      }

      const normalizedTool = this.toolRegistry.registerTool(toolDescriptor);
      const transportTool = this.toTransportToolDescriptor(normalizedTool);

      try {
        this.registerToolInServer(transportTool);
      } catch (error) {
        this.toolRegistry.unregisterTool(transportTool.name);
        throw error;
      }
      synced++;
    }

    return synced;
  }

  // --- WebMCP standard API (primary surface) ---

  /**
   * Register a tool on this server and mirror it to the native/polyfill context.
   * The schema is normalized via WebMCPToolRegistry before registration.
   * Rolls back both registrations if either throws.
   *
   * Implements the WebMCP standard API surface (`navigator.modelContext.registerTool`).
   */
  // @ts-expect-error -- WebMCP API: (ToolDescriptor) vs MCP SDK: (name, config, cb)
  override registerTool(tool: ToolDescriptor): RegisteredToolHandle {
    const normalizedTool = this.toolRegistry.registerTool(tool);
    const transportTool = this.toTransportToolDescriptor(normalizedTool);

    try {
      if (this.native) {
        (this.native.registerTool as (tool: ToolDescriptor) => void)(transportTool);
      }

      return this.registerToolInServer(transportTool);
    } catch (error) {
      this.toolRegistry.unregisterTool(normalizedTool.name);

      if (this.native) {
        try {
          this.native.unregisterTool(transportTool.name);
        } catch (rollbackError) {
          console.error(
            '[BrowserMcpServer] Rollback of native tool registration failed:',
            rollbackError
          );
        }
      }
      throw error;
    }
  }

  /**
   * Backfill tools that were already registered on the native/polyfill context
   * before this BrowserMcpServer wrapper was installed.
   */
  syncNativeTools(): number {
    const nativeToolsApi = this.getNativeToolsApi();
    if (!nativeToolsApi) {
      return 0;
    }

    const nativeCallTool = nativeToolsApi.callTool.bind(nativeToolsApi);
    return this.backfillTools(
      nativeToolsApi.listTools(),
      async (name: string, args: Record<string, unknown>) =>
        nativeCallTool({
          name,
          arguments: args,
        })
    );
  }

  /**
   * Unregister a tool by name or tool-reference object.
   * Removes it from the MCP server registry, the local WebMCPToolRegistry, and the native context.
   */
  unregisterTool(nameOrTool: string | ModelContextToolReference): void {
    const name = this.resolveToolNameForUnregister(nameOrTool);
    this._parentTools[name]?.remove();
    this.toolRegistry.unregisterTool(name);

    if (this.native) {
      this.native.unregisterTool(name);
    }
  }

  private clearRegisteredTools(): void {
    for (const name of Object.keys(this._parentTools)) {
      this.unregisterTool(name);
    }
  }

  /**
   * Register a resource accessible via the MCP protocol.
   * Wraps the parent SDK's URI-based registration behind the WebMCP descriptor shape.
   */
  // @ts-expect-error -- WebMCP API: (descriptor) vs MCP SDK: (name, uri, config, readCallback)
  override registerResource(descriptor: {
    uri: string;
    name: string;
    description?: string;
    mimeType?: string;
    read: (uri: URL, params?: Record<string, string>) => Promise<{ contents: ResourceContents[] }>;
  }): { unregister: () => void } {
    const registered = (super.registerResource as unknown as ParentRegisterResourceFn)(
      descriptor.name,
      descriptor.uri,
      {
        ...(descriptor.description !== undefined && { description: descriptor.description }),
        ...(descriptor.mimeType !== undefined && { mimeType: descriptor.mimeType }),
      },
      async (uri: URL) => ({
        contents: (await descriptor.read(uri)).contents,
      })
    );

    return {
      unregister: () => registered.remove(),
    };
  }

  /**
   * Register a prompt on this server.
   * The argsSchema is normalized to plain JSON Schema and stored locally in `_promptSchemas`
   * rather than passed to the parent SDK, which would corrupt it via Zod's objectFromShape.
   */
  // @ts-expect-error -- WebMCP API: (descriptor) vs MCP SDK: (name, config, cb)
  override registerPrompt(descriptor: {
    name: string;
    description?: string;
    argsSchema?: ToolInputSchema;
    get: (args: Record<string, unknown>) => Promise<{ messages: PromptMessage[] }>;
  }): { unregister: () => void } {
    const argsSchema =
      descriptor.argsSchema !== undefined
        ? (this.toTransportSchema(
            this.toolRegistry.normalizePromptArgsSchema(descriptor.name, descriptor.argsSchema)
          ) as InputSchema)
        : undefined;

    // Store argsSchema locally — the parent SDK's _createRegisteredPrompt corrupts
    // plain JSON Schema objects via objectFromShape() which expects Zod schemas.
    if (argsSchema) {
      this._promptSchemas.set(descriptor.name, argsSchema);
    }

    const registered = (super.registerPrompt as unknown as ParentRegisterPromptFn)(
      descriptor.name,
      {
        ...(descriptor.description !== undefined && { description: descriptor.description }),
        // Do NOT pass argsSchema to parent — it gets corrupted by Zod's objectFromShape
      },
      async (args: Record<string, unknown>) => ({
        messages: (await descriptor.get(args)).messages,
      })
    );

    return {
      unregister: () => {
        this._promptSchemas.delete(descriptor.name);
        registered.remove();
      },
    };
  }

  /**
   * @deprecated Use `registerTool()` for each tool individually.
   * Clears all registered tools and re-registers the tools in `options.tools`.
   */
  provideContext(options?: ModelContextOptions): void {
    this.warnProvideContextDeprecationOnce();
    this.clearRegisteredTools();

    for (const tool of options?.tools ?? []) {
      this.registerTool(tool);
    }
  }

  /**
   * @deprecated Use `unregisterTool()` on individual tool handles instead.
   * Unregisters all currently registered tools. Does not affect prompts or resources.
   */
  clearContext(): void {
    this.warnClearContextDeprecationOnce();
    this.clearRegisteredTools();
    // Note: _promptSchemas is NOT cleared here. clearContext() is a WebMCP standard
    // method that only handles tools. Prompt schemas are cleaned up individually
    // via the unregister() callback returned by registerPrompt().
  }

  private resolveToolNameForUnregister(nameOrTool: string | ModelContextToolReference): string {
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

  private warnProvideContextDeprecationOnce(): void {
    if (this._provideContextDeprecationWarned) {
      return;
    }

    this._provideContextDeprecationWarned = true;
    console.warn(
      '[BrowserMcpServer] navigator.modelContext.provideContext() is deprecated and will be removed in the next major version. Register tools individually with registerTool() instead.'
    );
  }

  private warnClearContextDeprecationOnce(): void {
    if (this._clearContextDeprecationWarned) {
      return;
    }

    this._clearContextDeprecationWarned = true;
    console.warn(
      '[BrowserMcpServer] navigator.modelContext.clearContext() is deprecated and will be removed in the next major version. Unregister individual tools instead.'
    );
  }

  // --- Extension methods ---

  /** Returns all currently enabled resources registered on this server. */
  listResources(): Array<{
    uri: string;
    name: string;
    description?: string;
    mimeType?: string;
  }> {
    return Object.entries(this._parentResources)
      .filter(([, resource]) => resource.enabled)
      .map(([uri, resource]) => ({
        uri,
        name: resource.name,
        ...resource.metadata,
      }));
  }

  /** Invoke the read callback for the resource at `uri`. Throws if not found. */
  async readResource(uri: string): Promise<{ contents: ResourceContents[] }> {
    const resource = this._parentResources[uri];
    if (!resource) {
      throw new Error(`Resource not found: ${uri}`);
    }

    return resource.readCallback(new URL(uri), {});
  }

  /**
   * Returns all currently enabled prompts.
   * Arguments are derived from the locally-stored JSON Schema (`_promptSchemas`),
   * not from the parent SDK's internal representation.
   */
  listPrompts(): Array<{
    name: string;
    description?: string;
    arguments?: Array<{ name: string; description?: string; required?: boolean }>;
  }> {
    return Object.entries(this._parentPrompts)
      .filter(([, prompt]) => prompt.enabled)
      .map(([name, prompt]) => {
        const schema = this._promptSchemas.get(name);
        return {
          name,
          ...(prompt.description !== undefined && { description: prompt.description }),
          ...(schema?.properties
            ? {
                arguments: Object.entries(schema.properties).map(([argName, prop]) => ({
                  name: argName,
                  ...(typeof prop === 'object' && prop !== null && 'description' in prop
                    ? { description: (prop as { description: string }).description }
                    : {}),
                  ...(schema.required?.includes(argName) ? { required: true } : {}),
                })),
              }
            : {}),
        };
      });
  }

  /**
   * Invoke a registered prompt by name, validating `args` against its JSON Schema if present.
   * Throws if the prompt is not found or if args fail validation.
   */
  async getPrompt(
    name: string,
    args: Record<string, unknown> = {}
  ): Promise<{ messages: PromptMessage[] }> {
    const prompt = this._parentPrompts[name];
    if (!prompt) {
      throw new Error(`Prompt not found: ${name}`);
    }

    const schema = this._promptSchemas.get(name);
    if (schema) {
      const validator = this._jsonValidator.getValidator(schema);
      const result = validator(args);
      if (!result.valid) {
        throw new Error(`Invalid arguments for prompt ${name}: ${result.errorMessage}`);
      }
    }

    return prompt.callback(args, {});
  }

  /** Returns all currently enabled tools with their transport-ready JSON Schema. */
  listTools(): ToolListItem[] {
    return Object.entries(this._parentTools)
      .filter(([, tool]) => tool.enabled)
      .map(([name, tool]) => {
        const item: ToolListItem = {
          name,
          description: tool.description ?? '',
          inputSchema: this.toTransportSchema(tool.inputSchema ?? DEFAULT_INPUT_SCHEMA),
        };
        if (tool.outputSchema)
          item.outputSchema = this.toTransportSchema(
            tool.outputSchema,
            false
          ) as JsonSchemaForInference;
        if (tool.annotations)
          item.annotations = tool.annotations as NonNullable<ToolListItem['annotations']>;
        return item;
      });
  }

  /**
   * Override SDK's validateToolInput to handle MCP-B's normalized JSON Schema inputs.
   */
  override async validateToolInput(
    tool: { inputSchema?: unknown },
    args: Record<string, unknown> | undefined,
    toolName: string
  ): Promise<Record<string, unknown> | undefined> {
    if (!tool.inputSchema) return undefined;

    const validator = this._jsonValidator.getValidator(tool.inputSchema);
    const result = validator(args ?? {});
    if (!result.valid) {
      throw new Error(`Invalid arguments for tool ${toolName}: ${result.errorMessage}`);
    }
    return result.data as Record<string, unknown>;
  }

  /**
   * Override SDK's validateToolOutput to handle MCP-B's normalized JSON Schema outputs.
   */
  override async validateToolOutput(
    tool: { outputSchema?: unknown },
    result: unknown,
    toolName: string
  ): Promise<void> {
    if (!tool.outputSchema) return;

    const r = result as Record<string, unknown>;
    if (!('content' in r) || r.isError || !r.structuredContent) return;
    const validator = this._jsonValidator.getValidator(tool.outputSchema);
    const validationResult = validator(r.structuredContent);
    if (!validationResult.valid) {
      throw new Error(
        `Output validation error: Invalid structured content for tool ${toolName}: ${validationResult.errorMessage}`
      );
    }
  }

  /**
   * Invoke a registered tool directly (bypasses MCP transport).
   * Throws if the tool is not found. Input/output validation runs via the handler
   * registered in `registerToolInServer`, which uses `validateToolInput`.
   */
  async callTool(params: {
    name: string;
    arguments?: Record<string, unknown>;
  }): Promise<ToolResponse> {
    const tool = this._parentTools[params.name];
    if (!tool) {
      throw new Error(`Tool not found: ${params.name}`);
    }

    return tool.handler(params.arguments ?? {}, {});
  }

  /** Convenience alias for `callTool({ name, arguments: args })`. */
  async executeTool(name: string, args: Record<string, unknown> = {}): Promise<ToolResponse> {
    return this.callTool({ name, arguments: args });
  }

  /**
   * Override connect to initialize request handlers BEFORE the transport connection.
   * This prevents "Cannot register capabilities after connecting to transport" errors
   * when tools are registered dynamically after connection.
   *
   * After the parent sets up its Zod-based handlers, we replace the ones that break
   * with plain JSON Schema objects (ListTools, ListPrompts, GetPrompt).
   */
  override async connect(transport: Transport): Promise<void> {
    // Let parent set up its handlers (including CallTool which uses our validateToolInput override)
    (this as unknown as { setToolRequestHandlers: () => void }).setToolRequestHandlers();
    (this as unknown as { setResourceRequestHandlers: () => void }).setResourceRequestHandlers();
    (this as unknown as { setPromptRequestHandlers: () => void }).setPromptRequestHandlers();

    // Replace ListTools handler — parent tries toJsonSchemaCompat (Zod → JSON Schema) on
    // inputSchema, but ours are already JSON Schema, so it falls back to empty {}.
    this.server.setRequestHandler(ListToolsRequestSchema, () => ({
      tools: this.listTools(),
    }));

    // Replace ListPrompts handler — parent calls promptArgumentsFromSchema which expects
    // Zod shapes. We use _promptSchemas which has the real JSON Schema.
    this.server.setRequestHandler(ListPromptsRequestSchema, () => ({
      prompts: this.listPrompts(),
    }));

    // Replace GetPrompt handler — parent uses Zod safeParseAsync on argsSchema.
    // We validate with PolyfillJsonSchemaValidator against our locally-stored JSON Schema.
    this.server.setRequestHandler(GetPromptRequestSchema, async (request) => {
      const prompt = this._parentPrompts[request.params.name];
      if (!prompt) {
        throw new Error(`Prompt ${request.params.name} not found`);
      }
      if (!prompt.enabled) {
        throw new Error(`Prompt ${request.params.name} disabled`);
      }

      const schema = this._promptSchemas.get(request.params.name);
      if (schema) {
        const validator = this._jsonValidator.getValidator(schema);
        const result = validator(request.params.arguments ?? {});
        if (!result.valid) {
          throw new Error(
            `Invalid arguments for prompt ${request.params.name}: ${result.errorMessage}`
          );
        }
        return prompt.callback(request.params.arguments as Record<string, unknown>, {});
      }

      return prompt.callback({}, {});
    });

    return super.connect(transport);
  }

  // --- Sampling & Elicitation (delegated to Server) ---

  /**
   * Request the connected client to sample from a model (sampling capability).
   * Applies a default 10-second timeout unless a signal is provided via `options`.
   */
  async createMessage(
    params: CreateMessageRequest['params'],
    options?: RequestOptions
  ): Promise<CreateMessageResult> {
    return this.server.createMessage(params, withDefaultTimeout(options));
  }

  /**
   * Request structured input from the user via the connected client (elicitation capability).
   * Applies a default 10-second timeout unless a signal is provided via `options`.
   */
  async elicitInput(
    params: ElicitRequest['params'],
    options?: RequestOptions
  ): Promise<ElicitResult> {
    return this.server.elicitInput(params, withDefaultTimeout(options));
  }
}

// --- Exported descriptor types for consumers ---

export interface ResourceDescriptor {
  uri: string;
  name: string;
  description?: string;
  mimeType?: string;
  read: (uri: URL, params?: Record<string, string>) => Promise<{ contents: ResourceContents[] }>;
}

export interface PromptDescriptor {
  name: string;
  description?: string;
  argsSchema?: ToolInputSchema;
  get: (args: Record<string, unknown>) => Promise<{ messages: PromptMessage[] }>;
}
