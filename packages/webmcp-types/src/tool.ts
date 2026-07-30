import type { CallToolResult, InputSchema } from './common.js';
import type {
  InferArgsFromInputSchema,
  InferJsonSchema,
  JsonSchemaForInference,
} from './json-schema.js';
import type { ToolAnnotations as McpToolAnnotations } from '@modelcontextprotocol/server';

// ============================================================================
// Tool Annotations
// ============================================================================

/**
 * Annotations defined by the WebMCP specification.
 *
 * Web IDL converts both fields to booleans. MCP-B runtimes may support the
 * additional MCP annotations exposed by {@link ToolAnnotations}.
 *
 * @see {@link https://webmachinelearning.github.io/webmcp/#dictdef-toolannotations}
 */
export interface WebMcpToolAnnotations {
  /**
   * Indicates the tool is read-only.
   */
  readOnlyHint?: boolean;

  /**
   * Indicates the tool's output may include content from outside the page's trust boundary.
   */
  untrustedContentHint?: boolean;
}

/**
 * MCP-B annotation extensions accepted by compatibility runtimes.
 *
 * `document.modelContext` only guarantees the fields in
 * {@link WebMcpToolAnnotations}. The remaining fields are MCP-B extensions.
 *
 * @see {@link https://modelcontextprotocol.io/specification/latest/server/tools}
 */
export type ToolAnnotations = McpToolAnnotations & WebMcpToolAnnotations;

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
 * Value that may be returned synchronously or via Promise.
 */
export type MaybePromise<T> = T | Promise<T>;

/**
 * Tool descriptor accepted by the strict WebMCP browser API.
 *
 * The browser invokes `execute(input)` with one argument. MCP-B runtimes expose
 * the richer {@link ToolDescriptor} callback when their extension surface is
 * used.
 */
export interface ModelContextTool<
  TArgs extends Record<string, unknown> | unknown[] = Record<string, unknown>,
  TResult = unknown,
  TName extends string = string,
> {
  /**
   * Unique tool identifier.
   */
  name: TName;

  /**
   * Optional user-facing label.
   */
  title?: string;

  /**
   * Human-readable summary of what the tool does.
   */
  description: string;

  /**
   * JSON Schema describing accepted input arguments.
   */
  inputSchema?: InputSchema;

  /**
   * Standard WebMCP behavior hints.
   */
  annotations?: WebMcpToolAnnotations;

  /**
   * Browser tool execution callback.
   */
  execute: (input: TArgs) => Promise<TResult>;
}

/**
 * Strict WebMCP tool descriptor whose input is inferred from JSON Schema.
 */
export type ModelContextToolFromSchema<
  TInputSchema extends { type?: string | readonly string[] | undefined },
  TResult = unknown,
  TName extends string = string,
> = Omit<
  ModelContextTool<InferArgsFromInputSchema<TInputSchema>, TResult, TName>,
  'inputSchema'
> & {
  inputSchema: TInputSchema;
};

/**
 * Extended tool descriptor accepted by MCP-B compatibility runtimes.
 *
 * Unlike the strict browser callback, this descriptor can receive a per-call
 * client and carry MCP output schemas and annotations.
 *
 * @template TArgs - Tool input arguments.
 * @template TResult - Tool execution raw result shape (or full CallToolResult).
 * @template TName - Tool name literal type.
 *
 * @see {@link https://modelcontextprotocol.io/specification/latest/server/tools}
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
   * Optional user-facing label.
   */
  title?: string;

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
  outputSchema?: JsonSchemaForInference;

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
> = TOutputSchema extends JsonSchemaForInference
  ? Omit<CallToolResult, 'structuredContent'> & {
      structuredContent: InferJsonSchema<TOutputSchema>;
    }
  : CallToolResult;

/**
 * Execute result typing derived from an optional output schema.
 */
export type ToolExecuteResultFromOutputSchema<
  TOutputSchema extends JsonSchemaForInference | undefined = undefined,
> = TOutputSchema extends JsonSchemaForInference
  ? InferJsonSchema<TOutputSchema> | ToolResultFromOutputSchema<TOutputSchema>
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
  TInputSchema extends { type?: string | readonly string[] | undefined },
  TOutputSchema extends JsonSchemaForInference | undefined = undefined,
  TName extends string = string,
> = Omit<
  ToolDescriptor<
    InferArgsFromInputSchema<TInputSchema> extends Record<string, unknown>
      ? InferArgsFromInputSchema<TInputSchema>
      : Record<string, unknown>,
    ToolExecuteResultFromOutputSchema<TOutputSchema>,
    TName
  >,
  'execute' | 'inputSchema' | 'outputSchema'
> & {
  inputSchema: TInputSchema;
  execute: (
    args: InferArgsFromInputSchema<TInputSchema> extends Record<string, unknown>
      ? InferArgsFromInputSchema<TInputSchema>
      : Record<string, unknown>,
    client: ModelContextClient
  ) => MaybePromise<ToolExecuteResultFromOutputSchema<TOutputSchema>>;
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
   * Optional user-facing label.
   */
  title?: string;

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
  outputSchema?: JsonSchemaForInference;

  /**
   * Optional behavior hints for LLM planners.
   */
  annotations?: ToolAnnotations;
}
