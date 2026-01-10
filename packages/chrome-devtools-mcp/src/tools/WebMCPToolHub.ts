/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {jsonSchemaToZod} from '@composio/json-schema-to-zod';

import type {McpContext} from '../McpContext.js';
import {
  zod,
  type McpServer,
  type CallToolResult,
  type Tool,
  type Page,
  type Debugger,
} from '../third_party/index.js';

/**
 * Convert a JSON Schema inputSchema from WebMCP to a Zod schema.
 *
 * Falls back to a permissive passthrough schema if conversion fails,
 * allowing the tool to still be registered and used.
 *
 * @param inputSchema - The JSON Schema from the WebMCP tool definition.
 * @param logger - Optional logger for conversion errors.
 * @returns A Zod schema for parameter validation.
 */
function convertInputSchema(
  inputSchema?: Tool['inputSchema'],
  logger?: Debugger,
): zod.ZodTypeAny {
  if (!inputSchema) {
    return zod.object({}).passthrough();
  }

  try {
    return jsonSchemaToZod(inputSchema as object);
  } catch (err) {
    logger?.('Failed to convert inputSchema to Zod:', err);
    return zod.object({}).passthrough();
  }
}

/**
 * Metadata for a registered WebMCP tool
 */
interface RegisteredTool {
  handle: ReturnType<typeof McpServer.prototype.registerTool>;
  page: Page;
  originalName: string;
  domain: string;
  toolId: string;
  description: string;
}

/**
 * Public info about a registered WebMCP tool (for diff_webmcp_tools)
 */
export interface RegisteredToolInfo {
  toolId: string;
  originalName: string;
  domain: string;
  pageIdx: number;
  description: string;
}

/**
 * WebMCPToolHub manages dynamic registration of WebMCP tools as first-class MCP tools.
 *
 * When a page has WebMCP tools available, this hub:
 * 1. Syncs those tools to the MCP server as native tools
 * 2. Uses naming convention: webmcp_{domain}_page{idx}_{toolName}
 * 3. Updates tools when WebMCP sends list_changed notifications
 * 4. Removes tools when pages navigate or close
 *
 * This allows Claude Code to call WebMCP tools directly without the two-step
 * diff_webmcp_tools -> call_webmcp_tool process.
 */
export class WebMCPToolHub {
  #server: McpServer;
  #context: McpContext;
  #logger: Debugger;
  /** Map of tool IDs to their registration metadata. */
  #registeredTools = new Map<string, RegisteredTool>();
  /** Tracks which tool IDs belong to each page (for cleanup on navigation). */
  #pageTools = new WeakMap<Page, Set<string>>();
  /** Guards against concurrent sync operations per page. */
  #syncInProgress = new WeakSet<Page>();
  /** Whether automatic tool registration is enabled. */
  #enabled = true;
  /** Global diff state for diff_webmcp_tools - tracks last seen tool IDs. */
  #lastSeenToolIds: Set<string> | null = null;

  constructor(server: McpServer, context: McpContext, enabled = true) {
    this.#server = server;
    this.#context = context;
    this.#logger = context.logger;
    this.#enabled = enabled;
  }

  /**
   * Disable automatic tool registration
   */
  disable(): void {
    this.#enabled = false;
  }

  /**
   * Enable automatic tool registration
   */
  enable(): void {
    this.#enabled = true;
  }

  /**
   * Check if the hub is enabled
   */
  isEnabled(): boolean {
    return this.#enabled;
  }

  /**
   * Sync tools for a page. Called on:
   * 1. Initial WebMCP connection
   * 2. ToolListChangedNotificationSchema notification
   *
   * @param page - The browser page
   * @param client - The MCP client (passed to avoid infinite loop via getWebMCPClient)
   */
  async syncToolsForPage(
    page: Page,
    client: Client,
  ): Promise<{synced: number; removed: number; updated: number}> {
    if (!this.#enabled) {
      return {synced: 0, removed: 0, updated: 0};
    }

    if (this.#syncInProgress.has(page)) {
      this.#logger('Sync already in progress for page, skipping');
      return {synced: 0, removed: 0, updated: 0};
    }

    this.#syncInProgress.add(page);
    const urlAtStart = page.url();

    try {
      const {tools} = await client.listTools();

      // Guard: page navigated during async operation
      if (page.url() !== urlAtStart) {
        this.#logger('Page navigated during sync, aborting');
        return {synced: 0, removed: 0, updated: 0};
      }

      return this.#applyToolChanges(page, tools as Tool[]);
    } catch (err) {
      this.#logger('Failed to sync WebMCP tools:', err);
      return {synced: 0, removed: 0, updated: 0};
    } finally {
      this.#syncInProgress.delete(page);
    }
  }

