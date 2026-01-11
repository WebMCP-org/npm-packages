/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type {Client} from '@modelcontextprotocol/sdk/client/index.js';

import type {McpContext} from '../McpContext.js';
import {
  type McpServer,
  type Tool,
  type Page,
  type Debugger,
} from '../third_party/index.js';

/**
 * Metadata for a tracked WebMCP tool
 */
interface TrackedTool {
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
  /** Map of tool IDs to their tracking metadata. */
  #trackedTools = new Map<string, TrackedTool>();
  /** Tracks which tool IDs belong to each page (for cleanup on navigation). */
  #pageTools = new WeakMap<Page, Set<string>>();
  /** Guards against concurrent sync operations per page. */
  #syncInProgress = new WeakSet<Page>();
  /** Whether automatic tool tracking is enabled. */
  #enabled = true;
  /** Last seen tool IDs for diff_webmcp_tools. */
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
   * Remove all tracked tools for a page. Called on:
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
      if (this.#trackedTools.has(toolId)) {
        this.#logger(`Removing tracked WebMCP tool: ${toolId}`);
        this.#trackedTools.delete(toolId);
        removed++;
      }
    }

    this.#pageTools.delete(page);
    this.#logger(`Removed ${removed} tracked WebMCP tools for page`);

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

      const existing = this.#trackedTools.get(toolId);
      if (existing) {
        // Re-track to ensure metadata updates are applied
        this.#logger(`Re-tracking WebMCP tool: ${toolId}`);
        this.#trackedTools.delete(toolId);
        this.#trackTool(page, domain, pageIdx, tool);
        updated++;
      } else {
        // Track new tool
        this.#trackTool(page, domain, pageIdx, tool);
        synced++;
      }
    }

    // Remove tools that no longer exist
    const existingToolIds = this.#pageTools.get(page) || new Set();
    let removed = 0;
    for (const toolId of existingToolIds) {
      if (!newToolIds.has(toolId)) {
        if (this.#trackedTools.has(toolId)) {
          this.#logger(`Removing stale WebMCP tool: ${toolId}`);
          this.#trackedTools.delete(toolId);
          removed++;
        }
      }
    }

    this.#pageTools.set(page, newToolIds);
    this.#logger(
      `WebMCP tool tracking: ${synced} added, ${updated} updated, ${removed} removed`,
    );

    // No longer send tools/list_changed - tools are called directly via call_webmcp_tool

    return {synced, removed, updated};
  }

  /**
   * Track a tool (tools are called directly via call_webmcp_tool, not registered with MCP server)
   */
  #trackTool(page: Page, domain: string, pageIdx: number, tool: Tool): void {
    const toolId = this.#generateToolId(domain, pageIdx, tool.name);

    // Validate tool name and log any warnings
    const warnings = validateToolName(tool.name);
    for (const warning of warnings) {
      this.#logger(`⚠️ Warning: ${warning}`);
    }

    this.#logger(`Tracking WebMCP tool: ${toolId}`);

    // Track tool metadata
    this.#trackedTools.set(toolId, {
      page,
      originalName: tool.name,
      domain,
      toolId,
      description: tool.description || '',
    });

    // Track tool for this page
    const pageToolSet = this.#pageTools.get(page) || new Set();
    pageToolSet.add(toolId);
    this.#pageTools.set(page, pageToolSet);
  }

  /**
   * Generate a unique tool ID following the naming convention
   */
  #generateToolId(domain: string, pageIdx: number, toolName: string): string {
    return `webmcp_${domain}_page${pageIdx}_${sanitizeName(toolName)}`;
  }

  /**
   * Get the total number of tracked tools
   */
  getToolCount(): number {
    return this.#trackedTools.size;
  }

  /**
   * Get all tracked tool IDs
   */
  getRegisteredToolIds(): string[] {
    return Array.from(this.#trackedTools.keys());
  }

  /**
   * Get all tracked tools with their metadata
   */
  getRegisteredTools(): RegisteredToolInfo[] {
    return Array.from(this.#trackedTools.values()).map(rt => ({
      toolId: rt.toolId,
      originalName: rt.originalName,
      domain: rt.domain,
      pageIdx: this.#context.getPages().indexOf(rt.page),
      description: rt.description,
    }));
  }

  /**
   * Get the last seen tool IDs (for diff_webmcp_tools)
   */
  getLastSeenToolIds(): Set<string> | null {
    return this.#lastSeenToolIds;
  }

  /**
   * Set the last seen tool IDs (for diff_webmcp_tools)
   */
  setLastSeenToolIds(toolIds: Set<string>): void {
    this.#lastSeenToolIds = toolIds;
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
