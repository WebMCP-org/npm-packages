import type {
  InputSchema,
  JsonObject,
  ModelContextClient,
  ModelContextCore,
  ModelContextExtensions,
  ModelContextOptions,
  ResourceContents,
  ToolDescriptor,
  ToolListItem,
  ToolResponse,
} from '@mcp-b/webmcp-types';
import type { ServerOptions } from '@modelcontextprotocol/sdk/server/index.js';
import { McpServer as BaseMcpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import {
  getParseErrorMessage,
  normalizeObjectSchema,
  safeParseAsync,
} from '@modelcontextprotocol/sdk/server/zod-compat.js';
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

function isCallToolResult(value: unknown): value is ToolResponse {
  return isPlainObject(value) && Array.isArray(value.content);
}

function isJsonPrimitive(value: unknown): value is string | number | boolean | null {
  return (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  );
}

function isJsonValue(value: unknown): boolean {
  if (isJsonPrimitive(value)) {
    return Number.isFinite(value as number) || typeof value !== 'number';
  }

  if (Array.isArray(value)) {
    return value.every((entry) => isJsonValue(entry));
  }

  if (!isPlainObject(value)) {
    return false;
  }

  return Object.values(value).every((entry) => isJsonValue(entry));
}

function toStructuredContent(value: unknown): JsonObject | undefined {
  if (!isPlainObject(value) || !isJsonValue(value)) {
    return undefined;
  }

  return value as JsonObject;
}

function serializeTextContent(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }

  try {
    const candidate = JSON.stringify(value);
    return candidate ?? String(value);
  } catch {
    return String(value);
  }
}

