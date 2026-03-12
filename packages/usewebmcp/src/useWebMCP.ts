import type { ToolInputSchema } from '@mcp-b/webmcp-polyfill';
import type {
  CallToolResult,
  InputSchema,
  JsonSchemaObject,
  ToolDescriptor,
} from '@mcp-b/webmcp-types';
import type { DependencyList } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  InferOutput,
  InferToolInput,
  ToolExecutionState,
  WebMCPConfig,
  WebMCPReturn,
} from './types.js';

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

const TOOL_OWNER_BY_NAME = new Map<string, symbol>();
type StructuredContent = Exclude<CallToolResult['structuredContent'], undefined>;
type CompatModelContext = Navigator['modelContext'] & {
  registerTool: (tool: ToolDescriptor) => { unregister: () => void } | undefined;
  unregisterTool: (name: string) => void;
};

function toStructuredContent(value: unknown): StructuredContent | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  try {
    const normalized = JSON.parse(JSON.stringify(value)) as unknown;
    if (!normalized || typeof normalized !== 'object' || Array.isArray(normalized)) {
      return null;
    }
    return normalized as StructuredContent;
  } catch {
    return null;
  }
}

function isDev(): boolean {
  const env = (globalThis as { process?: { env?: { NODE_ENV?: string } } }).process?.env?.NODE_ENV;
  return env !== undefined ? env !== 'production' : false;
}

/**
 * React hook for registering and managing Model Context Protocol (MCP) tools.
 *
 * This hook handles the complete lifecycle of an MCP tool:
 * - Registers the tool with `window.navigator.modelContext`
 * - Manages execution state (loading, results, errors)
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
 *   inputSchema: {
 *     type: 'object',
 *     properties: { userId: { type: 'string' } },
 *     required: ['userId'],
 *   } as const,
 *   outputSchema: {
 *     type: 'object',
 *     properties: {
 *       id: { type: 'string' },
 *       name: { type: 'string' },
 *       email: { type: 'string' },
 *     },
 *   } as const,
 *   execute: async ({ userId }) => {
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
 * - **Ref-based callbacks**: `execute`/`handler`, `onSuccess`, `onError`, and `formatOutput`
 *   are stored in refs, so changing these functions won't trigger re-registration.
 * - **Structural comparison**: `inputSchema`, `outputSchema`, and `annotations` are compared
 *   by value (via JSON serialization), so inline objects with identical content won't
 *   trigger re-registration.
 *
 * @template TInputSchema - JSON Schema defining input parameter types (use `as const` for inference)
 * @template TOutputSchema - JSON Schema object defining output structure (enables structuredContent)
 *
 * @param config - Configuration object for the tool
 * @param deps - Optional dependency array that triggers tool re-registration when values change.
 *
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
 *       type: 'object',
 *       properties: { postId: { type: 'string', description: 'The post ID' } },
 *       required: ['postId'],
 *     } as const,
 *     outputSchema: {
 *       type: 'object',
 *       properties: {
 *         success: { type: 'boolean' },
 *         likeCount: { type: 'number' },
 *       },
 *     } as const,
 *     execute: async ({ postId }) => {
 *       const result = await api.posts.like(postId);
 *       return { success: true, likeCount: result.likes };
 *     },
 *   });
 *
 *   return <div>Likes: {likeTool.state.lastResult?.likeCount ?? 0}</div>;
 * }
 * ```
 */
export function useWebMCP<
  TInputSchema extends ToolInputSchema = InputSchema,
  TOutputSchema extends JsonSchemaObject | undefined = undefined,
