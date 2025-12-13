import type { InputSchema } from '@mcp-b/global';
import { zodToJsonSchema } from '@mcp-b/global';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { DependencyList } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { z } from 'zod';
import type { InferOutput, ToolExecutionState, WebMCPConfig, WebMCPReturn } from './types.js';

/**
 * Default output formatter that converts values to formatted JSON strings.
 *
 * @internal
 * @param output - The value to format
 * @returns Formatted string representation
 */
function defaultFormatOutput(output: unknown): string {
  if (typeof output === 'string') {
    return output;
  }
  return JSON.stringify(output, null, 2);
}

/**
 * Converts a value to a stable JSON string for dependency comparison.
 * Returns undefined for undefined values to avoid unnecessary re-registrations.
 *
 * @internal
 * @param value - The value to serialize
 * @returns Stable JSON string or undefined
 */
function stableStringify(value: unknown): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (value === null) {
    return 'null';
  }
  try {
    // Sort object keys for consistent serialization
    return JSON.stringify(value, (_, v) => {
      if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
        return Object.keys(v)
          .sort()
          .reduce(
            (sorted, key) => {
              sorted[key] = v[key];
              return sorted;
            },
            {} as Record<string, unknown>
          );
      }
      return v;
    });
  } catch {
    // Non-serializable values (functions, circular refs, symbols) cannot be
    // reliably compared. Return undefined to force re-registration on every
    // render when such values are present. This is a safe fallback since
    // JSON schemas from Zod should always be serializable.
    return undefined;
  }
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
 * This hook is optimized to minimize unnecessary tool re-registrations, which
 * trigger JSON-RPC updates. Key optimizations include:
 *
 * - **Stable schema comparison**: `inputSchema`, `outputSchema`, and `annotations`
 *   are compared by content (JSON serialization), not reference. This means passing
 *   a new object with the same content won't trigger re-registration.
 *
 * - **Memoized JSON conversion**: Zod-to-JSON schema conversions are memoized to
 *   avoid recomputation on every render.
 *
 * - **Ref-based callbacks**: `handler`, `onSuccess`, `onError`, and `formatOutput`
 *   are stored in refs, so changing these functions won't trigger re-registration.
 *
 * **What triggers re-registration:**
 * - Changes to `name` or `description` (string comparison)
 * - Changes to schema/annotation content (deep comparison via JSON serialization)
 * - Changes to any value in the `deps` argument (reference comparison)
 *
 * **What does NOT trigger re-registration:**
 * - New object references with identical content for schemas/annotations
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
 * @returns Object containing execution state and control methods
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
 * Optimizing deps to minimize re-registrations:
 * ```tsx
 * function OptimizedSites({ sites }: { sites: Site[] }) {
 *   // BAD: Using the whole array causes re-registration on every render
 *   // if the array reference changes (e.g., from API response)
 *   // useWebMCP(config, [sites])
 *
 *   // GOOD: Use primitive values that only change when content changes
 *   const siteIds = sites.map(s => s.id).join(',');
 *   const siteCount = sites.length;
 *
 *   const sitesTool = useWebMCP(
 *     {
 *       name: 'sites_query',
 *       description: `Query ${siteCount} available sites`,
 *       outputSchema: {
 *         sites: z.array(z.object({ id: z.string(), name: z.string() })),
 *       },
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
  /** Inferred output type from the schema */
  type TOutput = InferOutput<TOutputSchema>;
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

  useEffect(() => {
    handlerRef.current = handler;
  }, [handler]);

  useEffect(() => {
    onSuccessRef.current = onSuccess;
  }, [onSuccess]);

  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);

  useEffect(() => {
    formatOutputRef.current = formatOutput;
  }, [formatOutput]);

  // Memoize JSON schemas to avoid recomputation on every render
  // These are derived from Zod schemas and used for MCP registration
  const inputJsonSchema = useMemo(
    () => (inputSchema ? zodToJsonSchema(inputSchema) : undefined),
    [inputSchema]
  );
  const outputJsonSchema = useMemo(
    () => (outputSchema ? zodToJsonSchema(outputSchema) : undefined),
    [outputSchema]
  );

  // Store schemas in refs so the effect can access them without direct dependencies
  // This allows us to use stable serialized strings for dependency comparison
  const inputJsonSchemaRef = useRef(inputJsonSchema);
  const outputJsonSchemaRef = useRef(outputJsonSchema);
  const annotationsRef = useRef(annotations);

  useEffect(() => {
    inputJsonSchemaRef.current = inputJsonSchema;
  }, [inputJsonSchema]);

  useEffect(() => {
    outputJsonSchemaRef.current = outputJsonSchema;
  }, [outputJsonSchema]);

  useEffect(() => {
    annotationsRef.current = annotations;
  }, [annotations]);

  // Create stable string representations for dependency comparison
  // This prevents unnecessary re-registrations when object references change
  // but content remains the same
  const inputSchemaKey = useMemo(() => stableStringify(inputJsonSchema), [inputJsonSchema]);
  const outputSchemaKey = useMemo(() => stableStringify(outputJsonSchema), [outputJsonSchema]);
  const annotationsKey = useMemo(() => stableStringify(annotations), [annotations]);

  // Memoize validator to prevent recreation on every render
  // This ensures execute callback and registration effect have stable dependencies
  const validator = useMemo(() => (inputSchema ? z.object(inputSchema) : null), [inputSchema]);

  // Store validator in ref to avoid execute callback dependency
  const validatorRef = useRef(validator);
  useEffect(() => {
    validatorRef.current = validator;
  }, [validator]);

  /**
   * Executes the tool handler with input validation and state management.
   *
   * @param input - The input parameters to validate and pass to the handler
   * @returns Promise resolving to the handler's output
   * @throws Error if validation fails or the handler throws
   */
  const execute = useCallback(async (input: unknown): Promise<TOutput> => {
    setState((prev) => ({
      ...prev,
      isExecuting: true,
      error: null,
    }));

    try {
      const currentValidator = validatorRef.current;
      const validatedInput = currentValidator ? currentValidator.parse(input) : input;
      const result = await handlerRef.current(validatedInput as never);

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
  }, []);

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

  // biome-ignore lint/correctness/useExhaustiveDependencies: Uses refs for latest values while stable keys trigger re-registration; execute is stable; deps is user-controlled
  useEffect(() => {
    if (typeof window === 'undefined' || !window.navigator?.modelContext) {
      console.warn(
        `[useWebMCP] window.navigator.modelContext is not available. Tool "${name}" will not be registered.`
      );
      return;
    }

    // Use refs to get the latest schema values - the stable keys ensure
    // we only re-register when content actually changes
    const currentInputSchema = inputJsonSchemaRef.current;
    const currentOutputSchema = outputJsonSchemaRef.current;
    const currentAnnotations = annotationsRef.current;

    const mcpHandler = async (input: unknown, _extra: unknown): Promise<CallToolResult> => {
      try {
        const result = await execute(input);
        const formattedOutput = formatOutputRef.current(result);

        // Build the MCP response with text content
        const response: CallToolResult = {
          content: [
            {
              type: 'text',
              text: formattedOutput,
            },
          ],
        };

        // When outputSchema is defined, include structuredContent per MCP specification.
        // The type assertion is safe because:
        // 1. outputSchema uses Zod schema, which always produces object types
        // 2. WebMCPConfig constrains handler return type to match outputSchema via InferOutput
        // 3. The MCP SDK's structuredContent type is Record<string, unknown>
        // Therefore, result is always assignable to Record<string, unknown> when outputSchema exists.
        if (currentOutputSchema) {
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
      inputSchema: (currentInputSchema || fallbackInputSchema) as InputSchema,
      ...(currentOutputSchema && { outputSchema: currentOutputSchema as InputSchema }),
      ...(currentAnnotations && { annotations: currentAnnotations }),
      execute: async (args: Record<string, unknown>) => {
        const result = await mcpHandler(args, {});
        return result;
      },
    });

    return () => {
      if (registration) {
        registration.unregister();
      }
    };
    // Dependencies use stable string keys for object comparison to prevent
    // unnecessary re-registrations when object references change but content is the same.
    // execute is intentionally omitted - it's stable (empty deps) and uses refs internally.
    // deps is spread to allow user-controlled re-registration triggers.
  }, [name, description, inputSchemaKey, outputSchemaKey, annotationsKey, ...(deps ?? [])]);

  return {
    state,
    execute,
    reset,
  };
}