function normalizeToolResponse(value: unknown): ToolResponse {
  if (isCallToolResult(value)) {
    return value;
  }

  const structuredContent = toStructuredContent(value);

  return {
    content: [{ type: 'text', text: serializeTextContent(value) }],
    ...(structuredContent ? { structuredContent } : {}),
    isError: false,
  };
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
type NativeMutationApi = Partial<
  Pick<ModelContextCore, 'registerTool' | 'unregisterTool' | 'clearContext'>
>;

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
  private _promptSchemas = new Map<string, InputSchema>();
  private _jsonValidator: PolyfillJsonSchemaValidator;
  private _publicMethodsBound = false;

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
   * Converts a schema (Zod or plain JSON Schema) to a transport-ready JSON Schema.
   * When `requireObjectType` is true (the default, for inputSchema), empty `{}` schemas
   * are normalized to `{ type: "object", properties: {} }` and schemas missing a root
   * `type` get `type: "object"` prepended — per MCP spec requirements.
   * When false (for outputSchema), no object-type normalization is applied.
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

  private isZodSchema(schema: unknown): boolean {
    if (!schema || typeof schema !== 'object') return false;
    const s = schema as Record<string, unknown>;
    return '_zod' in s || '_def' in s;
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

  private getNativeMutationApi(): NativeMutationApi | undefined {
    if (!this.native) {
      return undefined;
    }

    return this.native as NativeMutationApi;
  }

  private registerToolInNative(tool: ToolDescriptor): void {
    const nativeMutationApi = this.getNativeMutationApi();
    if (typeof nativeMutationApi?.registerTool === 'function') {
      (nativeMutationApi.registerTool as (tool: ToolDescriptor) => void)(tool);
    }
  }

  private unregisterToolInNative(name: string): void {
    const nativeMutationApi = this.getNativeMutationApi();
    if (typeof nativeMutationApi?.unregisterTool === 'function') {
      nativeMutationApi.unregisterTool(name);
    }
  }

  private clearToolsInNative(): void {
    const nativeMutationApi = this.getNativeMutationApi();
    if (typeof nativeMutationApi?.clearContext === 'function') {
      nativeMutationApi.clearContext();
    }
  }

  private registerToolInServer(tool: ToolDescriptor): { unregister: () => void } {
    const inputSchema = this.toTransportSchema(tool.inputSchema);

    // Cast needed: parent expects Zod-compatible schemas, we pass JSON Schema objects.
    (super.registerTool as unknown as ParentRegisterToolFn)(
      tool.name,
      {
        description: tool.description,
        inputSchema,
        ...(tool.outputSchema ? { outputSchema: tool.outputSchema } : {}),
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

      this.registerToolInServer(toolDescriptor);
      synced++;
    }

    return synced;
  }

  // --- WebMCP standard API (primary surface) ---

  // @ts-expect-error -- WebMCP API: (ToolDescriptor) vs MCP SDK: (name, config, cb)
  override registerTool(tool: ToolDescriptor): { unregister: () => void } {
    // Mirror to native first — the polyfill validates the descriptor
    this.registerToolInNative(tool);

    try {
      return this.registerToolInServer(tool);
    } catch (error) {
      // Rollback native registration on server failure
      try {
        this.unregisterToolInNative(tool.name);
      } catch (rollbackError) {
        console.error(
          '[BrowserMcpServer] Rollback of native tool registration failed:',
          rollbackError
        );
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

  unregisterTool(name: string): void {
    this._parentTools[name]?.remove();

    this.unregisterToolInNative(name);
  }

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

  // @ts-expect-error -- WebMCP API: (descriptor) vs MCP SDK: (name, config, cb)
  override registerPrompt(descriptor: {
    name: string;
    description?: string;
    argsSchema?: InputSchema;
    get: (args: Record<string, unknown>) => Promise<{ messages: PromptMessage[] }>;
  }): { unregister: () => void } {
    // Store argsSchema locally — the parent SDK's _createRegisteredPrompt corrupts
    // plain JSON Schema objects via objectFromShape() which expects Zod schemas.
    if (descriptor.argsSchema) {
      this._promptSchemas.set(descriptor.name, descriptor.argsSchema);
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

  provideContext(options?: ModelContextOptions): void {
    for (const tool of Object.values(this._parentTools)) {
      tool.remove();
    }

    this.clearToolsInNative();

    for (const tool of options?.tools ?? []) {
      this.registerTool(tool);
    }
  }

  clearContext(): void {
    for (const tool of Object.values(this._parentTools)) {
      tool.remove();
    }
    // Note: _promptSchemas is NOT cleared here. clearContext() is a WebMCP standard
    // method that only handles tools. Prompt schemas are cleaned up individually
    // via the unregister() callback returned by registerPrompt().

    this.clearToolsInNative();
  }

  // --- Extension methods ---

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

  async readResource(uri: string): Promise<{ contents: ResourceContents[] }> {
    const resource = this._parentResources[uri];
    if (!resource) {
      throw new Error(`Resource not found: ${uri}`);
    }

    return resource.readCallback(new URL(uri), {});
  }

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

  listTools(): ToolListItem[] {
    return Object.entries(this._parentTools)
      .filter(([, tool]) => tool.enabled)
      .map(([name, tool]) => {
        const item: ToolListItem = {
          name,
          description: tool.description ?? '',
          inputSchema: this.toTransportSchema(tool.inputSchema ?? DEFAULT_INPUT_SCHEMA),
        };
        if (tool.outputSchema) item.outputSchema = this.toTransportSchema(tool.outputSchema, false);
        if (tool.annotations)
          item.annotations = tool.annotations as NonNullable<ToolListItem['annotations']>;
        return item;
      });
  }

  /**
   * Override SDK's validateToolInput to handle both Zod schemas and plain JSON Schema.
   * Zod schemas use the SDK's safeParseAsync; plain JSON Schema uses PolyfillJsonSchemaValidator.
   */
  override async validateToolInput(
    tool: { inputSchema?: unknown },
    args: Record<string, unknown> | undefined,
    toolName: string
  ): Promise<Record<string, unknown> | undefined> {
    if (!tool.inputSchema) return undefined;

    // Zod schemas → use SDK's safeParseAsync
    if (this.isZodSchema(tool.inputSchema)) {
      const result = await safeParseAsync(
        tool.inputSchema as Parameters<typeof safeParseAsync>[0],
        args ?? {}
      );
      if (!result.success) {
        throw new Error(
          `Invalid arguments for tool ${toolName}: ${getParseErrorMessage(result.error)}`
        );
      }
      return result.data as Record<string, unknown>;
    }

    // Plain JSON Schema → use PolyfillJsonSchemaValidator
    const validator = this._jsonValidator.getValidator(tool.inputSchema);
    const result = validator(args ?? {});
    if (!result.valid) {
      throw new Error(`Invalid arguments for tool ${toolName}: ${result.errorMessage}`);
    }
    return result.data as Record<string, unknown>;
  }

  /**
   * Override SDK's validateToolOutput to handle both Zod schemas and plain JSON Schema.
   */
  override async validateToolOutput(
    tool: { outputSchema?: unknown },
    result: unknown,
    toolName: string
  ): Promise<void> {
    if (!tool.outputSchema) return;

    const r = result as Record<string, unknown>;
    if (!('content' in r) || r.isError || !r.structuredContent) return;

    // Zod schemas → use SDK's safeParseAsync
    if (this.isZodSchema(tool.outputSchema)) {
      const parseResult = await safeParseAsync(
        tool.outputSchema as Parameters<typeof safeParseAsync>[0],
        r.structuredContent
      );
      if (!parseResult.success) {
        throw new Error(
          `Output validation error: Invalid structured content for tool ${toolName}: ${getParseErrorMessage(parseResult.error)}`
        );
      }
      return;
    }

    // Plain JSON Schema → use PolyfillJsonSchemaValidator
    const validator = this._jsonValidator.getValidator(tool.outputSchema);
    const validationResult = validator(r.structuredContent);
    if (!validationResult.valid) {
      throw new Error(
        `Output validation error: Invalid structured content for tool ${toolName}: ${validationResult.errorMessage}`
      );
    }
  }

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

    // Replace GetPrompt handler — parent calls safeParseAsync on argsSchema.
    // We validate with PolyfillJsonSchemaValidator instead.
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

  async createMessage(
    params: CreateMessageRequest['params'],
    options?: RequestOptions
  ): Promise<CreateMessageResult> {
    return this.server.createMessage(params, withDefaultTimeout(options));
  }

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
  argsSchema?: InputSchema;
  get: (args: Record<string, unknown>) => Promise<{ messages: PromptMessage[] }>;
}