  /**
   * Remove all tools for a page. Called on:
   * 1. Transport close (navigation/page close)
   * 2. Manual removal
   */
  removeToolsForPage(page: Page): number {
    const toolIds = this.#pageTools.get(page);
    if (!toolIds) {
      return 0;
    }

    let removed = 0;
    for (const toolId of toolIds) {
      const registered = this.#registeredTools.get(toolId);
      if (registered) {
        this.#logger(`Removing WebMCP tool: ${toolId}`);
        registered.handle.remove();
        this.#registeredTools.delete(toolId);
        removed++;
      }
    }

    this.#pageTools.delete(page);
    this.#logger(`Removed ${removed} WebMCP tools for page`);
    return removed;
  }

  /**
   * Apply tool changes by comparing current tools with new tools from WebMCP.
   * Handles add, update, and remove operations.
   */
  #applyToolChanges(
    page: Page,
    tools: Tool[],
  ): {synced: number; removed: number; updated: number} {
    const domain = extractDomain(page.url());
    const pageIdx = this.#context.getPages().indexOf(page);

    // Guard: page not found in pages list (may have been closed)
    if (pageIdx === -1) {
      this.#logger('Page not found in pages list, skipping tool sync');
      return {synced: 0, removed: 0, updated: 0};
    }

    const newToolIds = new Set<string>();

    let synced = 0;
    let updated = 0;

    for (const tool of tools) {
      const toolId = this.#generateToolId(domain, pageIdx, tool.name);
      newToolIds.add(toolId);

      const existing = this.#registeredTools.get(toolId);
      if (existing) {
        // Remove and re-register to ensure schema updates are applied
        // (MCP SDK's update() doesn't support schema changes)
        this.#logger(`Re-registering WebMCP tool: ${toolId}`);
        existing.handle.remove();
        this.#registeredTools.delete(toolId);
        this.#registerTool(page, domain, pageIdx, tool);
        updated++;
      } else {
        // Register new tool
        this.#registerTool(page, domain, pageIdx, tool);
        synced++;
      }
    }

    // Remove tools that no longer exist
    const existingToolIds = this.#pageTools.get(page) || new Set();
    let removed = 0;
    for (const toolId of existingToolIds) {
      if (!newToolIds.has(toolId)) {
        const registered = this.#registeredTools.get(toolId);
        if (registered) {
          this.#logger(`Removing stale WebMCP tool: ${toolId}`);
          registered.handle.remove();
          this.#registeredTools.delete(toolId);
          removed++;
        }
      }
    }

    this.#pageTools.set(page, newToolIds);
    this.#logger(
      `WebMCP tool sync: ${synced} added, ${updated} updated, ${removed} removed`,
    );
    return {synced, removed, updated};
  }

  /**
   * Register a single tool with the MCP server
   */
  #registerTool(page: Page, domain: string, pageIdx: number, tool: Tool): void {
    const toolId = this.#generateToolId(domain, pageIdx, tool.name);
    const description = this.#generateDescription(
      domain,
      pageIdx,
      tool.description,
    );

    // Validate tool name and log any warnings
    const warnings = validateToolName(tool.name);
    for (const warning of warnings) {
      this.#logger(`⚠️ Warning: ${warning}`);
    }

    this.#logger(`Registering WebMCP tool: ${toolId}`);

    // Store tool name for use in the callback closure
    const originalToolName = tool.name;

    // Convert the JSON Schema inputSchema to Zod for MCP SDK registration
    const zodSchema = convertInputSchema(tool.inputSchema, this.#logger);

    const handle = this.#server.registerTool(
      toolId,
      {
        description,
        inputSchema: zodSchema,
      },
      async (params: Record<string, unknown>): Promise<CallToolResult> => {
        this.#logger(`[WebMCPToolHub] Tool call received: ${toolId}`);
        this.#logger(`[WebMCPToolHub] Params: ${JSON.stringify(params)}`);
        // Look up page dynamically to handle potential stale references
        const currentPage = this.#getPageForTool(toolId);
        if (!currentPage) {
          this.#logger(`[WebMCPToolHub] Page not found for tool: ${toolId}`);
          return {
            content: [
              {
                type: 'text',
                text: 'Tool no longer available - page may have closed or navigated',
              },
            ],
            isError: true,
          };
        }
        this.#logger(`[WebMCPToolHub] Executing tool: ${originalToolName}`);
        // Pass params directly - they are already parsed by MCP SDK using the Zod schema
        return this.#executeTool(currentPage, originalToolName, params);
      },
    );

    this.#registeredTools.set(toolId, {
      handle,
      page,
      originalName: tool.name,
      domain,
      toolId,
      description,
    });

    // Track tool for this page
    const pageToolSet = this.#pageTools.get(page) || new Set();
    pageToolSet.add(toolId);
    this.#pageTools.set(page, pageToolSet);
  }

  /**
   * Execute a WebMCP tool on a page
   */
  async #executeTool(
    page: Page,
    toolName: string,
    args: Record<string, unknown>,
  ): Promise<CallToolResult> {
    try {
      const result = await this.#context.getWebMCPClient(page);
      if (!result.connected) {
        return {
          content: [{type: 'text', text: 'WebMCP connection lost'}],
          isError: true,
        };
      }

      const callResult = await result.client.callTool({
        name: toolName,
        arguments: args,
      });

      // The SDK's callTool returns CallToolResult, but we need to handle
      // the content array properly
      return callResult as CallToolResult;
    } catch (err) {
      return {
        content: [
          {
            type: 'text',
            text: `Tool error: ${err instanceof Error ? err.message : String(err)}`,
          },
        ],
        isError: true,
      };
    }
  }

  /**
   * Get the page associated with a registered tool
   */
  #getPageForTool(toolId: string): Page | undefined {
    const registered = this.#registeredTools.get(toolId);
    return registered?.page;
  }

  /**
   * Generate a unique tool ID following the naming convention
   */
  #generateToolId(domain: string, pageIdx: number, toolName: string): string {
    return `webmcp_${domain}_page${pageIdx}_${sanitizeName(toolName)}`;
  }

  /**
   * Generate a tool description with WebMCP context
   */
  #generateDescription(
    domain: string,
    pageIdx: number,
    originalDescription?: string,
  ): string {
    const displayDomain = getDisplayDomain(domain);
    return `[WebMCP - ${displayDomain} - Page ${pageIdx}] ${originalDescription || 'No description'}`;
  }

  /**
   * Get the total number of registered tools
   */
  getToolCount(): number {
    return this.#registeredTools.size;
  }

  /**
   * Get all registered tool IDs
   */
  getRegisteredToolIds(): string[] {
    return Array.from(this.#registeredTools.keys());
  }

  /**
   * Get all registered tools with their metadata (for diff_webmcp_tools)
   */
  getRegisteredTools(): RegisteredToolInfo[] {
    return Array.from(this.#registeredTools.values()).map(rt => ({
      toolId: rt.toolId,
      originalName: rt.originalName,
      domain: rt.domain,
      pageIdx: this.#context.getPages().indexOf(rt.page),
      description: rt.description,
    }));
  }

  /**
   * Get the last seen tool IDs for diff tracking
   */
  getLastSeenToolIds(): Set<string> | null {
    return this.#lastSeenToolIds;
  }

  /**
   * Set the last seen tool IDs for diff tracking
   */
  setLastSeenToolIds(toolIds: Set<string>): void {
    this.#lastSeenToolIds = toolIds;
  }

  /**
   * Clear the last seen tool IDs (resets diff state)
   */
  clearLastSeenToolIds(): void {
    this.#lastSeenToolIds = null;
  }
}

