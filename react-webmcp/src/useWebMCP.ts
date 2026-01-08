import type { InputSchema } from '@mcp-b/global';
import { zodToJsonSchema } from '@mcp-b/global';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { DependencyList } from 'react';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { z } from 'zod';
import type { InferOutput, ToolExecutionState, WebMCPConfig, WebMCPReturn } from './types.js';

/**
 * Default output formatter that converts values to formatted JSON strings.
 *
 * String values are returned as-is; all other types are serialized to
 * indented JSON for readability.
 *
 * @internal
 */
function defaultFormatOutput(output: unknown): string {
  if (typeof output === 'string') {
    return output;
  }
  return JSON.stringify(output, null, 2);
}

/**
 * React hook for registering and managing Model Context Protocol (MCP) tools.
 *
 * This hook handles the complete lifecycle of an MCP tool:
 * - Registers the tool with `window.navigator.modelContext`
 * - Manages execution state (loading, results, errors)
 * - Validates input using Zod schemas
 * - Handles tool execution and lifecycle callbacks
 * - Automatically unregisters on component unmount
 * - Returns `structuredContent` when `outputSchema` is defined
 *
 * ## Output Schema (Recommended)
 *
 * Always define an `outputSchema` for your tools. This provides:
 * - **Type Safety**: Handler return type is inferred from the schema
 * - **MCP structuredContent**: AI models receive structured, typed data
 * - **Better AI Understanding**: Models can reason about your tool's output format
 *
 * ```tsx
 * useWebMCP({
 *   name: 'get_user',
 *   description: 'Get user by ID',
 *   inputSchema: { userId: z.string() },
 *   outputSchema: {
 *     id: z.string(),
 *     name: z.string(),
 *     email: z.string().email(),
 *   },
 *   handler: async ({ userId }) => {
 *     const user = await fetchUser(userId);
 *     return { id: user.id, name: user.name, email: user.email };
 *   },
 * });
 * ```
 *
 * ## Re-render Optimization
 *
 * This hook is optimized to minimize unnecessary tool re-registrations:
 *
 * - **Memoized JSON conversion**: Zod-to-JSON schema conversions are memoized to
 *   avoid recomputation on every render.
 *
 * - **Ref-based callbacks**: `handler`, `onSuccess`, `onError`, and `formatOutput`
 *   are stored in refs, so changing these functions won't trigger re-registration.
 *
 * **IMPORTANT**: If `inputSchema`, `outputSchema`, or `annotations` are defined inline
 * or change on every render, the tool will re-register unnecessarily. To avoid this,
 * memoize these values using `useMemo` or define them outside your component:
 *
 * ```tsx
 * // Good: Memoized schema (won't change unless deps change)
 * const outputSchema = useMemo(() => ({
 *   count: z.number(),
 *   items: z.array(z.string()),
 * }), []);
 *
 * // Good: Static schema defined outside component
 * const OUTPUT_SCHEMA = {
 *   count: z.number(),
 *   items: z.array(z.string()),
 * };
 *
 * // Bad: Inline schema (creates new object every render)
 * useWebMCP({
 *   outputSchema: { count: z.number() }, // Re-registers every render!
 * });
 * ```
 *
 * **What triggers re-registration:**
 * - Changes to `name` or `description`
 * - Changes to `inputSchema`, `outputSchema`, or `annotations` (reference comparison)
 * - Changes to any value in the `deps` argument (reference comparison)
 *
 * **What does NOT trigger re-registration:**
 * - Changes to `handler`, `onSuccess`, `onError`, or `formatOutput` functions
 *
 * @template TInputSchema - Zod schema object defining input parameter types
 * @template TOutputSchema - Zod schema object defining output structure (enables structuredContent)
 *
 * @param config - Configuration object for the tool
 * @param deps - Optional dependency array that triggers tool re-registration when values change.
 *   Similar to React's `useEffect` dependencies. When any value changes (by reference),
 *   the tool will be unregistered and re-registered. Prefer primitive values over
 *   objects/arrays to minimize re-registrations.
 *
 * @returns Object containing execution state and control methods
 *
 * @remarks
 * The hook uses React refs to store callbacks (`handler`, `onSuccess`, `onError`, `formatOutput`)
 * which prevents re-registration when these functions change. This is a performance optimization
 * that follows the "latest ref" pattern.
 *
 * When `outputSchema` is provided, the MCP response includes both text content and
 * `structuredContent` per the MCP specification. The type system ensures that the handler's
 * return type matches the output schema through Zod's type inference.
 *
 * @public
 *
 * @example
 * Basic tool with outputSchema (recommended):
 * ```tsx
 * function PostActions() {
 *   const likeTool = useWebMCP({
 *     name: 'posts_like',
 *     description: 'Like a post by ID',
 *     inputSchema: {
 *       postId: z.string().uuid().describe('The ID of the post to like'),
 *     },
 *     outputSchema: {
 *       success: z.boolean().describe('Whether the like was successful'),
 *       likeCount: z.number().describe('Updated like count'),
 *     },
 *     handler: async ({ postId }) => {
 *       const result = await api.posts.like(postId);
 *       return { success: true, likeCount: result.likes };
 *     },
 *   });
 *
 *   // likeTool.state.lastResult is typed as { success: boolean; likeCount: number } | null
 *   if (likeTool.state.isExecuting) {
 *     return <Spinner />;
 *   }
 *
 *   return <div>Likes: {likeTool.state.lastResult?.likeCount ?? 0}</div>;
 * }
 * ```
 *
 * @example
 * Tool with annotations and callbacks:
 * ```tsx
 * const deleteTool = useWebMCP({
 *   name: 'posts_delete',
 *   description: 'Delete a post permanently',
 *   inputSchema: {
 *     postId: z.string().uuid(),
 *   },
 *   outputSchema: {
 *     deleted: z.boolean(),
 *     deletedAt: z.string().describe('ISO timestamp of deletion'),
 *   },
 *   annotations: {
 *     destructiveHint: true,
 *     idempotentHint: false,
 *   },
 *   handler: async ({ postId }) => {
 *     await api.posts.delete(postId);
 *     return { deleted: true, deletedAt: new Date().toISOString() };
 *   },
 *   onSuccess: () => {
 *     navigate('/posts');
 *     toast.success('Post deleted');
 *   },
 *   onError: (error) => {
 *     toast.error(`Failed to delete: ${error.message}`);
 *   },
 * });
 * ```
 *
 * @example
 * Tool with deps for automatic re-registration:
 * ```tsx
 * function SitesManager({ sites }: { sites: Site[] }) {
 *   // Without deps, you'd need getter functions like: getSiteCount: () => sites.length
 *   // With deps, values can be used directly in description and handler
 *   const sitesTool = useWebMCP(
 *     {
 *       name: 'sites_query',
 *       description: `Query available sites. Current count: ${sites.length}`,
 *       outputSchema: {
 *         count: z.number(),
 *         sites: z.array(z.object({ id: z.string(), name: z.string() })),
 *       },
 *       handler: async () => ({
 *         count: sites.length,
 *         sites: sites.map(s => ({ id: s.id, name: s.name })),
 *       }),
 *     },
 *     [sites] // Re-register tool when sites array changes (by reference)
 *   );
 *
 *   return <SitesList sites={sites} />;
 * }
 * ```
 *
 * @example
 * Optimizing with memoization and deps:
 * ```tsx
 * function OptimizedSites({ sites }: { sites: Site[] }) {
 *   // Memoize schema to prevent re-registration on every render
 *   const outputSchema = useMemo(() => ({
 *     sites: z.array(z.object({ id: z.string(), name: z.string() })),
 *   }), []);
 *
 *   // Use primitive values in deps for better control
 *   const siteIds = sites.map(s => s.id).join(',');
 *   const siteCount = sites.length;
 *
 *   const sitesTool = useWebMCP(
 *     {
 *       name: 'sites_query',
 *       description: `Query ${siteCount} available sites`,
 *       outputSchema,
 *       handler: async () => ({
 *         sites: sites.map(s => ({ id: s.id, name: s.name })),
 *       }),
 *     },
 *     [siteIds, siteCount] // Only re-register when IDs or count actually change
 *   );
 *
 *   return <SitesList sites={sites} />;
 * }
 * ```
 */
