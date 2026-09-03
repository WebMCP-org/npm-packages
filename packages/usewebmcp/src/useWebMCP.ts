import {
  normalizeInputSchema,
  normalizeToolResponse,
  type ToolInputSchema,
} from '@mcp-b/webmcp-polyfill/schema';
import type { InputSchema, JsonSchemaForInference } from '@mcp-b/webmcp-types';
import type { DependencyList } from 'react';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type {
  InferOutput,
  InferToolInput,
  ToolExecutionState,
  WebMCPConfig,
  WebMCPReturn,
} from './types.js';

const INITIAL_STATE = {
  isExecuting: false,
  lastResult: null,
  error: null,
  executionCount: 0,
};

const useIsomorphicLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

/** Registers a React-owned tool with the current WebMCP model context. */
export function useWebMCP<
  TInputSchema extends ToolInputSchema = InputSchema,
  TOutputSchema extends JsonSchemaForInference | undefined = undefined,
>(
  config: WebMCPConfig<TInputSchema, TOutputSchema>,
  deps?: DependencyList
): WebMCPReturn<TOutputSchema, TInputSchema> {
  type TOutput = InferOutput<TOutputSchema>;
  type TInput = InferToolInput<TInputSchema>;
  const { name, description, enabled = true } = config;
  const [state, setState] = useState<ToolExecutionState<TOutput>>(INITIAL_STATE);
  const committedConfigRef = useRef(config);
  const pendingExecutionsRef = useRef(0);

  // MCP calls can arrive after commit but before passive effects. A layout effect
  // publishes only committed renders; the server fallback avoids the SSR warning.
  useIsomorphicLayoutEffect(() => {
    committedConfigRef.current = config;
  });

  const run = useCallback(async (input: TInput): Promise<TOutput> => {
    pendingExecutionsRef.current += 1;
    setState((previous) =>
      previous.isExecuting && previous.error === null
        ? previous
        : { ...previous, isExecuting: true, error: null }
    );

    let result: TOutput;
    const executionConfig = committedConfigRef.current;
    try {
      result = await executionConfig.execute(input);
      if (
        executionConfig.outputSchema &&
        normalizeToolResponse(result).structuredContent === undefined
      ) {
        throw new Error(
          `Tool "${executionConfig.name}" outputSchema requires execute to return a JSON-serializable result`
        );
      }
    } catch (error) {
      pendingExecutionsRef.current -= 1;
      const normalizedError = error instanceof Error ? error : new Error(String(error));
      setState((previous) => ({
        ...previous,
        isExecuting: pendingExecutionsRef.current > 0,
        error: normalizedError,
      }));
      throw normalizedError;
    }

    pendingExecutionsRef.current -= 1;
    setState((previous) => ({
      isExecuting: pendingExecutionsRef.current > 0,
      lastResult: result,
      error: null,
      executionCount: previous.executionCount + 1,
    }));
    return result;
  }, []);

  const reset = useCallback(() => {
    const isExecuting = pendingExecutionsRef.current > 0;
    setState((previous) =>
      previous.isExecuting === isExecuting &&
      previous.lastResult === null &&
      previous.error === null &&
      previous.executionCount === 0
        ? previous
        : { ...INITIAL_STATE, isExecuting }
    );
  }, []);

  useEffect(() => {
    if (!enabled) return;

    const modelContext =
      typeof document === 'undefined'
        ? undefined
        : (document.modelContext ??
          (typeof navigator === 'undefined' ? undefined : navigator.modelContext));
    if (!modelContext) {
      console.warn(
        `[useWebMCP] document.modelContext is not available. Tool "${name}" will not be registered.`
      );
      return;
    }

    const registeredConfig = committedConfigRef.current;
    const registeredOutputSchema = registeredConfig.outputSchema;
    const controller = new AbortController();
    const tool = {
      name,
      description,
      inputSchema: normalizeInputSchema(registeredConfig.inputSchema).inputSchema,
      ...(registeredOutputSchema && { outputSchema: registeredOutputSchema }),
      ...(registeredConfig.annotations && { annotations: registeredConfig.annotations }),
      execute: async (input: TInput) => {
        try {
          const response = normalizeToolResponse(await run(input));
          if (registeredOutputSchema && response.structuredContent === undefined) {
            throw new Error(
              `Tool "${name}" outputSchema requires the tool implementation to return a JSON-serializable result`
            );
          }
          return response;
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          return {
            content: [{ type: 'text' as const, text: `Error: ${message}` }],
            isError: true,
          };
        }
      },
    };

    try {
      const registration = modelContext.registerTool(tool, { signal: controller.signal });
      void Promise.resolve(registration).catch((error: unknown) => {
        if (!controller.signal.aborted) {
          controller.abort();
          console.warn(`[useWebMCP] registerTool("${name}") rejected:`, error);
        }
      });
    } catch (error) {
      controller.abort();
      console.warn(`[useWebMCP] registerTool("${name}") rejected:`, error);
      return;
    }

    return () => controller.abort();
    // `deps` lets callers explicitly opt descriptor values into re-registration.
    // oxlint-disable-next-line react-doctor/exhaustive-deps -- Public API deliberately forwards caller deps.
  }, [name, description, enabled, ...(deps ?? [])]);

  return { state, execute: run, reset };
}
