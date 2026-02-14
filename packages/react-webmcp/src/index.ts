'use client';

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
 * 3. **Request hooks**: Make sampling and elicitation requests to connected MCP clients
 *
 * @packageDocumentation
 */

/**
 * Re-export sampling and elicitation types from @mcp-b/global.
 */
export type {
  CallToolResult,
  ElicitationFormParams,
  ElicitationParams,
  ElicitationResult,
  ElicitationUrlParams,
  SamplingRequestParams,
  SamplingResult,
} from '@mcp-b/global';
/**
 * Re-export MCP SDK types for convenience.
 * These types come from @mcp-b/webmcp-ts-sdk which re-exports from @modelcontextprotocol/sdk.
 */
export type { Resource, ServerCapabilities, Tool } from '@mcp-b/webmcp-ts-sdk';
/**
 * Re-export shared types from @mcp-b packages.
 * React provider hooks should consume the MCP-B extension type surface from @mcp-b/global.
 */
export type {
  ModelContextProtocol,
  PromptDescriptor,
  PromptMessage,
  ResourceContents,
  ResourceDescriptor,
  ToolAnnotations,
  ToolDescriptor,
} from './types.js';

// ============================================
// Provider Hooks (Register/Expose Tools)
// ============================================

/**
 * Type definitions for tool registration and configuration.
 *
 * - {@link WebMCPConfig} - Configuration for tool registration
 * - {@link WebMCPReturn} - Return value from useWebMCP hook
 * - {@link ToolExecutionState} - Current execution state of a tool
 * - {@link InferOutput} - Utility type for inferring output from Zod schema
 */
export type {
  InferOutput,
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
// Provider Hooks (Register/Expose Prompts)
// ============================================

/**
 * Type definitions for prompt registration and configuration.
 */
export type { WebMCPPromptConfig, WebMCPPromptReturn } from './types.js';
/**
 * Hook for registering MCP prompts with the Model Context API.
 * Prompts provide reusable message templates for AI interactions.
 */
export { useWebMCPPrompt } from './useWebMCPPrompt.js';

// ============================================
// Provider Hooks (Register/Expose Resources)
// ============================================

/**
 * Type definitions for resource registration and configuration.
 */
export type { WebMCPResourceConfig, WebMCPResourceReturn } from './types.js';
/**
 * Hook for registering MCP resources with the Model Context API.
 * Resources expose data that AI models can read.
 */
export { useWebMCPResource } from './useWebMCPResource.js';

// ============================================
// Request Hooks (Sampling & Elicitation)
// ============================================

/**
 * Type definitions for elicitation hook.
 */
export type {
  // Backwards compatibility aliases
  ElicitationHandlerState,
  ElicitationState,
  UseElicitationConfig,
  UseElicitationHandlerConfig,
  UseElicitationHandlerReturn,
  UseElicitationReturn,
} from './useElicitationHandler.js';
/**
 * Hook for requesting user input from the connected MCP client.
 * Use this when the page needs to collect information from users via the AI client.
 */
export { useElicitation, useElicitationHandler } from './useElicitationHandler.js';
/**
 * Type definitions for sampling hook.
 */
export type {
  // Backwards compatibility aliases
  SamplingHandlerState,
  SamplingState,
  UseSamplingConfig,
  UseSamplingHandlerConfig,
  UseSamplingHandlerReturn,
  UseSamplingReturn,
} from './useSamplingHandler.js';
/**
 * Hook for requesting LLM completions from the connected MCP client.
 * Use this when the page needs AI model responses.
 */
export { useSampling, useSamplingHandler } from './useSamplingHandler.js';

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
