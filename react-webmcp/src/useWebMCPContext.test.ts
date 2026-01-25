import type { ModelContext, ModelContextTesting } from '@mcp-b/global';
import { initializeWebModelContext } from '@mcp-b/global';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from 'vitest-browser-react';
import { useWebMCPContext } from './useWebMCPContext.js';

// Extend Navigator type for testing
declare global {
  interface Navigator {
    modelContext?: ModelContext;
    modelContextTesting?: ModelContextTesting;
  }
}

const TEST_CHANNEL_ID = `useWebMCPContext-test-${Date.now()}`;

describe('useWebMCPContext', () => {
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

  describe('tool registration', () => {
    it('should register a context tool with name and description', async () => {
      await renderHook(() =>
        useWebMCPContext('context_user', 'Get current user information', () => ({
          userId: '123',
          name: 'John',
        }))
      );

      const tools = navigator.modelContextTesting!.listTools();
      expect(tools).toHaveLength(1);
      expect(tools[0].name).toBe('context_user');
      expect(tools[0].description).toBe('Get current user information');
    });

    it('should register with read-only annotations', async () => {
      await renderHook(() =>
        useWebMCPContext('context_settings', 'Get app settings', () => ({ theme: 'dark' }))
      );

      const tools = navigator.modelContextTesting!.listTools();
      expect(tools).toHaveLength(1);
      // The tool should be registered (annotations are internal metadata)
      expect(tools[0].name).toBe('context_settings');
    });

    it('should unregister tool on unmount', async () => {
      const { unmount } = await renderHook(() =>
        useWebMCPContext('context_test', 'Test context', () => 'test')
      );

      expect(navigator.modelContextTesting!.listTools()).toHaveLength(1);

      unmount();

      expect(navigator.modelContextTesting!.listTools()).toHaveLength(0);
    });
  });

  describe('context value execution', () => {
    it('should return context value when executed', async () => {
      const contextValue = { userId: '456', role: 'admin' };

      await renderHook(() =>
        useWebMCPContext('context_current_user', 'Get current user', () => contextValue)
      );

      // Execute via testing API - returns formatted text directly, not wrapped in { content: [...] }
      const result = await navigator.modelContextTesting!.executeTool(
        'context_current_user',
        JSON.stringify({})
      );

      expect(result).toBe(JSON.stringify(contextValue, null, 2));
    });

    it('should return string values as-is', async () => {
      await renderHook(() => useWebMCPContext('context_status', 'Get status', () => 'active'));

      const result = await navigator.modelContextTesting!.executeTool(
        'context_status',
        JSON.stringify({})
      );

      expect(result).toBe('active');
    });

    it('should format object values as JSON', async () => {
      const contextValue = { items: [1, 2, 3], count: 3 };

      await renderHook(() => useWebMCPContext('context_items', 'Get items', () => contextValue));

      const result = await navigator.modelContextTesting!.executeTool(
        'context_items',
        JSON.stringify({})
      );

      expect(result).toBe(JSON.stringify(contextValue, null, 2));
    });

    it('should always use latest getValue function', async () => {
      let value = 'initial';

      const { rerender } = await renderHook(
        ({ getValue }) => useWebMCPContext('context_dynamic', 'Dynamic context', getValue),
        { initialProps: { getValue: () => value } }
      );

      // First execution
      let result = await navigator.modelContextTesting!.executeTool(
        'context_dynamic',
        JSON.stringify({})
      );
      expect(result).toBe('initial');

      // Update value and rerender with new getValue
      value = 'updated';
      await rerender({ getValue: () => value });

      // Second execution should use latest value
      result = await navigator.modelContextTesting!.executeTool(
        'context_dynamic',
        JSON.stringify({})
      );
      expect(result).toBe('updated');
    });
  });

  describe('state management', () => {
    it('should provide execution state', async () => {
      const { result } = await renderHook(() =>
        useWebMCPContext('context_state', 'State test', () => ({ data: 'test' }))
      );

      expect(result.current.state).toEqual({
        isExecuting: false,
        lastResult: null,
        error: null,
        executionCount: 0,
      });
    });

    it('should provide execute function', async () => {
      const { result } = await renderHook(() =>
        useWebMCPContext('context_exec', 'Exec test', () => ({ data: 'test' }))
      );

      expect(typeof result.current.execute).toBe('function');
    });

    it('should provide reset function', async () => {
      const { result } = await renderHook(() =>
        useWebMCPContext('context_reset', 'Reset test', () => ({ data: 'test' }))
      );

      expect(typeof result.current.reset).toBe('function');
    });

    it('should update state after manual execution', async () => {
      const contextValue = { key: 'value' };

      const { result, act } = await renderHook(() =>
        useWebMCPContext('context_manual', 'Manual test', () => contextValue)
      );

      await act(async () => {
        await result.current.execute({});
      });

      expect(result.current.state.lastResult).toEqual(contextValue);
      expect(result.current.state.executionCount).toBe(1);
    });
  });

  describe('re-registration behavior', () => {
    it('should re-register when name changes', async () => {
      const { rerender } = await renderHook(
        ({ name }) => useWebMCPContext(name, 'Description', () => 'value'),
        { initialProps: { name: 'context_v1' } }
      );

      expect(navigator.modelContextTesting!.listTools()[0].name).toBe('context_v1');

      await rerender({ name: 'context_v2' });

      expect(navigator.modelContextTesting!.listTools()[0].name).toBe('context_v2');
    });

    it('should re-register when description changes', async () => {
      const { rerender } = await renderHook(
        ({ description }) => useWebMCPContext('context_test', description, () => 'value'),
        { initialProps: { description: 'Desc V1' } }
      );

      expect(navigator.modelContextTesting!.listTools()[0].description).toBe('Desc V1');

      await rerender({ description: 'Desc V2' });

      expect(navigator.modelContextTesting!.listTools()[0].description).toBe('Desc V2');
    });

    it('should not re-register when getValue function changes (ref-based)', async () => {
      const { rerender } = await renderHook(
        ({ getValue }) => useWebMCPContext('context_ref', 'Test', getValue),
        { initialProps: { getValue: () => 'v1' } }
      );

      expect(navigator.modelContextTesting!.listTools()).toHaveLength(1);

      await rerender({ getValue: () => 'v2' });

      // Should still have 1 tool (not re-registered unnecessarily)
      expect(navigator.modelContextTesting!.listTools()).toHaveLength(1);
    });
  });
});
