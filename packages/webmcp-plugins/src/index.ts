import type { WebMCP } from 'webmcp-types';

/** One tool execution, as seen by plugins. */
export interface ToolCall {
  /** Registered tool name. */
  readonly name: string;
  /** Exactly what the tool's `execute` will receive. */
  readonly input: unknown;
  /** Aborts when the caller cancels the execution. */
  readonly signal: AbortSignal;
}

/**
 * Runs around every execution of a tool, local or agent-initiated. Call `next()` at most
 * once and return its result, or throw to fail the call without running the tool.
 */
export interface WebMCPPlugin {
  readonly name: string;
  aroundExecute<T>(call: ToolCall, next: () => Promise<T>): Promise<T>;
}

type Execute<TInput, TResult> = (
  input: TInput,
  options: WebMCP.ToolExecuteCallbackOptions
) => TResult;

/**
 * Returns a copy of `tool` whose `execute` runs through `plugins`, outermost first.
 * Works with any `registerTool()` descriptor and with the React hooks' `execute`.
 */
export function withPlugins<TInput, TResult, TTool extends { name: string }>(
  tool: TTool & { execute: Execute<TInput, TResult> },
  plugins: readonly WebMCPPlugin[]
): TTool & { execute: Execute<TInput, Promise<Awaited<TResult>>> } {
  const chain = [...plugins];
  const execute = (input: TInput, options = { signal: new AbortController().signal }) => {
    const call: ToolCall = Object.freeze({ name: tool.name, input, signal: options.signal });
    const run = async (index: number): Promise<Awaited<TResult>> => {
      if (index === chain.length) {
        options.signal.throwIfAborted();
        return await tool.execute(input, options);
      }
      // A hole in the array throws here instead of skipping the remaining plugins.
      const plugin = chain[index]!;
      let called = false;
      return plugin.aroundExecute<Awaited<TResult>>(call, () => {
        if (called) {
          return Promise.reject(new Error(`Plugin "${plugin.name}" called next() twice`));
        }
        called = true;
        return run(index + 1);
      });
    };
    return run(0);
  };
  return { ...tool, execute };
}
