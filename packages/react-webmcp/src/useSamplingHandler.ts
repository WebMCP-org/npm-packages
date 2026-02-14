import type { ModelContext, SamplingRequestParams, SamplingResult } from '@mcp-b/global';
import { useCallback, useState } from 'react';

/**
 * State for sampling requests, tracking the current request and results.
 */
export interface SamplingState {
  /** Whether a sampling request is currently in progress */
  isLoading: boolean;
  /** The last sampling result received */
  result: SamplingResult | null;
  /** Any error that occurred during the last request */
  error: Error | null;
  /** Total number of requests made */
  requestCount: number;
}

/**
 * Configuration options for the useSampling hook.
 */
export interface UseSamplingConfig {
  /**
   * Optional callback invoked when a sampling request completes successfully.
   */
  onSuccess?: (result: SamplingResult) => void;

  /**
   * Optional callback invoked when a sampling request fails.
   */
  onError?: (error: Error) => void;
}

/**
 * Return value from the useSampling hook.
 */
export interface UseSamplingReturn {
  /** Current state of sampling */
  state: SamplingState;
  /** Function to request LLM completion from the connected client */
  createMessage: (params: SamplingRequestParams) => Promise<SamplingResult>;
  /** Reset the state */
  reset: () => void;
}

/**
 * React hook for requesting LLM completions from the connected MCP client.
 *
 * Sampling allows the server (webpage) to request LLM completions from the
 * connected client. This is useful when the page needs AI capabilities like
 * summarization, generation, or analysis.
 *
 * @param config - Optional configuration including callbacks
 * @returns Object containing state and the createMessage function
 *
 * @example Basic usage:
 * ```tsx
 * function AIAssistant() {
 *   const { state, createMessage } = useSampling({
 *     onSuccess: (result) => console.log('Got response:', result),
 *     onError: (error) => console.error('Sampling failed:', error),
 *   });
 *
 *   const handleAsk = async () => {
 *     const result = await createMessage({
 *       messages: [
 *         { role: 'user', content: { type: 'text', text: 'What is 2+2?' } }
 *       ],
 *       maxTokens: 100,
 *     });
 *     console.log(result.content);
 *   };
 *
 *   return (
 *     <div>
 *       <button onClick={handleAsk} disabled={state.isLoading}>
 *         Ask AI
 *       </button>
 *       {state.result && <p>{JSON.stringify(state.result.content)}</p>}
 *     </div>
 *   );
 * }
 * ```
 */
export function useSampling(config: UseSamplingConfig = {}): UseSamplingReturn {
  const { onSuccess, onError } = config;

  const [state, setState] = useState<SamplingState>({
    isLoading: false,
    result: null,
    error: null,
    requestCount: 0,
  });

  const reset = useCallback(() => {
    setState({
      isLoading: false,
      result: null,
      error: null,
      requestCount: 0,
    });
  }, []);

  const createMessage = useCallback(
    async (params: SamplingRequestParams): Promise<SamplingResult> => {
      if (typeof window === 'undefined' || !window.navigator?.modelContext) {
        throw new Error('navigator.modelContext is not available');
      }
      const modelContext = window.navigator.modelContext as ModelContext;

      setState((prev) => ({
        ...prev,
        isLoading: true,
        error: null,
      }));

      try {
        const result = await modelContext.createMessage(params);

        setState((prev) => ({
          isLoading: false,
          result,
          error: null,
          requestCount: prev.requestCount + 1,
        }));

        onSuccess?.(result);
        return result;
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));

        setState((prev) => ({
          ...prev,
          isLoading: false,
          error,
        }));

        onError?.(error);
        throw error;
      }
    },
    [onSuccess, onError]
  );

  return {
    state,
    createMessage,
    reset,
  };
}

// Also export with the old name for backwards compatibility during migration
export { useSampling as useSamplingHandler };
export type { SamplingState as SamplingHandlerState };
export type { UseSamplingConfig as UseSamplingHandlerConfig };
export type { UseSamplingReturn as UseSamplingHandlerReturn };
