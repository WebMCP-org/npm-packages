import type { StandardJSONSchemaV1, StandardSchemaV1 } from '@standard-schema/spec';
import type { WebMCP } from 'webmcp-types';

/** JSON Schema, or a schema implementing Standard JSON Schema v1. */
export type ToolInputSchema = NonNullable<WebMCP.ModelContextTool['inputSchema']>;

/** Input accepted by the returned execute function, before validation/transforms. */
export type InferToolInput<T extends ToolInputSchema> = T extends StandardJSONSchemaV1
  ? StandardJSONSchemaV1.InferInput<T>
  : Parameters<WebMCP.ModelContextToolFromSchema<T>['execute']>[0];

/** Input received by the implementation, after Standard Schema validation/transforms. */
export type InferValidatedToolInput<T extends ToolInputSchema> = T extends StandardSchemaV1
  ? StandardSchemaV1.InferOutput<T>
  : InferToolInput<T>;

/** Current state for local and agent-triggered tool executions. */
export interface ToolExecutionState<TResult = unknown> {
  /** Whether at least one execution is pending. */
  isExecuting: boolean;
  /** Most recent successful result, or null before one exists. */
  lastResult: TResult | null;
  /** Most recent execution error. */
  error: Error | null;
  /** Number of successful executions since the last reset. */
  executionCount: number;
}

/** Synchronous or asynchronous tool implementation. */
export type ToolExecuteFunction<
  TInputSchema extends ToolInputSchema = object,
  TResult = unknown,
> = (
  input: InferValidatedToolInput<TInputSchema>,
  options: WebMCP.ToolExecuteCallbackOptions
) => WebMCP.MaybePromise<TResult>;

/** Standard tool metadata plus React lifecycle and execution options. */
export interface WebMCPConfig<
  TInputSchema extends ToolInputSchema = object,
  TResult = unknown,
> extends Omit<WebMCP.ModelContextTool, 'inputSchema' | 'execute'> {
  inputSchema?: TInputSchema;
  execute: ToolExecuteFunction<TInputSchema, TResult>;
  /** Register while true. Local execution remains available when false. */
  enabled?: boolean;
  /** Origins allowed to discover/call the tool, enforced by the browser. */
  exposedTo?: WebMCP.ModelContextRegisterToolOptions['exposedTo'];
  /** Format agent-facing results; local execution and state retain the original result. */
  formatOutput?: (result: TResult) => unknown;
}

/** State and controls returned by useWebMCP. */
export interface WebMCPReturn<TInputSchema extends ToolInputSchema = object, TResult = unknown> {
  state: ToolExecutionState<TResult>;
  isSupported: boolean;
  isRegistered: boolean;
  registrationError: Error | null;
  execute: (
    input: InferToolInput<TInputSchema>,
    options?: WebMCP.ToolExecuteCallbackOptions
  ) => Promise<TResult>;
  /** Clears observed execution state without cancelling pending work. */
  reset: () => void;
}
