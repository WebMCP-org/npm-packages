import type { ModelContext, ModelContextTesting } from '@mcp-b/global';
import { initializeWebModelContext } from '@mcp-b/global';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from 'vitest-browser-react';
import { useElicitation, useElicitationHandler } from './useElicitationHandler.js';

// Extend Navigator type for testing
declare global {
  interface Navigator {
    modelContext?: ModelContext;
    modelContextTesting?: ModelContextTesting;
  }
}

const TEST_CHANNEL_ID = `useElicitation-test-${Date.now()}`;

describe('useElicitation', () => {
  beforeAll(() => {
    if (!navigator.modelContext) {
      initializeWebModelContext({
        transport: {
          tabServer: {
            channelId: TEST_CHANNEL_ID,
            allowedOrigins: [window.location.origin],
          },
        },
      });
    }
  });

  beforeEach(() => {
    navigator.modelContext?.clearContext();
    navigator.modelContextTesting?.reset();
  });

  describe('initial state', () => {
    it('should have correct initial state', async () => {
      const { result } = await renderHook(() => useElicitation());

      expect(result.current.state).toEqual({
        isLoading: false,
        result: null,
        error: null,
        requestCount: 0,
      });
    });

    it('should provide elicitInput and reset functions', async () => {
      const { result } = await renderHook(() => useElicitation());

      expect(typeof result.current.elicitInput).toBe('function');
      expect(typeof result.current.reset).toBe('function');
    });
  });

  describe('elicitInput behavior', () => {
    it('should set error state when elicitInput fails', async () => {
      const { result, act } = await renderHook(() => useElicitation());

      await act(async () => {
        try {
          await result.current.elicitInput({
            message: 'Configure',
            requestedSchema: { type: 'object' as const, properties: {} },
          });
        } catch {
          // Expected - elicitInput will fail without a connected client
        }
      });

      // The error state should be set
      expect(result.current.state.error).not.toBeNull();
      expect(result.current.state.isLoading).toBe(false);
    });

    it('should call onError callback when elicitInput fails', async () => {
      const onError = vi.fn();

      const { result, act } = await renderHook(() => useElicitation({ onError }));

      await act(async () => {
        try {
          await result.current.elicitInput({
            message: 'Configure',
            requestedSchema: { type: 'object' as const, properties: {} },
          });
        } catch {
          // Expected
        }
      });

      expect(onError).toHaveBeenCalled();
      expect(onError.mock.calls[0][0]).toBeInstanceOf(Error);
    });
  });

  describe('reset', () => {
    it('should reset state to initial values', async () => {
      const { result, act } = await renderHook(() => useElicitation());

      // First, trigger an error to change state
      await act(async () => {
        try {
          await result.current.elicitInput({
            message: 'Configure',
            requestedSchema: { type: 'object' as const, properties: {} },
          });
        } catch {
          // Expected
        }
      });

      // Verify state changed
      expect(result.current.state.error).not.toBeNull();

      // Reset
      await act(async () => {
        result.current.reset();
      });

      expect(result.current.state).toEqual({
        isLoading: false,
        result: null,
        error: null,
        requestCount: 0,
      });
    });
  });

  describe('backwards compatibility', () => {
    it('should export useElicitationHandler as an alias', () => {
      expect(useElicitationHandler).toBe(useElicitation);
    });
  });
});
