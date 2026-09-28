import type { WebMCP } from 'webmcp-types';

export type ToolInfo = WebMCP.RegisteredTool;

export interface ToolRegistration {
  unregister(): void;
}

/**
 * Strict WebMCP tool descriptor used by the native showcase.
 */
export type Tool = WebMCP.ModelContextTool;

/** Current native WebMCP context, including object-input execution. */
export type ModelContext = NonNullable<Document['modelContext']>;

// ============================================================================
// App-specific types (not in packages)
// ============================================================================

export type DetectionResult =
  | { isNative: true; message: string; context: ModelContext }
  | { isNative: false; message: string };

declare global {
  interface Window {
    __WEBMCP_SHOWCASE_RAW_SURFACE__?: Record<string, boolean>;
  }
}
