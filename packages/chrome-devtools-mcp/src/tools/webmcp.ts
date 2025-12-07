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

  // Check if we have a valid, active connection to the same page
  // We must verify:
  // 1. isClosed() - to detect page reloads where URL stays the same but frames are invalidated
  // 2. getPage() === page - to detect browser close/reopen where the page object is different
  //    even if URL is the same
  const hasValidConnection =
    webMCPClient &&
    webMCPTransport &&
    !webMCPTransport.isClosed() &&
    webMCPTransport.getPage() === page &&
    connectedPageUrl === currentUrl;

  if (hasValidConnection) {
    return {connected: true};
  }

  // If we have a stale connection (closed transport or different page), clean up first
  if (webMCPClient) {
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

    // Set up onclose handler to clean up module-level state
    // This handles page navigations, reloads, and manual disconnections
    transport.onclose = () => {
      if (webMCPClient === client) {
        webMCPClient = null;
        webMCPTransport = null;
        connectedPageUrl = null;
      }
    };

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
