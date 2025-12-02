import type { ElicitationHandler, ElicitationParams, ElicitationResult } from '@mcp-b/global';
import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * State for the elicitation handler, tracking requests and errors.
 */
export interface ElicitationHandlerState {
  /** Whether an elicitation request is currently being processed */
  isProcessing: boolean;
  /** The last elicitation request that was processed */
  lastRequest: ElicitationParams | null;
  /** The last result returned from the handler */
  lastResult: ElicitationResult | null;
  /** Any error that occurred during the last request */
  error: Error | null;
  /** Total number of requests processed */
  requestCount: number;
}

/**
 * Configuration options for the useElicitationHandler hook.
 */
export interface UseElicitationHandlerConfig {
  /**
   * The handler function to process elicitation requests.
   * Called when a tool needs additional user input.
   *
   * @param params - The elicitation request parameters
   * @returns Promise resolving to the user's response
   *
   * @example Form elicitation:
   * ```typescript
   * handler: async (params) => {
   *   if (params.mode === 'url') {
   *     // URL mode - for sensitive data collection
   *     const confirmed = await showConfirmDialog(
   *       `Open URL: ${params.url}?\nReason: ${params.message}`
   *     );
   *     if (confirmed) {
   *       window.open(params.url, '_blank');
   *       return { action: 'accept' };
   *     }
   *     return { action: 'decline' };
   *   }
   *
   *   // Form mode - collect non-sensitive data
   *   const result = await showFormDialog(params.message, params.requestedSchema);
   *   return result;
   * }
   * ```
   */
  handler: ElicitationHandler;

  /**
   * Optional callback invoked when an elicitation request completes successfully.
   */
  onSuccess?: (result: ElicitationResult, request: ElicitationParams) => void;

  /**
   * Optional callback invoked when an elicitation request fails.
   */
  onError?: (error: Error, request: ElicitationParams) => void;
}

/**
 * Return value from the useElicitationHandler hook.
 */
export interface UseElicitationHandlerReturn {
  /** Current state of the elicitation handler */
  state: ElicitationHandlerState;
  /** Reset the handler state */
  reset: () => void;
  /** Whether the handler is currently registered */
  isRegistered: boolean;
}

/**
 * React hook for registering an elicitation handler with the Model Context API.
 *
 * Elicitation allows MCP servers to request additional user input when a tool
 * needs more information. There are two modes:
 *
 * 1. **Form mode** (`mode: 'form'` or undefined): For non-sensitive data collection
 *    using a schema-driven form.
 * 2. **URL mode** (`mode: 'url'`): For sensitive data collection via a web URL,
 *    such as API keys, payments, or OAuth flows.
 *
 * The hook:
 * - Registers the handler with `navigator.modelContext.setElicitationHandler()`
 * - Tracks request/response state
 * - Automatically unregisters on component unmount
 *
 * @param config - Configuration including the handler function and callbacks
 * @returns Object containing state and control methods
 *
 * @example Basic form elicitation:
 * ```tsx
 * function ElicitationProvider() {
 *   const { state, isRegistered } = useElicitationHandler({
 *     handler: async (params) => {
 *       if (params.mode === 'url') {
 *         // Handle URL mode for sensitive data
 *         const confirmed = window.confirm(
 *           `A tool wants to open: ${params.url}\n\nReason: ${params.message}`
 *         );
 *         if (confirmed) {
 *           window.open(params.url, '_blank');
 *           return { action: 'accept' };
 *         }
 *         return { action: 'decline' };
 *       }
 *
 *       // Handle form mode
 *       const formData = await showFormModal(params.message, params.requestedSchema);
 *       if (formData) {
 *         return { action: 'accept', content: formData };
 *       }
 *       return { action: 'cancel' };
 *     },
 *   });
 *
 *   return (
 *     <div>
 *       <p>Elicitation handler: {isRegistered ? 'active' : 'inactive'}</p>
 *       <p>Requests handled: {state.requestCount}</p>
 *     </div>
 *   );
 * }
 * ```
 *
 * @example With a form library (React Hook Form):
 * ```tsx
 * const { state, isRegistered } = useElicitationHandler({
 *   handler: async (params) => {
 *     if (params.mode === 'url') {
 *       window.open(params.url, '_blank');
 *       return { action: 'accept' };
 *     }
 *
 *     // Show a modal form and wait for submission
 *     return new Promise((resolve) => {
 *       setFormConfig({
 *         message: params.message,
 *         schema: params.requestedSchema,
 *         onSubmit: (data) => resolve({ action: 'accept', content: data }),
 *         onCancel: () => resolve({ action: 'cancel' }),
 *       });
 *       setShowForm(true);
 *     });
 *   },
 * });
 * ```
 *
 * @example Handling different field types:
 * ```tsx
 * useElicitationHandler({
 *   handler: async (params) => {
 *     if (params.mode === 'url') {
 *       return { action: 'decline' }; // Don't support URL mode
 *     }
 *
 *     const schema = params.requestedSchema;
 *     const formData: Record<string, string | number | boolean | string[]> = {};
 *
 *     for (const [key, prop] of Object.entries(schema.properties)) {
 *       let value: string | number | boolean | string[];
 *
 *       if (prop.enum) {
 *         // Show dropdown for enum types
 *         value = await showDropdown(prop.title || key, prop.enum);
 *       } else if (prop.type === 'boolean') {
 *         // Show checkbox for boolean
 *         value = await showCheckbox(prop.title || key);
 *       } else if (prop.type === 'number' || prop.type === 'integer') {
 *         // Show number input
 *         value = await showNumberInput(prop.title || key, prop.minimum, prop.maximum);
 *       } else {
 *         // Show text input
 *         value = await showTextInput(prop.title || key, prop.minLength, prop.maxLength);
 *       }
 *
 *       formData[key] = value;
 *     }
 *
 *     return { action: 'accept', content: formData };
 *   },
 * });
 * ```
 */
export function useElicitationHandler(
  config: UseElicitationHandlerConfig
): UseElicitationHandlerReturn {
  const { handler, onSuccess, onError } = config;

  const [state, setState] = useState<ElicitationHandlerState>({
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
        '[useElicitationHandler] navigator.modelContext not available. Handler will not be registered.'
      );
      return;
    }

    // Create a wrapped handler that tracks state
    const wrappedHandler: ElicitationHandler = async (params) => {
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

    const registration = window.navigator.modelContext.setElicitationHandler({
      handler: wrappedHandler,
    });

    setIsRegistered(true);
    console.log('[useElicitationHandler] Elicitation handler registered');

    return () => {
      registration.unregister();
      setIsRegistered(false);
      console.log('[useElicitationHandler] Elicitation handler unregistered');
    };
  }, []); // Empty deps - we use refs for the handler

  return {
    state,
    reset,
    isRegistered,
  };
}