/**
 * Sanitize a name to be used in tool IDs.
 * Replaces any non-alphanumeric characters (except underscore) with underscore.
 */
export function sanitizeName(name: string): string {
  return name.replace(/[^a-zA-Z0-9_]/g, '_');
}

/**
 * Validate a tool name and return any warnings about the first character.
 * Tool names should start with a letter (a-z, A-Z) for best compatibility
 * with MCP clients. Starting with underscore, number, or hyphen may cause issues.
 *
 * NOTE: Similar validation logic exists in @mcp-b/global/src/global.ts for browser context.
 * Keep both implementations in sync when making changes.
 *
 * @param name - Tool name to validate
 * @returns Array of warning messages (empty if name starts with a letter)
 */
export function validateToolName(name: string): string[] {
  const warnings: string[] = [];

  // Check if name starts with underscore
  if (name.startsWith('_')) {
    warnings.push(
      `Tool name "${name}" starts with underscore. ` +
        'This may cause compatibility issues with some MCP clients. ' +
        'Consider using a letter as the first character.',
    );
  }

  // Check if name starts with a number
  if (/^[0-9]/.test(name)) {
    warnings.push(
      `Tool name "${name}" starts with a number. ` +
        'This may cause compatibility issues. ' +
        'Consider using a letter as the first character.',
    );
  }

  // Check if name starts with hyphen
  if (name.startsWith('-')) {
    warnings.push(
      `Tool name "${name}" starts with hyphen. ` +
        'This may cause compatibility issues. ' +
        'Consider using a letter as the first character.',
    );
  }

  return warnings;
}

/**
 * Extract and sanitize domain from a URL.
 * Handles localhost specially to include port in the domain.
 * Returns 'unknown' for URLs without a valid hostname (about:blank, file://, data:, etc.)
 */
export function extractDomain(url: string): string {
  try {
    const urlObj = new URL(url);
    const hostname = urlObj.hostname;

    // Handle empty hostname (about:blank, file://, data:, etc.)
    if (!hostname) {
      return 'unknown';
    }

    const isLocalhost =
      hostname === 'localhost' ||
      hostname === '127.0.0.1' ||
      hostname === '[::1]';
    const domain = isLocalhost
      ? `localhost_${urlObj.port || '80'}`
      : hostname;
    return sanitizeName(domain);
  } catch {
    return 'unknown';
  }
}

/**
 * Convert a sanitized domain back to display format.
 * Handles localhost port conversion and general underscore-to-dot conversion.
 *
 * IMPORTANT: Handle localhost FIRST before general underscore replacement
 */
export function getDisplayDomain(sanitizedDomain: string): string {
  return sanitizedDomain
    .replace(/^localhost_(\d+)$/, 'localhost:$1')
    .replace(/_/g, '.');
}
