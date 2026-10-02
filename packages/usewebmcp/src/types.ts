import type { WebMCP } from 'webmcp-types';

/**
 * The JSON Schema object accepted by the WebMCP tool contract. Standard Schema
 * validators such as Zod belong to `@mcp-b/react-webmcp`.
 */
export type ToolInputSchema = NonNullable<WebMCP.ModelContextTool['inputSchema']> & {
  readonly '~standard'?: never;
};

/** Input inferred from the WebMCP JSON Schema. */
export type InferToolInput<T extends object> = Parameters<
  WebMCP.ModelContextToolFromSchema<T>['execute']
>[0];

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
  input: InferToolInput<TInputSchema>,
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
}

/** State and controls returned by useWebMCP. */
export interface WebMCPReturn<TInputSchema extends ToolInputSchema = object, TResult = unknown> {
  state: ToolExecutionState<TResult>;
  isSupported: boolean;
  registrationError: Error | null;
  execute: (
    input: InferToolInput<TInputSchema>,
    options?: WebMCP.ToolExecuteCallbackOptions
  ) => Promise<TResult>;
  /** Clears observed execution state without cancelling pending work. */
  reset: () => void;
}
