import { isBrowserMcpServer, type BrowserMcpServer } from '@mcp-b/webmcp-ts-sdk';

export function getBrowserMcpServer(): BrowserMcpServer | undefined {
  const modelContext = globalThis.document?.modelContext;
  return modelContext && isBrowserMcpServer(modelContext) ? modelContext : undefined;
}
