import type { ModelContext, ModelContextTesting } from '@mcp-b/global';
import { initializeWebModelContext } from '@mcp-b/global';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from 'vitest-browser-react';
import { useSampling, useSamplingHandler } from './useSamplingHandler.js';

// Extend Navigator type for testing
declare global {
  interface Navigator {
    modelContext?: ModelContext;
    modelContextTesting?: ModelContextTesting;
  }
}

const TEST_CHANNEL_ID = `useSampling-test-${Date.now()}`;

describe('useSampling', () => {
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
      const { result } = await renderHook(() => useSampling());

      expect(result.current.state).toEqual({
        isLoading: false,
        result: null,
        error: null,
        requestCount: 0,
      });
    });

    it('should provide createMessage and reset functions', async () => {
      const { result } = await renderHook(() => useSampling());

      expect(typeof result.current.createMessage).toBe('function');
      expect(typeof result.current.reset).toBe('function');
    });
  });

  describe('createMessage behavior', () => {
    it('should set error state when createMessage fails', async () => {
      const { result, act } = await renderHook(() => useSampling());

      await act(async () => {
        try {
          await result.current.createMessage({
            messages: [{ role: 'user' as const, content: { type: 'text' as const, text: 'Hi' } }],
            maxTokens: 100,
          });
        } catch {
          // Expected - createMessage will fail without a connected client
        }
      });

      // The error state should be set
      expect(result.current.state.error).not.toBeNull();
      expect(result.current.state.isLoading).toBe(false);
    });

    it('should call onError callback when createMessage fails', async () => {
      const onError = vi.fn();

      const { result, act } = await renderHook(() => useSampling({ onError }));

      await act(async () => {
        try {
          await result.current.createMessage({
            messages: [{ role: 'user' as const, content: { type: 'text' as const, text: 'Hi' } }],
            maxTokens: 100,
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
      const { result, act } = await renderHook(() => useSampling());

      // First, trigger an error to change state
      await act(async () => {
        try {
          await result.current.createMessage({
            messages: [{ role: 'user' as const, content: { type: 'text' as const, text: 'Hi' } }],
            maxTokens: 100,
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
    it('should export useSamplingHandler as an alias', () => {
      expect(useSamplingHandler).toBe(useSampling);
    });
  });
});
