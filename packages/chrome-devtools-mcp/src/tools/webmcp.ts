/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {Client} from '@modelcontextprotocol/sdk/client/index.js';

import {
  WebMCPClientTransport,
  CHECK_WEBMCP_AVAILABLE_SCRIPT,
} from '../transports/index.js';
import {zod} from '../third_party/index.js';

import {ToolCategory} from './categories.js';
import {defineTool} from './ToolDefinition.js';

/**
 * Module-level storage for WebMCP client and transport.
 * Only one connection is maintained at a time per page.
 */
let webMCPClient: Client | null = null;
let webMCPTransport: WebMCPClientTransport | null = null;

/**
 * Connect to MCP tools registered on the current webpage via WebMCP.
 *
 * This tool injects a bridge into the page that connects to the page's
 * TabServerTransport, enabling access to tools registered with @mcp-b/global.
 */
export const connectWebMCP = defineTool({
  name: 'connect_webmcp',
  description:
    'Connect to MCP tools registered on the current webpage via WebMCP. ' +
    'This enables calling tools that the website has exposed through the Web Model Context API. ' +
    'The page must have @mcp-b/global loaded.',
  annotations: {
    title: 'Connect to Website MCP Tools',
    category: ToolCategory.WEBMCP,
    readOnlyHint: true,
  },
  schema: {},
  handler: async (_request, response, context) => {
    const page = context.getSelectedPage();

    // Check if already connected
    if (webMCPClient) {
      response.appendResponseLine(
        'Already connected to WebMCP. Use disconnect_webmcp first to reconnect.'
      );
      return;
    }

    // Check if WebMCP is available on the page
    let hasWebMCP = false;
    try {
      const result = (await page.evaluate(CHECK_WEBMCP_AVAILABLE_SCRIPT)) as {
        available: boolean;
        type?: string;
      };
      hasWebMCP = result.available;
    } catch {
      hasWebMCP = false;
    }

    if (!hasWebMCP) {
      response.appendResponseLine('WebMCP not detected on this page.');
      response.appendResponseLine('');
      response.appendResponseLine(
        'To use website tools, the page needs @mcp-b/global loaded.'
      );
      response.appendResponseLine('Add to your page:');
      response.appendResponseLine(
        '  <script type="module" src="https://unpkg.com/@mcp-b/global"></script>'
      );
      return;
    }

    try {
      // Create transport and client
      const transport = new WebMCPClientTransport({
        page,
        readyTimeout: 10000,
        requireWebMCP: false, // We already checked
      });

      const client = new Client(
        {name: 'chrome-devtools-mcp', version: '1.0.0'},
        {capabilities: {}}
      );

      await client.connect(transport);

      // Store for later use
      webMCPTransport = transport;
      webMCPClient = client;

      // List available tools
      const {tools} = await client.listTools();

      response.appendResponseLine('Connected to WebMCP server');
      response.appendResponseLine('');
      response.appendResponseLine(`Found ${tools.length} tool(s):`);

      if (tools.length === 0) {
        response.appendResponseLine('  (no tools registered yet)');
      } else {
        for (const tool of tools) {
          response.appendResponseLine(`  - ${tool.name}`);
          if (tool.description) {
            response.appendResponseLine(`    ${tool.description}`);
          }
        }
      }
    } catch (err) {
      response.appendResponseLine(
        `Failed to connect: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  },
});

/**
 * List all MCP tools available on the connected webpage.
 */
export const listWebMCPTools = defineTool({
  name: 'list_webmcp_tools',
  description:
    'List all MCP tools available on the connected webpage. ' +
    'Run connect_webmcp first to establish a connection.',
  annotations: {
    title: 'List Website MCP Tools',
    category: ToolCategory.WEBMCP,
    readOnlyHint: true,
  },
  schema: {},
  handler: async (_request, response, _context) => {
    if (!webMCPClient) {
      response.appendResponseLine(
        'Not connected to WebMCP. Run connect_webmcp first.'
      );
      return;
    }

    try {
      const {tools} = await webMCPClient.listTools();

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
              `  Input Schema: (complex schema, ${schemaStr.length} chars)`
            );
          }
        }
        response.appendResponseLine('');
      }
    } catch (err) {
      response.appendResponseLine(
        `Failed to list tools: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  },
});

/**
 * Call a tool registered on the webpage via WebMCP.
 */
export const callWebMCPTool = defineTool({
  name: 'call_webmcp_tool',
  description:
    'Call a tool registered on the webpage via WebMCP. ' +
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
  handler: async (request, response, _context) => {
    if (!webMCPClient) {
      response.appendResponseLine(
        'Not connected to WebMCP. Run connect_webmcp first.'
      );
      return;
    }

    const {name, arguments: args} = request.params;

    try {
      response.appendResponseLine(`Calling tool: ${name}`);
      if (args && Object.keys(args).length > 0) {
        response.appendResponseLine(`Arguments: ${JSON.stringify(args)}`);
      }
      response.appendResponseLine('');

      const result = await webMCPClient.callTool({
        name,
        arguments: args || {},
      });

      response.appendResponseLine('Result:');

      // Format the result content
      if (result.content && Array.isArray(result.content)) {
        for (const content of result.content) {
          if (content.type === 'text') {
            response.appendResponseLine(content.text);
          } else if (content.type === 'image') {
            response.appendResponseLine(
              `[Image: ${content.mimeType}, ${content.data.length} bytes]`
            );
          } else if (content.type === 'resource') {
            response.appendResponseLine(
              `[Resource: ${JSON.stringify(content.resource)}]`
            );
          } else {
            response.appendResponseLine(JSON.stringify(content, null, 2));
          }
        }
      } else {
        response.appendResponseLine(JSON.stringify(result, null, 2));
      }

      if (result.isError) {
        response.appendResponseLine('');
        response.appendResponseLine('(Tool returned an error)');
      }
    } catch (err) {
      response.appendResponseLine(
        `Failed to call tool: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  },
});

/**
 * Disconnect from the WebMCP server on the current page.
 */
export const disconnectWebMCP = defineTool({
  name: 'disconnect_webmcp',
  description: 'Disconnect from the WebMCP server on the current page.',
  annotations: {
    title: 'Disconnect from Website MCP',
    category: ToolCategory.WEBMCP,
    readOnlyHint: true,
  },
  schema: {},
  handler: async (_request, response, _context) => {
    if (!webMCPClient) {
      response.appendResponseLine('Not connected to WebMCP.');
      return;
    }

    try {
      await webMCPClient.close();
      webMCPClient = null;
      webMCPTransport = null;
      response.appendResponseLine('Disconnected from WebMCP.');
    } catch (err) {
      response.appendResponseLine(
        `Error disconnecting: ${err instanceof Error ? err.message : String(err)}`
      );
      // Clear anyway
      webMCPClient = null;
      webMCPTransport = null;
    }
  },
});
