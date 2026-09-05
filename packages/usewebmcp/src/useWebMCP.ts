'use client';

import type { DependencyList } from 'react';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { WebMCP } from 'webmcp-types';
import { toInputSchema, validateInput } from './schema.js';
import type { ToolExecutionState, ToolInputSchema, WebMCPConfig, WebMCPReturn } from './types.js';

const INITIAL_STATE = { isExecuting: false, lastResult: null, error: null, executionCount: 0 };
const INITIAL_REGISTRATION = { isSupported: false, isRegistered: false, registrationError: null };
const useIsomorphicLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

function canRegister(context: unknown): context is Pick<WebMCP.ModelContext, 'registerTool'> {
  return (
    typeof context === 'object' &&
    context !== null &&
    'registerTool' in context &&
    typeof context.registerTool === 'function'
  );
}

/** Registers a React-owned tool using the upstream WebMCP contract. */
export function useWebMCP<const TInputSchema extends ToolInputSchema = object, TResult = unknown>(
  config: WebMCPConfig<TInputSchema, TResult>,
  deps?: DependencyList
): WebMCPReturn<TInputSchema, TResult> {
  const [state, setState] = useState<ToolExecutionState<TResult>>(INITIAL_STATE);
  const [registration, setRegistration] =
    useState<Pick<WebMCPReturn, 'isSupported' | 'isRegistered' | 'registrationError'>>(
      INITIAL_REGISTRATION
    );
  const pendingExecutions = useRef(0);
  const schema = useMemo(() => {
    try {
      return {
        value: config.inputSchema === undefined ? undefined : toInputSchema(config.inputSchema),
      };
    } catch (error) {
      return { error: toError(error) };
    }
  }, [config.inputSchema]);
  const {
    execute: _execute,
    formatOutput: _formatOutput,
    enabled = true,
    exposedTo,
    ...metadata
  } = config;
  const descriptor = {
    ...metadata,
    ...(schema.value !== undefined && { inputSchema: schema.value }),
  };
  let preparationError = schema.error;
  let descriptorKey: string;
  try {
    descriptorKey = JSON.stringify([descriptor, exposedTo]);
  } catch (error) {
    preparationError = toError(error);
    descriptorKey = preparationError.message;
  }
  const committed = useRef({ config, descriptor, preparationError });

  // Publish only committed renders, before external calls from later layout effects.
  useIsomorphicLayoutEffect(() => {
    committed.current = { config, descriptor, preparationError };
  });

  const run = useCallback(
    async (
      input: unknown,
      options: WebMCP.ToolExecuteCallbackOptions = { signal: new AbortController().signal },
      forAgent = false
    ): Promise<{ result: TResult; output: unknown }> => {
      const executionConfig = committed.current.config;
      const { signal } = options;
      pendingExecutions.current += 1;
      setState((previous) =>
        previous.isExecuting && previous.error === null
          ? previous
          : { ...previous, isExecuting: true, error: null }
      );
      let onAbort: (() => void) | undefined;
      try {
        signal.throwIfAborted();
        const operation = async () => {
          const validated = await validateInput(executionConfig.inputSchema, input);
          signal.throwIfAborted();
          const result = await executionConfig.execute(validated, options);
          signal.throwIfAborted();
          if (result instanceof Error) throw result;
          const output =
            forAgent && executionConfig.formatOutput
              ? await executionConfig.formatOutput(result)
              : result;
          signal.throwIfAborted();
          return { result, output };
        };
        const { result, output } = await Promise.race([
          new Promise<never>((_, reject) => {
            onAbort = () => reject(signal.reason);
            signal.addEventListener('abort', onAbort, { once: true });
          }),
          operation(),
        ]);
        setState((previous) => ({
          ...previous,
          lastResult: result,
          error: null,
          executionCount: previous.executionCount + 1,
        }));
        return { result, output };
      } catch (error) {
        const normalized = toError(error);
        setState((previous) => ({ ...previous, error: normalized }));
        throw normalized;
      } finally {
        if (onAbort) signal.removeEventListener('abort', onAbort);
        pendingExecutions.current -= 1;
        setState((previous) => ({ ...previous, isExecuting: pendingExecutions.current > 0 }));
      }
    },
    []
  );

  const execute = useCallback<WebMCPReturn<TInputSchema, TResult>['execute']>(
    async (input, options) => (await run(input, options)).result,
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
    let timer: ReturnType<typeof setInterval> | undefined;
    const register = () => {
      const context =
        document.modelContext ?? ('modelContext' in navigator ? navigator.modelContext : undefined);
      const isSupported = canRegister(context);
      const { config: current, descriptor: tool, preparationError: error } = committed.current;
      setRegistration((previous) =>
        previous.isSupported === isSupported &&
        !previous.isRegistered &&
        previous.registrationError === (error ?? null)
          ? previous
          : { isSupported, isRegistered: false, registrationError: error ?? null }
      );
      if (error || !enabled) return true;
      if (!isSupported) return false;
      const failed = (cause: unknown) => {
        if (controller.signal.aborted) return;
        controller.abort();
        setRegistration({
          isSupported: true,
          isRegistered: false,
          registrationError: toError(cause),
        });
      };
      try {
        const registered = context.registerTool(
          {
            ...tool,
            execute: async (input, options) => {
              try {
                return (await run(input, options, true)).output;
              } catch (cause) {
                return { content: [{ type: 'text', text: toError(cause).message }], isError: true };
              }
            },
          },
          { signal: controller.signal, ...(current.exposedTo && { exposedTo: current.exposedTo }) }
        );
        void Promise.resolve(registered).then(() => {
          if (!controller.signal.aborted) {
            setRegistration({ isSupported: true, isRegistered: true, registrationError: null });
          }
        }, failed);
      } catch (cause) {
        failed(cause);
      }
      return true;
    };
    if (!register()) {
      // Extensions can inject after mount. Bound discovery to 10 seconds per hook.
      let attempts = 0;
      timer = setInterval(() => {
        if (register() || ++attempts >= 20) clearInterval(timer);
      }, 500);
    }
    return () => {
      clearInterval(timer);
      controller.abort();
    };
    // Descriptor contents avoid churn from inline schemas; deps can explicitly refresh registration.
    // oxlint-disable-next-line react-doctor/exhaustive-deps -- Metadata is compared by value and callbacks are read after commit.
  }, [descriptorKey, preparationError?.message, enabled, ...(deps ?? [])]);

  return { state, ...registration, execute, reset };
}
