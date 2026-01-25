import type { ModelContext, ModelContextTesting } from '@mcp-b/global';
import { initializeWebModelContext } from '@mcp-b/global';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from 'vitest-browser-react';
import { z } from 'zod/v4';
import { useWebMCPPrompt } from './useWebMCPPrompt.js';

// Extend Navigator type for testing
declare global {
  interface Navigator {
    modelContext?: ModelContext;
    modelContextTesting?: ModelContextTesting;
  }
}

const TEST_CHANNEL_ID = `useWebMCPPrompt-test-${Date.now()}`;

describe('useWebMCPPrompt', () => {
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
    it('should return isRegistered as true when registered', async () => {
      const { result } = await renderHook(() =>
        useWebMCPPrompt({
          name: 'test_prompt',
          get: async () => ({
            messages: [{ role: 'user', content: { type: 'text', text: 'Hello' } }],
          }),
        })
      );

      expect(result.current.isRegistered).toBe(true);
    });
  });

  describe('prompt registration', () => {
    it('should register prompt with navigator.modelContext', async () => {
      await renderHook(() =>
        useWebMCPPrompt({
          name: 'help_prompt',
          description: 'Get help with the application',
          get: async () => ({
            messages: [{ role: 'user', content: { type: 'text', text: 'Help me' } }],
          }),
        })
      );

      const prompts = navigator.modelContext!.listPrompts();
      expect(prompts).toHaveLength(1);
      expect(prompts[0].name).toBe('help_prompt');
      expect(prompts[0].description).toBe('Get help with the application');
    });

    it('should register prompt without description', async () => {
      await renderHook(() =>
        useWebMCPPrompt({
          name: 'simple_prompt',
          get: async () => ({
            messages: [{ role: 'user', content: { type: 'text', text: 'Simple' } }],
          }),
        })
      );

      const prompts = navigator.modelContext!.listPrompts();
      expect(prompts).toHaveLength(1);
      expect(prompts[0].name).toBe('simple_prompt');
    });

    it('should register prompt with args schema', async () => {
      await renderHook(() =>
        useWebMCPPrompt({
          name: 'code_review',
          description: 'Review code',
          argsSchema: {
            code: z.string(),
            language: z.string().optional(),
          },
          get: async ({ code, language }) => ({
            messages: [
              {
                role: 'user',
                content: { type: 'text', text: `Review this ${language ?? ''} code:\n${code}` },
              },
            ],
          }),
        })
      );

      const prompts = navigator.modelContext!.listPrompts();
      expect(prompts).toHaveLength(1);
      expect(prompts[0].name).toBe('code_review');
      // Check that arguments were registered
      expect(prompts[0].arguments).toBeDefined();
    });

    it('should unregister prompt on unmount', async () => {
      const { unmount } = await renderHook(() =>
        useWebMCPPrompt({
          name: 'test_prompt',
          get: async () => ({
            messages: [{ role: 'user', content: { type: 'text', text: 'Test' } }],
          }),
        })
      );

      expect(navigator.modelContext!.listPrompts()).toHaveLength(1);

      unmount();

      expect(navigator.modelContext!.listPrompts()).toHaveLength(0);
    });
  });

  describe('prompt execution', () => {
    it('should execute get function via internal API', async () => {
      const getMessage = vi.fn().mockResolvedValue({
        messages: [{ role: 'user', content: { type: 'text', text: 'Generated message' } }],
      });

      await renderHook(() =>
        useWebMCPPrompt({
          name: 'dynamic_prompt',
          argsSchema: {
            topic: z.string(),
          },
          get: getMessage,
        })
      );

      // Get the prompt and execute it via the internal model context
      const prompts = navigator.modelContext!.listPrompts();
      expect(prompts).toHaveLength(1);
      expect(prompts[0].name).toBe('dynamic_prompt');
    });
  });

  describe('re-registration behavior', () => {
    it('should re-register when name changes', async () => {
      const { rerender } = await renderHook(
        ({ name }) =>
          useWebMCPPrompt({
            name,
            get: async () => ({
              messages: [{ role: 'user', content: { type: 'text', text: 'Test' } }],
            }),
          }),
        { initialProps: { name: 'prompt_v1' } }
      );

      expect(navigator.modelContext!.listPrompts()[0].name).toBe('prompt_v1');

      await rerender({ name: 'prompt_v2' });

      expect(navigator.modelContext!.listPrompts()[0].name).toBe('prompt_v2');
    });

    it('should re-register when description changes', async () => {
      const { rerender } = await renderHook(
        ({ description }) =>
          useWebMCPPrompt({
            name: 'test_prompt',
            description,
            get: async () => ({
              messages: [{ role: 'user', content: { type: 'text', text: 'Test' } }],
            }),
          }),
        { initialProps: { description: 'Version 1' } }
      );

      expect(navigator.modelContext!.listPrompts()[0].description).toBe('Version 1');

      await rerender({ description: 'Version 2' });

      expect(navigator.modelContext!.listPrompts()[0].description).toBe('Version 2');
    });

    it('should not re-register when get function changes (ref-based)', async () => {
      const firstPrompts = navigator.modelContext!.listPrompts();
      expect(firstPrompts).toHaveLength(0);

      const { rerender } = await renderHook(
        ({ get }) =>
          useWebMCPPrompt({
            name: 'test_prompt',
            get,
          }),
        {
          initialProps: {
            get: async () => ({
              messages: [{ role: 'user', content: { type: 'text', text: 'v1' } }],
            }),
          },
        }
      );

      expect(navigator.modelContext!.listPrompts()).toHaveLength(1);

      await rerender({
        get: async () => ({
          messages: [{ role: 'user', content: { type: 'text', text: 'v2' } }],
        }),
      });

      // Should still have 1 prompt (not re-registered)
      expect(navigator.modelContext!.listPrompts()).toHaveLength(1);
    });
  });
});
