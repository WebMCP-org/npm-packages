import type { CallToolResult, InputSchema, ModelContext } from '@mcp-b/global';
import type { JsonSchemaObject, ToolDescriptor } from '@mcp-b/webmcp-types';
import type { DependencyList } from 'react';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type {
  InferOutput,
  InferToolInput,
  ReactWebMCPInputSchema,
  ToolExecutionState,
  WebMCPConfig,
  WebMCPReturn,
} from './types.js';
import { isZodSchema, zodToJsonSchema } from './zod-utils.js';

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

const useIsomorphicLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

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
 *   handler: async ({ userId }) => {
 *     const user = await fetchUser(userId);
 *     return { id: user.id, name: user.name, email: user.email };
 *   },
 * });
 * ```
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
 */
export function useWebMCP<
  TInputSchema extends ReactWebMCPInputSchema = InputSchema,
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
  const isMountedRef = useRef(true);
  const warnedRef = useRef(new Set<string>());
  const prevConfigRef = useRef({
    inputSchema,
    outputSchema,
    annotations,
    description,
    deps,
  });
  // Update refs when callbacks change (doesn't trigger re-registration)
  useIsomorphicLayoutEffect(() => {
    handlerRef.current = handler;
    onSuccessRef.current = onSuccess;
    onErrorRef.current = onError;
    formatOutputRef.current = formatOutput;
  }, [handler, onSuccess, onError, formatOutput]);

  // Cleanup: mark component as unmounted
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    const warnOnce = (key: string, message: string) => {
      if (warnedRef.current.has(key)) {
        return;
      }
      warnedRef.current.add(key);
    };

    const prev = prevConfigRef.current;

    if (inputSchema && prev.inputSchema && prev.inputSchema !== inputSchema) {
      warnOnce(
        'inputSchema',
        `Tool "${name}" inputSchema reference changed; memoize or define it outside the component to avoid re-registration.`
      );
    }

    if (outputSchema && prev.outputSchema && prev.outputSchema !== outputSchema) {
      warnOnce(
        'outputSchema',
        `Tool "${name}" outputSchema reference changed; memoize or define it outside the component to avoid re-registration.`
      );
    }

    if (annotations && prev.annotations && prev.annotations !== annotations) {
      warnOnce(
        'annotations',
        `Tool "${name}" annotations reference changed; memoize or define it outside the component to avoid re-registration.`
      );
    }

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
      const result = await handlerRef.current(input as TInput);

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
        onSuccessRef.current(result, input);
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
        onErrorRef.current(err, input);
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
    if (typeof window === 'undefined' || !window.navigator?.modelContext) {
      console.warn(
        `window.navigator.modelContext is not available. Tool "${name}" will not be registered.`
      );
      return;
    }
    const modelContext = window.navigator.modelContext as ModelContext;

    /**
     * Handles MCP tool execution by running the handler and formatting the response.
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

        if (outputSchema) {
          const structuredContent = toStructuredContent(result);
          if (!structuredContent) {
            throw new Error(
              `Tool "${name}" outputSchema requires the handler to return a JSON object result`
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

    const resolvedInputSchema = inputSchema
      ? isZodSchema(inputSchema)
        ? zodToJsonSchema(inputSchema)
        : (inputSchema as InputSchema)
      : undefined;

    const ownerToken = Symbol(name);
    (modelContext.registerTool as (tool: ToolDescriptor) => void)({
      name,
      description,
      ...(resolvedInputSchema && { inputSchema: resolvedInputSchema }),
      ...(outputSchema && { outputSchema: outputSchema as InputSchema }),
      ...(annotations && { annotations }),
      execute: mcpHandler,
    });
    TOOL_OWNER_BY_NAME.set(name, ownerToken);

    return () => {
      const currentOwner = TOOL_OWNER_BY_NAME.get(name);
      if (currentOwner !== ownerToken) {
        return;
      }

      TOOL_OWNER_BY_NAME.delete(name);
      try {
        modelContext.unregisterTool(name);
      } catch (error) {}
    };
    // Spread operator in dependencies: Allows users to provide additional dependencies
    // via the `deps` parameter. While unconventional, this pattern is intentional to support
    // dynamic dependency injection. The spread is safe because deps is validated and warned
    // about non-primitive values earlier in this hook.
  }, [name, description, inputSchema, outputSchema, annotations, ...(deps ?? [])]);

  return {
    state,
    execute: stableExecute,
    reset,
  };
}
