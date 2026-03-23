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
  ReactWebMCPInputSchema,
  ReactWebMCPOutputSchema,
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
const STANDARD_JSON_SCHEMA_TARGETS = ['draft-2020-12', 'draft-07'] as const;
type StructuredContent = Exclude<CallToolResult['structuredContent'], undefined>;

function isObjectOutputSchema(schema: JsonSchemaForInference | undefined): boolean {
  return schema?.type === 'object';
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function assertRegisteredOutputSchema(
  outputSchema: ReactWebMCPOutputSchema | undefined,
  toolName: string
): JsonSchemaForInference | undefined {
  if (outputSchema === undefined) {
    return undefined;
  }

  if (!isPlainObject(outputSchema) || !('~standard' in outputSchema)) {
    return outputSchema as JsonSchemaForInference;
  }

  const standard = outputSchema['~standard'];
  if (!isPlainObject(standard)) {
    throw new Error(
      `[ReactWebMCP:useWebMCP] Tool "${toolName}" outputSchema must expose Standard JSON Schema for output`
    );
  }

  const jsonSchema = standard.jsonSchema;
  if (!isPlainObject(jsonSchema) || typeof jsonSchema.output !== 'function') {
    throw new Error(
      `[ReactWebMCP:useWebMCP] Tool "${toolName}" outputSchema must expose Standard JSON Schema for output`
    );
  }

  for (const target of STANDARD_JSON_SCHEMA_TARGETS) {
    try {
      const converted = jsonSchema.output({ target });
      if (isPlainObject(converted)) {
        return converted as unknown as JsonSchemaForInference;
      }
    } catch (error) {
      console.warn(
        `[ReactWebMCP:useWebMCP] Standard JSON Schema conversion failed for tool "${toolName}" outputSchema with target "${target}":`,
        error
      );
    }
  }

  throw new Error(
    `[ReactWebMCP:useWebMCP] Failed to convert tool "${toolName}" outputSchema to JSON Schema`
  );
}

function containsFunction(value: unknown, seen = new Set<object>()): boolean {
  if (typeof value === 'function') {
    return true;
  }

  if (!isPlainObject(value) && !Array.isArray(value)) {
    return false;
  }

  if (seen.has(value)) {
    return false;
  }
  seen.add(value);

  const entries = Array.isArray(value) ? value : Object.values(value);
  return entries.some((entry) => containsFunction(entry, seen));
}

function getStructuralDependency(value: unknown): unknown {
  if (value == null) {
    return undefined;
  }

  if (containsFunction(value)) {
    return value;
  }

  try {
    return JSON.stringify(value);
  } catch {
    return value;
  }
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

/**
 * React hook for registering and managing Model Context Protocol (MCP) tools.
 *
 * This hook handles the complete lifecycle of an MCP tool:
 * - Registers the tool with `window.navigator.modelContext`
 * - Manages execution state (loading, results, errors)
 * - Handles tool execution and lifecycle callbacks
 * - Automatically unregisters on component unmount
 * - Returns `structuredContent` when `outputSchema` describes an object result
 *
 * ## Schema Contract
 *
 * `inputSchema` accepts plain JSON Schema or Standard Schema objects.
 * Registration still flows through `navigator.modelContext`, so validator-only Standard Schema
 * inputs must be JSON-exportable or registration will throw.
 * `outputSchema` accepts plain JSON Schema or Standard JSON Schema objects.
 *
 * Defining an `outputSchema` is recommended because it provides:
 * - **Type Safety**: Handler return type is inferred from the schema
 * - **MCP structuredContent**: AI models receive structured, typed data
 * - **Better AI Understanding**: Models can reason about your tool's output format
 *
 * @template TInputSchema - Plain JSON Schema or Standard Schema defining input parameter types
 * @template TOutputSchema - Plain JSON Schema or Standard JSON Schema defining output structure
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
 * function UserCard({ userId }: { userId: string }) {
 *   const { state } = useWebMCP({
 *     name: 'get_user',
 *     description: 'Get user by ID',
 *     inputSchema: ({
 *       type: 'object',
 *       properties: { userId: { type: 'string' } },
 *       required: ['userId'],
 *     } as const satisfies ToolInputSchema),
 *     outputSchema: ({
 *       type: 'object',
 *       properties: {
 *         id: { type: 'string' },
 *         name: { type: 'string' },
 *         email: { type: 'string' },
 *       },
 *     } as const satisfies ToolOutputSchema),
 *     handler: async ({ userId }) => {
 *       const user = await fetchUser(userId);
 *       return { id: user.id, name: user.name, email: user.email };
 *     },
 *   });
 *
 *   return <div>{state.lastResult?.name ?? 'Loading...'}</div>;
 * }
 * ```
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
    enabled = true,
    handler,
    formatOutput = defaultFormatOutput,
    onStart,
    onSuccess,
    onError,
  } = config;

  // Memoize schema/annotations keys to prevent re-registration when
  // structurally identical inline objects are passed on every render.
  const inputSchemaDependency = useMemo(() => getStructuralDependency(inputSchema), [inputSchema]);
  const outputSchemaDependency = useMemo(
    () => getStructuralDependency(outputSchema),
    [outputSchema]
  );
  const annotationsDependency = useMemo(() => getStructuralDependency(annotations), [annotations]);

  const [state, setState] = useState<ToolExecutionState<TOutput>>({
    isExecuting: false,
    lastResult: null,
    error: null,
    executionCount: 0,
  });

  const handlerRef = useRef(handler);
  const onStartRef = useRef(onStart);
  const onSuccessRef = useRef(onSuccess);
  const onErrorRef = useRef(onError);
  const formatOutputRef = useRef(formatOutput);
  const isMountedRef = useRef(true);
  // Update refs when callbacks change (doesn't trigger re-registration)
  useEffect(() => {
    handlerRef.current = handler;
    onStartRef.current = onStart;
    onSuccessRef.current = onSuccess;
    onErrorRef.current = onError;
    formatOutputRef.current = formatOutput;
  }, [handler, onStart, onSuccess, onError, formatOutput]);

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
    if (onStartRef.current) {
      onStartRef.current(input);
    }

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
    if (!enabled) {
      return;
    }

    if (typeof window === 'undefined' || !window.navigator?.modelContext) {
      console.warn(
        '[ReactWebMCP:useWebMCP]',
        `Tool "${name}" skipped: modelContext is not available`
      );
      return;
    }
    const modelContext = window.navigator.modelContext;
    const resolvedOutputSchema = assertRegisteredOutputSchema(outputSchema, name);

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

        if (isObjectOutputSchema(resolvedOutputSchema)) {
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

    const ownerToken = Symbol(name);
    const toolDescriptor = {
      name,
      description,
      ...(inputSchema !== undefined ? { inputSchema } : {}),
      ...(outputSchema !== undefined ? { outputSchema } : {}),
      ...(annotations && { annotations }),
      execute: mcpHandler,
    } as unknown as ToolDescriptor;
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
        console.warn('[ReactWebMCP:useWebMCP]', `Failed to unregister tool "${name}"`, error);
      }
    };
    // The dependency sentinels avoid unnecessary re-registration for plain JSON values,
    // while function-bearing schemas fall back to identity-based tracking.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    name,
    description,
    inputSchemaDependency,
    outputSchemaDependency,
    annotationsDependency,
    enabled,
    ...(deps ?? []),
  ]);

  return {
    state,
    execute: stableExecute,
    reset,
  };
}
