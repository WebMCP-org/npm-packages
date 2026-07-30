import type {
  CreateMessageRequest,
  CreateMessageResult,
  CreateMessageResultWithTools,
} from '@modelcontextprotocol/server';
import { useCallback } from 'react';
import { getBrowserMcpServer } from './model-context.js';
import { useMcpRequest, type McpRequestState } from './useMcpRequest.js';

type SamplingRequestParams = CreateMessageRequest['params'];
type SamplingResult = CreateMessageResult | CreateMessageResultWithTools;

/**
 * State for sampling requests, tracking the current request and results.
 */
export interface SamplingState extends McpRequestState<SamplingResult> {}

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
  const request = useCallback(async (params: SamplingRequestParams): Promise<SamplingResult> => {
    const modelContext = getBrowserMcpServer();
    if (!modelContext) {
      throw new Error('document.modelContext is not available');
    }

    return modelContext.createMessage(params);
  }, []);
  const { execute, reset, state } = useMcpRequest(request, config);

  return {
    state,
    createMessage: execute,
    reset,
  };
}
