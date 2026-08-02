import { isBrowserMcpServer, type BrowserMcpServer } from '@mcp-b/webmcp-ts-sdk';

export function getBrowserMcpServer(): BrowserMcpServer | undefined {
  if (typeof document === 'undefined' || typeof navigator === 'undefined') {
    return undefined;
  }

  const modelContext = document.modelContext ?? navigator.modelContext;
  return modelContext && isBrowserMcpServer(modelContext) ? modelContext : undefined;
}
