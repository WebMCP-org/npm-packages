import type {
  CallToolResult,
  InputSchema,
  ModelContextClient,
  ModelContextCore,
  ModelContextOptions,
  ResourceContents,
  ToolDescriptor,
  ToolListItem,
  ToolResponse,
} from '@mcp-b/webmcp-types';
import type { ServerOptions } from '@modelcontextprotocol/sdk/server/index.js';
import { McpServer as BaseMcpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { mergeCapabilities } from '@modelcontextprotocol/sdk/shared/protocol.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import type { Implementation, PromptMessage } from '@modelcontextprotocol/sdk/types.js';
import { PolyfillJsonSchemaValidator } from './polyfill-validator.js';

const DEFAULT_INPUT_SCHEMA: InputSchema = { type: 'object', properties: {} };

interface ParentRegisteredTool {
  description?: string;
  inputSchema?: unknown;
  outputSchema?: unknown;
  annotations?: unknown;
  handler: (args: Record<string, unknown>, extra: unknown) => Promise<CallToolResult>;
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
  cb: (args: Record<string, unknown>, extra: unknown) => Promise<CallToolResult>
) => void;

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
  private native: ModelContextCore | undefined;

  constructor(serverInfo: Implementation, options?: BrowserMcpServerOptions) {
    const enhancedOptions: ServerOptions = {
      capabilities: mergeCapabilities(options?.capabilities || {}, {
        tools: { listChanged: true },
        resources: { listChanged: true },
        prompts: { listChanged: true },
      }),
      jsonSchemaValidator: options?.jsonSchemaValidator ?? new PolyfillJsonSchemaValidator(),
    };

    super(serverInfo, enhancedOptions);
    this.native = options?.native;
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

  // --- WebMCP standard API (primary surface) ---

  // @ts-expect-error -- WebMCP API: (ToolDescriptor) vs MCP SDK: (name, config, cb)
  override registerTool(tool: ToolDescriptor): void {
    // Mirror to native first — the polyfill validates the descriptor
    if (this.native) {
      (this.native.registerTool as (tool: ToolDescriptor) => void)(tool);
    }

    const inputSchema = tool.inputSchema ?? DEFAULT_INPUT_SCHEMA;

    try {
      // Cast needed: parent expects Zod-compatible schemas, we pass JSON Schema objects
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
          return tool.execute(args, client);
        }
      );
    } catch (error) {
      // Rollback native registration on server failure
      if (this.native) {
        try {
          this.native.unregisterTool(tool.name);
        } catch {
          // best-effort rollback
        }
      }
      throw error;
    }
  }

  unregisterTool(name: string): void {
    this._parentTools[name]?.remove();

    if (this.native) {
      this.native.unregisterTool(name);
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
    const registered = (super.registerResource as Function)(
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
    const registered = (super.registerPrompt as Function)(
      descriptor.name,
      {
        ...(descriptor.description !== undefined && { description: descriptor.description }),
        ...(descriptor.argsSchema !== undefined && { argsSchema: descriptor.argsSchema }),
      },
      async (args: Record<string, unknown>) => ({
        messages: (await descriptor.get(args)).messages,
      })
    );

    return {
      unregister: () => registered.remove(),
    };
  }

  provideContext(options?: ModelContextOptions): void {
    for (const tool of Object.values(this._parentTools)) {
      tool.remove();
    }

    if (this.native) {
      this.native.clearContext();
    }

    for (const tool of options?.tools ?? []) {
      this.registerTool(tool);
    }
  }

  clearContext(): void {
    for (const tool of Object.values(this._parentTools)) {
      tool.remove();
    }

    if (this.native) {
      this.native.clearContext();
    }
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
      .map(([name, prompt]) => ({
        name,
        ...(prompt.description !== undefined && { description: prompt.description }),
        ...(prompt.argsSchema
          ? {
              arguments: Object.entries((prompt.argsSchema as Record<string, unknown>) ?? {}).map(
                ([argName]) => ({ name: argName })
              ),
            }
          : {}),
      }));
  }

  async getPrompt(
    name: string,
    args: Record<string, unknown> = {}
  ): Promise<{ messages: PromptMessage[] }> {
    const prompt = this._parentPrompts[name];
    if (!prompt) {
      throw new Error(`Prompt not found: ${name}`);
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
          inputSchema: (tool.inputSchema as InputSchema) ?? DEFAULT_INPUT_SCHEMA,
        };
        if (tool.outputSchema) item.outputSchema = tool.outputSchema as InputSchema;
        if (tool.annotations)
          item.annotations = tool.annotations as NonNullable<ToolListItem['annotations']>;
        return item;
      });
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

  /**
   * Override connect to initialize request handlers BEFORE the transport connection.
   * This prevents "Cannot register capabilities after connecting to transport" errors
   * when tools are registered dynamically after connection.
   */
  override async connect(transport: Transport): Promise<void> {
    (this as unknown as { setToolRequestHandlers: () => void }).setToolRequestHandlers();
    (this as unknown as { setResourceRequestHandlers: () => void }).setResourceRequestHandlers();
    (this as unknown as { setPromptRequestHandlers: () => void }).setPromptRequestHandlers();
    return super.connect(transport);
  }
}
