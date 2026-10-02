import { isBrowserMcpServer, type BrowserMcpServer } from '@mcp-b/webmcp-ts-sdk';

export function requireBrowserMcpServer(): BrowserMcpServer {
  const modelContext = document.modelContext;
  if (!isBrowserMcpServer(modelContext)) {
    throw new Error('The global runtime did not install the MCP-B BrowserMcpServer');
  }
  return modelContext;
}
