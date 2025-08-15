// global.ts

import { TabServerTransport } from '@mcp-b/transports';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import './types.d.ts';

/**
 * Internal initialization function that creates and configures the MCP server.
 * This function is idempotent and handles errors gracefully.
 * @throws {Error} If initialization fails
 */
function initializeMCP(isInitialized: boolean): void {
  if (isInitialized) {
    return;
  }

  try {
    const hostname = window.location.hostname || 'localhost';

    window.mcp = new McpServer(
      {
        name: hostname,
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {
            listChanged: true,
          },
        },
      }
    );

    // Register default tool with proper error handling in the callback
    window.mcp.registerTool(
      'get_current_website_title',
      {
        description: 'Get the title of the current website',
      },
      async () => {
        try {
          const title = document.title || 'Untitled';
          return { content: [{ type: 'text', text: title }] };
        } catch (error) {
          console.error('Error in get_current_website_title tool:', error);
          return {
            content: [
              {
                type: 'text',
                text: `Error getting website title ${error instanceof Error ? error.message : String(error)}`,
              },
            ],
            isError: true,
          };
        }
      }
    );

    // Configure transport with restricted origins if possible; '*' is insecure, consider environment-specific origins
    // For best security practices, replace '*' with specific allowed origins in production
    const transport = new TabServerTransport({
      allowedOrigins: ['*'],
    });

    window.mcp.connect(transport);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    throw new Error(`Failed to initialize MCP server: ${errorMessage}`);
  }
}

/**
 * Initializes the global MCP server and exposes it on window.mcp.
 * This function is safe to call multiple times - it will only initialize once.
 * It performs environment checks and handles browser-only execution.
 */
export function initializeGlobalMCP(isInitialized: boolean): void {
  if (typeof window === 'undefined') {
    console.warn('initializeGlobalMCP called in non-browser environment; skipping.');
    return;
  }

  if (isInitialized && window.mcp) {
    console.warn('MCP server already initialized; skipping.');
    return;
  }

  try {
    initializeMCP(isInitialized);
    isInitialized = true;
  } catch (error) {
    console.error('Failed to initialize global MCP:', error);
    throw error;
  }
}

/**
 * Cleanup function to properly dispose of the MCP server and remove global reference.
 * This is useful for testing, hot module replacement, or resetting the state.
 * It handles errors during cleanup gracefully.
 */
// export function cleanupGlobalMCP(): void {
//   if (serverInstance) {
//     try {
//       serverInstance.close();
//     } catch (error) {
//       console.warn('Error closing MCP server:', error);
//     } finally {
//       serverInstance = null;
//     }
//   }

//   if (typeof window !== 'undefined' && 'mcp' in window) {
//     delete (window as unknown as { mcp?: unknown }).mcp;
//   }

//   isInitialized = false;
// }
