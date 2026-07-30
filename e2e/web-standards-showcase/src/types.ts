/**
 * Showcase types — thin re-exports from @mcp-b/webmcp-types with aliases
 * that preserve the import names used throughout the app.
 */

export type { RegisteredTool as ToolInfo } from '@mcp-b/webmcp-types';

import type { ChromeModelContext, ModelContextTool } from '@mcp-b/webmcp-types';

export interface ToolRegistration {
  unregister(): void;
}

/**
 * Strict WebMCP tool descriptor used by the native showcase.
 */
export type Tool = ModelContextTool;

/**
 * Strict native context plus Chromium's feature-detectable execution
 * extension.
 */
export type ModelContext = ChromeModelContext;

// ============================================================================
// App-specific types (not in packages)
// ============================================================================

export interface DetectionResult {
  available: boolean;
  isNative: boolean;
  isPolyfill: boolean;
  message: string;
}
