'use client';

import {
  createInvocationCallback,
  invoke,
  unwrapInvocation,
} from '@mcp-b/webmcp-polyfill/invocation';
import type { DependencyList } from 'react';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { WebMCP } from 'webmcp-types';
import { toInputSchema, validateInput } from './schema.js';
import type { ToolInputSchema, WebMCPConfig, WebMCPToolReturn } from './types.js';

const INITIAL_REGISTRATION = { isSupported: false, registrationError: null };
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

/** Register a React-owned tool without subscribing its owner to invocation state. */
export function useWebMCPTool<
  const TInputSchema extends ToolInputSchema = object,
  TResult = unknown,
>(
  config: WebMCPConfig<TInputSchema, TResult>,
  deps?: DependencyList
): WebMCPToolReturn<TInputSchema, TResult> {
  const [registration, setRegistration] =
    useState<Pick<WebMCPToolReturn, 'isSupported' | 'registrationError'>>(INITIAL_REGISTRATION);
  const instanceId = useRef<string | null>(null);
  if (instanceId.current === null) instanceId.current = crypto.randomUUID();
  const schema = useMemo(() => {
    try {
      const value =
        config.inputSchema === undefined ? undefined : toInputSchema(config.inputSchema);
      const key = JSON.stringify(value);
      if (value !== undefined && key === undefined)
        throw new TypeError('inputSchema must serialize to JSON');
      return { value, key };
    } catch (error) {
      return { error: toError(error) };
    }
  }, [config.inputSchema]);
  const {
    execute: _execute,
    formatOutput: _formatOutput,
    formatError: _formatError,
    isErrorResponse: _isErrorResponse,
    middleware: _middleware,
    binding: _binding,
    checkBinding: _checkBinding,
    inputSchema: _inputSchema,
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
    descriptorKey = JSON.stringify([metadata, exposedTo]);
  } catch (error) {
    preparationError = toError(error);
    descriptorKey = preparationError.message;
  }
  const registrationInputs = [
    descriptorKey,
    schema.key,
    preparationError?.message,
    enabled,
    ...(deps ?? []),
  ];
  const committed = useRef({
    config,
    descriptor,
    preparationError,
    registrationInputs,
    generation: 0,
  });

  // Publish only committed renders, before external calls from later layout effects.
  useIsomorphicLayoutEffect(() => {
    const previous = committed.current;
    const changed =
      registrationInputs.length !== previous.registrationInputs.length ||
      registrationInputs.some(
        (value, index) => !Object.is(value, previous.registrationInputs[index])
      );
    committed.current = {
      config,
      descriptor,
      preparationError,
      registrationInputs,
      generation: previous.generation + Number(changed),
    };
  });

  const getInvocationConfig = useCallback(
    (registrationSignal?: AbortSignal, registrationGeneration?: number) => {
      const captured = committed.current.config;
      return {
        tool: { instanceId: instanceId.current!, name: captured.name },
        ...(registrationSignal && { signal: registrationSignal }),
        input: { validate: (value: unknown) => validateInput(captured.inputSchema, value) },
        execute: captured.execute,
        ...(captured.middleware && { middleware: captured.middleware }),
        ...(captured.binding && { binding: captured.binding }),
        checkBinding: () => {
          registrationSignal?.throwIfAborted();
          if (
            registrationGeneration !== undefined &&
            registrationGeneration !== committed.current.generation
          ) {
            throw new Error('Tool registration changed before execution');
          }
          committed.current.config.checkBinding?.();
        },
        ...(captured.formatOutput && { formatOutput: captured.formatOutput }),
        ...(captured.formatError && { formatError: captured.formatError }),
        ...(captured.isErrorResponse && { isErrorResponse: captured.isErrorResponse }),
      };
    },
    []
  );

  const execute = useCallback<WebMCPToolReturn<TInputSchema, TResult>['execute']>(
    (input, options) => unwrapInvocation(invoke(getInvocationConfig(), input, options)),
    [getInvocationConfig]
  );

  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setInterval> | undefined;
    const register = () => {
      const context =
        document.modelContext ?? ('modelContext' in navigator ? navigator.modelContext : undefined);
      const isSupported = canRegister(context);
      const {
        config: current,
        descriptor: tool,
        preparationError: error,
        generation,
      } = committed.current;
      setRegistration((previous) =>
        previous.isSupported === isSupported && previous.registrationError === (error ?? null)
          ? previous
          : { isSupported, registrationError: error ?? null }
      );
      if (error || !enabled) return true;
      if (!isSupported) return false;
      const failed = (cause: unknown) => {
        if (controller.signal.aborted) return;
        controller.abort();
        setRegistration({ isSupported: true, registrationError: toError(cause) });
      };
      try {
        const registered = context.registerTool(
          {
            ...tool,
            execute: createInvocationCallback(() =>
              getInvocationConfig(controller.signal, generation)
            ),
          },
          { signal: controller.signal, ...(current.exposedTo && { exposedTo: current.exposedTo }) }
        );
        void Promise.resolve(registered).catch(failed);
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
    // oxlint-disable-next-line react-doctor/exhaustive-deps -- Metadata is compared by value and callbacks are read after commit.
  }, registrationInputs);

  return { ...registration, execute };
}