>(
  config: WebMCPConfig<TInputSchema, TOutputSchema>,
  deps?: DependencyList
): WebMCPReturn<TOutputSchema> {
  type TOutput = InferOutput<TOutputSchema>;
  type TInput = InferToolInput<TInputSchema>;
  const {
    name,
    description,
    inputSchema,
    outputSchema,
    annotations,
    execute: configExecute,
    handler: legacyHandler,
    formatOutput = defaultFormatOutput,
    enabled = true,
    onStart,
    onSuccess,
    onError,
  } = config;
  const toolExecute = configExecute ?? legacyHandler;

  if (!toolExecute) {
    throw new TypeError(
      `[useWebMCP] Tool "${name}" must provide an implementation via config.execute or config.handler`
    );
  }

  const [state, setState] = useState<ToolExecutionState<TOutput>>({
    isExecuting: false,
    lastResult: null,
    error: null,
    executionCount: 0,
  });

  // Stable serialized keys for object deps — prevents re-registration when
  // structurally identical objects are passed inline on every render.
  const inputSchemaKey = useMemo(
    () => (inputSchema != null ? JSON.stringify(inputSchema) : undefined),
    [inputSchema]
  );
  const outputSchemaKey = useMemo(
    () => (outputSchema != null ? JSON.stringify(outputSchema) : undefined),
    [outputSchema]
  );
  const annotationsKey = useMemo(
    () => (annotations != null ? JSON.stringify(annotations) : undefined),
    [annotations]
  );

  const toolExecuteRef = useRef(toolExecute);
  const onStartRef = useRef(onStart);
  const onSuccessRef = useRef(onSuccess);
  const onErrorRef = useRef(onError);
  const formatOutputRef = useRef(formatOutput);
  const inputSchemaRef = useRef(inputSchema);
  const outputSchemaRef = useRef(outputSchema);
  const annotationsRef = useRef(annotations);
  const isMountedRef = useRef(true);
  const warnedRef = useRef(new Set<string>());
  const prevConfigRef = useRef({
    inputSchema,
    outputSchema,
    annotations,
    description,
    deps,
  });
  // Update refs when callbacks/values change (doesn't trigger re-registration)
  useEffect(() => {
    toolExecuteRef.current = toolExecute;
    onStartRef.current = onStart;
    onSuccessRef.current = onSuccess;
    onErrorRef.current = onError;
    formatOutputRef.current = formatOutput;
    inputSchemaRef.current = inputSchema;
    outputSchemaRef.current = outputSchema;
    annotationsRef.current = annotations;
  }, [
    toolExecute,
    onStart,
    onSuccess,
    onError,
    formatOutput,
    inputSchema,
    outputSchema,
    annotations,
  ]);

  // Cleanup: mark component as unmounted
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!isDev()) {
      prevConfigRef.current = { inputSchema, outputSchema, annotations, description, deps };
      return;
    }

    const warnOnce = (key: string, message: string) => {
      if (warnedRef.current.has(key)) {
        return;
      }
      console.warn(`[useWebMCP] ${message}`);
      warnedRef.current.add(key);
    };

    const prev = prevConfigRef.current;

    if (description !== prev.description) {
      warnOnce(
        'description',
        `Tool "${name}" description changed; this re-registers the tool. Memoize the description if it does not need to update.`
      );
    }

    if (
      deps?.some(
        (value) => (typeof value === 'object' && value !== null) || typeof value === 'function'
      )
    ) {
      warnOnce(
        'deps',
        `Tool "${name}" deps contains non-primitive values; prefer primitives or memoize objects/functions to reduce re-registration.`
      );
    }

    prevConfigRef.current = { inputSchema, outputSchema, annotations, description, deps };
  }, [annotations, deps, description, inputSchema, name, outputSchema]);

  /**
   * Executes the configured tool implementation with input validation and state management.
   *
   * @param input - The input parameters to validate and pass to the tool implementation
   * @returns Promise resolving to the tool output
   * @throws Error if validation fails or the tool implementation throws
   */
  const execute = useCallback(async (input: unknown): Promise<TOutput> => {
    try {
      setState((prev) => ({
        ...prev,
        isExecuting: true,
        error: null,
      }));

      const typedInput = input as TInput;

      onStartRef.current?.(typedInput);

      const result = await toolExecuteRef.current(typedInput);

      // Only update state if component is still mounted
      if (isMountedRef.current) {
        setState((prev) => ({
          isExecuting: false,
          lastResult: result,
          error: null,
          executionCount: prev.executionCount + 1,
        }));
      }

      if (onSuccessRef.current) {
        onSuccessRef.current(result, typedInput);
      }

      return result;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));

      // Only update state if component is still mounted
      if (isMountedRef.current) {
        setState((prev) => ({
          ...prev,
          isExecuting: false,
          error: err,
        }));
      }

      if (onErrorRef.current) {
        onErrorRef.current(err, input as TInput);
      }

      throw err;
    }
  }, []);
  const executeRef = useRef(execute);

  useEffect(() => {
    executeRef.current = execute;
  }, [execute]);

  const stableExecute = useCallback(
    (input: unknown): Promise<TOutput> => executeRef.current(input),
    []
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
    // These keys are derived from JSON.stringify of the schemas/annotations.
    // Reading them here ensures the effect re-runs on structural changes,
    // while refs hold the latest values for registration.
    void inputSchemaKey;
    void outputSchemaKey;
    void annotationsKey;

    if (!enabled) {
      return;
    }

    if (typeof window === 'undefined' || !window.navigator?.modelContext) {
      console.warn(
        `[useWebMCP] window.navigator.modelContext is not available. Tool "${name}" will not be registered.`
      );
      return;
    }

    /**
     * Handles MCP tool execution by running the tool implementation and formatting the response.
     *
     * @param input - The input parameters from the MCP client
     * @returns CallToolResult with text content and optional structuredContent
     */
    const mcpHandler = async (input: unknown): Promise<CallToolResult> => {
      try {
        const result = await executeRef.current(input);
        const formattedOutput = formatOutputRef.current(result);

        const response: CallToolResult = {
          content: [
            {
              type: 'text',
              text: formattedOutput,
            },
          ],
        };

        if (outputSchemaRef.current) {
          const structuredContent = toStructuredContent(result);
          if (!structuredContent) {
            throw new Error(
              `Tool "${name}" outputSchema requires the tool implementation to return a JSON object result`
            );
          }
          response.structuredContent = structuredContent;
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

    const currentInputSchema = inputSchemaRef.current;
    const currentOutputSchema = outputSchemaRef.current;
    const currentAnnotations = annotationsRef.current;

    const ownerToken = Symbol(name);
    const modelContext = window.navigator.modelContext as CompatModelContext;
    const toolDescriptor: ToolDescriptor = {
      name,
      description,
      ...(currentInputSchema && { inputSchema: currentInputSchema as InputSchema }),
      ...(currentOutputSchema && { outputSchema: currentOutputSchema as InputSchema }),
      ...(currentAnnotations && { annotations: currentAnnotations }),
      execute: mcpHandler,
    };

    const registration = modelContext.registerTool(toolDescriptor);
    TOOL_OWNER_BY_NAME.set(name, ownerToken);

    return () => {
      const currentOwner = TOOL_OWNER_BY_NAME.get(name);
      if (currentOwner !== ownerToken) {
        return;
      }

      TOOL_OWNER_BY_NAME.delete(name);
      try {
        if (registration && typeof registration.unregister === 'function') {
          registration.unregister();
          return;
        }

        modelContext.unregisterTool(name);
      } catch (error) {
        if (isDev()) {
          console.warn(`[useWebMCP] Failed to unregister tool "${name}" during cleanup:`, error);
        }
      }
    };
  }, [
    name,
    description,
    inputSchemaKey,
    outputSchemaKey,
    annotationsKey,
    enabled,
    ...(deps ?? []),
  ]);

  return {
    state,
    execute: stableExecute,
    reset,
  };
}
