'use client';

/**
 * usewebmcp
 *
 * Standalone React hooks for the Web Model Context Protocol.
 * Registers tools with `navigator.modelContext` directly.
 *
 * @packageDocumentation
 */

// ============================================
// Types
// ============================================

export type {
  CallToolResult,
  InferOutput,
  InputSchema,
  ToolAnnotations,
  ToolExecutionState,
  WebMCPConfig,
  WebMCPReturn,
} from './types.js';

// ============================================
// Hooks
// ============================================

export { useWebMCP } from './useWebMCP.js';
