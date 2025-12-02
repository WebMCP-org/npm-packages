import type { ElicitationParams, ElicitationResult } from '@mcp-b/global';
import { useCallback, useState } from 'react';

/**
 * State for elicitation requests, tracking the current request and results.
 */
export interface ElicitationState {
  /** Whether an elicitation request is currently in progress */
  isLoading: boolean;
  /** The last elicitation result received */
  result: ElicitationResult | null;
  /** Any error that occurred during the last request */
  error: Error | null;
  /** Total number of requests made */
  requestCount: number;
}

/**
 * Configuration options for the useElicitation hook.
 */
export interface UseElicitationConfig {
  /**
   * Optional callback invoked when an elicitation request completes successfully.
   */
  onSuccess?: (result: ElicitationResult) => void;

  /**
   * Optional callback invoked when an elicitation request fails.
   */
  onError?: (error: Error) => void;
}

/**
 * Return value from the useElicitation hook.
 */
export interface UseElicitationReturn {
  /** Current state of elicitation */
  state: ElicitationState;
  /** Function to request user input from the connected client */
  elicitInput: (params: ElicitationParams) => Promise<ElicitationResult>;
  /** Reset the state */
  reset: () => void;
}

/**
 * React hook for requesting user input from the connected MCP client.
 *
 * Elicitation allows the server (webpage) to request user input from the
 * connected client. This is useful when the page needs additional information
 * from the user, such as API keys, configuration options, or confirmations.
 *
 * There are two modes:
 * 1. **Form mode**: For non-sensitive data collection using a schema-driven form.
 * 2. **URL mode**: For sensitive data collection via a web URL (API keys, OAuth, etc.).
 *
 * @param config - Optional configuration including callbacks
 * @returns Object containing state and the elicitInput function
 *
 * @example Form elicitation:
 * ```tsx
 * function ConfigForm() {
 *   const { state, elicitInput } = useElicitation({
 *     onSuccess: (result) => console.log('Got input:', result),
 *     onError: (error) => console.error('Elicitation failed:', error),
 *   });
 *
 *   const handleConfigure = async () => {
 *     const result = await elicitInput({
 *       message: 'Please provide your configuration',
 *       requestedSchema: {
 *         type: 'object',
 *         properties: {
 *           apiKey: { type: 'string', title: 'API Key', description: 'Your API key' },
 *           model: { type: 'string', enum: ['gpt-4', 'gpt-3.5'], title: 'Model' }
 *         },
 *         required: ['apiKey']
 *       }
 *     });
 *
 *     if (result.action === 'accept') {
 *       console.log('Config:', result.content);
 *     }
 *   };
 *
 *   return (
 *     <button onClick={handleConfigure} disabled={state.isLoading}>
 *       Configure
 *     </button>
 *   );
 * }
 * ```
 *
 * @example URL elicitation (for sensitive data):
 * ```tsx
 * const { elicitInput } = useElicitation();
 *
 * const handleOAuth = async () => {
 *   const result = await elicitInput({
 *     mode: 'url',
 *     message: 'Please authenticate with GitHub',
 *     elicitationId: 'github-oauth-123',
 *     url: 'https://github.com/login/oauth/authorize?client_id=...'
 *   });
 *
 *   if (result.action === 'accept') {
 *     console.log('OAuth completed');
 *   }
 * };
 * ```
 */
export function useElicitation(config: UseElicitationConfig = {}): UseElicitationReturn {
  const { onSuccess, onError } = config;

  const [state, setState] = useState<ElicitationState>({
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

  const elicitInput = useCallback(
    async (params: ElicitationParams): Promise<ElicitationResult> => {
      if (typeof window === 'undefined' || !window.navigator?.modelContext) {
        throw new Error('navigator.modelContext is not available');
      }

      setState((prev) => ({
        ...prev,
        isLoading: true,
        error: null,
      }));

      try {
        const result = await window.navigator.modelContext.elicitInput(params);

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
    elicitInput,
    reset,
  };
}

// Also export with the old name for backwards compatibility during migration
export { useElicitation as useElicitationHandler };
export type { ElicitationState as ElicitationHandlerState };
export type { UseElicitationConfig as UseElicitationHandlerConfig };
export type { UseElicitationReturn as UseElicitationHandlerReturn };
