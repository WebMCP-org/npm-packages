import type { ToolInputSchema } from '@mcp-b/webmcp-polyfill';
import type { PromptMessage, ResourceContents } from '@mcp-b/webmcp-ts-sdk';
import type {
  CallToolResult,
  InferArgsFromInputSchema,
  InferJsonSchema,
  InputSchema,
  JsonSchemaObject,
  ToolAnnotations,
} from '@mcp-b/webmcp-types';
import type { z } from 'zod';
import type { ZodSchemaObject } from './zod-utils.js';

// Re-export PromptMessage and ResourceContents for use in hook types
export type { PromptMessage, ResourceContents };

// Re-export core/runtime types from MCP-B packages
export type { ToolAnnotations, CallToolResult };

// Re-export schema types for consumers
export type { ToolInputSchema } from '@mcp-b/webmcp-polyfill';
export type { ZodSchemaObject } from './zod-utils.js';

/**
 * Union of all input schema types supported by react-webmcp:
 * - `ToolInputSchema` (JSON Schema + Standard Schema v1)
 * - `ZodSchemaObject` (Zod v3 `Record<string, z.ZodTypeAny>`)
 */
export type ReactWebMCPInputSchema = ToolInputSchema | ZodSchemaObject;

/**
 * Union of all output schema types supported by react-webmcp:
 * - `JsonSchemaObject` (MCP output schema)
 * - `ZodSchemaObject` (Zod v3 `Record<string, z.ZodTypeAny>`, converted at runtime)
 */
export type ReactWebMCPOutputSchema = JsonSchemaObject | ZodSchemaObject;

/**
 * Infers handler input type from a Standard Schema, Zod v3 schema, or JSON Schema.
 *
 * - **Standard Schema** (Zod v4, Valibot, ArkType): extracts `~standard.types.input`
 * - **Zod v3** (`Record<string, z.ZodTypeAny>`): uses `z.infer<z.ZodObject<T>>`
 * - **JSON Schema** (`as const`): uses `InferArgsFromInputSchema` for structural inference
 * - **Fallback**: `Record<string, unknown>`
 *
 * @template T - The input schema type
 * @internal
 */
export type InferToolInput<T> =
  // Standard Schema v1 (Zod v4, Valibot, ArkType)
  T extends { readonly '~standard': { readonly types?: infer Types } }
    ? Types extends { readonly input: infer I }
      ? I
      : Record<string, unknown>
    : // Zod v3 schema object
      T extends Record<string, z.ZodTypeAny>
      ? z.infer<z.ZodObject<T>>
      : // JSON Schema
        T extends InputSchema
        ? InferArgsFromInputSchema<T>
        : Record<string, unknown>;

/**
 * Utility type to infer the output type from an output schema.
 *
 * - `JsonSchemaObject` resolves via `InferJsonSchema`
 * - `ZodSchemaObject` resolves via `z.infer<z.ZodObject<...>>`
 * - `undefined` falls back to `TFallback`
 *
 * @template TOutputSchema - Output schema for result inference
 * @template TFallback - Fallback type when no schema is provided
 * @internal
 */
export type InferOutput<
  TOutputSchema extends ReactWebMCPOutputSchema | undefined = undefined,
  TFallback = unknown,
