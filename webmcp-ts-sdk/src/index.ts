/**
 * @mcp-b/webmcp-ts-sdk
 *
 * Browser-optimized MCP TypeScript SDK for WebMCP.
 *
 * This package provides a stripped-down version of the MCP SDK optimized for browser environments.
 * It excludes:
 * - OAuth/authentication modules (not needed for browser-to-browser communication)
 * - Node.js-specific transports (stdio, SSE server, streamable HTTP server)
 * - Server-side middleware and routers
 *
 * For browser-specific transports (postMessage, Chrome extension messaging, etc.),
 * use @mcp-b/transports alongside this package.
 */

// ============================================================================
// BROWSER-OPTIMIZED MCP SERVER
// ============================================================================

export { BrowserMcpServer, BrowserMcpServer as McpServer } from './browser-server.js';

// ============================================================================
// CORE CLIENT & SERVER CLASSES
// ============================================================================

export type { ClientOptions } from '@modelcontextprotocol/sdk/client/index.js';
// Client class for connecting to MCP servers
export { Client } from '@modelcontextprotocol/sdk/client/index.js';
export type { ServerOptions } from '@modelcontextprotocol/sdk/server/index.js';
// Server classes for creating MCP servers
export { Server } from '@modelcontextprotocol/sdk/server/index.js';

