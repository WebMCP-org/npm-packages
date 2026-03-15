import type { UnknownRecord } from './type-utils';

export interface ExecuteResult {
  result: unknown;
  error?: string;
  logs?: string[];
}

export type ToolArgs = UnknownRecord;

/** A single tool function callable from sandbox code. */
export type ToolFunction<TArgs = ToolArgs, TResult = unknown> = (args: TArgs) => Promise<TResult>;

/** Map of tool names to their execution functions. */
export type ToolFunctions<TArgs = ToolArgs, TResult = unknown> = Record<
  string,
  ToolFunction<TArgs, TResult>
>;

/**
 * An executor runs LLM-generated code in a sandbox, making the provided
 * tool functions callable as `codemode.*` inside the sandbox.
 *
 * Implementations should never throw — errors are returned in `ExecuteResult.error`.
 */
export interface Executor {
  execute(code: string, fns: ToolFunctions): Promise<ExecuteResult>;
}
