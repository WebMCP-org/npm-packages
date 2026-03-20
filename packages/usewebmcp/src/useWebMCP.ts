import type { ToolInputSchema } from '@mcp-b/webmcp-polyfill';
import type {
  CallToolResult,
  InputSchema,
  JsonObject,
  JsonSchemaForInference,
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
const DEFAULT_REGISTERED_INPUT_SCHEMA: InputSchema = { type: 'object', properties: {} };
const STANDARD_JSON_SCHEMA_TARGETS = ['draft-2020-12', 'draft-07'] as const;
type StructuredContent = Exclude<CallToolResult['structuredContent'], undefined>;

function isObjectOutputSchema(schema: JsonSchemaForInference | undefined): boolean {
  return schema?.type === 'object';
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isInputSchema(value: unknown): value is InputSchema {
  if (!isPlainObject(value)) {
    return false;
  }

  if ('type' in value && value.type !== undefined && typeof value.type !== 'string') {
    return false;
  }

  if ('properties' in value && value.properties !== undefined && !isPlainObject(value.properties)) {
    return false;
  }

  if (
    'required' in value &&
    value.required !== undefined &&
    (!Array.isArray(value.required) || value.required.some((entry) => typeof entry !== 'string'))
  ) {
    return false;
  }

  return true;
}

function isJsonValue(value: unknown): boolean {
  if (value === null) {
    return true;
  }

  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return true;
  }

  if (Array.isArray(value)) {
    return value.every(isJsonValue);
  }

  if (typeof value !== 'object') {
    return false;
  }

  return Object.values(value).every(isJsonValue);
}

function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value) && isJsonValue(value);
}

function toStructuredContent(value: unknown): StructuredContent | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  try {
    const normalized = JSON.parse(JSON.stringify(value));
    return isJsonObject(normalized) ? normalized : null;
  } catch {
    return null;
  }
}

function isToolRegistrationHandle(value: unknown): value is { unregister: () => void } {
  return (
    typeof value === 'object' &&
    value !== null &&
    'unregister' in value &&
    typeof value.unregister === 'function'
  );
}

function registerToolWithCompatibilityHandle(
  modelContext: Navigator['modelContext'],
  toolDescriptor: ToolDescriptor
): { unregister: () => void } | undefined {
  const registration = Reflect.apply(modelContext.registerTool, modelContext, [toolDescriptor]);
  return isToolRegistrationHandle(registration) ? registration : undefined;
}

function toRegisteredInputSchema(
  inputSchema: ToolInputSchema | undefined
): InputSchema | undefined {
  if (inputSchema === undefined) {
    return undefined;
  }

  if (!isPlainObject(inputSchema) || !('~standard' in inputSchema)) {
    return isInputSchema(inputSchema) ? inputSchema : DEFAULT_REGISTERED_INPUT_SCHEMA;
  }

  const standard = inputSchema['~standard'];
  if (!isPlainObject(standard)) {
    return DEFAULT_REGISTERED_INPUT_SCHEMA;
  }

  const jsonSchema = standard.jsonSchema;
  if (!isPlainObject(jsonSchema) || typeof jsonSchema.input !== 'function') {
    return DEFAULT_REGISTERED_INPUT_SCHEMA;
  }

  for (const target of STANDARD_JSON_SCHEMA_TARGETS) {
    try {
      const converted = jsonSchema.input({ target });
      if (isInputSchema(converted)) {
        return converted;
      }
    } catch {
      // Try the next target before falling back to the default registration schema.
    }
  }

  return DEFAULT_REGISTERED_INPUT_SCHEMA;
}

