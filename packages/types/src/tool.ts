import type { CallToolResult, InputSchema } from './common.js';

// ============================================================================
// Tool Annotations
// ============================================================================

/**
 * Annotations providing hints about tool behavior.
 *
 * @see {@link https://spec.modelcontextprotocol.io/specification/server/tools/}
 */
export interface ToolAnnotations {
  /**
   * Optional display title.
   */
  title?: string;

  /**
   * Indicates the tool is read-only.
   */
  readOnlyHint?: boolean;

  /**
   * Indicates the tool may perform destructive actions.
   */
  destructiveHint?: boolean;

  /**
   * Indicates the tool can be called repeatedly without changing outcome.
   */
  idempotentHint?: boolean;

  /**
   * Indicates the tool may reach beyond local context (network, external systems, etc.).
   */
  openWorldHint?: boolean;
}

// ============================================================================
// Tool Descriptor
// ============================================================================

/**
 * Tool descriptor for the Web Model Context API.
 *
 * Tools are functions that AI models can call to perform actions or retrieve
 * information. This interface uses JSON Schema for input validation.
 *
 * @template TArgs - Tool input arguments.
 * @template TResult - Tool execution result shape.
 * @template TName - Tool name literal type.
 *
 * @see {@link https://spec.modelcontextprotocol.io/specification/server/tools/}
 */
export interface ToolDescriptor<
  TArgs extends Record<string, unknown> = Record<string, unknown>,
  TResult extends CallToolResult = CallToolResult,
  TName extends string = string,
> {
  /**
   * Unique tool identifier.
   */
  name: TName;

  /**
   * Human-readable summary of what the tool does.
   */
  description: string;

  /**
   * JSON Schema describing accepted input arguments.
   */
  inputSchema: InputSchema;

  /**
   * Optional JSON Schema describing output payload shape.
   */
  outputSchema?: InputSchema;

  /**
   * Optional behavior hints for LLM planners.
   */
  annotations?: ToolAnnotations;

  /**
   * Tool execution function.
   */
  execute: (args: TArgs) => Promise<TResult>;
}

// ============================================================================
// Tool List Item
// ============================================================================

/**
 * Tool information returned by listTools().
 * Provides metadata about a registered tool without exposing the execute function.
 *
 * @template TName - Tool name literal type.
 */
export interface ToolListItem<TName extends string = string> {
  /**
   * Unique tool identifier.
   */
  name: TName;

  /**
   * Human-readable summary of what the tool does.
   */
  description: string;

  /**
   * JSON Schema describing accepted input arguments.
   */
  inputSchema: InputSchema;

  /**
   * Optional JSON Schema describing output payload shape.
   */
  outputSchema?: InputSchema;

  /**
   * Optional behavior hints for LLM planners.
   */
  annotations?: ToolAnnotations;
}
