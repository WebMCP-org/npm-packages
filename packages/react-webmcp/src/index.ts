'use client';

/**
 * React hooks for exposing WebMCP tools, prompts, and resources, plus an MCP client provider.
 * @packageDocumentation
 */

export type {
  InferOutput,
  InferToolInput,
  ToolExecutionState,
  WebMCPConfig,
  WebMCPReturn,
} from 'usewebmcp';
export { useWebMCP } from 'usewebmcp';

export type { ToolInputSchema } from '@mcp-b/webmcp-polyfill/schema';
export type { McpClientProviderProps } from './client/McpClientProvider.js';
export { McpClientProvider, useMcpClient } from './client/McpClientProvider.js';
export type {
  WebMCPPromptConfig,
  WebMCPPromptReturn,
  WebMCPResourceConfig,
  WebMCPResourceReturn,
} from './types.js';
export { useWebMCPContext } from './useWebMCPContext.js';
export { useWebMCPPrompt } from './useWebMCPPrompt.js';
export { useWebMCPResource } from './useWebMCPResource.js';
