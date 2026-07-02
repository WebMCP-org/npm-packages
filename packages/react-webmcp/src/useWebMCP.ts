import type {
  CallToolResult,
  InputSchema,
  JsonSchemaForInference,
  ToolDescriptor,
} from '@mcp-b/webmcp-types';
import { isPlainObject, normalizeInputSchema, toJsonValue } from '@mcp-b/webmcp-polyfill/schema';
import type { DependencyList } from 'react';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type {
  InferOutput,
  InferToolInput,
  ReactWebMCPInputSchema,
  ReactWebMCPOutputSchema,
  ToolExecutionState,
  WebMCPConfig,
  WebMCPReturn,
} from './types.js';
import { getModelContext } from './model-context.js';
import { isZodSchema, isZodType, zodToJsonSchema } from './zod-utils.js';

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
const INFERABLE_JSON_SCHEMA_TYPES = [
  'array',
  'boolean',
  'integer',
  'null',
  'number',
  'object',
  'string',
] as const;
const UNSUPPORTED_OUTPUT_SCHEMA_KEYS = ['$ref', 'allOf', 'anyOf', 'oneOf', 'not'] as const;

function isInferableJsonSchemaType(
  value: unknown
): value is (typeof INFERABLE_JSON_SCHEMA_TYPES)[number] {
  return (
    typeof value === 'string' &&
    INFERABLE_JSON_SCHEMA_TYPES.includes(value as (typeof INFERABLE_JSON_SCHEMA_TYPES)[number])
  );
}

function unsupportedOutputSchema(detail: string): never {
  throw new Error(`Unsupported outputSchema: ${detail}`);
}

function assertInferableJsonSchema(
  value: unknown,
  path = '$'
): asserts value is JsonSchemaForInference {
  if (!isPlainObject(value)) {
    unsupportedOutputSchema(`${path} must be a JSON Schema object`);
  }

  for (const key of UNSUPPORTED_OUTPUT_SCHEMA_KEYS) {
    if (key in value) {
      unsupportedOutputSchema(`${path}.${key} is outside the inferable JSON Schema subset`);
    }
  }

  const schemaTypes =
    typeof value.type === 'string'
      ? [value.type]
      : Array.isArray(value.type)
        ? value.type
        : undefined;
  if (
    !schemaTypes?.length ||
    !schemaTypes.every((schemaType) => isInferableJsonSchemaType(schemaType))
  ) {
    unsupportedOutputSchema(`${path} must declare an inferable JSON Schema type`);
  }

  const requiredValue = value.required;
  if (
    requiredValue !== undefined &&
    (!Array.isArray(requiredValue) || requiredValue.some((entry) => typeof entry !== 'string'))
  ) {
    unsupportedOutputSchema(`${path}.required must be an array of strings`);
  }

  if (schemaTypes.includes('array')) {
    if (!isPlainObject(value.items)) {
      unsupportedOutputSchema(`${path}.items must be an inferable schema for array outputs`);
    }
    assertInferableJsonSchema(value.items, `${path}.items`);
  }

  if (schemaTypes.includes('object')) {
    if (value.properties !== undefined && !isPlainObject(value.properties)) {
      unsupportedOutputSchema(`${path}.properties must be an object`);
    }

    if (isPlainObject(value.properties)) {
      for (const [key, propertySchema] of Object.entries(value.properties)) {
        assertInferableJsonSchema(propertySchema, `${path}.properties.${key}`);
      }
    }

    if (
      value.additionalProperties !== undefined &&
      typeof value.additionalProperties !== 'boolean'
    ) {
      assertInferableJsonSchema(value.additionalProperties, `${path}.additionalProperties`);
    }
  }
}

const useIsomorphicLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

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
 *   handler: async ({ userId }) => {
 *     const user = await fetchUser(userId);
 *     return { id: user.id, name: user.name, email: user.email };
 *   },
 * });
 * ```
 *
 * @template TInputSchema - JSON Schema defining input parameter types (use `as const` for inference)
 * @template TOutputSchema - JSON Schema defining output structure
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
  TOutputSchema extends ReactWebMCPOutputSchema | undefined = undefined,
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
  // Keep the registered handler current without re-registering the tool.
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

  /**
   * Executes the tool handler with input validation and state management.
   *
   * @param input - The input parameters to validate and pass to the handler
   * @returns Promise resolving to the handler's output
   * @throws Error if validation fails or the handler throws
   */
  const execute = useCallback(async (input: TInput): Promise<TOutput> => {
    setState((prev) => ({
      ...prev,
      isExecuting: true,
      error: null,
    }));

    try {
      const result = await handlerRef.current(input);

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
        '[ReactWebMCP:useWebMCP]',
        `Tool "${name}" skipped: modelContext is not available`
      );
      return;
    }

    const resolvedInputSchema = isZodSchema(inputSchema)
      ? zodToJsonSchema(inputSchema)
      : normalizeInputSchema(inputSchema).inputSchema;
    let resolvedOutputSchema: JsonSchemaForInference | undefined;
    if (outputSchema) {
      const jsonSchema =
        isZodSchema(outputSchema) || isZodType(outputSchema)
          ? zodToJsonSchema(outputSchema)
          : outputSchema;
      assertInferableJsonSchema(jsonSchema);
      resolvedOutputSchema = jsonSchema;
    }
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

        if (resolvedOutputSchema) {
          const structuredContent = toJsonValue(result);
          if (structuredContent === undefined) {
            throw new Error(
              `Tool "${name}" outputSchema requires the handler to return a JSON-serializable result`
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
    const toolDescriptor: ToolDescriptor & { inputSchema: InputSchema } = {
      name,
      description,
      inputSchema: resolvedInputSchema,
      ...(resolvedOutputSchema && { outputSchema: resolvedOutputSchema }),
      ...(annotations && { annotations }),
      execute: mcpHandler,
    };
    const controller = new AbortController();
    let registered = false;
    let disposed = false;

    try {
      const registerResult = modelContext.registerTool(toolDescriptor, {
        signal: controller.signal,
      });

      void Promise.resolve(registerResult).then(
        () => {
          if (!disposed && !controller.signal.aborted) {
            registered = true;
            TOOL_OWNER_BY_NAME.set(name, ownerToken);
          }
        },
        (error: unknown) => {
          if (!controller.signal.aborted) {
            controller.abort();
            console.warn(`[ReactWebMCP:useWebMCP] registerTool("${name}") rejected:`, error);
          }
        }
      );
    } catch (error) {
      controller.abort();
      console.warn(`[ReactWebMCP:useWebMCP] registerTool("${name}") rejected:`, error);
      return;
    }

    return () => {
      disposed = true;

      if (registered && TOOL_OWNER_BY_NAME.get(name) === ownerToken) {
        TOOL_OWNER_BY_NAME.delete(name);
        controller.abort();
        return;
      }

      if (!registered) {
        controller.abort();
      }
    };
    // Spread operator in dependencies intentionally allows consumers to trigger
    // re-registration with custom reactive inputs.
  }, [name, description, ...(deps ?? [])]);

  return {
    state,
    execute: stableExecute,
    reset,
  };
}
