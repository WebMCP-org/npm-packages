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
  ReactWebMCPInputSchema,
  ReactWebMCPOutputSchema,
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
const DEFAULT_REGISTERED_INPUT_SCHEMA: InputSchema = { type: 'object', properties: {} };
const STANDARD_JSON_SCHEMA_TARGETS = ['draft-2020-12', 'draft-07'] as const;
type StructuredContent = Exclude<CallToolResult['structuredContent'], undefined>;

function isObjectOutputSchema(schema: ReactWebMCPOutputSchema | undefined): boolean {
  if (!schema) {
    return false;
  }

  if (isZodSchema(schema)) {
    return true;
  }

  return 'type' in schema && schema.type === 'object';
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

function isJsonSchemaForInference(value: unknown): value is JsonSchemaForInference {
  if (!isPlainObject(value) || !('type' in value)) {
    return false;
  }

  const schemaType = value.type;
  if (typeof schemaType === 'string') {
    if (
      !['array', 'boolean', 'integer', 'null', 'number', 'object', 'string'].includes(schemaType)
    ) {
      return false;
    }

    if (schemaType === 'array') {
      return 'items' in value && isJsonSchemaForInference(value.items);
    }

    if (schemaType === 'object' && 'properties' in value && value.properties !== undefined) {
      return (
        isPlainObject(value.properties) &&
        Object.values(value.properties).every(isJsonSchemaForInference)
      );
    }

    return true;
  }

  return (
    Array.isArray(schemaType) &&
    schemaType.length > 0 &&
    schemaType.every((entry) =>
      ['array', 'boolean', 'integer', 'null', 'number', 'object', 'string'].includes(entry)
    )
  );
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

/**
 * On Chrome Beta 147 native (which ignores the second arg), aborting
 * the controller cannot remove the tool. Install `@mcp-b/global`
 * or `@mcp-b/webmcp-polyfill` there.
 */
function registerToolWithCleanup(
  modelContext: Navigator['modelContext'],
  toolDescriptor: ToolDescriptor
): AbortController {
  const controller = new AbortController();
  (
    modelContext.registerTool as (tool: ToolDescriptor, options?: { signal?: AbortSignal }) => void
  ).call(modelContext, toolDescriptor, { signal: controller.signal });
  return controller;
}

function toRegisteredInputSchema(
  schema: ReactWebMCPInputSchema | undefined
): InputSchema | undefined {
  if (!schema) {
    return undefined;
  }

  if (isZodSchema(schema)) {
    return zodToJsonSchema(schema);
  }

  if (!isPlainObject(schema) || !('~standard' in schema)) {
    return isInputSchema(schema) ? schema : DEFAULT_REGISTERED_INPUT_SCHEMA;
  }

  const standard = schema['~standard'];
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
  schema: ReactWebMCPOutputSchema | undefined
): JsonSchemaForInference | undefined {
  if (!schema) {
    return undefined;
  }

  const jsonSchema = isZodSchema(schema) ? zodToJsonSchema(schema) : schema;
  return isJsonSchemaForInference(jsonSchema) ? jsonSchema : undefined;
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
 *   handler: async ({ userId }) => {
 *     const user = await fetchUser(userId);
 *     return { id: user.id, name: user.name, email: user.email };
 *   },
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
    if (typeof window === 'undefined' || !window.navigator?.modelContext) {
      console.warn(
        '[ReactWebMCP:useWebMCP]',
        `Tool "${name}" skipped: modelContext is not available`
      );
      return;
    }
    const modelContext = window.navigator.modelContext;

    /**
     * Handles MCP tool execution by running the handler and formatting the response.
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

    const resolvedInputSchema = toRegisteredInputSchema(inputSchema);
    const resolvedOutputSchema = toRegisteredOutputSchema(outputSchema);

    const ownerToken = Symbol(name);
    const toolDescriptor: ToolDescriptor = {
      name,
      description,
      ...(resolvedInputSchema && { inputSchema: resolvedInputSchema }),
      ...(resolvedOutputSchema && { outputSchema: resolvedOutputSchema }),
      ...(annotations && { annotations }),
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
      try {
        controller.abort();
      } catch (error) {
        console.warn('[ReactWebMCP:useWebMCP]', `Failed to unregister tool "${name}"`, error);
      }
    };
    // Spread operator in dependencies intentionally allows consumers to trigger
    // re-registration with custom reactive inputs.
  }, [name, description, inputSchema, outputSchema, annotations, ...(deps ?? [])]);

  return {
    state,
    execute: stableExecute,
    reset,
  };
}