function toRegisteredOutputSchema(
  outputSchema: JsonSchemaForInference | undefined
): JsonSchemaForInference | undefined {
  if (outputSchema === undefined) {
    return undefined;
  }

  return outputSchema;
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
 *
 * **IMPORTANT**: If `inputSchema`, `outputSchema`, or `annotations` are defined inline
 * or change on every render, the tool will re-register unnecessarily. To avoid this,
 * define them outside your component with `as const`:
 *
 * ```tsx
 * // Good: Static schema defined outside component
 * const OUTPUT_SCHEMA = {
 *   type: 'object',
 *   properties: { count: { type: 'number' } },
 * } as const;
 *
 * // Bad: Inline schema (creates new object every render)
 * useWebMCP({
 *   outputSchema: { type: 'object', properties: { count: { type: 'number' } } } as const,
 * });
 * ```
 *
 * @template TInputSchema - JSON Schema defining input parameter types (use `as const` for inference)
 * @template TOutputSchema - JSON Schema defining output structure (object schemas enable structuredContent)
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
  TOutputSchema extends JsonSchemaForInference | undefined = undefined,
>(
  config: WebMCPConfig<TInputSchema, TOutputSchema>,
  deps?: DependencyList
): WebMCPReturn<TOutputSchema, TInputSchema> {
  type TOutput = InferOutput<TOutputSchema>;
  type TInput = InferToolInput<TInputSchema>;
  const {
    name,
    description,
    inputSchema,
    outputSchema,
    annotations,
    enabled = true,
    execute: configExecute,
    handler: legacyHandler,
    formatOutput = defaultFormatOutput,
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

  // Memoize schema/annotations keys to prevent re-registration when
  // structurally identical inline objects are passed on every render.
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

  const [state, setState] = useState<ToolExecutionState<TOutput>>({
    isExecuting: false,
    lastResult: null,
    error: null,
    executionCount: 0,
  });

  const toolExecuteRef = useRef(toolExecute);
  const onStartRef = useRef(onStart);
  const onSuccessRef = useRef(onSuccess);
  const onErrorRef = useRef(onError);
  const formatOutputRef = useRef(formatOutput);
  const isMountedRef = useRef(true);
  // Update refs when callbacks change (doesn't trigger re-registration)
  useEffect(() => {
    toolExecuteRef.current = toolExecute;
    onStartRef.current = onStart;
    onSuccessRef.current = onSuccess;
    onErrorRef.current = onError;
    formatOutputRef.current = formatOutput;
  }, [toolExecute, onStart, onSuccess, onError, formatOutput]);

  // Cleanup: mark component as unmounted
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  /**
   * Executes the configured tool implementation with input validation and state management.
   *
   * @param input - The input parameters to validate and pass to the tool implementation
   * @returns Promise resolving to the tool output
   * @throws Error if validation fails or the tool implementation throws
   */
  const execute = useCallback(async (input: TInput): Promise<TOutput> => {
    if (onStartRef.current) {
      onStartRef.current(input);
    }

    setState((prev) => ({
      ...prev,
      isExecuting: true,
      error: null,
    }));

    try {
      const result = await toolExecuteRef.current(input);

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
    (input: TInput): Promise<TOutput> => executeRef.current(input),
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
        const result = await Reflect.apply(executeRef.current, undefined, [input]);
        const formattedOutput = formatOutputRef.current(result);

        const response: CallToolResult = {
          content: [
            {
              type: 'text',
              text: formattedOutput,
            },
          ],
        };

        if (isObjectOutputSchema(outputSchema)) {
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

    const ownerToken = Symbol(name);
    const modelContext = window.navigator.modelContext;
    const resolvedInputSchema = toRegisteredInputSchema(inputSchema);
    const resolvedOutputSchema = toRegisteredOutputSchema(outputSchema);
    const toolDescriptor: ToolDescriptor = {
      name,
      description,
      ...(resolvedInputSchema && { inputSchema: resolvedInputSchema }),
      ...(resolvedOutputSchema && { outputSchema: resolvedOutputSchema }),
      ...(annotations && { annotations }),
      execute: mcpHandler,
    };

    const registration = registerToolWithCompatibilityHandle(modelContext, toolDescriptor);
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
        console.warn(`[useWebMCP] Failed to unregister tool "${name}" during cleanup:`, error);
      }
    };
    // inputSchemaKey/outputSchemaKey/annotationsKey are JSON.stringify'd memoized keys
    // that prevent re-registration when structurally identical inline objects are passed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
