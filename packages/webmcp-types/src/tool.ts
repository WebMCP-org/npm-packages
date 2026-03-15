import type {
  CallToolResult,
  ElicitationParams,
  ElicitationResult,
  InputSchema,
} from './common.js';
import type {
  InferArgsFromInputSchema,
  InferJsonSchema,
  JsonSchemaForInference,
  JsonSchemaObject,
} from './json-schema.js';

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
  readOnlyHint?: boolean | 'true' | 'false';

  /**
   * Indicates the tool may perform destructive actions.
   */
  destructiveHint?: boolean | 'true' | 'false';

  /**
   * Indicates the tool can be called repeatedly without changing outcome.
   */
  idempotentHint?: boolean | 'true' | 'false';

  /**
   * Indicates the tool may reach beyond local context (network, external systems, etc.).
   */
  openWorldHint?: boolean | 'true' | 'false';
}

/**
 * Raw tool result values accepted by execute handlers before runtime normalization.
 */
export type ToolRawResult = unknown;

/**
 * Tool execute return value accepted by WebMCP descriptor types.
 */
export type ToolExecuteResult<TResult = ToolRawResult> = TResult extends CallToolResult
  ? TResult
  : CallToolResult | TResult;

// ============================================================================
// Tool Descriptor
// ============================================================================

/**
 * Per-call client provided to tool handlers.
 */
export interface ModelContextClient {
  /**
   * Requests user interaction during the current tool call.
   */
  requestUserInteraction(callback: () => Promise<unknown>): Promise<unknown>;
}

/**
 * MCPB extension context with additional elicitation helper.
 */
export interface ToolExecutionContext extends ModelContextClient {
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
 * information. This interface uses JSON Schema for input/output typing.
 *
 * @template TArgs - Tool input arguments.
 * @template TResult - Tool execution raw result shape (or full CallToolResult).
 * @template TName - Tool name literal type.
 *
 * @see {@link https://spec.modelcontextprotocol.io/specification/server/tools/}
 */
export interface ToolDescriptor<
  TArgs extends Record<string, unknown> = Record<string, unknown>,
  TResult = ToolRawResult,
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
   * Schema describing accepted input arguments.
   */
  inputSchema?: InputSchema;

  /**
   * Optional schema describing output payload shape.
   */
  outputSchema?: InputSchema;

  /**
   * Optional behavior hints for LLM planners.
   */
  annotations?: ToolAnnotations;

  /**
   * Tool execution function.
   */
  execute: (args: TArgs, client: ModelContextClient) => MaybePromise<ToolExecuteResult<TResult>>;
}

/**
 * Tool response shape inferred from an `outputSchema`.
 *
 * When a literal object output schema is provided, `structuredContent` is
 * narrowed to the inferred schema type for wrapped MCP responses.
 *
 * @template TOutputSchema - Optional literal JSON object schema.
 */
export type ToolResultFromOutputSchema<
  TOutputSchema extends JsonSchemaForInference | undefined = undefined,
> = TOutputSchema extends JsonSchemaObject
  ? Omit<CallToolResult, 'structuredContent'> & {
      structuredContent: InferJsonSchema<TOutputSchema>;
    }
  : CallToolResult;

/**
 * Execute result typing derived from an optional output schema.
 */
export type ToolExecuteResultFromOutputSchema<
  TOutputSchema extends JsonSchemaForInference | undefined = undefined,
> = TOutputSchema extends JsonSchemaObject
  ? InferJsonSchema<TOutputSchema> | ToolResultFromOutputSchema<TOutputSchema>
  : TOutputSchema extends JsonSchemaForInference
    ? InferJsonSchema<TOutputSchema> | CallToolResult
    : ToolExecuteResult;

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
  TInputSchema extends { type?: string | readonly string[] },
  TOutputSchema extends JsonSchemaForInference | undefined = undefined,
  TName extends string = string,
> = Omit<
  ToolDescriptor<
    InferArgsFromInputSchema<TInputSchema>,
    ToolExecuteResultFromOutputSchema<TOutputSchema>,
    TName
  >,
  'inputSchema' | 'outputSchema'
> & {
  inputSchema: TInputSchema;
} & (TOutputSchema extends JsonSchemaForInference
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
