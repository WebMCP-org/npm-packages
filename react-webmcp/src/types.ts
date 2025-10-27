import type { ToolAnnotations } from '@mcp-b/webmcp-ts-sdk';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { z } from 'zod';

// Re-export types from SDK packages
export type { ToolAnnotations, CallToolResult };

/**
 * Represents the current execution state of a tool, including loading status,
 * results, errors, and execution history.
 *
 * @template TOutput - The type of data returned by the tool handler
 * @public
 */
export interface ToolExecutionState<TOutput = unknown> {
  /**
   * Indicates whether the tool is currently executing.
   * Use this to show loading states in your UI.
   */
  isExecuting: boolean;

  /**
   * The result from the most recent successful execution.
   * Will be `null` if the tool hasn't been executed or last execution failed.
   */
  lastResult: TOutput | null;

  /**
   * The error from the most recent failed execution.
   * Will be `null` if the tool hasn't been executed or last execution succeeded.
   */
  error: Error | null;

  /**
   * Total number of times this tool has been executed.
   * Increments on both successful and failed executions.
   */
  executionCount: number;
}

/**
 * Configuration options for the `useWebMCP` hook.
 * Defines a tool's metadata, schema, handler, and lifecycle callbacks.
 *
 * @template TInputSchema - Zod schema object defining input parameters
 * @template TOutput - The type of data returned by the handler function
 * @public
 *
 * @example
 * ```typescript
 * const config: WebMCPConfig = {
 *   name: 'posts_like',
 *   description: 'Like a post by its ID',
 *   inputSchema: {
 *     postId: z.string().uuid(),
 *   },
 *   handler: async ({ postId }) => {
 *     await api.likePost(postId);
 *     return { success: true };
 *   },
 * };
 * ```
 */
export interface WebMCPConfig<
  TInputSchema extends Record<string, z.ZodTypeAny> = Record<string, never>,
  TOutput = string,
> {
  /**
   * Unique identifier for the tool (e.g., 'posts_like', 'graph_navigate').
   * Must follow naming conventions: lowercase with underscores.
   */
  name: string;

  /**
   * Human-readable description explaining what the tool does.
   * This description is used by AI assistants to understand when to use the tool.
   */
  description: string;

  /**
   * Zod schema object defining the input parameters for the tool.
   * Each key is a parameter name, and the value is a Zod type definition.
   *
   * @example
   * ```typescript
   * inputSchema: {
   *   postId: z.string().uuid().describe('The ID of the post to like'),
   *   userId: z.string().optional(),
   * }
   * ```
   */
  inputSchema?: TInputSchema;

  /**
   * Optional Zod schema object defining the expected output structure.
   * Used for runtime validation of handler return values.
   */
  outputSchema?: Record<string, z.ZodTypeAny>;

  /**
   * Optional metadata annotations providing hints about tool behavior.
   * See {@link ToolAnnotations} for available options.
   */
  annotations?: ToolAnnotations;

  /**
   * The function that executes when the tool is called.
   * Can be synchronous or asynchronous.
   *
   * @param input - Validated input parameters matching the inputSchema
   * @returns The result data or a Promise resolving to the result
   */
  handler: (input: z.infer<z.ZodObject<TInputSchema>>) => Promise<TOutput> | TOutput;

  /**
   * Optional function to format the handler output for the MCP response.
   * Defaults to JSON.stringify with indentation.
   *
   * @param output - The raw output from the handler
   * @returns Formatted string for the MCP response
   */
  formatOutput?: (output: TOutput) => string;

  /**
   * Optional callback invoked when the tool execution succeeds.
   * Useful for triggering side effects like navigation or analytics.
   *
   * @param result - The successful result from the handler
   * @param input - The input that was passed to the handler
   */
  onSuccess?: (result: TOutput, input: unknown) => void;

  /**
   * Optional callback invoked when the tool execution fails.
   * Useful for error handling, logging, or showing user notifications.
   *
   * @param error - The error that occurred during execution
   * @param input - The input that was passed to the handler
   */
  onError?: (error: Error, input: unknown) => void;
}

/**
 * Return value from the `useWebMCP` hook.
 * Provides access to execution state and methods for manual tool control.
 *
 * @template TOutput - The type of data returned by the tool handler
 * @public
 */
export interface WebMCPReturn<TOutput = unknown> {
  /**
   * Current execution state including loading status, results, and errors.
   * See {@link ToolExecutionState} for details.
   */
  state: ToolExecutionState<TOutput>;

  /**
   * Manually execute the tool with the provided input.
   * Useful for testing, debugging, or triggering execution from your UI.
   *
   * @param input - The input parameters to pass to the tool
   * @returns Promise resolving to the tool's output
   * @throws Error if validation fails or handler throws
   */
  execute: (input: unknown) => Promise<TOutput>;

  /**
   * Reset the execution state to its initial values.
   * Clears results, errors, and resets the execution count.
   */
  reset: () => void;
}

// Re-export types from @mcp-b/global
export type { ModelContext as ModelContextProtocol, ToolDescriptor } from '@mcp-b/global';
