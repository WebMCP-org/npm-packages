import type { ElicitRequest, ElicitResult } from '@modelcontextprotocol/server';
import { useCallback } from 'react';
import { getBrowserMcpServer } from './model-context.js';
import { useMcpRequest, type McpRequestState } from './useMcpRequest.js';
type ElicitationParams = ElicitRequest['params'];
type ElicitationResult = ElicitResult;

/**
 * State for elicitation requests, tracking the current request and results.
 */
export interface ElicitationState extends McpRequestState<ElicitationResult> {}

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
  const request = useCallback(async (params: ElicitationParams): Promise<ElicitationResult> => {
    const modelContext = getBrowserMcpServer();
    if (!modelContext) {
      throw new Error('document.modelContext is not available');
    }

    return modelContext.elicitInput(params);
  }, []);
  const { execute, reset, state } = useMcpRequest(request, config);

  return {
    state,
    elicitInput: execute,
    reset,
  };
}