> = TOutputSchema extends undefined
  ? TFallback
  : TOutputSchema extends Record<string, z.ZodTypeAny> // Zod v3 schema object
    ? z.infer<z.ZodObject<TOutputSchema>>
    : // JSON Schema object
      TOutputSchema extends JsonSchemaObject
      ? InferJsonSchema<TOutputSchema>
      : TFallback;

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
 * Uses JSON Schema for type inference via `as const`.
 *
 * @template TInputSchema - JSON Schema defining input parameters
 * @template TOutputSchema - Output schema defining output structure (enables structuredContent)
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
 *   handler: async ({ postId }) => {
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
 *   handler: async ({ postId }) => {
 *     const result = await api.likePost(postId);
 *     return { likes: result.likes, likedAt: new Date().toISOString() };
 *   },
 * });
 * ```
 */
export interface WebMCPConfig<
  TInputSchema extends ReactWebMCPInputSchema = InputSchema,
  TOutputSchema extends ReactWebMCPOutputSchema | undefined = undefined,
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
   * JSON Schema defining the input parameters for the tool.
   * Use `as const` to enable type inference for the handler's input.
   *
   * @example
   * ```typescript
   * inputSchema: {
   *   type: 'object',
   *   properties: {
   *     postId: { type: 'string', description: 'The ID of the post to like' },
   *     userId: { type: 'string' },
   *   },
   *   required: ['postId'],
   * } as const
   * ```
   */
  inputSchema?: TInputSchema;

  /**
   * **Recommended:** Output schema defining the expected output structure.
   * Accepts either a JSON Schema object or a Zod schema map.
   *
   * When provided, this enables three key features:
   * 1. **Type Safety**: The handler's return type is inferred from this schema
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
    input: InferToolInput<TInputSchema>
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
   * Whether the tool should currently be registered.
   *
   * Defaults to `true`. Set to `false` to skip registration until the tool
   * should become available again.
   */
  enabled?: boolean;

  /**
   * Optional callback invoked when tool execution begins.
   * Useful for triggering optimistic UI or loading indicators before the
   * handler runs.
   *
   * @param input - The input that will be passed to the handler
   */
  onStart?: (input: unknown) => void;

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
 * @template TOutputSchema - Output schema defining output structure
 * @public
 */
export interface WebMCPReturn<
  TOutputSchema extends ReactWebMCPOutputSchema | undefined = undefined,
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

// Re-export BrowserMcpServer aliased as ModelContextProtocol (API surface type)
export type {
  BrowserMcpServer as ModelContextProtocol,
  PromptDescriptor,
  ResourceDescriptor,
} from '@mcp-b/webmcp-ts-sdk';
export type { ToolDescriptor } from '@mcp-b/webmcp-types';

// ============================================================================
// Prompt Hook Types
// ============================================================================

/**
 * Configuration options for the `useWebMCPPrompt` hook.
 * Defines a prompt's metadata, argument schema, and message generator.
 *
 * @template TArgsSchema - JSON Schema defining prompt arguments
 * @public
 *
 * @example
 * ```typescript
 * const config: WebMCPPromptConfig = {
 *   name: 'review_code',
 *   description: 'Review code for best practices',
 *   argsSchema: {
 *     type: 'object',
 *     properties: {
 *       code: { type: 'string', description: 'The code to review' },
 *       language: { type: 'string', description: 'Programming language' },
 *     },
 *     required: ['code'],
 *   } as const,
 *   get: async ({ code, language }) => ({
 *     messages: [{
 *       role: 'user',
 *       content: { type: 'text', text: `Review this ${language ?? ''} code:\n${code}` }
 *     }]
 *   }),
 * };
 * ```
 */
export interface WebMCPPromptConfig<TArgsSchema extends ReactWebMCPInputSchema = InputSchema> {
  /**
   * Unique identifier for the prompt (e.g., 'review_code', 'summarize_text').
   */
  name: string;

  /**
   * Optional description explaining what the prompt does.
   * This helps AI assistants understand when to use the prompt.
   */
  description?: string;

  /**
   * Optional JSON Schema defining the arguments for the prompt.
   * Use `as const` to enable type inference for the `get` function's arguments.
   */
  argsSchema?: TArgsSchema;

  /**
   * Function that generates the prompt messages.
   * Can be synchronous or asynchronous.
   *
   * @param args - Validated arguments matching the argsSchema
   * @returns Object containing the prompt messages
   */
  get: (
    args: InferToolInput<TArgsSchema>
  ) => Promise<{ messages: PromptMessage[] }> | { messages: PromptMessage[] };
}

/**
 * Return value from the `useWebMCPPrompt` hook.
 * Indicates whether the prompt is registered.
 *
 * @public
 */
export interface WebMCPPromptReturn {
  /**
   * Whether the prompt is currently registered with the Model Context API.
   */
  isRegistered: boolean;
}

// ============================================================================
// Resource Hook Types
// ============================================================================

/**
 * Configuration options for the `useWebMCPResource` hook.
 * Defines a resource's metadata and read handler.
 *
 * @public
 *
 * @example Static resource
 * ```typescript
 * const config: WebMCPResourceConfig = {
 *   uri: 'config://app-settings',
 *   name: 'App Settings',
 *   description: 'Application configuration',
 *   mimeType: 'application/json',
 *   read: async (uri) => ({
 *     contents: [{ uri: uri.href, text: JSON.stringify(settings) }]
 *   }),
 * };
 * ```
 *
 * @example Dynamic resource with URI template
 * ```typescript
 * const config: WebMCPResourceConfig = {
 *   uri: 'user://{userId}/profile',
 *   name: 'User Profile',
 *   description: 'User profile data',
 *   read: async (uri, params) => ({
 *     contents: [{
 *       uri: uri.href,
 *       text: JSON.stringify(await fetchUser(params?.userId ?? ''))
 *     }]
 *   }),
 * };
 * ```
 */
export interface WebMCPResourceConfig {
  /**
   * The resource URI or URI template.
   * - Static: "config://app-settings"
   * - Template: "user://{userId}/profile" where {userId} becomes a parameter
   */
  uri: string;

  /**
   * Human-readable name for the resource.
   */
  name: string;

  /**
   * Optional description of what the resource provides.
   */
  description?: string;

  /**
   * Optional MIME type of the resource content.
   */
  mimeType?: string;

  /**
   * Function that reads and returns the resource content.
   *
   * @param uri - The resolved URI being requested
   * @param params - Parameters extracted from URI template (if applicable)
   * @returns Resource contents with the data
   */
  read: (uri: URL, params?: Record<string, string>) => Promise<{ contents: ResourceContents[] }>;
}

/**
 * Return value from the `useWebMCPResource` hook.
 * Indicates whether the resource is registered.
 *
 * @public
 */
export interface WebMCPResourceReturn {
  /**
   * Whether the resource is currently registered with the Model Context API.
   */
  isRegistered: boolean;
}
