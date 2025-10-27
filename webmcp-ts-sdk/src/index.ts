// Export our browser-optimized MCP Server as the primary export
// This replaces the standard McpServer with one that supports dynamic tool registration

// Re-export Server class from official SDK (for advanced usage)
export { Server } from '@modelcontextprotocol/sdk/server/index.js';
// Re-export protocol utilities
export { mergeCapabilities } from '@modelcontextprotocol/sdk/shared/protocol.js';
// Re-export transport interfaces
export type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';

// Re-export all commonly used types from official SDK
export type {
  CallToolRequest,
  CallToolResult,
  ClientCapabilities,
  ClientNotification,
  ClientRequest,
  ClientResult,
  CreateMessageRequest,
  CreateMessageResult,
  ElicitRequest,
  ElicitResult,
  GetPromptRequest,
  GetPromptResult,
  Implementation,
  InitializeRequest,
  InitializeResult,
  JSONRPCMessage,
  ListPromptsRequest,
  ListPromptsResult,
  ListResourcesRequest,
  ListResourcesResult,
  ListToolsRequest,
  ListToolsResult,
  LoggingLevel,
  LoggingMessageNotification,
  McpError,
  Notification,
  Prompt,
  PromptMessage,
  ReadResourceRequest,
  ReadResourceResult,
  Request,
  Resource,
  ResourceContents,
  ResourceTemplate,
  Result,
  ServerCapabilities,
  ServerNotification,
  ServerRequest,
  ServerResult,
  Tool,
  ToolAnnotations,
} from '@modelcontextprotocol/sdk/types.js';

// Re-export schemas for request/response validation
export {
  CallToolRequestSchema,
  CallToolResultSchema,
  CreateMessageRequestSchema,
  CreateMessageResultSchema,
  ElicitRequestSchema,
  ElicitResultSchema,
  ErrorCode,
  GetPromptRequestSchema,
  GetPromptResultSchema,
  InitializeRequestSchema,
  InitializeResultSchema,
  LATEST_PROTOCOL_VERSION,
  ListPromptsRequestSchema,
  ListPromptsResultSchema,
  ListResourcesRequestSchema,
  ListResourcesResultSchema,
  ListToolsRequestSchema,
  ListToolsResultSchema,
  LoggingLevelSchema,
  ReadResourceRequestSchema,
  ReadResourceResultSchema,
  SUPPORTED_PROTOCOL_VERSIONS,
} from '@modelcontextprotocol/sdk/types.js';
export { BrowserMcpServer as McpServer, BrowserMcpServer } from './browser-server.js';
