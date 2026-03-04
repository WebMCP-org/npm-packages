import type { ToolInputSchema } from '@mcp-b/webmcp-polyfill';
import type {
  InferArgsFromInputSchema,
  InferJsonSchema,
  InputSchema,
  JsonSchemaObject,
  ToolAnnotations,
} from '@mcp-b/webmcp-types';

/**
 * Infers tool input type from either a Standard Schema or JSON Schema.
 *
 * - **Standard Schema** (Zod v4, Valibot, ArkType): extracts `~standard.types.input`
 * - **JSON Schema** (`as const`): uses `InferArgsFromInputSchema` for structural inference
 * - **Fallback**: `Record<string, unknown>`
 *
 * @template T - The input schema type
 * @internal
 */
export type InferToolInput<T> = T extends { readonly '~standard': { readonly types?: infer Types } }
  ? Types extends { readonly input: infer I }
    ? I
    : Record<string, unknown>
  : T extends InputSchema
    ? InferArgsFromInputSchema<T>
    : Record<string, unknown>;

/**
 * Utility type to infer the output type from a JSON Schema object.
 *
 * When `TOutputSchema` is a literal `JsonSchemaObject`, this resolves to
 * `InferJsonSchema<TOutputSchema>`. When it's `undefined`,
 * it falls back to the provided `TFallback` type.
 *
 * @template TOutputSchema - JSON Schema object for output inference
 * @template TFallback - Fallback type when no schema is provided
 * @internal
 */
export type InferOutput<
  TOutputSchema extends JsonSchemaObject | undefined = undefined,
  TFallback = unknown,
> = TOutputSchema extends undefined
  ? TFallback
  : TOutputSchema extends JsonSchemaObject
    ? InferJsonSchema<TOutputSchema>
    : TFallback;

/**
 * Represents the current execution state of a tool, including loading status,
 * results, errors, and execution history.
 *
 * @template TOutput - The type of data returned by the tool implementation
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
 * Tool implementation function used by `useWebMCP`.
 *
 * Supports sync or async implementations.
 *
 * @template TInputSchema - Schema defining input parameters
 * @template TOutputSchema - Optional JSON Schema object defining output structure
 *
 * @public
 */
export type ToolExecuteFunction<
  TInputSchema extends ToolInputSchema = InputSchema,
  TOutputSchema extends JsonSchemaObject | undefined = undefined,
> = (
  input: InferToolInput<TInputSchema>
) => Promise<InferOutput<TOutputSchema>> | InferOutput<TOutputSchema>;

/**
 * Shared configuration fields for the `useWebMCP` hook.
 *
 * Defines a tool's metadata, schema, and lifecycle callbacks.
 * Uses JSON Schema for type inference via `as const`.
 *
 * @template TInputSchema - JSON Schema defining input parameters
 * @template TOutputSchema - JSON Schema object defining output structure (enables structuredContent)
 *
 * @public
 *
 * @example Basic tool without output schema:
 * ```typescript
 * const config: WebMCPConfig = {
 *   name: 'posts_like',
 *   description: 'Like a post by its ID',
 *   inputSchema: {
 *     type: 'object',
 *     properties: { postId: { type: 'string' } },
 *     required: ['postId'],
 *   } as const,
 *   execute: async ({ postId }) => {
 *     await api.likePost(postId);
 *     return { success: true };
 *   },
 * };
 * ```
 *
 * @example Tool with output schema (enables MCP structuredContent):
 * ```typescript
 * useWebMCP({
 *   name: 'posts_like',
 *   description: 'Like a post and return updated like count',
 *   inputSchema: {
 *     type: 'object',
 *     properties: { postId: { type: 'string' } },
 *     required: ['postId'],
 *   } as const,
 *   outputSchema: {
 *     type: 'object',
 *     properties: {
 *       likes: { type: 'number', description: 'Updated like count' },
 *       likedAt: { type: 'string', description: 'ISO timestamp of the like' },
 *     },
 *   } as const,
 *   execute: async ({ postId }) => {
 *     const result = await api.likePost(postId);
 *     return { likes: result.likes, likedAt: new Date().toISOString() };
 *   },
 * });
 * ```
 */
