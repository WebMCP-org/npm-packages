import type { InputSchema } from '@mcp-b/global';
import { zodToJsonSchema } from '@mcp-b/global';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
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
 * React hook for registering and managing Model Context Protocol (MCP) tools.
 *
 * This hook handles the complete lifecycle of an MCP tool:
 * - Registers the tool with `window.navigator.modelContext`
 * - Manages execution state (loading, results, errors)
 * - Validates input using Zod schemas
 * - Handles tool execution and lifecycle callbacks
 * - Automatically unregisters on component unmount
 * - Properly returns `structuredContent` when `outputSchema` is defined
 *
 * @template TInputSchema - Zod schema object defining input parameter types
 * @template TOutputSchema - Zod schema object defining output structure (enables structuredContent)
 *
 * @param config - Configuration object for the tool
 * @returns Object containing execution state and control methods
 *
 * @public
 *
 * @example
 * Basic tool registration:
 * ```tsx
 * function PostActions() {
 *   const likeTool = useWebMCP({
 *     name: 'posts_like',
 *     description: 'Like a post by ID',
 *     inputSchema: {
 *       postId: z.string().uuid().describe('The ID of the post to like'),
 *     },
 *     handler: async ({ postId }) => {
 *       await api.posts.like(postId);
 *       return { success: true, postId };
 *     },
 *   });
 *
 *   if (likeTool.state.isExecuting) {
 *     return <Spinner />;
 *   }
 *
 *   return <div>Post actions ready</div>;
 * }
 * ```
 *
 * @example
 * Tool with outputSchema (enables MCP structuredContent):
 * ```tsx
 * const counterTool = useWebMCP({
 *   name: 'counter_get',
 *   description: 'Get the current counter value',
 *   outputSchema: {
 *     counter: z.number().describe('Current counter value'),
 *     timestamp: z.string().describe('ISO timestamp'),
 *   },
 *   handler: async () => {
 *     // Return type is inferred from outputSchema
 *     return { counter: getCounter(), timestamp: new Date().toISOString() };
 *   },
 * });
 *
 * // counterTool.state.lastResult is typed as { counter: number; timestamp: string } | null
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
 *   annotations: {
 *     destructiveHint: true,
 *     idempotentHint: false,
 *   },
 *   handler: async ({ postId }) => {
 *     await api.posts.delete(postId);
 *     return { deleted: true };
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
 */
export function useWebMCP<
  TInputSchema extends Record<string, z.ZodTypeAny> = Record<string, never>,
  TOutputSchema extends Record<string, z.ZodTypeAny> = Record<string, never>,
>(config: WebMCPConfig<TInputSchema, TOutputSchema>): WebMCPReturn<TOutputSchema> {
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

  useEffect(() => {
    if (typeof window === 'undefined' || !window.navigator?.modelContext) {
      console.warn(
        `[useWebMCP] window.navigator.modelContext is not available. Tool "${name}" will not be registered.`
      );
      return;
    }

    const inputJsonSchema = inputSchema ? zodToJsonSchema(inputSchema) : undefined;
    const outputJsonSchema = outputSchema ? zodToJsonSchema(outputSchema) : undefined;

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
      execute: async (args: Record<string, unknown>) => {
        const result = await mcpHandler(args, {});
        return result;
      },
    });

    console.log(`[useWebMCP] Registered tool: ${name}`);

    return () => {
      if (registration) {
        registration.unregister();
        console.log(`[useWebMCP] Unregistered tool: ${name}`);
      }
    };
    // Note: execute is intentionally omitted - it's stable (empty deps) and uses refs internally
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name, description, inputSchema, outputSchema, annotations]);

  return {
    state,
    execute,
    reset,
  };
}
