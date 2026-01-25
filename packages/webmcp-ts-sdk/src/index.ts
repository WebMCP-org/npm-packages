// Export our browser-optimized MCP Server as the primary export
// This replaces the standard McpServer with one that supports dynamic tool registration

// Re-export Client class from official SDK
export { Client } from '@modelcontextprotocol/sdk/client/index.js';
// Re-export Server class from official SDK (for advanced usage)
export { Server } from '@modelcontextprotocol/sdk/server/index.js';
export type { RequestOptions } from '@modelcontextprotocol/sdk/shared/protocol.js';
// Re-export protocol utilities
export { mergeCapabilities } from '@modelcontextprotocol/sdk/shared/protocol.js';
// Re-export stdio utilities for native messaging transports
export { ReadBuffer, serializeMessage } from '@modelcontextprotocol/sdk/shared/stdio.js';
// Re-export transport interfaces
export type {
  Transport,
  TransportSendOptions,
} from '@modelcontextprotocol/sdk/shared/transport.js';
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
  JSONRPCMessageSchema,
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
  ResourceListChangedNotificationSchema,
  SUPPORTED_PROTOCOL_VERSIONS,
  ToolListChangedNotificationSchema,
} from '@modelcontextprotocol/sdk/types.js';
export { BrowserMcpServer as McpServer, BrowserMcpServer } from './browser-server.js';
export { NoOpJsonSchemaValidator } from './no-op-validator.js';
