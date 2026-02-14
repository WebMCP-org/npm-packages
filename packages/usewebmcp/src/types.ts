import type { CallToolResult, InputSchema, ToolAnnotations } from '@mcp-b/webmcp-types';
import type { z } from 'zod';

// Re-export types from @mcp-b/webmcp-types for convenience
export type { CallToolResult, InputSchema, ToolAnnotations };

/**
 * Utility type to infer the output type from a Zod schema object.
 *
 * When `TOutputSchema` is a non-empty Zod schema object, this resolves to
 * `z.infer<z.ZodObject<TOutputSchema>>`. When it's empty (`Record<string, never>`),
 * it falls back to the provided `TFallback` type.
 *
 * @template TOutputSchema - Zod schema object for output validation
 * @template TFallback - Fallback type when no schema is provided
 * @internal
 */
export type InferOutput<
  TOutputSchema extends Record<string, z.ZodTypeAny>,
  TFallback = unknown,
> = TOutputSchema extends Record<string, never> ? TFallback : z.infer<z.ZodObject<TOutputSchema>>;

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
   * Increments on successful executions only.
   */
  executionCount: number;
}

/**
 * Configuration options for the `useWebMCP` hook.
 *
 * Defines a tool's metadata, schema, handler, and lifecycle callbacks.
 * Supports full Zod type inference for both input and output schemas.
 *
 * @template TInputSchema - Zod schema object defining input parameters
 * @template TOutputSchema - Zod schema object defining output structure (enables structuredContent)
 *
 * @public
 *
 * @example Basic tool without output schema:
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
 *
 * @example Tool with output schema (enables MCP structuredContent):
 * ```typescript
 * const config: WebMCPConfig<
 *   { postId: z.ZodString },
 *   { likes: z.ZodNumber; likedAt: z.ZodString }
 * > = {
 *   name: 'posts_like',
 *   description: 'Like a post and return updated like count',
 *   inputSchema: {
 *     postId: z.string().uuid(),
 *   },
 *   outputSchema: {
 *     likes: z.number().describe('Updated like count'),
 *     likedAt: z.string().describe('ISO timestamp of the like'),
 *   },
 *   // Handler return type is inferred from outputSchema
 *   handler: async ({ postId }) => {
 *     const result = await api.likePost(postId);
 *     return { likes: result.likes, likedAt: new Date().toISOString() };
 *   },
 * };
 * ```
 */
export interface WebMCPConfig<
  TInputSchema extends Record<string, z.ZodTypeAny> = Record<string, never>,
  TOutputSchema extends Record<string, z.ZodTypeAny> = Record<string, never>,
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
   * **Recommended:** Zod schema object defining the expected output structure.
   *
   * When provided, this enables three key features:
   * 1. **Type Safety**: The handler's return type is inferred from this schema
   * 2. **MCP structuredContent**: The MCP response includes `structuredContent`
   *    containing the typed output per the MCP specification
   * 3. **AI Understanding**: AI models can better understand and use the tool's output
   *
   * This is the recommended way to define tool outputs. The schema provides
   * both compile-time type checking and runtime structure for MCP clients.
   *
   * @see {@link https://spec.modelcontextprotocol.io/specification/server/tools/#output-schemas}
   *
   * @example
   * ```typescript
   * outputSchema: {
   *   counter: z.number().describe('The current counter value'),
   *   timestamp: z.string().describe('ISO timestamp'),
   *   metadata: z.object({
   *     updatedBy: z.string(),
   *   }).describe('Additional metadata'),
   * }
   * ```
   */
  outputSchema?: TOutputSchema;

  /**
   * Optional metadata annotations providing hints about tool behavior.
   * See {@link ToolAnnotations} for available options.
   */
  annotations?: ToolAnnotations;

  /**
   * The function that executes when the tool is called.
   * Can be synchronous or asynchronous.
   *
   * When `outputSchema` is provided, the return type is inferred from the schema.
   * Otherwise, any return type is allowed.
   *
   * @param input - Validated input parameters matching the inputSchema
   * @returns The result data or a Promise resolving to the result
   */
  handler: (
    input: z.infer<z.ZodObject<TInputSchema>>
  ) => Promise<InferOutput<TOutputSchema>> | InferOutput<TOutputSchema>;

  /**
   * Custom formatter for the MCP text response.
   *
   * @deprecated Use `outputSchema` instead. The `outputSchema` provides type-safe
   * structured output via MCP's `structuredContent`, which is the recommended
   * approach for tool outputs. This property will be removed in a future version.
   *
   * @param output - The raw output from the handler
   * @returns Formatted string for the MCP response content
   */
  formatOutput?: (output: InferOutput<TOutputSchema>) => string;

  /**
   * Optional callback invoked when the tool execution succeeds.
   * Useful for triggering side effects like navigation or analytics.
   *
   * @param result - The successful result from the handler
   * @param input - The input that was passed to the handler
   */
  onSuccess?: (result: InferOutput<TOutputSchema>, input: unknown) => void;

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
 * @template TOutputSchema - Zod schema object defining output structure
 * @public
 */
export interface WebMCPReturn<
  TOutputSchema extends Record<string, z.ZodTypeAny> = Record<string, never>,
> {
  /**
   * Current execution state including loading status, results, and errors.
   * See {@link ToolExecutionState} for details.
   */
  state: ToolExecutionState<InferOutput<TOutputSchema>>;

  /**
   * Manually execute the tool with the provided input.
   * Useful for testing, debugging, or triggering execution from your UI.
   *
   * @param input - The input parameters to pass to the tool
   * @returns Promise resolving to the tool's output
   * @throws Error if validation fails or handler throws
   */
  execute: (input: unknown) => Promise<InferOutput<TOutputSchema>>;

  /**
   * Reset the execution state to its initial values.
   * Clears results, errors, and resets the execution count.
   */
  reset: () => void;
}
