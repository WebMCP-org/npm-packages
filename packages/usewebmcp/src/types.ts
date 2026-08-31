import type { ToolInputSchema } from '@mcp-b/webmcp-polyfill/schema';
import type {
  InferArgsFromInputSchema,
  InferJsonSchema,
  InputSchema,
  JsonSchemaForInference,
  ToolAnnotations,
} from '@mcp-b/webmcp-types';

/** Infers tool input from a JSON Schema literal or Standard JSON Schema. */
export type InferToolInput<T> = T extends { readonly '~standard': { readonly types?: infer Types } }
  ? NonNullable<Types> extends { readonly input: infer Input }
    ? Input
    : Record<string, unknown>
  : T extends InputSchema
    ? InferArgsFromInputSchema<T>
    : Record<string, unknown>;

/** Infers tool output from a JSON Schema literal. */
export type InferOutput<TOutputSchema extends JsonSchemaForInference | undefined = undefined> =
  TOutputSchema extends undefined
    ? unknown
    : TOutputSchema extends JsonSchemaForInference
      ? InferJsonSchema<TOutputSchema>
      : unknown;

/** Current state for local and MCP-triggered tool executions. */
export interface ToolExecutionState<TOutput = unknown> {
  /** Whether at least one execution is pending. */
  isExecuting: boolean;
  /** Most recent successful result, or `null` before one exists. */
  lastResult: TOutput | null;
  /** Most recent execution error. */
  error: Error | null;
  /** Number of successful executions since the last reset. */
  executionCount: number;
}

/** Synchronous or asynchronous tool implementation. */
export type ToolExecuteFunction<
  TInputSchema extends ToolInputSchema = InputSchema,
  TOutputSchema extends JsonSchemaForInference | undefined = undefined,
> = (
  input: InferToolInput<TInputSchema>
) => Promise<InferOutput<TOutputSchema>> | InferOutput<TOutputSchema>;

/** Configuration for a tool registered by `useWebMCP`. */
export interface WebMCPConfig<
  TInputSchema extends ToolInputSchema = InputSchema,
  TOutputSchema extends JsonSchemaForInference | undefined = undefined,
> {
  /** Unique WebMCP tool name. */
  name: string;
  /** Description shown to MCP clients. */
  description: string;
  /** Whether to register with the runtime. Defaults to `true`. */
  enabled?: boolean;
  /** JSON Schema literal or Standard JSON Schema for the tool input. */
  inputSchema?: TInputSchema;
  /** JSON Schema used for output inference and structured content. */
  outputSchema?: TOutputSchema;
  /** Optional WebMCP behavior hints. */
  annotations?: ToolAnnotations;
  /** Tool implementation. */
  execute: ToolExecuteFunction<TInputSchema, TOutputSchema>;
}

/** State and controls returned by `useWebMCP`. */
export interface WebMCPReturn<
  TOutputSchema extends JsonSchemaForInference | undefined = undefined,
  TInputSchema extends ToolInputSchema = InputSchema,
> {
  state: ToolExecutionState<InferOutput<TOutputSchema>>;
  execute: (input: InferToolInput<TInputSchema>) => Promise<InferOutput<TOutputSchema>>;
  reset: () => void;
}
