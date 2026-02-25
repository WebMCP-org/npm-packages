import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import { type ToolAnnotations, ToolAnnotationsSchema } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';

import { RelayBridgeServer, type RelayBridgeServerOptions } from './bridgeServer.js';
import type { AggregatedTool } from './registry.js';

/**
 * Handle returned by MCP tool registration.
 */
interface RegisteredToolHandle {
  remove: () => void;
}

/**
 * Construction options for {@link LocalRelayMcpServer}.
 */
export interface LocalRelayMcpServerOptions {
  /**
   * Existing bridge instance to reuse.
   */
  bridge?: RelayBridgeServer;
  /**
   * Bridge options used when creating an internal bridge.
   */
  bridgeOptions?: RelayBridgeServerOptions;
  /**
   * MCP server name reported during initialization.
   */
  serverName?: string;
  /**
   * MCP server version reported during initialization.
   */
  serverVersion?: string;
}

/**
 * MCP server facade that exposes browser-relayed tools over MCP transport.
 */
export class LocalRelayMcpServer {
  /**
   * Underlying WebSocket bridge used for browser communication.
   */
  readonly bridge: RelayBridgeServer;

  private readonly mcpServer: McpServer;
  private readonly dynamicToolHandles = new Map<string, RegisteredToolHandle>();
  private readonly dynamicToolSignature = new Map<string, string>();

  private syncing = false;
  private syncRequested = false;
  private connected = false;

  /**
   * Creates a local relay MCP server with static and dynamic tool registration.
   */
  constructor(options: LocalRelayMcpServerOptions = {}) {
    this.bridge = options.bridge ?? new RelayBridgeServer(options.bridgeOptions);

    this.mcpServer = new McpServer({
      name: options.serverName ?? 'webmcp-local-relay',
      version: options.serverVersion ?? '0.0.0',
    });

    this.bridge.on('stateChanged', () => {
      void this.syncDynamicTools().catch((err) => {
        this.logSyncError(err);
      });
    });

    this.registerStaticTools();
  }

  /**
   * Starts the browser bridge and synchronizes dynamic MCP tools.
   */
  async start(): Promise<void> {
    await this.bridge.start();
    await this.syncDynamicTools();
  }

  async connect(transport: Transport): Promise<void> {
    if (this.connected) {
      throw new Error('MCP server transport already connected');
    }

    await this.mcpServer.connect(transport);
    this.connected = true;
  }

  /**
   * Convenience helper that connects the server over stdio transport.
   */
  async startStdio(): Promise<void> {
    await this.connect(new StdioServerTransport());
  }

  async stop(): Promise<void> {
    this.connected = false;
    try {
      await this.mcpServer.close();
    } catch (err) {
      process.stderr.write(
        `[webmcp-local-relay] error: failed to close MCP server: ${err instanceof Error ? (err.stack ?? err.message) : String(err)}\n`
      );
    }
    await this.bridge.stop();
  }

  /**
   * Returns dynamic tool names currently registered in MCP.
   */
  listDynamicToolNames(): string[] {
    return Array.from(this.dynamicToolHandles.keys()).sort();
  }

  /**
   * Registers built-in management tools exposed by the relay.
   */
  private registerStaticTools(): void {
    this.mcpServer.registerTool(
      'webmcp_list_sources',
      {
        description: 'List connected browser tool sources and their metadata.',
        inputSchema: {},
        annotations: {
          readOnlyHint: true,
          idempotentHint: true,
        },
      },
      async () => {
        const sources = this.bridge.registry.listSources();
        return {
          content: [
            { type: 'text', text: JSON.stringify({ count: sources.length, sources }, null, 2) },
          ],
          structuredContent: {
            count: sources.length,
            sources,
          },
        };
      }
    );

    this.mcpServer.registerTool(
      'webmcp_list_tools',
      {
        description:
          'List WebMCP tools available from connected browser sources. ' +
          'Returns tool definitions including name, description, input schema, and source info. ' +
          'Use webmcp_call_tool to invoke a tool by name.',
        inputSchema: {},
        annotations: {
          readOnlyHint: true,
          idempotentHint: true,
        },
      },
      async () => {
        const tools = this.bridge.registry.listTools();
        return {
          content: [
            { type: 'text', text: JSON.stringify({ count: tools.length, tools }, null, 2) },
          ],
          structuredContent: {
            count: tools.length,
            tools,
          },
        };
      }
    );

    this.mcpServer.registerTool(
      'webmcp_call_tool',
      {
        description:
          'Call a WebMCP tool registered by a connected browser page. ' +
          'Use webmcp_list_tools first to see available tools and their input schemas.',
        inputSchema: {
          name: z
            .string()
            .describe('The tool name to call. Use webmcp_list_tools to see available tool names.'),
          arguments: z
            .record(z.string(), z.unknown())
            .optional()
            .describe(
              'Arguments to pass to the tool as a JSON object. Check the tool inputSchema from webmcp_list_tools for expected fields.'
            ),
        },
        annotations: {
          readOnlyHint: false,
        },
      },
      async ({ name, arguments: args }) => {
        const tools = this.bridge.registry.listTools();
        const toolSummary = this.buildToolSummary(tools);

        const matched = tools.find((t) => t.name === name);
        if (!matched) {
          const errorLines = [`Tool "${name}" not found.`];
          if (toolSummary) {
            errorLines.push('', 'Available tools:', toolSummary);
          } else {
            errorLines.push(
              '',
              'No tools are currently available. Ensure a browser page with WebMCP is connected.'
            );
          }
          return {
            content: [{ type: 'text' as const, text: errorLines.join('\n') }],
            isError: true,
          };
        }

        try {
          const result = await this.bridge.invokeTool(name, args ?? {});

          if (toolSummary) {
            const updatedTools = this.bridge.registry.listTools();
            const updatedSummary = this.buildToolSummary(updatedTools);
            if (updatedSummary) {
              result.content = [
                ...result.content,
                { type: 'text' as const, text: `\n---\nAvailable tools:\n${updatedSummary}` },
              ];
            }
          }

          return result;
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          const errorLines = [`Failed to call tool "${name}": ${message}`];
          if (toolSummary) {
            errorLines.push('', 'Available tools:', toolSummary);
          }
          return {
            content: [{ type: 'text' as const, text: errorLines.join('\n') }],
            isError: true,
          };
        }
      }
    );
  }

