/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {Client} from '@modelcontextprotocol/sdk/client/index.js';

import {WebMCPClientTransport} from '../transports/index.js';
import {zod} from '../third_party/index.js';
import type {Page} from '../third_party/index.js';

import {ToolCategory} from './categories.js';
import {defineTool} from './ToolDefinition.js';
import type {Context} from './ToolDefinition.js';

/**
 * Module-level storage for WebMCP client and transport.
 * Only one connection is maintained at a time per page.
 */
let webMCPClient: Client | null = null;
let webMCPTransport: WebMCPClientTransport | null = null;
let connectedPageUrl: string | null = null;

/**
 * Check if WebMCP is available on a page by checking the bridge's hasWebMCP() method.
 * The bridge is auto-injected into all pages, so we just need to check if it detected WebMCP.
 */
async function checkWebMCPAvailable(page: Page): Promise<boolean> {
  try {
    // First check if the bridge is injected and can detect WebMCP
    const result = await page.evaluate(() => {
      // Check if bridge exists and can detect WebMCP
      if (
        typeof window !== 'undefined' &&
        // @ts-expect-error - bridge is injected
        typeof window.__mcpBridge?.hasWebMCP === 'function'
      ) {
        // @ts-expect-error - bridge is injected
        return window.__mcpBridge.hasWebMCP();
      }
      // Fallback: direct check
      // @ts-expect-error - modelContext is a polyfill/experimental API
      if (typeof navigator !== 'undefined' && navigator.modelContext) {
        return true;
      }
      // @ts-expect-error - internal marker
      if (window.__MCP_BRIDGE__) {
        return true;
      }
      return false;
    });
    return result;
  } catch {
    return false;
  }
}

/**
 * Auto-connect to WebMCP on the current page if available.
 * Returns true if connected (or already connected to same page), false otherwise.
 */
async function ensureWebMCPConnected(
  context: Context
): Promise<{connected: boolean; error?: string}> {
  const page = context.getSelectedPage();
  const currentUrl = page.url();

  // If already connected to the same page, we're good
  if (webMCPClient && connectedPageUrl === currentUrl) {
    return {connected: true};
  }

  // If connected to a different page, disconnect first
  if (webMCPClient && connectedPageUrl !== currentUrl) {
    try {
      await webMCPClient.close();
    } catch {
      // Ignore close errors
    }
    webMCPClient = null;
    webMCPTransport = null;
    connectedPageUrl = null;
  }

  // Check if WebMCP is available
  const hasWebMCP = await checkWebMCPAvailable(page);
  if (!hasWebMCP) {
    return {connected: false, error: 'WebMCP not detected on this page'};
  }

  // Connect
  try {
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
    connectedPageUrl = currentUrl;

    return {connected: true};
  } catch (err) {
    return {
      connected: false,
      error: `Failed to connect: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

/**
 * Connect to MCP tools registered on the current webpage via WebMCP.
 *
 * This tool explicitly connects to the page's MCP tools. Note that
 * list_webmcp_tools and call_webmcp_tool will auto-connect if needed,
 * so this tool is optional but useful for explicit connection management.
 */
export const connectWebMCP = defineTool({
  name: 'connect_webmcp',
  description:
    'Connect to MCP tools registered on the current webpage via WebMCP. ' +
    'This enables calling tools that the website has exposed through the Web Model Context API. ' +
    'Note: list_webmcp_tools and call_webmcp_tool will auto-connect if needed.',
  annotations: {
    title: 'Connect to Website MCP Tools',
    category: ToolCategory.WEBMCP,
    readOnlyHint: true,
  },
  schema: {},
  handler: async (_request, response, context) => {
    const page = context.getSelectedPage();
    const currentUrl = page.url();

    // Check if already connected to this page
    if (webMCPClient && connectedPageUrl === currentUrl) {
      response.appendResponseLine(
        'Already connected to WebMCP on this page.'
      );

      // List available tools
      try {
        const {tools} = await webMCPClient.listTools();
        response.appendResponseLine('');
        response.appendResponseLine(`${tools.length} tool(s) available:`);
        for (const tool of tools) {
          response.appendResponseLine(`  - ${tool.name}`);
        }
      } catch {
        // Ignore list errors
      }
      return;
    }

    // Force disconnect if connected to a different page
    if (webMCPClient) {
      try {
        await webMCPClient.close();
      } catch {
        // Ignore
      }
      webMCPClient = null;
      webMCPTransport = null;
      connectedPageUrl = null;
    }

    // Connect
    const result = await ensureWebMCPConnected(context);

    if (!result.connected) {
      response.appendResponseLine(result.error || 'WebMCP not detected on this page.');
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

    // List available tools
    try {
      const {tools} = await webMCPClient!.listTools();

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
        `Connected but failed to list tools: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  },
});

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
    // Auto-connect if needed
    const connectResult = await ensureWebMCPConnected(context);
    if (!connectResult.connected) {
      response.appendResponseLine(
        connectResult.error || 'No WebMCP tools available on this page.'
      );
      return;
    }

    try {
      const {tools} = await webMCPClient!.listTools();

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
    // Auto-connect if needed
    const connectResult = await ensureWebMCPConnected(context);
    if (!connectResult.connected) {
      response.appendResponseLine(
        connectResult.error || 'No WebMCP tools available on this page.'
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

      const result = await webMCPClient!.callTool({
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
      connectedPageUrl = null;
      response.appendResponseLine('Disconnected from WebMCP.');
    } catch (err) {
      response.appendResponseLine(
        `Error disconnecting: ${err instanceof Error ? err.message : String(err)}`
      );
      // Clear anyway
      webMCPClient = null;
      webMCPTransport = null;
      connectedPageUrl = null;
    }
  },
});
