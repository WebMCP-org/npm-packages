import type { SamplingHandler, SamplingRequestParams, SamplingResult } from '@mcp-b/global';
import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * State for the sampling handler, tracking requests and errors.
 */
export interface SamplingHandlerState {
  /** Whether a sampling request is currently being processed */
  isProcessing: boolean;
  /** The last sampling request that was processed */
  lastRequest: SamplingRequestParams | null;
  /** The last result returned from the handler */
  lastResult: SamplingResult | null;
  /** Any error that occurred during the last request */
  error: Error | null;
  /** Total number of requests processed */
  requestCount: number;
}

/**
 * Configuration options for the useSamplingHandler hook.
 */
export interface UseSamplingHandlerConfig {
  /**
   * The handler function to process sampling requests.
   * Called when a tool in the MCP server needs LLM completion.
   *
   * @param params - The sampling request parameters including messages, tokens, etc.
   * @returns Promise resolving to the LLM response
   *
   * @example
   * ```typescript
   * handler: async (params) => {
   *   const response = await openai.chat.completions.create({
   *     model: 'gpt-4',
   *     messages: params.messages.map(m => ({
   *       role: m.role,
   *       content: typeof m.content === 'string'
   *         ? m.content
   *         : 'text' in m.content ? m.content.text : ''
   *     })),
   *     max_tokens: params.maxTokens,
   *     temperature: params.temperature,
   *   });
   *   return {
   *     model: 'gpt-4',
   *     role: 'assistant',
   *     content: { type: 'text', text: response.choices[0].message.content || '' },
   *     stopReason: 'endTurn',
   *   };
   * }
   * ```
   */
  handler: SamplingHandler;

  /**
   * Optional callback invoked when a sampling request completes successfully.
   */
  onSuccess?: (result: SamplingResult, request: SamplingRequestParams) => void;

  /**
   * Optional callback invoked when a sampling request fails.
   */
  onError?: (error: Error, request: SamplingRequestParams) => void;
}

/**
 * Return value from the useSamplingHandler hook.
 */
export interface UseSamplingHandlerReturn {
  /** Current state of the sampling handler */
  state: SamplingHandlerState;
  /** Reset the handler state */
  reset: () => void;
  /** Whether the handler is currently registered */
  isRegistered: boolean;
}

/**
 * React hook for registering a sampling handler with the Model Context API.
 *
 * Sampling allows MCP servers to request LLM completions from the client.
 * This is useful when tools need to leverage LLM capabilities for tasks
 * like summarization, generation, or analysis.
 *
 * The hook:
 * - Registers the handler with `navigator.modelContext.setSamplingHandler()`
 * - Tracks request/response state
 * - Automatically unregisters on component unmount
 *
 * @param config - Configuration including the handler function and callbacks
 * @returns Object containing state and control methods
 *
 * @example Basic usage with OpenAI:
 * ```tsx
 * function SamplingProvider() {
 *   const { state, isRegistered } = useSamplingHandler({
 *     handler: async (params) => {
 *       const response = await openai.chat.completions.create({
 *         model: 'gpt-4',
 *         messages: params.messages.map(m => ({
 *           role: m.role,
 *           content: typeof m.content === 'string'
 *             ? m.content
 *             : 'text' in m.content ? m.content.text : ''
 *         })),
 *         max_tokens: params.maxTokens,
 *       });
 *       return {
 *         model: 'gpt-4',
 *         role: 'assistant',
 *         content: { type: 'text', text: response.choices[0].message.content || '' },
 *         stopReason: 'endTurn',
 *       };
 *     },
 *     onSuccess: (result) => console.log('Sampling completed:', result),
 *     onError: (error) => console.error('Sampling failed:', error),
 *   });
 *
 *   return (
 *     <div>
 *       <p>Sampling handler: {isRegistered ? 'active' : 'inactive'}</p>
 *       <p>Requests processed: {state.requestCount}</p>
 *     </div>
 *   );
 * }
 * ```
 *
 * @example With Anthropic Claude:
 * ```tsx
 * useSamplingHandler({
 *   handler: async (params) => {
 *     const messages = params.messages.map(m => ({
 *       role: m.role,
 *       content: typeof m.content === 'string'
 *         ? m.content
 *         : 'text' in m.content ? m.content.text : ''
 *     }));
 *
 *     const response = await anthropic.messages.create({
 *       model: 'claude-3-opus-20240229',
 *       max_tokens: params.maxTokens,
 *       system: params.systemPrompt,
 *       messages,
 *     });
 *
 *     return {
 *       model: 'claude-3-opus-20240229',
 *       role: 'assistant',
 *       content: { type: 'text', text: response.content[0].text },
 *       stopReason: response.stop_reason === 'end_turn' ? 'endTurn' : 'maxTokens',
 *     };
 *   },
 * });
 * ```
 */
export function useSamplingHandler(config: UseSamplingHandlerConfig): UseSamplingHandlerReturn {
  const { handler, onSuccess, onError } = config;

  const [state, setState] = useState<SamplingHandlerState>({
    isProcessing: false,
    lastRequest: null,
    lastResult: null,
    error: null,
    requestCount: 0,
  });

  const [isRegistered, setIsRegistered] = useState(false);

  // Use refs to avoid stale closures
  const handlerRef = useRef(handler);
  const onSuccessRef = useRef(onSuccess);
  const onErrorRef = useRef(onError);

  useEffect(() => {
    handlerRef.current = handler;
  }, [handler]);

  useEffect(() => {
    onSuccessRef.current = onSuccess;
  }, [onSuccess]);

  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);

  const reset = useCallback(() => {
    setState({
      isProcessing: false,
      lastRequest: null,
      lastResult: null,
      error: null,
      requestCount: 0,
    });
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.navigator?.modelContext) {
      console.warn(
        '[useSamplingHandler] navigator.modelContext not available. Handler will not be registered.'
      );
      return;
    }

    // Create a wrapped handler that tracks state
    const wrappedHandler: SamplingHandler = async (params) => {
      setState((prev) => ({
        ...prev,
        isProcessing: true,
        lastRequest: params,
        error: null,
      }));

      try {
        const result = await handlerRef.current(params);

        setState((prev) => ({
          isProcessing: false,
          lastRequest: params,
          lastResult: result,
          error: null,
          requestCount: prev.requestCount + 1,
        }));

        if (onSuccessRef.current) {
          onSuccessRef.current(result, params);
        }

        return result;
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));

        setState((prev) => ({
          ...prev,
          isProcessing: false,
          error,
        }));

        if (onErrorRef.current) {
          onErrorRef.current(error, params);
        }

        throw error;
      }
    };

    const registration = window.navigator.modelContext.setSamplingHandler({
      handler: wrappedHandler,
    });

    setIsRegistered(true);
    console.log('[useSamplingHandler] Sampling handler registered');

    return () => {
      registration.unregister();
      setIsRegistered(false);
      console.log('[useSamplingHandler] Sampling handler unregistered');
    };
  }, []); // Empty deps - we use refs for the handler

  return {
    state,
    reset,
    isRegistered,
  };
}
