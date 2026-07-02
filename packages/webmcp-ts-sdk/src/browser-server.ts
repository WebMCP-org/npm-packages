import type {
  InputSchema,
  JsonSchemaForInference,
  ModelContextClient,
  ModelContextCore,
  ModelContextExtensions,
  ModelContextRegisterToolOptions,
  ModelContextTestingExecuteToolOptions,
  ModelContextToolInfo,
  ModelContextToolReference,
  ResourceContents,
  ToolDescriptor,
  ToolListItem,
  ToolResponse,
} from '@mcp-b/webmcp-types';
import { toJsonValue } from '@mcp-b/webmcp-polyfill/schema';
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
import { validateAndWarnToolName } from '@modelcontextprotocol/sdk/shared/toolNameValidation.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import type { jsonSchemaValidator } from '@modelcontextprotocol/sdk/validation';
import { CfWorkerJsonSchemaValidator } from '@modelcontextprotocol/sdk/validation/cfworker';
import type {
  CallToolResult as McpCallToolResult,
  CreateMessageRequest,
  CreateMessageResult,
  ElicitRequest,
  ElicitResult,
  Implementation,
  PromptMessage,
} from '@modelcontextprotocol/sdk/types.js';
import {
  CallToolRequestSchema,
  GetPromptRequestSchema,
  ListPromptsRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

const DEFAULT_INPUT_SCHEMA: InputSchema = { type: 'object', properties: {} };
const DEFAULT_CLIENT_REQUEST_TIMEOUT = 10_000;

export const SERVER_MARKER_PROPERTY = '__isBrowserMcpServer' as const;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isCallToolResult(value: unknown): value is ToolResponse {
  return isPlainObject(value) && Array.isArray(value.content);
}

function isPermissionsPolicySecurityError(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false;
  }

  const { name, message } = error as { name?: unknown; message?: unknown };

  return (
    name === 'SecurityError' &&
    typeof message === 'string' &&
    /permissions policy|feature "tools" is disallowed/i.test(message)
  );
}

function isAbortError(error: unknown): boolean {
  return (
    Boolean(error) &&
    typeof error === 'object' &&
    (error as { name?: unknown }).name === 'AbortError'
  );
}

function createAbortError(): Error {
  if (typeof DOMException === 'function') {
    return new DOMException('signal is aborted without reason', 'AbortError');
  }

  const error = new Error('signal is aborted without reason');
  error.name = 'AbortError';
  return error;
}

function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
  return (
    Boolean(value) &&
    (typeof value === 'object' || typeof value === 'function') &&
    typeof (value as { then?: unknown }).then === 'function'
  );
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

  const structuredContent = toJsonValue(value);

  return {
    content: [{ type: 'text', text: serializeTextContent(value) }],
    ...(structuredContent !== undefined ? { structuredContent } : {}),
    isError: false,
  };
}

function parseNativeToolInputSchema(inputSchema: string | undefined): InputSchema {
  if (!inputSchema) {
    return DEFAULT_INPUT_SCHEMA;
  }

  try {
    const parsed = JSON.parse(inputSchema) as unknown;
    if (isPlainObject(parsed)) {
      return parsed as InputSchema;
    }
  } catch {
    // Fall through to the default schema. Native previews have returned invalid
    // schema strings during development; a bad imported tool schema should not
    // prevent the wrapper from initializing.
  }

  return DEFAULT_INPUT_SCHEMA;
}

function toToolListItemFromNativeToolInfo(tool: ModelContextToolInfo): ToolListItem {
  return {
    name: tool.name,
    description: tool.description ?? '',
    inputSchema: parseNativeToolInputSchema(tool.inputSchema),
  };
}

