import { useCallback, useState } from 'react';

export interface McpRequestState<TResult> {
  isLoading: boolean;
  result: TResult | null;
  error: Error | null;
  requestCount: number;
}

export interface McpRequestCallbacks<TResult> {
  onSuccess?: (result: TResult) => void;
  onError?: (error: Error) => void;
}

function initialState<TResult>(): McpRequestState<TResult> {
  return {
    isLoading: false,
    result: null,
    error: null,
    requestCount: 0,
  };
}

export function useMcpRequest<TParams, TResult>(
  request: (params: TParams) => Promise<TResult>,
  callbacks: McpRequestCallbacks<TResult>
): {
  execute: (params: TParams) => Promise<TResult>;
  reset: () => void;
  state: McpRequestState<TResult>;
} {
  const [state, setState] = useState<McpRequestState<TResult>>(initialState);

  const reset = useCallback(() => {
    setState(initialState());
  }, []);

  const execute = useCallback(
    async (params: TParams): Promise<TResult> => {
      setState((previous) => ({
        ...previous,
        isLoading: true,
        error: null,
      }));

      try {
        const result = await request(params);
        setState((previous) => ({
          isLoading: false,
          result,
          error: null,
          requestCount: previous.requestCount + 1,
        }));
        callbacks.onSuccess?.(result);
        return result;
      } catch (cause) {
        const error = cause instanceof Error ? cause : new Error(String(cause));
        setState((previous) => ({
          ...previous,
          isLoading: false,
          error,
        }));
        callbacks.onError?.(error);
        throw error;
      }
    },
    [callbacks.onError, callbacks.onSuccess, request]
  );

  return { execute, reset, state };
}
