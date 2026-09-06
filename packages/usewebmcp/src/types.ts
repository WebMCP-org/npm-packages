import type { StandardJSONSchemaV1, StandardSchemaV1 } from '@standard-schema/spec';
import type { ToolExecutionState } from '@mcp-b/webmcp-polyfill/execution-state';
import type { AroundInvoke } from '@mcp-b/webmcp-polyfill/invocation';
import type { WebMCP } from 'webmcp-types';

export type { ToolExecutionState } from '@mcp-b/webmcp-polyfill/execution-state';

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
  /** Format agent-facing failures; local execution continues to reject. Cancellation always rejects. */
  formatError?: (error: Error) => unknown;
  /** Protocol adapter seam: classify an agent response as a failed execution. */
  isErrorResponse?: (response: unknown) => boolean;
  /** Optional invocation observers and gates, in outermost-first order. */
  middleware?: readonly AroundInvoke<TResult>[];
  /** Serializable approval description when validated inputs contain non-JSON values. */
  binding?: (input: InferValidatedToolInput<TInputSchema>) => unknown;
  /** Recheck current authority before execution, using the latest committed checker. */
  checkBinding?: () => void;
}

/** Registration and local execution, without an execution-state subscription. */
export interface WebMCPToolReturn<
  TInputSchema extends ToolInputSchema = object,
  TResult = unknown,
> {
  isSupported: boolean;
  registrationError: Error | null;
  execute: (
    input: InferToolInput<TInputSchema>,
    options?: WebMCP.ToolExecuteCallbackOptions
  ) => Promise<TResult>;
}

/** State and controls returned by useWebMCP. */
export interface WebMCPReturn<
  TInputSchema extends ToolInputSchema = object,
  TResult = unknown,
> extends WebMCPToolReturn<TInputSchema, TResult> {
  state: ToolExecutionState<TResult>;
  /** Clears observed execution state without cancelling pending work. */
  reset: () => void;
}
