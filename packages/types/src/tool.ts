import type {
  CallToolResult,
  ElicitationParams,
  ElicitationResult,
  InputSchema,
} from './common.js';
import type { InferArgsFromInputSchema, InferJsonSchema, JsonSchemaObject } from './json-schema.js';

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
 * Per-call execution context provided to tool handlers.
 */
export interface ToolExecutionContext {
  /**
   * Requests user input for the current tool call.
   *
   * This function is bound to the active tool call and should only be used
   * during execution of that call.
   */
  elicitInput(params: ElicitationParams): Promise<ElicitationResult>;
}

/**
 * Value that may be returned synchronously or via Promise.
 */
export type MaybePromise<T> = T | Promise<T>;

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
  execute: (args: TArgs, context: ToolExecutionContext) => MaybePromise<TResult>;
}

/**
 * Tool response shape inferred from an `outputSchema`.
 *
 * When a literal object output schema is provided, `structuredContent` is
 * narrowed to the inferred schema type. Otherwise, this resolves to the
 * base `CallToolResult`.
 *
 * @template TOutputSchema - Optional literal JSON object schema.
 */
export type ToolResultFromOutputSchema<
  TOutputSchema extends JsonSchemaObject | undefined = undefined,
> = TOutputSchema extends JsonSchemaObject
  ? CallToolResult & { structuredContent?: InferJsonSchema<TOutputSchema> }
  : CallToolResult;

/**
 * Tool descriptor whose `execute` args are inferred from a JSON Schema.
 *
 * For widened/non-literal schemas, arguments fall back to `Record<string, unknown>`.
 * When `outputSchema` is an inferable literal object schema, `structuredContent` is inferred.
 *
 * @template TInputSchema - JSON Schema for tool arguments.
 * @template TOutputSchema - Optional JSON schema for `structuredContent`.
 * @template TName - Tool name literal type.
 * @template TResult - Optional result type override constrained by inferred output schema.
 */
export type ToolDescriptorFromSchema<
  TInputSchema extends { type: string | readonly string[] },
  TOutputSchema extends JsonSchemaObject | undefined = undefined,
  TName extends string = string,
> = Omit<
  ToolDescriptor<
    InferArgsFromInputSchema<TInputSchema>,
    ToolResultFromOutputSchema<TOutputSchema>,
    TName
  >,
  'inputSchema' | 'outputSchema'
> & {
  inputSchema: TInputSchema;
} & (TOutputSchema extends JsonSchemaObject
    ? {
        outputSchema: TOutputSchema;
      }
    : {
        outputSchema?: undefined;
      });

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
