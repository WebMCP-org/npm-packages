import { execFile } from 'node:child_process';

import {
  fromJsonSchema,
  type JsonSchemaType,
  McpServer,
  type RegisteredTool,
  type Transport,
} from '@modelcontextprotocol/server';
import { StdioServerTransport } from '@modelcontextprotocol/server/stdio';
import { z } from 'zod/v4';

import { RelayBridgeServer, type RelayBridgeServerOptions } from './bridgeServer.js';
import type { AggregatedTool, SourceInfo } from './registry.js';

/**
 * Base options shared by all {@link LocalRelayMcpServer} configurations.
 */
interface LocalRelayMcpServerBaseOptions {
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
 * Construction options for {@link LocalRelayMcpServer}.
 *
 * Provide either an existing `bridge` instance OR `bridgeOptions` to create
 * one internally — not both.
 */
export type LocalRelayMcpServerOptions = LocalRelayMcpServerBaseOptions &
  (
    | { bridge: RelayBridgeServer; bridgeOptions?: never }
    | { bridge?: never; bridgeOptions?: RelayBridgeServerOptions }
  );

/**
 * MCP server facade that exposes browser-relayed tools over MCP transport.
 */
export class LocalRelayMcpServer {
  /**
   * Underlying WebSocket bridge used for browser communication.
   */
  readonly bridge: RelayBridgeServer;

  private readonly mcpServer: McpServer;
  private readonly dynamicTools = new Map<string, { handle: RegisteredTool; signature: string }>();

