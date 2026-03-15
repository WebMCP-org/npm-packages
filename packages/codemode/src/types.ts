export interface ExecuteResult {
  result: unknown;
  error?: string;
  logs?: string[];
}

/** A single tool function callable from sandbox code. */
export type ToolFunction = (args: unknown) => Promise<unknown>;

/** Map of tool names to their execution functions. */
export type ToolFunctions = Record<string, ToolFunction>;

/**
 * An executor runs LLM-generated code in a sandbox, making the provided
 * tool functions callable as `codemode.*` inside the sandbox.
 *
 * Implementations should never throw — errors are returned in `ExecuteResult.error`.
 */
export interface Executor {
  execute(code: string, fns: ToolFunctions): Promise<ExecuteResult>;
}
