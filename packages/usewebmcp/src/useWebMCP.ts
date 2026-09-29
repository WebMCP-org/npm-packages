'use client';

import type { DependencyList } from 'react';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { WebMCP } from 'webmcp-types';
import type {
  InferToolInput,
  ToolExecutionState,
  ToolInputSchema,
  WebMCPConfig,
  WebMCPReturn,
} from './types.js';

const INITIAL_STATE = { isExecuting: false, lastResult: null, error: null, executionCount: 0 };
const INITIAL_REGISTRATION = { isSupported: false, registrationError: null };
const useIsomorphicLayoutEffect = globalThis.window === undefined ? useEffect : useLayoutEffect;

type ExecutionOutcome<T> = { result: T; output: unknown } | { error: Error; output?: unknown };
type RegisteredToolInput = Parameters<WebMCP.ModelContextTool['execute']>[0];

export interface WebMCPAdapter<TResult> {
  descriptor?: object;
  preparationError?: Error;
  formatOutput?: (result: TResult) => WebMCP.MaybePromise<unknown>;
  formatError?: (error: Error) => WebMCP.MaybePromise<unknown>;
}

function toError(cause: unknown): Error {
  return cause instanceof Error ? cause : new Error(String(cause));
}

export function useWebMCPWithAdapter<
  const TInputSchema extends ToolInputSchema = object,
  TResult = unknown,