interface WebMCPConfigBase<
  TInputSchema extends ToolInputSchema = InputSchema,
  TOutputSchema extends JsonSchemaObject | undefined = undefined,
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
   * Schema defining the input parameters for the tool.
   * Accepts JSON Schema (with `as const`) or any Standard Schema v1
   * library (Zod v4, Valibot, ArkType, etc.).
   *
   * @example JSON Schema
   * ```typescript
   * inputSchema: {
   *   type: 'object',
   *   properties: {
   *     postId: { type: 'string', description: 'The ID of the post to like' },
   *   },
   *   required: ['postId'],
   * } as const
   * ```
   *
   * @example Standard Schema (Zod v4)
   * ```typescript
   * inputSchema: z.object({ postId: z.string() })
   * ```
   */
  inputSchema?: TInputSchema;

  /**
   * **Recommended:** JSON Schema object defining the expected output structure.
   *
   * When provided, this enables three key features:
   * 1. **Type Safety**: The implementation return type is inferred from this schema
   * 2. **MCP structuredContent**: The MCP response includes `structuredContent`
   *    containing the typed output per the MCP specification
   * 3. **AI Understanding**: AI models can better understand and use the tool's output
   *
   * @see {@link https://spec.modelcontextprotocol.io/specification/server/tools/#output-schemas}
   *
   * @example
   * ```typescript
   * outputSchema: {
   *   type: 'object',
   *   properties: {
   *     counter: { type: 'number', description: 'The current counter value' },
   *     timestamp: { type: 'string', description: 'ISO timestamp' },
   *   },
   * } as const
   * ```
   */
  outputSchema?: TOutputSchema;

  /**
   * Optional metadata annotations providing hints about tool behavior.
   * See {@link ToolAnnotations} for available options.
   */
  annotations?: ToolAnnotations;

  /**
   * Custom formatter for the MCP text response.
   *
   * @deprecated Use `outputSchema` instead. The `outputSchema` provides type-safe
   * structured output via MCP's `structuredContent`, which is the recommended
   * approach for tool outputs. This property will be removed in a future version.
   *
   * @param output - The raw output from the tool implementation
   * @returns Formatted string for the MCP response content
   */
  formatOutput?: (output: InferOutput<TOutputSchema>) => string;

  /**
   * Optional callback invoked when the tool execution succeeds.
   * Useful for triggering side effects like navigation or analytics.
   *
   * @param result - The successful result from the tool implementation
   * @param input - The input that was passed to the tool implementation
   */
  onSuccess?: (result: InferOutput<TOutputSchema>, input: unknown) => void;

  /**
   * Optional callback invoked when the tool execution fails.
   * Useful for error handling, logging, or showing user notifications.
   *
   * @param error - The error that occurred during execution
   * @param input - The input that was passed to the tool implementation
   */
  onError?: (error: Error, input: unknown) => void;
}

type WebMCPConfigImplementation<
  TInputSchema extends ToolInputSchema = InputSchema,
  TOutputSchema extends JsonSchemaObject | undefined = undefined,
> =
  | {
      /**
       * Preferred tool implementation function.
       */
      execute: ToolExecuteFunction<TInputSchema, TOutputSchema>;
      /**
       * Backward-compatible alias for `execute`.
       */
      handler?: ToolExecuteFunction<TInputSchema, TOutputSchema>;
    }
  | {
      /**
       * Backward-compatible alias for `execute`.
       */
      handler: ToolExecuteFunction<TInputSchema, TOutputSchema>;
      /**
       * Preferred tool implementation function.
       */
      execute?: ToolExecuteFunction<TInputSchema, TOutputSchema>;
    };

/**
 * Configuration options for the `useWebMCP` hook.
 *
 * You can provide tool logic with either:
 * - `execute` (preferred), or
 * - `handler` (backward-compatible alias).
 *
 * If both are provided, `execute` is used.
 *
 * @template TInputSchema - JSON Schema defining input parameters
 * @template TOutputSchema - JSON Schema object defining output structure (enables structuredContent)
 *
 * @public
 */
export type WebMCPConfig<
  TInputSchema extends ToolInputSchema = InputSchema,
  TOutputSchema extends JsonSchemaObject | undefined = undefined,
> = WebMCPConfigBase<TInputSchema, TOutputSchema> &
  WebMCPConfigImplementation<TInputSchema, TOutputSchema>;

/**
 * Return value from the `useWebMCP` hook.
 * Provides access to execution state and methods for manual tool control.
 *
 * @template TOutputSchema - JSON Schema object defining output structure
 * @public
 */
export interface WebMCPReturn<TOutputSchema extends JsonSchemaObject | undefined = undefined> {
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
   * @throws Error if validation fails or tool implementation throws
   */
  execute: (input: unknown) => Promise<InferOutput<TOutputSchema>>;

  /**
   * Reset the execution state to its initial values.
   * Clears results, errors, and resets the execution count.
   */
  reset: () => void;
}