export function useWebMCP<
  TInputSchema extends Record<string, z.ZodTypeAny> = Record<string, never>,
  TOutputSchema extends Record<string, z.ZodTypeAny> = Record<string, never>,
>(
  config: WebMCPConfig<TInputSchema, TOutputSchema>,
  deps?: DependencyList
): WebMCPReturn<TOutputSchema> {
  type TOutput = InferOutput<TOutputSchema>;
  type TInput = z.infer<z.ZodObject<TInputSchema>>;

  const {
    name,
    description,
    inputSchema,
    outputSchema,
    annotations,
    handler,
    formatOutput = defaultFormatOutput,
    onSuccess,
    onError,
  } = config;

  const [state, setState] = useState<ToolExecutionState<TOutput>>({
    isExecuting: false,
    lastResult: null,
    error: null,
    executionCount: 0,
  });

  const handlerRef = useRef(handler);
  const onSuccessRef = useRef(onSuccess);
  const onErrorRef = useRef(onError);
  const formatOutputRef = useRef(formatOutput);

  useLayoutEffect(() => {
    handlerRef.current = handler;
    onSuccessRef.current = onSuccess;
    onErrorRef.current = onError;
    formatOutputRef.current = formatOutput;
  });

  const inputJsonSchema = useMemo(
    () => (inputSchema ? zodToJsonSchema(inputSchema) : undefined),
    [inputSchema]
  );
  const outputJsonSchema = useMemo(
    () => (outputSchema ? zodToJsonSchema(outputSchema) : undefined),
    [outputSchema]
  );

  const validator = useMemo(() => (inputSchema ? z.object(inputSchema) : null), [inputSchema]);

  /**
   * Executes the tool handler with input validation and state management.
   *
   * @param input - The input parameters to validate and pass to the handler
   * @returns Promise resolving to the handler's output
   * @throws Error if validation fails or the handler throws
   */
  const execute = useCallback(
    async (input: unknown): Promise<TOutput> => {
      setState((prev) => ({
        ...prev,
        isExecuting: true,
        error: null,
      }));

      try {
        const validatedInput: TInput = validator ? validator.parse(input) : (input as TInput);
        const result = await handlerRef.current(validatedInput);

        setState((prev) => ({
          isExecuting: false,
          lastResult: result,
          error: null,
          executionCount: prev.executionCount + 1,
        }));

        if (onSuccessRef.current) {
          onSuccessRef.current(result, input);
        }

        return result;
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));

        setState((prev) => ({
          ...prev,
          isExecuting: false,
          error: err,
        }));

        if (onErrorRef.current) {
          onErrorRef.current(err, input);
        }

        throw err;
      }
    },
    [validator]
  );

  /**
   * Resets the execution state to initial values.
   */
  const reset = useCallback(() => {
    setState({
      isExecuting: false,
      lastResult: null,
      error: null,
      executionCount: 0,
    });
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.navigator?.modelContext) {
      console.warn(
        `[useWebMCP] window.navigator.modelContext is not available. Tool "${name}" will not be registered.`
      );
      return;
    }

    /**
     * Handles MCP tool execution by running the handler and formatting the response.
     *
     * @param input - The input parameters from the MCP client
     * @returns CallToolResult with text content and optional structuredContent
     */
    const mcpHandler = async (input: unknown): Promise<CallToolResult> => {
      try {
        const result = await execute(input);
        const formattedOutput = formatOutputRef.current(result);

        const response: CallToolResult = {
          content: [
            {
              type: 'text',
              text: formattedOutput,
            },
          ],
        };

        if (outputJsonSchema) {
          response.structuredContent = result as Record<string, unknown>;
        }

        return response;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);

        return {
          content: [
            {
              type: 'text',
              text: `Error: ${errorMessage}`,
            },
          ],
          isError: true,
        };
      }
    };

    const fallbackInputSchema: InputSchema = {
      type: 'object',
      properties: {},
    };

    const registration = window.navigator.modelContext.registerTool({
      name,
      description,
      inputSchema: (inputJsonSchema || fallbackInputSchema) as InputSchema,
      ...(outputJsonSchema && { outputSchema: outputJsonSchema as InputSchema }),
      ...(annotations && { annotations }),
      execute: mcpHandler,
    });

    return () => {
      registration?.unregister();
    };
  }, [name, description, inputJsonSchema, outputJsonSchema, annotations, execute, ...(deps ?? [])]);

  return {
    state,
    execute,
    reset,
  };
}