  private syncDebounceTimer: ReturnType<typeof setTimeout> | null = null;
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
      this.debouncedSyncDynamicTools();
    });

    this.registerStaticTools();
  }

  /**
   * Starts the browser bridge and synchronizes dynamic MCP tools.
   */
  async start(): Promise<void> {
    await this.bridge.start();
    this.syncDynamicTools();
  }

  /**
   * Connects the MCP server to a transport.
   *
   * This may be called exactly once per instance lifecycle.
   */
  async connect(transport: Transport): Promise<void> {
    if (this.connected) {
      throw new Error('MCP server transport already connected');
    }

    await this.mcpServer.connect(transport);
    this.connected = true;

    this.mcpServer.server.onerror = (error) => {
      process.stderr.write(
        `[webmcp-local-relay] error: MCP protocol error: ${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`
      );
    };
  }

  /**
   * Convenience helper that connects the server over stdio transport.
   */
  async startStdio(): Promise<void> {
    await this.connect(new StdioServerTransport());
  }

  /**
   * Stops MCP transport and bridge resources.
   */
  async stop(): Promise<void> {
    this.connected = false;

    if (this.syncDebounceTimer) {
      clearTimeout(this.syncDebounceTimer);
      this.syncDebounceTimer = null;
    }

    let mcpCloseError: unknown;
    try {
      await this.mcpServer.close();
    } catch (err) {
      mcpCloseError = err;
      process.stderr.write(
        `[webmcp-local-relay] error: failed to close MCP server: ${err instanceof Error ? (err.stack ?? err.message) : String(err)}\n`
      );
    }
    await this.bridge.stop();
    if (mcpCloseError) {
      process.stderr.write(
        '[webmcp-local-relay] warn: shutdown completed with errors (MCP server close failed)\n'
      );
    }
  }

  /**
   * Returns dynamic tool names currently registered in MCP.
   */
  listDynamicToolNames(): string[] {
    return Array.from(this.dynamicTools.keys()).sort();
  }

  /**
   * Registers built-in management tools exposed by the relay.
   */
  private registerStaticTools(): void {
    this.mcpServer.registerTool(
      'webmcp_list_sources',
      {
        description: 'List connected browser tool sources and their metadata.',
        inputSchema: z.object({}),
        annotations: {
          readOnlyHint: true,
          idempotentHint: true,
        },
      },
      async () => {
        const clientMode = this.bridge.mode === 'client';
        const sources = clientMode
          ? this.bridge.listSourcesFromRelay()
          : this.bridge.registry.listSources();
        const info = {
          ...(clientMode ? { mode: 'client' as const } : {}),
          count: sources.length,
          sources,
        };
        return {
          content: [{ type: 'text', text: JSON.stringify(info, null, 2) }],
          structuredContent: info,
        };
      }
    );

    this.mcpServer.registerTool(
      'webmcp_list_tools',
      {
        description:
          'List WebMCP tools available from connected browser sources. Returns tool definitions including name, description, input schema, and source info.',
        inputSchema: z.object({}),
        annotations: {
          readOnlyHint: true,
          idempotentHint: true,
        },
      },
      async () => {
        const tools = this.listAggregatedTools();
        const info = { count: tools.length, tools };
        return {
          content: [{ type: 'text', text: JSON.stringify(info, null, 2) }],
          structuredContent: info,
        };
      }
    );

    this.mcpServer.registerTool(
      'webmcp_open_page',
      {
        description:
          "Open a URL in the user's default browser, or refresh a connected source page. Use to launch WebMCP-enabled pages or reload stale connections.",
        inputSchema: z.object({
          url: z.string().describe('URL to open or match for refresh.'),
          refresh: z
            .boolean()
            .optional()
            .describe(
              'If true, refresh the connected source matching this URL instead of opening a new tab.'
            ),
        }),
        annotations: { readOnlyHint: false },
      },
      async ({ url, refresh }) => {
        let parsed: URL;
        try {
          parsed = new URL(url);
        } catch {
          return {
            content: [{ type: 'text' as const, text: `Invalid URL: ${url}` }],
            isError: true,
          };
        }

        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
          return {
            content: [
              {
                type: 'text' as const,
                text: `Only http: and https: URLs are allowed. Got: ${parsed.protocol}`,
              },
            ],
            isError: true,
          };
        }

        const existing =
          this.bridge.mode === 'server'
            ? this.bridge.registry
                .listSources()
                .find((source) => source.url && URL.parse(source.url)?.origin === parsed.origin)
            : undefined;

        if (refresh) {
          if (this.bridge.mode === 'client') {
            return {
              content: [
                {
                  type: 'text' as const,
                  text: 'Refresh is not supported in client mode. Only the server relay can reload sources.',
                },
              ],
              isError: true,
            };
          }

          if (!existing) {
            return {
              content: [
                {
                  type: 'text' as const,
                  text: `No connected source matches origin ${parsed.origin}. The page may not be open or connected.`,
                },
              ],
              isError: true,
            };
          }

          try {
            this.bridge.reloadSource(existing.sourceId);
            return {
              content: [
                {
                  type: 'text' as const,
                  text: `Reload sent to source ${existing.sourceId} (${existing.url ?? existing.origin}).`,
                },
              ],
            };
          } catch (err) {
            return {
              content: [
                {
                  type: 'text' as const,
                  text: `Failed to reload source: ${err instanceof Error ? err.message : String(err)}`,
                },
              ],
              isError: true,
            };
          }
        }

        try {
          await this.openInBrowser(url);
        } catch (err) {
          return {
            content: [
              {
                type: 'text' as const,
                text: `Failed to open browser: ${err instanceof Error ? err.message : String(err)}`,
              },
            ],
            isError: true,
          };
        }

        if (existing) {
          return {
            content: [
              {
                type: 'text' as const,
                text: `Opened ${url} in the default browser. Note: a source from ${existing.url ?? existing.origin} is already connected.`,
              },
            ],
          };
        }

        return {
          content: [{ type: 'text' as const, text: `Opened ${url} in the default browser.` }],
        };
      }
    );
  }

  /**
   * Opens a URL in the user's default browser using the platform open command.
   *
   * Passes the re-serialized `URL.href` directly to the platform launcher.
   * No shell or command-language string is involved.
   */
  private openInBrowser(url: string): Promise<void> {
    const safeUrl = new URL(url).href;
    const command =
      process.platform === 'darwin'
        ? 'open'
        : process.platform === 'win32'
          ? 'explorer.exe'
          : 'xdg-open';
    return new Promise((resolve, reject) => {
      execFile(command, [safeUrl], (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  /**
   * Debounces rapid stateChanged events into a single sync pass.
   *
   * Browser reconnections emit multiple stateChanged events in quick
   * succession (hello, tools/list). Without debouncing, each triggers a
   * full sync that removes and re-registers tools — sending per-operation
   * notifications through the stdio transport and overwhelming the agent.
   */
  private debouncedSyncDynamicTools(): void {
    if (this.syncDebounceTimer) {
      return;
    }

    this.syncDebounceTimer = setTimeout(() => {
      this.syncDebounceTimer = null;
      try {
        this.syncDynamicTools();
      } catch (err) {
        const details = err instanceof Error ? (err.stack ?? err.message) : String(err);
        process.stderr.write(
          `[webmcp-local-relay] error: failed to sync dynamic tools: ${details}\n`
        );
      }
    }, 16);
  }

  /**
   * Returns the current aggregated tool list, dispatching based on bridge mode.
   */
  private listAggregatedTools(): AggregatedTool[] {
    return this.bridge.mode === 'client'
      ? this.buildAggregatedToolsFromRelay()
      : this.bridge.registry.listTools();
  }

  /**
   * Converts relay client tool descriptors to aggregated tool shape.
   * Populates per-tool source metadata from the relay's tool-source mapping.
   */
  private buildAggregatedToolsFromRelay(): AggregatedTool[] {
    const toolSourceMap = this.bridge.getToolSourceMapFromRelay();
    const allSources = this.bridge.listSourcesFromRelay();
    const sourceById = new Map(allSources.map((s) => [s.sourceId, s]));

    return this.bridge
      .listToolsFromRelay()
      .map((tool) => {
        const sourceIds = toolSourceMap[tool.name] ?? [];
        const sources: SourceInfo[] = [];
        for (const id of sourceIds) {
          const source = sourceById.get(id);
          if (source) {
            sources.push(source);
          } else {
            process.stderr.write(
              `[webmcp-local-relay] warn: tool "${tool.name}" references unknown sourceId "${id}"\n`
            );
          }
        }

        return {
          ...tool,
          originalName: tool.name,
          sources,
        };
      })
      .sort((left, right) => left.name.localeCompare(right.name));
  }

  /**
   * Applies current aggregated tool state to MCP dynamic registrations.
   */
  private syncDynamicTools(): void {
    const tools = this.listAggregatedTools();
    const nextNames = new Set(tools.map((tool) => tool.name));

    for (const [name, registration] of this.dynamicTools) {
      if (nextNames.has(name)) {
        continue;
      }

      registration.handle.remove();
      this.dynamicTools.delete(name);
    }

    for (const tool of tools) {
      const signature = this.toolSignature(tool);
      const current = this.dynamicTools.get(tool.name);

      if (current?.signature === signature) {
        continue;
      }

      if (current) {
        current.handle.remove();
        this.dynamicTools.delete(tool.name);
      }

      try {
        const handle = this.registerDynamicTool(tool);
        this.dynamicTools.set(tool.name, { handle, signature });
      } catch (err) {
        const details = err instanceof Error ? (err.stack ?? err.message) : String(err);
        process.stderr.write(
          `[webmcp-local-relay] warn: skipped dynamic tool "${tool.name}" because its schema could not be compiled: ${details}\n`
        );
      }
    }
  }

  /**
   * Registers a single dynamic tool and returns a removal handle.
   */
  private registerDynamicTool(tool: AggregatedTool): RegisteredTool {
    // `AggregatedTool` has already passed the SDK's ToolSchema validation.
    // JsonSchemaType's exact optional properties are structurally narrower
    // than the protocol Tool type even though both describe JSON Schema.
    const inputSchema = fromJsonSchema<Record<string, unknown>>(tool.inputSchema as JsonSchemaType);
    const outputSchema = tool.outputSchema
      ? fromJsonSchema(tool.outputSchema as JsonSchemaType)
      : undefined;

    return this.mcpServer.registerTool(
      tool.name,
      {
        ...(tool.title !== undefined ? { title: tool.title } : {}),
        description: this.dynamicToolDescription(tool),
        inputSchema,
        ...(outputSchema ? { outputSchema } : {}),
        ...(tool.annotations ? { annotations: tool.annotations } : {}),
        ...(tool.icons ? { icons: tool.icons } : {}),
        ...(tool._meta ? { _meta: tool._meta } : {}),
      },
      async (args: Record<string, unknown>, context) => {
        try {
          return await this.bridge.invokeTool(tool.name, args, { signal: context.mcpReq.signal });
        } catch (err) {
          if (context.mcpReq.signal.aborted) throw err;
          const message = err instanceof Error ? err.message : String(err);
          const details = err instanceof Error ? (err.stack ?? err.message) : String(err);
          process.stderr.write(
            `[webmcp-local-relay] error: dynamic tool "${tool.name}" invocation failed: ${details}\n`
          );
          return {
            content: [
              {
                type: 'text' as const,
                text: `Failed to invoke relayed tool "${tool.name}": ${message}`,
              },
            ],
            isError: true,
          };
        }
      }
    );
  }

  /**
   * Builds a display description for relayed tools including source context.
   * In client mode, source metadata is unavailable, so tools are labeled `[WebMCP relay]`.
   */
  private dynamicToolDescription(tool: AggregatedTool): string {
    const source = tool.sources[0];
    const sourceLabel = source
      ? `[WebMCP ${source.tabId}${source.title ? ` • ${source.title}` : ''}]`
      : '[WebMCP relay]';

    return `${sourceLabel} ${tool.description ?? `Relayed tool ${tool.originalName}`}`;
  }

  /**
   * Produces a stable signature for change detection of dynamic tool metadata.
   *
   * Deliberately excludes `sourceId` (which is a per-connection UUID that
   * changes on every browser reconnect) so that a reconnecting tab with the
   * same tools does not trigger a needless remove+re-register cycle.
   */
  private toolSignature(tool: AggregatedTool): string {
    return JSON.stringify({
      originalName: tool.originalName,
      title: tool.title,
      description: tool.description,
      inputSchema: tool.inputSchema,
      outputSchema: tool.outputSchema,
      annotations: tool.annotations,
      _meta: tool._meta,
      icons: tool.icons,
      source: tool.sources[0]
        ? { tabId: tool.sources[0].tabId, title: tool.sources[0].title }
        : undefined,
    });
  }
}
