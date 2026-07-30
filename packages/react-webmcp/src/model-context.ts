import { SERVER_MARKER_PROPERTY, type BrowserMcpServer } from '@mcp-b/webmcp-ts-sdk';
import type { ModelContext } from '@mcp-b/webmcp-types';

function isBrowserMcpServer(modelContext: ModelContext): modelContext is BrowserMcpServer {
  return SERVER_MARKER_PROPERTY in modelContext && modelContext[SERVER_MARKER_PROPERTY] === true;
}

export function getBrowserMcpServer(): BrowserMcpServer | undefined {
  if (typeof document === 'undefined' || typeof navigator === 'undefined') {
    return undefined;
  }

  const modelContext = document.modelContext ?? navigator.modelContext;
  return modelContext && isBrowserMcpServer(modelContext) ? modelContext : undefined;
}
