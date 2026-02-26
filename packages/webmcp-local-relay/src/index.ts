/**
 * Public package exports for WebMCP Local Relay.
 */

export type {
  CallToolResult,
  Tool,
  ToolAnnotations,
} from '@modelcontextprotocol/sdk/types.js';
export {
  RelayBridgeServer,
  type RelayBridgeServerOptions,
} from './bridgeServer.js';
export { type CliOptions, parseCliOptions, printHelp } from './cli-utils.js';
export { LocalRelayMcpServer, type LocalRelayMcpServerOptions } from './mcpRelayServer.js';
export {
  buildPublicToolName,
  extractSanitizedDomain,
  sanitizeName,
} from './naming.js';
export {
  CallToolRequestParamsSchema,
  CallToolResultSchema,
  DEFAULT_TOOL_INPUT_SCHEMA,
  InboundToolSchema,
  NormalizedToolSchema,
  normalizeInboundTool,
  type RelayCallToolResult,
  type RelayInvokeArgs,
  RelayInvokeArgsSchema,
  type RelayTool,
  type RelayToolAnnotations,
  ToolAnnotationsSchema,
  ToolSchema,
} from './protocol.js';
export {
  type AggregatedTool,
  HelloRequiredError,
  RelayRegistry,
  type ResolvedInvocation,
  type SourceInfo,
} from './registry.js';
export {
  type BrowserToRelayMessage,
  BrowserToRelayMessageSchema,
  type RelayClientToServerMessage,
  RelayClientToServerMessageSchema,
  type RelayServerToClientMessage,
  RelayServerToClientMessageSchema,
  type RelayToBrowserMessage,
  RelayToBrowserMessageSchema,
} from './schemas.js';