  /**
   * Builds a concise plain-text list of available tools.
   */
  private buildToolSummary(tools: AggregatedTool[]): string | null {
    if (tools.length === 0) {
      return null;
    }

    return tools
      .map((t) => {
        const desc = t.description ? ` - ${t.description.split('\n')[0]}` : '';
        return `  ${t.name}${desc}`;
      })
      .join('\n');
  }

  /**
   * Coalesces concurrent sync requests into a single serialized sync loop.
   */
  private async syncDynamicTools(): Promise<void> {
    if (this.syncing) {
      this.syncRequested = true;
      return;
    }

    this.syncing = true;

    try {
      do {
        this.syncRequested = false;
        this.applyDynamicTools(this.bridge.registry.listTools());
      } while (this.syncRequested);
    } finally {
      const retryRequested = this.syncRequested;
      this.syncRequested = false;
      this.syncing = false;
      if (retryRequested) {
        void this.syncDynamicTools().catch((err) => {
          this.logSyncError(err);
        });
      }
    }
  }

  /**
   * Applies registry tool state to MCP dynamic registrations.
   */
  private applyDynamicTools(tools: AggregatedTool[]): void {
    const nextNames = new Set(tools.map((tool) => tool.name));
    let changed = false;

    for (const [name, handle] of this.dynamicToolHandles.entries()) {
      if (nextNames.has(name)) {
        continue;
      }

      handle.remove();
      this.dynamicToolHandles.delete(name);
      this.dynamicToolSignature.delete(name);
      changed = true;
    }

    for (const tool of tools) {
      const signature = this.toolSignature(tool);
      const currentSignature = this.dynamicToolSignature.get(tool.name);

      if (currentSignature === signature && this.dynamicToolHandles.has(tool.name)) {
        continue;
      }

      const existing = this.dynamicToolHandles.get(tool.name);
      if (existing) {
        existing.remove();
        this.dynamicToolHandles.delete(tool.name);
      }

      const handle = this.registerDynamicTool(tool);
      this.dynamicToolHandles.set(tool.name, handle);
      this.dynamicToolSignature.set(tool.name, signature);
      changed = true;
    }

    if (changed && this.connected) {
      this.mcpServer.sendToolListChanged();
    }
  }

  /**
   * Registers a single dynamic tool and returns a removal handle.
   */
  private registerDynamicTool(tool: AggregatedTool): RegisteredToolHandle {
    const annotations = this.normalizeAnnotations(tool.annotations);
    const config: {
      description: string;
      inputSchema: z.ZodObject<z.ZodRawShape, 'passthrough'>;
      annotations?: ToolAnnotations;
    } = {
      description: this.dynamicToolDescription(tool),
      inputSchema: z.object({}).passthrough(),
    };
    if (annotations) {
      config.annotations = annotations;
    }

    const handle = this.mcpServer.registerTool(
      tool.name,
      config,
      async (args: Record<string, unknown>) => {
        return this.bridge.invokeTool(tool.name, args);
      }
    );

    return {
      remove: () => {
        handle.remove();
      },
    };
  }

  /**
   * Builds a display description for relayed tools including source context.
   */
  private dynamicToolDescription(tool: AggregatedTool): string {
    const source = tool.sources[0];
    const sourceLabel = source
      ? `[WebMCP ${source.tabId}${source.title ? ` • ${source.title}` : ''}]`
      : '[WebMCP]';

    return `${sourceLabel} ${tool.description ?? `Relayed tool ${tool.originalName}`}`;
  }

  /**
   * Converts unknown annotation payloads into MCP tool annotations when valid.
   */
  private normalizeAnnotations(
    value: Record<string, unknown> | undefined
  ): ToolAnnotations | undefined {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return undefined;
    }

    const parsed = ToolAnnotationsSchema.safeParse(value);
    return parsed.success ? parsed.data : undefined;
  }

  /**
   * Produces a stable signature for change detection of dynamic tool metadata.
   */
  private toolSignature(tool: AggregatedTool): string {
    return JSON.stringify({
      name: tool.name,
      originalName: tool.originalName,
      description: tool.description,
      inputSchema: tool.inputSchema,
      outputSchema: tool.outputSchema,
      annotations: tool.annotations,
      sources: tool.sources.map((source) => ({
        sourceId: source.sourceId,
        tabId: source.tabId,
      })),
    });
  }

  /**
   * Logs tool sync errors with full detail.
   */
  private logSyncError(err: unknown): void {
    const details = err instanceof Error ? (err.stack ?? err.message) : String(err);
    process.stderr.write(`[webmcp-local-relay] error: failed to sync dynamic tools: ${details}\n`);
  }
}
