import type { InputSchema } from '@mcp-b/global';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { useCallback, useEffect, useRef, useState } from 'react';
import { z } from 'zod';
import type { ToolExecutionState, WebMCPConfig, WebMCPReturn } from './types.js';

/**
 * Converts a Zod schema object to JSON Schema format for MCP.
 * Handles basic type inference for common Zod types.
 *
 * @internal
 * @param schema - Record of Zod type definitions
 * @returns JSON Schema object with type, properties, and required fields
 */
function zodToJsonSchema(schema: Record<string, z.ZodTypeAny>): {
  type: string;
  properties?: Record<string, unknown>;
  required?: string[];
} {
  const properties: Record<string, unknown> = {};
  const required: string[] = [];

  for (const [key, zodType] of Object.entries(schema)) {
    const description = (zodType as { description?: string }).description || undefined;

    let type = 'string';
    if (zodType instanceof z.ZodNumber) {
      type = 'number';
    } else if (zodType instanceof z.ZodBoolean) {
      type = 'boolean';
    } else if (zodType instanceof z.ZodArray) {
      type = 'array';
    } else if (zodType instanceof z.ZodObject) {
      type = 'object';
    }

    properties[key] = {
      type,
      ...(description && { description }),
    };

    if (!zodType.isOptional()) {
      required.push(key);
    }
  }

  return {
    type: 'object',
    properties,
    ...(required.length > 0 && { required }),
  };
}

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
 *
 * @template TInputSchema - Zod schema object defining input parameter types
 * @template TOutput - Type of data returned by the handler function
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
  TOutput = string,
>(config: WebMCPConfig<TInputSchema, TOutput>): WebMCPReturn<TOutput> {
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

  const validator = inputSchema ? z.object(inputSchema) : null;

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
        const validatedInput = validator ? validator.parse(input) : input;
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

    const inputJsonSchema = inputSchema ? zodToJsonSchema(inputSchema) : undefined;
    const outputJsonSchema = outputSchema ? zodToJsonSchema(outputSchema) : undefined;

    const mcpHandler = async (input: unknown, _extra: unknown): Promise<CallToolResult> => {
      try {
        const result = await execute(input);
        const formattedOutput = formatOutputRef.current(result);

        return {
          content: [
            {
              type: 'text',
              text: formattedOutput,
            },
          ],
        };
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
  }, [name, description, inputSchema, outputSchema, annotations, execute]);

  return {
    state,
    execute,
    reset,
  };
}
