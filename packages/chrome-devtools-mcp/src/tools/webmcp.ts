/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {zod} from '../third_party/index.js';

import {ToolCategory} from './categories.js';
import {defineTool} from './ToolDefinition.js';

/**
 * Show all WebMCP tools registered across all pages, with diff since last call.
 * First call returns full list. Subsequent calls return only added/removed tools.
 */
export const diffWebMCPTools = defineTool({
  name: 'diff_webmcp_tools',
  description:
    'Show all WebMCP tools registered across all pages, with diff since last call. ' +
    'First call returns full list. Subsequent calls return only added/removed tools. ' +
    'Use full=true to force complete list. ' +
    'Tools are shown with their callable names (e.g., webmcp_localhost_3000_page0_test_add). ' +
    'Call these tools directly by name instead of using a separate call tool.',
  annotations: {
    title: 'Diff Website MCP Tools',
    category: ToolCategory.WEBMCP,
    readOnlyHint: true,
  },
  schema: {
    full: zod
      .boolean()
      .optional()
      .describe('Force full tool list instead of diff. Default: false'),
  },
  handler: async (request, response, context) => {
    const {full} = request.params;
    const toolHub = context.getToolHub();

    if (!toolHub) {
      response.appendResponseLine('WebMCPToolHub not initialized.');
      return;
    }

    const tools = toolHub.getRegisteredTools();
    const currentToolIds = new Set(tools.map(t => t.toolId));
    const lastSeen = toolHub.getLastSeenToolIds();

    // First call or full=true: return full list
    if (!lastSeen || full) {
      toolHub.setLastSeenToolIds(currentToolIds);

      if (tools.length === 0) {
        response.appendResponseLine('No WebMCP tools registered.');
        response.appendResponseLine(
          'Navigate to a page with @mcp-b/global loaded to discover tools.',
        );
        return;
      }

      response.appendResponseLine(`${tools.length} WebMCP tool(s) registered:`);
      response.appendResponseLine('');

      for (const tool of tools) {
        response.appendResponseLine(`- ${tool.toolId}`);
        response.appendResponseLine(`  Original: ${tool.originalName}`);
        response.appendResponseLine(`  Domain: ${tool.domain} (page ${tool.pageIdx})`);
        if (tool.description) {
          response.appendResponseLine(`  Description: ${tool.description}`);
        }
        response.appendResponseLine('');
      }
      return;
    }

    // Subsequent calls: return diff
    const added = tools.filter(t => !lastSeen.has(t.toolId));
    const removed = [...lastSeen].filter(id => !currentToolIds.has(id));
    toolHub.setLastSeenToolIds(currentToolIds);

    if (added.length === 0 && removed.length === 0) {
      response.appendResponseLine('No changes since last poll.');
      if (tools.length > 0) {
        const toolNames = tools.map(t => t.originalName).join(', ');
        response.appendResponseLine(
          `${tools.length} tools available: ${toolNames}`,
        );
      }
      return;
    }

    if (added.length > 0) {
      response.appendResponseLine(`Added (${added.length}):`);
      for (const tool of added) {
        response.appendResponseLine(`+ ${tool.toolId}`);
        if (tool.description) {
          response.appendResponseLine(`  ${tool.description}`);
        }
      }
      response.appendResponseLine('');
    }

    if (removed.length > 0) {
      response.appendResponseLine(`Removed (${removed.length}):`);
      for (const id of removed) {
        response.appendResponseLine(`- ${id}`);
      }
    }
  },
});