// McpServer (high-level server API) - also re-export base for advanced usage
export { McpServer as BaseMcpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

// ============================================================================
// PROTOCOL & TRANSPORT
// ============================================================================

// In-memory transport (useful for testing and in-process communication)
export { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
export type {
  ProtocolOptions,
  RequestOptions,
} from '@modelcontextprotocol/sdk/shared/protocol.js';
// Protocol base class and utilities
export {
  mergeCapabilities,
  Protocol,
} from '@modelcontextprotocol/sdk/shared/protocol.js';
// Transport interface (for custom transports)
export type {
  Transport,
  TransportSendOptions,
} from '@modelcontextprotocol/sdk/shared/transport.js';

// ============================================================================
// PROTOCOL CONSTANTS & ERROR CODES
// ============================================================================

export {
  ErrorCode,
  JSONRPC_VERSION,
  LATEST_PROTOCOL_VERSION,
  SUPPORTED_PROTOCOL_VERSIONS,
} from '@modelcontextprotocol/sdk/types.js';

// ============================================================================
// TYPE EXPORTS - Core MCP Types
// ============================================================================

export type {
  AudioContent,
  BlobResourceContents,
  CallToolRequest,
  CallToolResult,
  // Cancelled notification
  CancelledNotification,
  // Capabilities
  ClientCapabilities,
  // Client request/notification/result types
  ClientNotification,
  ClientRequest,
  ClientResult,
  // Completion types (for autocompletion)
  CompleteRequest,
  CompleteResult,
  // Sampling types (for LLM sampling requests)
  CreateMessageRequest,
  CreateMessageResult,
  // Pagination types
  Cursor,
  // Elicitation types (for user input requests)
  ElicitRequest,
  ElicitResult,
  EmbeddedResource,
  GetPromptRequest,
  GetPromptResult,
  ImageContent,
  // Base protocol types
  Implementation,
  InitializedNotification,
  // Initialization
  InitializeRequest,
  InitializeResult,
  // JSON-RPC types
  JSONRPCError,
  JSONRPCMessage,
  JSONRPCNotification,
  JSONRPCRequest,
  JSONRPCResponse,
  ListPromptsRequest,
  ListPromptsResult,
  ListResourcesRequest,
  ListResourcesResult,
  ListResourceTemplatesRequest,
  ListResourceTemplatesResult,
  ListRootsRequest,
  ListRootsResult,
  ListToolsRequest,
  ListToolsResult,
  // Logging types
  LoggingLevel,
  LoggingMessageNotification,
  // Error class
  McpError,
  // Extra info passed with messages
  MessageExtraInfo,
  Notification,
  PaginatedRequest,
  PaginatedResult,
  // Progress types
  Progress,
  ProgressNotification,
  ProgressToken,
  // Prompt types
  Prompt,
  PromptArgument,
  PromptListChangedNotification,
  PromptMessage,
  ReadResourceRequest,
  ReadResourceResult,
  Request,
  RequestId,
  RequestInfo,
  // Resource types
  Resource,
  ResourceContents,
  ResourceLink,
  ResourceListChangedNotification,
  ResourceTemplate,
  ResourceUpdatedNotification,
  Result,
  // Root types
  Root,
  RootsListChangedNotification,
  SamplingMessage,
  ServerCapabilities,
  // Server request/notification/result types
  ServerNotification,
  ServerRequest,
  ServerResult,
  SubscribeRequest,
  // Content types
  TextContent,
  TextResourceContents,
  // Tool types
  Tool,
  ToolAnnotations,
  UnsubscribeRequest,
} from '@modelcontextprotocol/sdk/types.js';

// ============================================================================
// SCHEMA EXPORTS - Zod Schemas for Validation
// ============================================================================

export {
  AudioContentSchema,
  BlobResourceContentsSchema,
  CallToolRequestSchema,
  CallToolResultSchema,
  // Cancelled notification schema
  CancelledNotificationSchema,
  // Capability schemas
  ClientCapabilitiesSchema,
  // Client/Server message schemas
  ClientNotificationSchema,
  ClientRequestSchema,
  ClientResultSchema,
  CompatibilityCallToolResultSchema,
  // Completion schemas
  CompleteRequestSchema,
  CompleteResultSchema,
  ContentBlockSchema,
  // Sampling schemas
  CreateMessageRequestSchema,
  CreateMessageResultSchema,
  // Pagination schemas
  CursorSchema,
  // Elicitation schemas
  ElicitRequestSchema,
  ElicitResultSchema,
  EmbeddedResourceSchema,
  EmptyResultSchema,
  GetPromptRequestSchema,
  GetPromptResultSchema,
  ImageContentSchema,
  ImplementationSchema,
  InitializedNotificationSchema,
  // Initialization schemas
  InitializeRequestSchema,
  InitializeResultSchema,
  isInitializedNotification,
  isInitializeRequest,
  // Type guards
  isJSONRPCError,
  isJSONRPCNotification,
  isJSONRPCRequest,
  isJSONRPCResponse,
  // JSON-RPC schemas
  JSONRPCErrorSchema,
  JSONRPCMessageSchema,
  JSONRPCNotificationSchema,
  JSONRPCRequestSchema,
  JSONRPCResponseSchema,
  ListPromptsRequestSchema,
  ListPromptsResultSchema,
  ListResourcesRequestSchema,
  ListResourcesResultSchema,
  ListResourceTemplatesRequestSchema,
  ListResourceTemplatesResultSchema,
  ListRootsRequestSchema,
  ListRootsResultSchema,
  ListToolsRequestSchema,
  ListToolsResultSchema,
  // Logging schemas
  LoggingLevelSchema,
  LoggingMessageNotificationSchema,
  ModelHintSchema,
  ModelPreferencesSchema,
  NotificationSchema,
  PaginatedRequestSchema,
  PaginatedResultSchema,
  // Ping schema
  PingRequestSchema,
  ProgressNotificationSchema,
  // Progress schemas
  ProgressSchema,
  ProgressTokenSchema,
  PromptArgumentSchema,
  PromptListChangedNotificationSchema,
  PromptMessageSchema,
  // Prompt schemas
  PromptSchema,
  ReadResourceRequestSchema,
  ReadResourceResultSchema,
  RequestIdSchema,
  // Base schemas
  RequestSchema,
  ResourceContentsSchema,
  ResourceLinkSchema,
  ResourceListChangedNotificationSchema,
  // Resource schemas
  ResourceSchema,
  ResourceTemplateSchema,
  ResourceUpdatedNotificationSchema,
  ResultSchema,
  // Root schemas
  RootSchema,
  RootsListChangedNotificationSchema,
  SamplingMessageSchema,
  ServerCapabilitiesSchema,
  ServerNotificationSchema,
  ServerRequestSchema,
  ServerResultSchema,
  SetLevelRequestSchema,
  SubscribeRequestSchema,
  // Content schemas
  TextContentSchema,
  TextResourceContentsSchema,
  ToolAnnotationsSchema,
  ToolListChangedNotificationSchema,
  // Tool schemas
  ToolSchema,
  UnsubscribeRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
