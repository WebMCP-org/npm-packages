import type { ModelContext, ModelContextTesting } from '@mcp-b/global';
import { initializeWebModelContext } from '@mcp-b/global';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from 'vitest-browser-react';
import { z } from 'zod';
import { useWebMCPPrompt } from './useWebMCPPrompt.js';

// Extend Navigator type for testing
declare global {
  interface Navigator {
    modelContext?: ModelContext;
    modelContextTesting?: ModelContextTesting;
  }
}

const TEST_CHANNEL_ID = `useWebMCPPrompt-test-${Date.now()}`;

/**
 * Helper to enable dev mode by setting globalThis.process.env.NODE_ENV.
 * Returns a cleanup function that restores the original state.
 */
function enableDevMode(): () => void {
  const g = globalThis as { process?: { env?: { NODE_ENV?: string } } };
  const hadProcess = 'process' in globalThis;
  const origProcess = g.process;

  g.process = { env: { NODE_ENV: 'test' } };

  return () => {
    if (hadProcess) {
      g.process = origProcess;
    } else {
      delete g.process;
    }
  };
}

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

    it('should keep isRegistered as false when registration handle is missing', async () => {
      const registerPromptSpy = vi
        .spyOn(navigator.modelContext as ModelContext, 'registerPrompt')
        .mockImplementation(
          () => undefined as unknown as ReturnType<ModelContext['registerPrompt']>
        );

      try {
        const { result } = await renderHook(() =>
          useWebMCPPrompt({
            name: 'no_handle_prompt',
            get: async () => ({
              messages: [{ role: 'user', content: { type: 'text', text: 'Hello' } }],
            }),
          })
        );

        expect(registerPromptSpy).toHaveBeenCalledTimes(1);
        expect(result.current.isRegistered).toBe(false);
      } finally {
        registerPromptSpy.mockRestore();
      }
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

      const prompts = navigator.modelContext?.listPrompts();
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

      const prompts = navigator.modelContext?.listPrompts();
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

      const prompts = navigator.modelContext?.listPrompts();
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

      expect(navigator.modelContext?.listPrompts()).toHaveLength(1);

      unmount();

      expect(navigator.modelContext?.listPrompts()).toHaveLength(0);
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
      const prompts = navigator.modelContext?.listPrompts();
      expect(prompts).toHaveLength(1);
      expect(prompts[0].name).toBe('dynamic_prompt');
    });

    it('should invoke the promptHandler when getPrompt is called', async () => {
      const getMessage = vi.fn().mockResolvedValue({
        messages: [{ role: 'user', content: { type: 'text', text: 'Hello from prompt' } }],
      });

      await renderHook(() =>
        useWebMCPPrompt({
          name: 'invoke_prompt',
          get: getMessage,
        })
      );

      // Execute the prompt through the model context
      const result = await navigator.modelContext?.getPrompt('invoke_prompt', {});

      expect(getMessage).toHaveBeenCalled();
      expect(result?.messages).toHaveLength(1);
      expect(result?.messages[0]?.content).toEqual({
        type: 'text',
        text: 'Hello from prompt',
      });
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

      expect(navigator.modelContext?.listPrompts()[0].name).toBe('prompt_v1');

      await rerender({ name: 'prompt_v2' });

      expect(navigator.modelContext?.listPrompts()[0].name).toBe('prompt_v2');
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

      expect(navigator.modelContext?.listPrompts()[0].description).toBe('Version 1');

      await rerender({ description: 'Version 2' });

      expect(navigator.modelContext?.listPrompts()[0].description).toBe('Version 2');
    });

    it('should not re-register when get function changes (ref-based)', async () => {
      const firstPrompts = navigator.modelContext?.listPrompts();
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

      expect(navigator.modelContext?.listPrompts()).toHaveLength(1);

      await rerender({
        get: async () => ({
          messages: [{ role: 'user', content: { type: 'text', text: 'v2' } }],
        }),
      });

      // Should still have 1 prompt (not re-registered)
      expect(navigator.modelContext?.listPrompts()).toHaveLength(1);
    });
  });

  describe('dev mode logging', () => {
    let cleanupDevMode: (() => void) | undefined;

    afterEach(() => {
      cleanupDevMode?.();
      cleanupDevMode = undefined;
    });

    it('should log registration in dev mode', async () => {
      cleanupDevMode = enableDevMode();
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      try {
        await renderHook(() =>
          useWebMCPPrompt({
            name: 'dev_log_prompt',
            get: async () => ({
              messages: [{ role: 'user', content: { type: 'text', text: 'Hello' } }],
            }),
          })
        );

        expect(logSpy).toHaveBeenCalledWith(
          expect.stringContaining('Registered prompt: dev_log_prompt')
        );
      } finally {
        logSpy.mockRestore();
      }
    });

    it('should log unregistration in dev mode', async () => {
      cleanupDevMode = enableDevMode();
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      try {
        const { unmount } = await renderHook(() =>
          useWebMCPPrompt({
            name: 'dev_unlog_prompt',
            get: async () => ({
              messages: [{ role: 'user', content: { type: 'text', text: 'Hello' } }],
            }),
          })
        );

        logSpy.mockClear();
        unmount();

        expect(logSpy).toHaveBeenCalledWith(
          expect.stringContaining('Unregistered prompt: dev_unlog_prompt')
        );
      } finally {
        logSpy.mockRestore();
      }
    });

    it('should warn in dev mode when no registration handle is returned', async () => {
      cleanupDevMode = enableDevMode();
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const registerPromptSpy = vi
        .spyOn(navigator.modelContext as ModelContext, 'registerPrompt')
        .mockImplementation(
          () => undefined as unknown as ReturnType<ModelContext['registerPrompt']>
        );

      try {
        await renderHook(() =>
          useWebMCPPrompt({
            name: 'no_handle_dev_prompt',
            get: async () => ({
              messages: [{ role: 'user', content: { type: 'text', text: 'Hello' } }],
            }),
          })
        );

        expect(warnSpy).toHaveBeenCalledWith(
          expect.stringContaining('did not return a registration handle')
        );
      } finally {
        warnSpy.mockRestore();
        registerPromptSpy.mockRestore();
      }
    });
  });

  describe('modelContext unavailability', () => {
    let cleanupDevMode: (() => void) | undefined;

    afterEach(() => {
      cleanupDevMode?.();
      cleanupDevMode = undefined;
    });

    it('should warn in dev mode when modelContext is not available', async () => {
      cleanupDevMode = enableDevMode();
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const savedModelContext = navigator.modelContext;

      try {
        Object.defineProperty(navigator, 'modelContext', {
          value: undefined,
          writable: true,
          configurable: true,
        });

        const { result } = await renderHook(() =>
          useWebMCPPrompt({
            name: 'unavailable_prompt',
            get: async () => ({
              messages: [{ role: 'user', content: { type: 'text', text: 'Hello' } }],
            }),
          })
        );

        expect(warnSpy).toHaveBeenCalledWith(
          expect.stringContaining('modelContext is not available')
        );
        expect(result.current.isRegistered).toBe(false);
      } finally {
        Object.defineProperty(navigator, 'modelContext', {
          value: savedModelContext,
          writable: true,
          configurable: true,
        });
        warnSpy.mockRestore();
      }
    });
  });

  describe('registration error handling', () => {
    it('should set isRegistered to false and rethrow when registerPrompt throws', async () => {
      const registerPromptSpy = vi
        .spyOn(navigator.modelContext as ModelContext, 'registerPrompt')
        .mockImplementation(() => {
          throw new Error('Registration failed');
        });

      try {
        let caughtError: Error | null = null;
        try {
          await renderHook(() =>
            useWebMCPPrompt({
              name: 'error_prompt',
              get: async () => ({
                messages: [{ role: 'user', content: { type: 'text', text: 'Hello' } }],
              }),
            })
          );
        } catch (e) {
          caughtError = e as Error;
        }

        expect(caughtError).toBeInstanceOf(Error);
        expect(caughtError?.message).toBe('Registration failed');
      } finally {
        registerPromptSpy.mockRestore();
      }
    });
  });
});
