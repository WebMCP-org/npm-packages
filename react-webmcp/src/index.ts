/**
 * @mcp-b/react-webmcp
 *
 * React hooks for registering and managing Model Context Protocol (MCP) tools
 * with type-safe schemas, async state management, and built-in error handling.
 *
 * This package provides three main use cases:
 *
 * 1. **Provider hooks**: Register and expose tools to AI assistants via `window.navigator.modelContext`
 * 2. **Client hooks**: Connect to and consume tools from MCP servers
 * 3. **Capability hooks**: Handle sampling and elicitation requests from MCP servers
 *
 * @packageDocumentation
 */

/**
 * Re-export sampling and elicitation types from @mcp-b/global.
 */
export type {
  ElicitationFormParams,
  ElicitationHandler,
  ElicitationHandlerOptions,
  ElicitationParams,
  ElicitationResult,
  ElicitationUrlParams,
  SamplingHandler,
  SamplingHandlerOptions,
  SamplingRequestParams,
  SamplingResult,
} from '@mcp-b/global';
/**
 * Re-export MCP SDK types for convenience.
 * These types come from the official @modelcontextprotocol/sdk.
 */
export type {
  CallToolResult,
  Resource,
  ServerCapabilities,
  Tool,
} from '@modelcontextprotocol/sdk/types.js';
/**
 * Re-export shared types from @mcp-b packages.
 * These maintain the type hierarchy:
 * - ToolAnnotations and CallToolResult come from @modelcontextprotocol/sdk
 * - ToolDescriptor and ModelContextProtocol come from @mcp-b/global
 * - All are re-exported through our types.ts for convenience
 */
export type {
  ModelContextProtocol,
  ToolAnnotations,
  ToolDescriptor,
} from './types.js';

// ============================================
// Provider Hooks (Register/Expose Tools)
// ============================================

/**
 * Type definitions for tool registration and configuration.
 */
export type {
  ToolExecutionState,
  WebMCPConfig,
  WebMCPReturn,
} from './types.js';
/**
 * Main hook for registering MCP tools with full control over execution state,
 * validation, and lifecycle callbacks.
 */
export { useWebMCP } from './useWebMCP.js';
/**
 * Simplified hook for exposing read-only context data to AI assistants.
 * Convenience wrapper around `useWebMCP` for context tools.
 */
export { useWebMCPContext } from './useWebMCPContext.js';

// ============================================
// Capability Hooks (Sampling & Elicitation)
// ============================================

/**
 * Type definitions for elicitation handler hook.
 */
export type {
  ElicitationHandlerState,
  UseElicitationHandlerConfig,
  UseElicitationHandlerReturn,
} from './useElicitationHandler.js';
/**
 * Hook for registering an elicitation handler that processes user input requests.
 * Use this when MCP servers need to collect additional information from users.
 */
export { useElicitationHandler } from './useElicitationHandler.js';
/**
 * Type definitions for sampling handler hook.
 */
export type {
  SamplingHandlerState,
  UseSamplingHandlerConfig,
  UseSamplingHandlerReturn,
} from './useSamplingHandler.js';
/**
 * Hook for registering a sampling handler that processes LLM completion requests.
 * Use this when MCP servers need to request AI model responses.
 */
export { useSamplingHandler } from './useSamplingHandler.js';

// ============================================
// Client Hooks (Consume Tools)
// ============================================

/**
 * Type definition for McpClientProvider props.
 */
export type { McpClientProviderProps } from './client/McpClientProvider.js';
/**
 * Provider component for connecting to MCP servers and consuming their tools.
 * Manages connection state, fetches tools/resources, and handles server notifications.
 */
export { McpClientProvider, useMcpClient } from './client/McpClientProvider.js';
