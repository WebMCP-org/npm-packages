import type { BrowserMcpServer } from '@mcp-b/webmcp-ts-sdk';

// The SDK exports this guard from its root entry, which would bundle the MCP server into clients.
function isBrowserMcpServer(context: EventTarget): context is BrowserMcpServer {
  return '__isBrowserMcpServer' in context && context.__isBrowserMcpServer === true;
}

export function getBrowserMcpServer(): BrowserMcpServer | undefined {
  const modelContext = globalThis.document?.modelContext;
  return modelContext && isBrowserMcpServer(modelContext) ? modelContext : undefined;
}
