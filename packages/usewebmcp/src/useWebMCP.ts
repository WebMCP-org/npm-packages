import type { ToolInputSchema } from '@mcp-b/webmcp-polyfill';
import type {
  CallToolResult,
  InputSchema,
  JsonObject,
  JsonSchemaForInference,
  ToolDescriptor,
} from '@mcp-b/webmcp-types';
import type { DependencyList } from 'react';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type {
  InferOutput,
  InferToolInput,
  ToolExecutionState,
  WebMCPConfig,
  WebMCPReturn,
} from './types.js';
import { getModelContext, type ModelContextSurface } from './model-context.js';

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

const useIsomorphicLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

function isDev(): boolean {
  const env = typeof process !== 'undefined' ? process.env?.NODE_ENV : undefined;
  return env !== undefined ? env !== 'production' : false;
}

/**
 * On Chrome 147/148, aborting the controller does not remove the tool.
 * Install `@mcp-b/global` or `@mcp-b/webmcp-polyfill` for those versions.
 * Chrome 149+ removes the tool on abort in the native implementation.
 */
function registerToolWithCleanup(
  modelContext: ModelContextSurface,
  toolDescriptor: ToolDescriptor
): AbortController {
  const controller = new AbortController();
  (
    modelContext.registerTool as (tool: ToolDescriptor, options?: { signal?: AbortSignal }) => void
  ).call(modelContext, toolDescriptor, { signal: controller.signal });
  return controller;
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
 * - Registers the tool with `window.document.modelContext`
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
 * - **Ref-based static descriptors and callbacks**: `inputSchema`, `outputSchema`,
 *   `annotations`, `execute`/`handler`, `onSuccess`, `onError`, and `formatOutput`
 *   are stored in refs, so recreating them during render won't trigger re-registration.
 *
 * If a schema or annotation actually changes and the registered descriptor should change,
 * include the relevant primitive value in the `deps` array.
 *
 * ```tsx
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
    execute: configExecute,
    handler: legacyHandler,
    formatOutput = defaultFormatOutput,
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

  const toolExecuteRef = useRef(toolExecute);
  const onSuccessRef = useRef(onSuccess);
  const onErrorRef = useRef(onError);
  const formatOutputRef = useRef(formatOutput);
  const inputSchemaRef = useRef(inputSchema);
  const outputSchemaRef = useRef(outputSchema);
  const annotationsRef = useRef(annotations);
  const isMountedRef = useRef(true);
  const warnedRef = useRef(new Set<string>());
  const prevConfigRef = useRef({
    description,
    deps,
  });
  // Update refs when callbacks or static descriptors are recreated during render.
  useIsomorphicLayoutEffect(() => {
    toolExecuteRef.current = toolExecute;
    onSuccessRef.current = onSuccess;
    onErrorRef.current = onError;
    formatOutputRef.current = formatOutput;
    inputSchemaRef.current = inputSchema;
    outputSchemaRef.current = outputSchema;
    annotationsRef.current = annotations;
  }, [annotations, inputSchema, onSuccess, onError, outputSchema, toolExecute, formatOutput]);

  // Cleanup: mark component as unmounted
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!isDev()) {
      prevConfigRef.current = { description, deps };
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

    prevConfigRef.current = { description, deps };
  }, [deps, description, name]);

  /**
   * Executes the configured tool implementation with input validation and state management.
   *
   * @param input - The input parameters to validate and pass to the tool implementation
   * @returns Promise resolving to the tool output
   * @throws Error if validation fails or the tool implementation throws
   */
  const execute = useCallback(async (input: TInput): Promise<TOutput> => {
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
    const modelContext = getModelContext();
    if (!modelContext) {
      console.warn(
        `[useWebMCP] window.document.modelContext is not available. Tool "${name}" will not be registered.`
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

        if (isObjectOutputSchema(outputSchemaRef.current)) {
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
    const resolvedInputSchema = toRegisteredInputSchema(inputSchemaRef.current);
    const resolvedOutputSchema = toRegisteredOutputSchema(outputSchemaRef.current);
    const resolvedAnnotations = annotationsRef.current;
    const toolDescriptor: ToolDescriptor = {
      name,
      description,
      ...(resolvedInputSchema && { inputSchema: resolvedInputSchema }),
      ...(resolvedOutputSchema && { outputSchema: resolvedOutputSchema }),
      ...(resolvedAnnotations && { annotations: resolvedAnnotations }),
      execute: mcpHandler,
    };

    const controller = registerToolWithCleanup(modelContext, toolDescriptor);
    TOOL_OWNER_BY_NAME.set(name, ownerToken);

    return () => {
      const currentOwner = TOOL_OWNER_BY_NAME.get(name);
      if (currentOwner !== ownerToken) {
        return;
      }

      TOOL_OWNER_BY_NAME.delete(name);
      controller.abort();
    };
    // Spread operator in dependencies: Allows users to provide additional dependencies
    // via the `deps` parameter. While unconventional, this pattern is intentional to support
    // dynamic dependency injection. The spread is safe because deps is validated and warned
    // about non-primitive values earlier in this hook.
  }, [name, description, ...(deps ?? [])]);

  return {
    state,
    execute: stableExecute,
    reset,
  };
}