>(
  config: WebMCPConfig<TInputSchema, TResult>,
  deps: DependencyList | undefined,
  adapter: WebMCPAdapter<TResult>
): WebMCPReturn<TInputSchema, TResult> {
  const [state, setState] = useState<ToolExecutionState<TResult>>(INITIAL_STATE);
  const [registration, setRegistration] =
    useState<Pick<WebMCPReturn, 'isSupported' | 'registrationError'>>(INITIAL_REGISTRATION);
  const pendingExecutions = useRef(0);
  const schema = useMemo(() => {
    try {
      const value = config.inputSchema;
      if (value !== undefined && '~standard' in value) {
        throw new TypeError(
          'inputSchema must be JSON Schema. Use @mcp-b/react-webmcp for Zod and other Standard Schema validators.'
        );
      }
      const key = JSON.stringify(value);
      if (value !== undefined && key === undefined) {
        throw new TypeError('inputSchema must serialize to JSON');
      }
      return { value, key };
    } catch (error) {
      return { error: toError(error) };
    }
  }, [config.inputSchema]);
  const { name, title, description, annotations, enabled = true, exposedTo } = config;
  const metadata = {
    name,
    ...(title !== undefined && { title }),
    description,
    ...(annotations !== undefined && { annotations }),
    ...adapter.descriptor,
  };
  const descriptor = {
    ...metadata,
    ...(schema.value !== undefined && { inputSchema: schema.value }),
  };
  let preparationError = schema.error ?? adapter.preparationError;
  let descriptorKey: string;
  try {
    descriptorKey = JSON.stringify([metadata, schema.key, exposedTo]);
  } catch (error) {
    preparationError = toError(error);
    descriptorKey = preparationError.message;
  }
  const committed = useRef({ config, descriptor, preparationError, adapter });

  // Publish only committed renders, before external calls from later layout effects.
  useIsomorphicLayoutEffect(() => {
    committed.current = { config, descriptor, preparationError, adapter };
  });

  const run = useCallback(
    async (
      input: InferToolInput<TInputSchema> | RegisteredToolInput,
      options: WebMCP.ToolExecuteCallbackOptions = { signal: new AbortController().signal },
      forAgent = false
    ): Promise<ExecutionOutcome<TResult>> => {
      const { config: executionConfig, adapter: executionAdapter } = committed.current;
      const { signal } = options;
      pendingExecutions.current += 1;
      setState((previous) =>
        previous.isExecuting && previous.error === null
          ? previous
          : { ...previous, isExecuting: true, error: null }
      );
      let onAbort: (() => void) | undefined;
      let outcome: ExecutionOutcome<TResult>;
      try {
        signal.throwIfAborted();
        const operation = async (): Promise<ExecutionOutcome<TResult>> => {
          try {
            // SAFETY: registered calls are validated by inputSchema; local calls are typed.
            const result = await executionConfig.execute(
              input as InferToolInput<TInputSchema>,
              options
            );
            signal.throwIfAborted();
            if (result instanceof Error) throw result;
            const output =
              forAgent && executionAdapter.formatOutput
                ? await executionAdapter.formatOutput(result)
                : result;
            signal.throwIfAborted();
            if (forAgent && output !== undefined) {
              try {
                if (JSON.stringify(output) === undefined) {
                  throw new TypeError('JSON.stringify returned undefined');
                }
              } catch (cause) {
                throw new TypeError(
                  `Tool "${executionConfig.name}" returned a result that is not JSON-serializable`,
                  { cause }
                );
              }
            }
            return { result, output: output ?? null };
          } catch (cause) {
            signal.throwIfAborted();
            const error = toError(cause);
            const formatError = executionAdapter.formatError;
            if (!forAgent || !formatError) return { error };
            const output = await formatError(error);
            signal.throwIfAborted();
            return { error, output };
          }
        };
        outcome = await Promise.race([
          new Promise<never>((_, reject) => {
            onAbort = () => reject(signal.reason);
            signal.addEventListener('abort', onAbort, { once: true });
          }),
          operation(),
        ]);
      } catch (error) {
        outcome = { error: toError(error) };
      } finally {
        if (onAbort) signal.removeEventListener('abort', onAbort);
        pendingExecutions.current -= 1;
      }
      const isExecuting = pendingExecutions.current > 0;
      setState((previous) =>
        'error' in outcome
          ? { ...previous, isExecuting, error: outcome.error }
          : {
              isExecuting,
              lastResult: outcome.result,
              error: null,
              executionCount: previous.executionCount + 1,
            }
      );
      return outcome;
    },
    []
  );

  const execute = useCallback<WebMCPReturn<TInputSchema, TResult>['execute']>(
    async (input, options) => {
      const outcome = await run(input, options);
      if ('error' in outcome) throw outcome.error;
      return outcome.result;
    },
    [run]
  );

  const reset = useCallback(() => {
    const isExecuting = pendingExecutions.current > 0;
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
    const controller = new AbortController();
    const context = globalThis.document?.modelContext;
    const isSupported = typeof context?.registerTool === 'function';
    const { config: current, descriptor: tool, preparationError: error } = committed.current;
    setRegistration((previous) =>
      previous.isSupported === isSupported && previous.registrationError === (error ?? null)
        ? previous
        : { isSupported, registrationError: error ?? null }
    );
    const failed = (cause: unknown) => {
      if (controller.signal.aborted) return;
      controller.abort();
      const registrationError = toError(cause);
      console.warn(`[useWebMCP] registerTool("${current.name}") rejected:`, registrationError);
      setRegistration({ isSupported: true, registrationError });
    };
    if (!error && enabled && isSupported && context) {
      try {
        const registered = context.registerTool(
          {
            ...tool,
            execute: async (input, options) => {
              const outcome = await run(input, options, true);
              if ('output' in outcome) return outcome.output;
              throw outcome.error;
            },
          },
          { signal: controller.signal, ...(current.exposedTo && { exposedTo: current.exposedTo }) }
        );
        void registered.catch(failed);
      } catch (cause) {
        failed(cause);
      }
    }
    return () => controller.abort();
    // Descriptor contents avoid churn from inline schemas; deps can explicitly refresh registration.
    // oxlint-disable-next-line react-doctor/exhaustive-deps -- Metadata is compared by value and callbacks are read after commit.
  }, [descriptorKey, preparationError?.message, enabled, ...(deps ?? [])]);

  return { state, ...registration, execute, reset };
}

/** Registers a React-owned tool using the upstream WebMCP contract. */
export function useWebMCP<const TInputSchema extends ToolInputSchema = object, TResult = unknown>(
  config: WebMCPConfig<TInputSchema, TResult>,
  deps?: DependencyList
): WebMCPReturn<TInputSchema, TResult> {
  return useWebMCPWithAdapter(config, deps, {});
}
