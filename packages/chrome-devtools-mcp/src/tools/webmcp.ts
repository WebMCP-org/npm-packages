/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {zod} from '../third_party/index.js';

import {ToolCategory} from './categories.js';
import {defineTool} from './ToolDefinition.js';

/**
 * List all MCP tools available on the current webpage.
 * Auto-connects to WebMCP if not already connected.
 */
export const listWebMCPTools = defineTool({
  name: 'list_webmcp_tools',
  description:
    'List all MCP tools available on the current webpage. ' +
    'Automatically connects to WebMCP if the page has @mcp-b/global loaded.',
  annotations: {
    title: 'List Website MCP Tools',
    category: ToolCategory.WEBMCP,
    readOnlyHint: true,
  },
  schema: {},
  handler: async (_request, response, context) => {
    // Get client from context (handles auto-connect and stale connection detection)
    const result = await context.getWebMCPClient();
    if (!result.connected) {
      response.appendResponseLine(
        result.error || 'No WebMCP tools available on this page.',
      );
      return;
    }

    const client = result.client;

    try {
      const {tools} = await client.listTools();

      response.appendResponseLine(`${tools.length} tool(s) available:`);
      response.appendResponseLine('');

      for (const tool of tools) {
        response.appendResponseLine(`- ${tool.name}`);
        if (tool.description) {
          response.appendResponseLine(`  Description: ${tool.description}`);
        }
        if (tool.inputSchema) {
          const schemaStr = JSON.stringify(tool.inputSchema, null, 2);
          // Only show schema if it's not too long
          if (schemaStr.length < 500) {
            response.appendResponseLine(`  Input Schema: ${schemaStr}`);
          } else {
            response.appendResponseLine(
              `  Input Schema: (complex schema, ${schemaStr.length} chars)`,
            );
          }
        }
        response.appendResponseLine('');
      }
    } catch (err) {
      response.appendResponseLine(
        `Failed to list tools: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  },
});

/**
 * Call a tool registered on the webpage via WebMCP.
 * Auto-connects to WebMCP if not already connected.
 */
export const callWebMCPTool = defineTool({
  name: 'call_webmcp_tool',
  description:
    'Call a tool registered on the webpage via WebMCP. ' +
    'Automatically connects if the page has @mcp-b/global loaded. ' +
    'Use list_webmcp_tools to see available tools and their schemas.',
  annotations: {
    title: 'Call Website MCP Tool',
    category: ToolCategory.WEBMCP,
    readOnlyHint: false, // Tools may have side effects
  },
  schema: {
    name: zod.string().describe('The name of the tool to call'),
    arguments: zod
      .record(zod.any())
      .optional()
      .describe('Arguments to pass to the tool as a JSON object'),
  },
  handler: async (request, response, context) => {
    // Get client from context (handles auto-connect and stale connection detection)
    const result = await context.getWebMCPClient();
    if (!result.connected) {
      response.appendResponseLine(
        result.error || 'No WebMCP tools available on this page.',
      );
      return;
    }

    const client = result.client;
    const {name, arguments: args} = request.params;

    try {
      response.appendResponseLine(`Calling tool: ${name}`);
      if (args && Object.keys(args).length > 0) {
        response.appendResponseLine(`Arguments: ${JSON.stringify(args)}`);
      }
      response.appendResponseLine('');

      const callResult = await client.callTool({
        name,
        arguments: args || {},
      });

      response.appendResponseLine('Result:');

      // Format the result content
      if (callResult.content && Array.isArray(callResult.content)) {
        for (const content of callResult.content) {
          if (content.type === 'text') {
            response.appendResponseLine(content.text);
          } else if (content.type === 'image') {
            response.appendResponseLine(
              `[Image: ${content.mimeType}, ${content.data.length} bytes]`,
            );
          } else if (content.type === 'resource') {
            response.appendResponseLine(
              `[Resource: ${JSON.stringify(content.resource)}]`,
            );
          } else {
            response.appendResponseLine(JSON.stringify(content, null, 2));
          }
        }
      } else {
        response.appendResponseLine(JSON.stringify(callResult, null, 2));
      }

      if (callResult.isError) {
        response.appendResponseLine('');
        response.appendResponseLine('(Tool returned an error)');
      }
    } catch (err) {
      response.appendResponseLine(
        `Failed to call tool: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  },
});