function parseNativeToolResult(toolName: string, serialized: string | null): ToolResponse {
  if (serialized === null) {
    return {
      content: [{ type: 'text', text: 'Tool execution interrupted by navigation' }],
      isError: true,
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(serialized);
  } catch (parseError) {
    throw new Error(
      `Failed to parse serialized tool response for ${toolName}: ${parseError instanceof Error ? parseError.message : String(parseError)}`
    );
  }

  return normalizeToolResponse(parsed);
}

function withDefaultTimeout(options?: RequestOptions): RequestOptions {
  if (options?.signal) return options;
  return { ...options, signal: AbortSignal.timeout(DEFAULT_CLIENT_REQUEST_TIMEOUT) };
}

interface RegisteredWebMcpTool {
  title?: string;
  description?: string;
  inputSchema: InputSchema;
  outputSchema?: JsonSchemaForInference;
  annotations?: ToolListItem['annotations'];
  handler: (args: Record<string, unknown>) => Promise<ToolResponse>;
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

type NativeLegacyToolsApi = ModelContextCore &
  Pick<ModelContextExtensions, 'listTools' | 'callTool'>;
type NativeStandardToolsApi = Pick<ModelContextCore, 'getTools' | 'executeTool'>;
type MaybePromise<T> = T | PromiseLike<T>;
type NativeRegisterToolFn = (
  tool: ToolDescriptor,
  options?: ModelContextRegisterToolOptions
) => MaybePromise<void>;
type NativeUnregisterToolFn = (nameOrTool: string | ModelContextToolReference) => void;
interface NativeToolCleanup {
  abort: () => void;
  nativeSignalAccepted: boolean;
}

/**
 * Browser-optimized MCP Server that speaks WebMCP natively.
 *
 * Implements `registerTool(tool, options?)` while retaining MCP capabilities
 * (resources, prompts, elicitation, sampling) via BaseMcpServer.
 *
 * Deprecated compatibility (kept for Chrome Beta 147 and existing wrappers,
 * removed in the next major): `unregisterTool(name)`.
 *
 * When `native` is provided, tool operations are mirrored so that
 * navigator.modelContextTesting stays in sync.
 */
export class BrowserMcpServer extends BaseMcpServer {
  readonly [SERVER_MARKER_PROPERTY] = true as const;

  private native: ModelContextCore | undefined;
  private _promptSchemas = new Map<string, InputSchema>();
  private _jsonValidator: jsonSchemaValidator;
  private _publicMethodsBound = false;
  private _unregisterToolDeprecationWarned = false;
  private _nativeToolCleanups = new Map<string, NativeToolCleanup>();
  private _tools = new Map<string, RegisteredWebMcpTool>();
  private _producerEventTarget = new EventTarget();
  private _ontoolchange: ((this: ModelContextCore, ev: Event) => unknown) | null = null;
  private _producerToolsChangedQueued = false;

  constructor(serverInfo: Implementation, options?: BrowserMcpServerOptions) {
    const validator = options?.jsonSchemaValidator ?? new CfWorkerJsonSchemaValidator();
    const enhancedOptions: ServerOptions = {
      capabilities: mergeCapabilities(options?.capabilities || {}, {
        tools: { listChanged: true },
        resources: { listChanged: true },
        prompts: { listChanged: true },
      }),
      jsonSchemaValidator: validator,
    };

    super(serverInfo, enhancedOptions);
    this._jsonValidator = validator;
    this.native = options?.native;
    this.bindPublicApiMethods();
    this.installToolRequestHandlers();
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
    this.listTools = this.listTools.bind(this);
    this.getTools = this.getTools.bind(this);
    this.callTool = this.callTool.bind(this);
    this.executeTool = this.executeTool.bind(this);
    this.addEventListener = this.addEventListener.bind(this);
    this.removeEventListener = this.removeEventListener.bind(this);
    this.dispatchEvent = this.dispatchEvent.bind(this);

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

  private get _parentResources(): Record<string, ParentRegisteredResource> {
    return (this as unknown as { _registeredResources: Record<string, ParentRegisteredResource> })
      ._registeredResources;
  }

  private get _parentPrompts(): Record<string, ParentRegisteredPrompt> {
    return (this as unknown as { _registeredPrompts: Record<string, ParentRegisteredPrompt> })
      ._registeredPrompts;
  }

  private toJsonSchema(schema: unknown, pipeStrategy: 'input' | 'output'): Record<string, unknown> {
    if (!schema || typeof schema !== 'object') {
      return {};
    }

    const normalized = normalizeObjectSchema(schema as Parameters<typeof normalizeObjectSchema>[0]);
    return normalized
      ? (toJsonSchemaCompat(normalized, {
          strictUnions: true,
          pipeStrategy,
        }) as unknown as Record<string, unknown>)
      : (schema as Record<string, unknown>);
  }

  private toInputTransportSchema(schema: unknown): InputSchema {
    const jsonSchema = this.toJsonSchema(schema, 'input');

    if (Object.keys(jsonSchema).length === 0) {
      return DEFAULT_INPUT_SCHEMA;
    }

    if (jsonSchema.type === undefined) {
      return { type: 'object', ...jsonSchema } as InputSchema;
    }

    return jsonSchema as InputSchema;
  }

  private toOutputTransportSchema(schema: unknown): JsonSchemaForInference {
    return this.toJsonSchema(schema, 'output') as unknown as JsonSchemaForInference;
  }

  private isZodSchema(schema: unknown): boolean {
    if (!schema || typeof schema !== 'object') return false;
    const s = schema as Record<string, unknown>;
    return '_zod' in s || '_def' in s;
  }

  private getNativeLegacyToolsApi(): NativeLegacyToolsApi | undefined {
    if (!this.native) {
      return undefined;
    }

    const candidate = this.native as ModelContextCore &
      Partial<Pick<ModelContextExtensions, 'listTools' | 'callTool'>>;
    if (typeof candidate.listTools !== 'function' || typeof candidate.callTool !== 'function') {
      return undefined;
    }

    return candidate as NativeLegacyToolsApi;
  }

  private getNativeStandardToolsApi(): NativeStandardToolsApi | undefined {
    if (!this.native) {
      return undefined;
    }

    const candidate = this.native as Partial<NativeStandardToolsApi>;
    if (typeof candidate.getTools !== 'function' || typeof candidate.executeTool !== 'function') {
      return undefined;
    }

    return candidate as NativeStandardToolsApi;
  }

  private getNativeUnregisterTool(): NativeUnregisterToolFn | undefined {
    if (!this.native) {
      return undefined;
    }

    const unregisterTool = (this.native as { unregisterTool?: unknown }).unregisterTool;
    if (typeof unregisterTool !== 'function') {
      return undefined;
    }

    return (nameOrTool: string | ModelContextToolReference) =>
      unregisterTool.call(this.native, nameOrTool);
  }

  private createNativeToolCleanup(signal?: AbortSignal): {
    options: ModelContextRegisterToolOptions;
    abort: () => void;
  } {
    const controller = new AbortController();
    let removeSignalListener: (() => void) | undefined;

    if (signal) {
      const abortNativeSignal = () => {
        controller.abort();
      };

      if (signal.aborted) {
        abortNativeSignal();
      } else {
        signal.addEventListener('abort', abortNativeSignal, { once: true });
        removeSignalListener = () => signal.removeEventListener('abort', abortNativeSignal);
      }
    }

    return {
      options: { signal: controller.signal },
      abort: () => {
        removeSignalListener?.();
        if (!controller.signal.aborted) {
          controller.abort();
        }
      },
    };
  }

  private registerNativeToolMirror(
    tool: ToolDescriptor,
    signal?: AbortSignal
  ): NativeToolCleanup | undefined {
    if (!this.native) {
      return undefined;
    }

    const nativeRegister = this.native.registerTool as NativeRegisterToolFn;
    const nativeUnregisterTool = this.getNativeUnregisterTool();
    const shouldPassSignal = Boolean(signal) || !nativeUnregisterTool;
    const cleanup = shouldPassSignal ? this.createNativeToolCleanup(signal) : undefined;
    let nativeRegisterResult: MaybePromise<void>;

    try {
      if (cleanup) {
        nativeRegisterResult = nativeRegister.call(this.native, tool, cleanup.options);
      } else {
        nativeRegisterResult = nativeRegister.call(this.native, tool);
      }
    } catch (error) {
      cleanup?.abort();
      if (isPermissionsPolicySecurityError(error)) {
        console.warn(
          '[BrowserMcpServer] Native WebMCP tool mirror is blocked by permissions policy; continuing with WebMCP transport registration only.'
        );
        return undefined;
      }
      throw error;
    }

    if (!cleanup) {
      return undefined;
    }

    const nativeToolCleanup = {
      abort: cleanup.abort,
      // Web IDL optional arguments may not increase function.length. When
      // unregisterTool is absent, the signal is the only native cleanup path.
      nativeSignalAccepted: nativeRegister.length >= 2 || !nativeUnregisterTool,
    };
    this._nativeToolCleanups.set(tool.name, nativeToolCleanup);

    if (isPromiseLike(nativeRegisterResult)) {
      nativeRegisterResult.then(undefined, (error: unknown) => {
        cleanup.abort();
        if (this._nativeToolCleanups.get(tool.name) === nativeToolCleanup) {
          this._nativeToolCleanups.delete(tool.name);
        }

        if (isPermissionsPolicySecurityError(error)) {
          console.warn(
            '[BrowserMcpServer] Native WebMCP tool mirror is blocked by permissions policy; continuing with WebMCP transport registration only.'
          );
          return;
        }

        if (isAbortError(error)) {
          return;
        }

        console.warn(
          '[BrowserMcpServer] Native WebMCP tool mirror registration rejected; continuing with WebMCP transport registration only.',
          error
        );
      });
    }

    return nativeToolCleanup;
  }

  private unregisterNativeToolMirror(
    name: string,
    options?: { preferAbortSignal?: boolean }
  ): void {
    const cleanup = this._nativeToolCleanups.get(name);
    this._nativeToolCleanups.delete(name);

    const nativeUnregisterTool = this.getNativeUnregisterTool();
    const shouldUseAbortOnly = options?.preferAbortSignal && cleanup?.nativeSignalAccepted === true;

    if (shouldUseAbortOnly || !nativeUnregisterTool) {
      cleanup?.abort();
      return;
    }

    try {
      nativeUnregisterTool(name);
    } finally {
      cleanup?.abort();
    }
  }

  private installToolRequestHandlers(): void {
    this.server.setRequestHandler(ListToolsRequestSchema, () => ({
      tools: this.listToolsForMcpTransport(),
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      try {
        const params =
          request.params.arguments === undefined
            ? { name: request.params.name }
            : {
                name: request.params.name,
                arguments: request.params.arguments,
              };
        const result = await this.callTool(params);
        return this.toMcpCallToolResult(result);
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: error instanceof Error ? error.message : String(error),
            },
          ],
          isError: true,
        } satisfies McpCallToolResult;
      }
    });
  }

  private registerToolInServer(tool: ToolDescriptor): void {
    validateAndWarnToolName(tool.name);

    const inputSchema = this.toInputTransportSchema(tool.inputSchema);
    const outputSchema = tool.outputSchema
      ? this.toOutputTransportSchema(tool.outputSchema)
      : undefined;

    if (this._tools.has(tool.name)) {
      throw new Error(`Tool ${tool.name} is already registered`);
    }

    const registeredTool: RegisteredWebMcpTool = {
      ...(tool.title ? { title: tool.title } : {}),
      description: tool.description,
      inputSchema,
      ...(outputSchema ? { outputSchema } : {}),
      ...(tool.annotations ? { annotations: tool.annotations } : {}),
      handler: async (args: Record<string, unknown>) => {
        const client: ModelContextClient = {
          requestUserInteraction: async (cb: () => Promise<unknown>) => cb(),
        };
        return normalizeToolResponse(await tool.execute(args, client));
      },
    };

    this._tools.set(tool.name, registeredTool);
    this.sendToolListChanged();
    this.notifyProducerToolsChanged();
  }

  get ontoolchange(): ((this: ModelContextCore, ev: Event) => unknown) | null {
    return this._ontoolchange;
  }

  set ontoolchange(handler: ((this: ModelContextCore, ev: Event) => unknown) | null) {
    this._ontoolchange = handler;
  }

  addEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject | null,
    options?: boolean | AddEventListenerOptions
  ): void {
    this._producerEventTarget.addEventListener(type, listener, options);
  }

  removeEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject | null,
    options?: boolean | EventListenerOptions
  ): void {
    this._producerEventTarget.removeEventListener(type, listener, options);
  }

  dispatchEvent(event: Event): boolean {
    return this._producerEventTarget.dispatchEvent(event);
  }

  private notifyProducerToolsChanged(): void {
    if (this._producerToolsChangedQueued) {
      return;
    }
    this._producerToolsChangedQueued = true;

    queueMicrotask(() => {
      this._producerToolsChangedQueued = false;
      const event = new Event('toolchange');
      try {
        this._ontoolchange?.call(this as unknown as ModelContextCore, event);
      } catch (error) {
        console.warn(
          '[BrowserMcpServer] navigator.modelContext.ontoolchange handler threw:',
          error
        );
      }
      this.dispatchEvent(event);
    });
  }

  backfillTools(
    tools: readonly ToolListItem[],
    execute: (name: string, args: Record<string, unknown>) => Promise<ToolResponse>
  ): number {
    let synced = 0;

    for (const sourceTool of tools) {
      if (!sourceTool?.name || this._tools.has(sourceTool.name)) {
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

  // @ts-expect-error -- WebMCP API: (ToolDescriptor, options?) vs MCP SDK: (name, config, cb)
  override registerTool(
    tool: ToolDescriptor,
    options?: ModelContextRegisterToolOptions
  ): Promise<void> {
    const signal = options?.signal;

    if (signal?.aborted) {
      return Promise.reject(createAbortError());
    }

    this.registerNativeToolMirror(tool, signal);

    try {
      this.registerToolInServer(tool);
    } catch (error) {
      if (this.native) {
        try {
          this.unregisterNativeToolMirror(tool.name);
        } catch (rollbackError) {
          console.error(
            '[BrowserMcpServer] Rollback of native tool registration failed:',
            rollbackError
          );
        }
      }
      throw error;
    }

    if (signal) {
      signal.addEventListener(
        'abort',
        () => {
          const removed = this._tools.delete(tool.name);
          if (removed) {
            this.sendToolListChanged();
          }
          try {
            this.unregisterNativeToolMirror(tool.name, { preferAbortSignal: true });
          } catch (error) {
            console.warn('[BrowserMcpServer] Native unregister via abort fallback failed:', error);
          }
          if (removed) {
            this.notifyProducerToolsChanged();
          }
        },
        { once: true }
      );
    }

    return Promise.resolve();
  }

  /**
   * Backfill tools that were already registered on the native/polyfill context
   * before this BrowserMcpServer wrapper was installed.
   */
  syncNativeTools(): number {
    let synced = 0;
    const nativeLegacyToolsApi = this.getNativeLegacyToolsApi();
    if (nativeLegacyToolsApi) {
      const nativeCallTool = nativeLegacyToolsApi.callTool.bind(nativeLegacyToolsApi);
      synced += this.backfillTools(
        nativeLegacyToolsApi.listTools(),
        async (name: string, args: Record<string, unknown>) =>
          nativeCallTool({
            name,
            arguments: args,
          })
      );
    }

    const nativeStandardToolsApi = this.getNativeStandardToolsApi();
    if (nativeStandardToolsApi) {
      void this.backfillNativeStandardTools(nativeStandardToolsApi).catch((error: unknown) => {
        console.warn('[BrowserMcpServer] Native WebMCP tool backfill failed:', error);
      });
    }

    return synced;
  }

  private async backfillNativeStandardTools(
    nativeToolsApi: NativeStandardToolsApi
  ): Promise<number> {
    const nativeTools = await nativeToolsApi.getTools.call(this.native);
    return this.backfillTools(
      nativeTools.map(toToolListItemFromNativeToolInfo),
      async (name: string, args: Record<string, unknown>) => {
        const nativeTool = nativeTools.find((tool) => tool.name === name);
        if (!nativeTool) {
          throw new Error(`Native tool not found: ${name}`);
        }

        const serialized = await nativeToolsApi.executeTool.call(
          this.native,
          nativeTool,
          JSON.stringify(args ?? {})
        );
        return parseNativeToolResult(name, serialized);
      }
    );
  }

  unregisterTool(nameOrTool: string | ModelContextToolReference): void {
    this.warnUnregisterToolDeprecationOnce();
    const name = this.resolveToolNameForUnregister(nameOrTool);
    const removed = this._tools.delete(name);
    if (removed) {
      this.sendToolListChanged();
    }

    if (this.native) {
      this.unregisterNativeToolMirror(name);
    }
    if (removed) {
      this.notifyProducerToolsChanged();
    }
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

  private warnUnregisterToolDeprecationOnce(): void {
    if (this._unregisterToolDeprecationWarned) {
      return;
    }

    this._unregisterToolDeprecationWarned = true;
    console.warn(
      '[BrowserMcpServer] navigator.modelContext.unregisterTool() is deprecated. The April 23, 2026 WebMCP draft removed it in favor of registerTool(tool, { signal }) — pass an AbortSignal and abort it to unregister.'
    );
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
    return [...this._tools.entries()].map(([name, tool]) => {
      const item: ToolListItem = {
        name,
        description: tool.description ?? '',
        inputSchema: tool.inputSchema,
      };
      if (tool.outputSchema) item.outputSchema = tool.outputSchema;
      if (tool.annotations) item.annotations = tool.annotations;
      return item;
    });
  }

  private listToolsForMcpTransport(): ToolListItem[] {
    return this.listTools().map((tool) => {
      if (!tool.outputSchema || tool.outputSchema.type === 'object') {
        return tool;
      }

      if (tool.outputSchema.type === undefined) {
        return {
          ...tool,
          outputSchema: {
            ...(tool.outputSchema as Record<string, unknown>),
            type: 'object',
          } as JsonSchemaForInference,
        };
      }

      const { outputSchema: _outputSchema, ...mcpTool } = tool;
      return mcpTool;
    });
  }

  private toMcpCallToolResult(result: ToolResponse): McpCallToolResult {
    return {
      content: result.content as McpCallToolResult['content'],
      ...(isPlainObject(result.structuredContent)
        ? {
            structuredContent: result.structuredContent as McpCallToolResult['structuredContent'],
          }
        : {}),
      ...(result.isError !== undefined ? { isError: result.isError } : {}),
    };
  }

  async getTools(): Promise<ModelContextToolInfo[]> {
    const origin =
      typeof globalThis.location === 'object' && typeof globalThis.location?.origin === 'string'
        ? globalThis.location.origin
        : '';
    const currentWindow =
      typeof globalThis.window === 'object' ? globalThis.window : (undefined as unknown as Window);

    return this.listTools().map((tool) => {
      let inputSchema: string;
      try {
        inputSchema = JSON.stringify(tool.inputSchema ?? DEFAULT_INPUT_SCHEMA);
      } catch {
        inputSchema = JSON.stringify(DEFAULT_INPUT_SCHEMA);
      }

      return {
        name: tool.name,
        title: this._tools.get(tool.name)?.title ?? tool.description ?? '',
        description: tool.description ?? '',
        inputSchema,
        origin,
        window: currentWindow,
      };
    });
  }

  /**
   * Override SDK's validateToolInput to handle both Zod schemas and plain JSON Schema.
   * Zod schemas use the SDK's safeParseAsync; plain JSON Schema uses the configured SDK validator.
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

    // Plain JSON Schema → use the configured SDK validator
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

    const r = result as { content?: unknown; isError?: unknown; structuredContent?: unknown };
    if (!('content' in r) || r.isError) return;
    if (r.structuredContent === undefined) {
      throw new Error(
        `Output validation error: Tool ${toolName} has an output schema but no structured content was provided`
      );
    }

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

    // Plain JSON Schema → use the configured SDK validator
    const validator = this._jsonValidator.getValidator(tool.outputSchema);
    const validationResult = validator(r.structuredContent);
    if (!validationResult.valid) {
      throw new Error(
        `Output validation error: Invalid structured content for tool ${toolName}: ${validationResult.errorMessage}`
      );
    }
  }

  /**
   * Executes a registered tool by name.
   *
   * @deprecated Prefer the WebMCP standard producer path: get a descriptor from
   * `getTools()` and pass it to `executeTool(tool, inputArgsJson)`. This method
   * remains as an MCP-B compatibility convenience and MCP transport bridge.
   */
  async callTool(params: {
    name: string;
    arguments?: Record<string, unknown>;
  }): Promise<ToolResponse> {
    const tool = this._tools.get(params.name);
    if (!tool) {
      throw new Error(`Tool not found: ${params.name}`);
    }

    const args = await this.validateToolInput(tool, params.arguments, params.name);
    const result = await tool.handler(args ?? {});
    await this.validateToolOutput(tool, result, params.name);
    return result;
  }

  /**
   * Executes a tool descriptor returned from getTools().
   */
  executeTool(
    tool: ModelContextToolInfo,
    inputArgsJson: string,
    options?: ModelContextTestingExecuteToolOptions
  ): Promise<string | null>;
  /**
   * Executes a registered tool by name.
   *
   * @deprecated Prefer the WebMCP standard producer path: get a descriptor from
   * `getTools()` and pass it to `executeTool(tool, inputArgsJson)`.
   */
  executeTool(name: string, args?: Record<string, unknown>): Promise<ToolResponse>;
  async executeTool(
    toolOrName: ModelContextToolInfo | string,
    inputArgsJsonOrArgs: string | Record<string, unknown> = {}
  ): Promise<string | null | ToolResponse> {
    if (typeof toolOrName === 'string') {
      return this.callTool({
        name: toolOrName,
        arguments:
          typeof inputArgsJsonOrArgs === 'string'
            ? JSON.parse(inputArgsJsonOrArgs)
            : inputArgsJsonOrArgs,
      });
    }

    const result = await this.callTool({
      name: toolOrName.name,
      arguments:
        typeof inputArgsJsonOrArgs === 'string'
          ? (JSON.parse(inputArgsJsonOrArgs) as Record<string, unknown>)
          : inputArgsJsonOrArgs,
    });
    const serialized = JSON.stringify(result);
    return serialized === undefined ? null : serialized;
  }

  /**
   * Override connect to initialize request handlers BEFORE the transport connection.
   * This prevents "Cannot register capabilities after connecting to transport" errors
   * when tools are registered dynamically after connection.
   *
   * Tool handlers are installed with the public low-level Server API in the constructor.
   * Prompt/resource handlers still come from the parent, then prompt handlers are replaced
   * where the parent expects Zod shapes instead of plain JSON Schema.
   */
  override async connect(transport: Transport): Promise<void> {
    (this as unknown as { setResourceRequestHandlers: () => void }).setResourceRequestHandlers();
    (this as unknown as { setPromptRequestHandlers: () => void }).setPromptRequestHandlers();

    // Replace ListPrompts handler — parent calls promptArgumentsFromSchema which expects
    // Zod shapes. We use _promptSchemas which has the real JSON Schema.
    this.server.setRequestHandler(ListPromptsRequestSchema, () => ({
      prompts: this.listPrompts(),
    }));

    // Replace GetPrompt handler — parent calls safeParseAsync on argsSchema.
    // We validate with the configured SDK validator instead.
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
