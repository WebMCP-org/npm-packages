/**
 * Showcase types — thin re-exports from @mcp-b/webmcp-types with aliases
 * that preserve the import names used throughout the app.
 */

export type {
  InputSchema as ToolInputSchema,
  ModelContextTestingToolInfo as ToolInfo,
  ModelContextToolRegistrationHandle as ToolRegistration,
} from '@mcp-b/webmcp-types';

export type { CallToolResult } from '@mcp-b/webmcp-types';

import type {
  ModelContextCore,
  ModelContextExtensions,
  ModelContextRegisterToolOptions,
  ModelContextTesting as PackageModelContextTesting,
  ModelContextTestingPolyfillExtensions,
  ModelContextToolRegistrationHandle,
  ToolDescriptor,
} from '@mcp-b/webmcp-types';

/**
 * Tool descriptor alias.
 *
 * The package `ToolDescriptor` is generic-typed; the showcase only needs the
 * default (unparameterised) shape.
 */
export type Tool = ToolDescriptor;

/**
 * The showcase patches the native `ModelContext` with legacy compatibility
 * helpers via `installLegacyContextCompat` — most notably, a wrapped
 * `registerTool` that returns a registration handle for the showcase. The
 * patched surface also adds `listTools()` from the testing API and normalizes
 * toolchange listener methods when the native preview does not expose them on
 * `modelContext`.
 *
 * This type captures the full patched surface the showcase code relies on.
 */
export type ModelContext = ModelContextCore & {
  registerTool(
    tool: Tool,
    options?: ModelContextRegisterToolOptions
  ): ModelContextToolRegistrationHandle;
  unregisterTool: ModelContextExtensions['unregisterTool'];
  listTools: ModelContextExtensions['listTools'];
  addEventListener(
    type: 'toolchange' | 'toolschange',
    listener: EventListenerOrEventListenerObject,
    options?: boolean | AddEventListenerOptions
  ): void;
  removeEventListener(
    type: 'toolchange' | 'toolschange',
    listener: EventListenerOrEventListenerObject,
    options?: boolean | EventListenerOptions
  ): void;
};

/**
 * The showcase uses the polyfill's extended testing API surface
 * (getToolCalls, clearToolCalls, setMockToolResponse, reset, etc.)
 * in addition to the base ModelContextTesting methods.
 */
export type ModelContextTesting = PackageModelContextTesting &
  ModelContextTestingPolyfillExtensions;

// ============================================================================
// App-specific types (not in packages)
// ============================================================================

export interface DetectionResult {
  available: boolean;
  isNative: boolean;
  isPolyfill: boolean;
  testingAvailable: boolean;
  message: string;
}
