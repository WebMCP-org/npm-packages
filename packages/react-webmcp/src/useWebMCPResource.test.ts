import type { ModelContext, ModelContextTesting } from '@mcp-b/global';
import { initializeWebModelContext } from '@mcp-b/global';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from 'vitest-browser-react';
import { useWebMCPResource } from './useWebMCPResource.js';

// Extend Navigator type for testing
declare global {
  interface Navigator {
    modelContext?: ModelContext;
    modelContextTesting?: ModelContextTesting;
  }
}

const TEST_CHANNEL_ID = `useWebMCPResource-test-${Date.now()}`;

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

describe('useWebMCPResource', () => {
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
        useWebMCPResource({
          uri: 'app://settings',
          name: 'App Settings',
          read: async () => ({
            contents: [{ uri: 'app://settings', text: '{}' }],
          }),
        })
      );

      expect(result.current.isRegistered).toBe(true);
    });

    it('should keep isRegistered as false when registration handle is missing', async () => {
      const registerResourceSpy = vi
        .spyOn(navigator.modelContext as ModelContext, 'registerResource')
        .mockImplementation(
          () => undefined as unknown as ReturnType<ModelContext['registerResource']>
        );

      try {
        const { result } = await renderHook(() =>
          useWebMCPResource({
            uri: 'app://missing-handle',
            name: 'Missing Handle',
            read: async () => ({
              contents: [{ uri: 'app://missing-handle', text: '{}' }],
            }),
          })
        );

        expect(registerResourceSpy).toHaveBeenCalledTimes(1);
        expect(result.current.isRegistered).toBe(false);
      } finally {
        registerResourceSpy.mockRestore();
      }
    });
  });

  describe('resource registration', () => {
    it('should register resource with navigator.modelContext', async () => {
      await renderHook(() =>
        useWebMCPResource({
          uri: 'config://app',
          name: 'App Configuration',
          description: 'Application configuration settings',
          mimeType: 'application/json',
          read: async () => ({
            contents: [{ uri: 'config://app', text: '{"theme":"dark"}' }],
          }),
        })
      );

      const resources = navigator.modelContext?.listResources();
      expect(resources).toHaveLength(1);
      expect(resources[0].uri).toBe('config://app');
      expect(resources[0].name).toBe('App Configuration');
      expect(resources[0].description).toBe('Application configuration settings');
      expect(resources[0].mimeType).toBe('application/json');
    });

    it('should register resource without optional fields', async () => {
      await renderHook(() =>
        useWebMCPResource({
          uri: 'data://items',
          name: 'Items',
          read: async () => ({
            contents: [{ uri: 'data://items', text: '[]' }],
          }),
        })
      );

      const resources = navigator.modelContext?.listResources();
      expect(resources).toHaveLength(1);
      expect(resources[0].uri).toBe('data://items');
      expect(resources[0].name).toBe('Items');
    });

    it('should unregister resource on unmount', async () => {
      const { unmount } = await renderHook(() =>
        useWebMCPResource({
          uri: 'test://resource',
          name: 'Test Resource',
          read: async () => ({
            contents: [{ uri: 'test://resource', text: 'test' }],
          }),
        })
      );

      expect(navigator.modelContext?.listResources()).toHaveLength(1);

      unmount();

      expect(navigator.modelContext?.listResources()).toHaveLength(0);
    });
  });

  describe('resource reading', () => {
    it('should execute read function with URI', async () => {
      const readFn = vi.fn().mockResolvedValue({
        contents: [{ uri: 'app://settings', text: '{"theme":"light"}' }],
      });

      await renderHook(() =>
        useWebMCPResource({
          uri: 'app://settings',
          name: 'Settings',
          read: readFn,
        })
      );

      // The resource is registered, verify it's there
      const resources = navigator.modelContext?.listResources();
      expect(resources).toHaveLength(1);
      expect(resources[0].uri).toBe('app://settings');
    });

    it('should invoke the resourceHandler when readResource is called', async () => {
      const readFn = vi.fn().mockResolvedValue({
        contents: [{ uri: 'app://data', text: '{"result":"ok"}' }],
      });

      await renderHook(() =>
        useWebMCPResource({
          uri: 'app://data',
          name: 'Data Resource',
          read: readFn,
        })
      );

      // Execute the resource read through the model context
      const result = await navigator.modelContext?.readResource('app://data');

      expect(readFn).toHaveBeenCalled();
      expect(result?.contents).toHaveLength(1);
      expect(result?.contents[0]?.text).toBe('{"result":"ok"}');
    });

    it('should register resource with correct structure', async () => {
      await renderHook(() =>
        useWebMCPResource({
          uri: 'data://items',
          name: 'Items',
          read: async () => ({
            contents: [
              {
                uri: 'data://items',
                mimeType: 'application/json',
                text: '[{"id":1},{"id":2}]',
              },
            ],
          }),
        })
      );

      const resources = navigator.modelContext?.listResources();
      expect(resources).toHaveLength(1);
      expect(resources[0].name).toBe('Items');
    });
  });

  describe('re-registration behavior', () => {
    it('should re-register when uri changes', async () => {
      const { rerender } = await renderHook(
        ({ uri }) =>
          useWebMCPResource({
            uri,
            name: 'Resource',
            read: async () => ({
              contents: [{ uri, text: 'data' }],
            }),
          }),
        { initialProps: { uri: 'data://v1' } }
      );

      expect(navigator.modelContext?.listResources()[0].uri).toBe('data://v1');

      await rerender({ uri: 'data://v2' });

      expect(navigator.modelContext?.listResources()[0].uri).toBe('data://v2');
    });

    it('should re-register when name changes', async () => {
      const { rerender } = await renderHook(
        ({ name }) =>
          useWebMCPResource({
            uri: 'data://resource',
            name,
            read: async () => ({
              contents: [{ uri: 'data://resource', text: 'data' }],
            }),
          }),
        { initialProps: { name: 'Resource V1' } }
      );

      expect(navigator.modelContext?.listResources()[0].name).toBe('Resource V1');

      await rerender({ name: 'Resource V2' });

      expect(navigator.modelContext?.listResources()[0].name).toBe('Resource V2');
    });

    it('should re-register when description changes', async () => {
      const { rerender } = await renderHook(
        ({ description }) =>
          useWebMCPResource({
            uri: 'data://resource',
            name: 'Resource',
            description,
            read: async () => ({
              contents: [{ uri: 'data://resource', text: 'data' }],
            }),
          }),
        { initialProps: { description: 'Desc V1' } }
      );

      expect(navigator.modelContext?.listResources()[0].description).toBe('Desc V1');

      await rerender({ description: 'Desc V2' });

      expect(navigator.modelContext?.listResources()[0].description).toBe('Desc V2');
    });

    it('should re-register when mimeType changes', async () => {
      const { rerender } = await renderHook(
        ({ mimeType }) =>
          useWebMCPResource({
            uri: 'data://resource',
            name: 'Resource',
            mimeType,
            read: async () => ({
              contents: [{ uri: 'data://resource', text: 'data' }],
            }),
          }),
        { initialProps: { mimeType: 'text/plain' } }
      );

      expect(navigator.modelContext?.listResources()[0].mimeType).toBe('text/plain');

      await rerender({ mimeType: 'application/json' });

      expect(navigator.modelContext?.listResources()[0].mimeType).toBe('application/json');
    });

    it('should not re-register when read function changes (ref-based)', async () => {
      const { rerender } = await renderHook(
        ({ read }) =>
          useWebMCPResource({
            uri: 'data://resource',
            name: 'Resource',
            read,
          }),
        {
          initialProps: {
            read: async () => ({
              contents: [{ uri: 'data://resource', text: 'v1' }],
            }),
          },
        }
      );

      expect(navigator.modelContext?.listResources()).toHaveLength(1);

      await rerender({
        read: async () => ({
          contents: [{ uri: 'data://resource', text: 'v2' }],
        }),
      });

      // Should still have 1 resource (not re-registered unnecessarily)
      expect(navigator.modelContext?.listResources()).toHaveLength(1);
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
          useWebMCPResource({
            uri: 'log://registered',
            name: 'Log Resource',
            read: async () => ({
              contents: [{ uri: 'log://registered', text: '{}' }],
            }),
          })
        );

        expect(logSpy).toHaveBeenCalledWith(
          expect.stringContaining('Registered resource: log://registered')
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
          useWebMCPResource({
            uri: 'log://unregistered',
            name: 'Unlog Resource',
            read: async () => ({
              contents: [{ uri: 'log://unregistered', text: '{}' }],
            }),
          })
        );

        logSpy.mockClear();
        unmount();

        expect(logSpy).toHaveBeenCalledWith(
          expect.stringContaining('Unregistered resource: log://unregistered')
        );
      } finally {
        logSpy.mockRestore();
      }
    });

    it('should warn in dev mode when no registration handle is returned', async () => {
      cleanupDevMode = enableDevMode();
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const registerResourceSpy = vi
        .spyOn(navigator.modelContext as ModelContext, 'registerResource')
        .mockImplementation(
          () => undefined as unknown as ReturnType<ModelContext['registerResource']>
        );

      try {
        await renderHook(() =>
          useWebMCPResource({
            uri: 'nohandle://resource',
            name: 'No Handle Dev',
            read: async () => ({
              contents: [{ uri: 'nohandle://resource', text: '{}' }],
            }),
          })
        );

        expect(warnSpy).toHaveBeenCalledWith(
          expect.stringContaining('did not return a registration handle')
        );
      } finally {
        warnSpy.mockRestore();
        registerResourceSpy.mockRestore();
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
          useWebMCPResource({
            uri: 'unavailable://resource',
            name: 'Unavailable',
            read: async () => ({
              contents: [{ uri: 'unavailable://resource', text: '{}' }],
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
    it('should set isRegistered to false and rethrow when registerResource throws', async () => {
      const registerResourceSpy = vi
        .spyOn(navigator.modelContext as ModelContext, 'registerResource')
        .mockImplementation(() => {
          throw new Error('Resource registration failed');
        });

      try {
        let caughtError: Error | null = null;
        try {
          await renderHook(() =>
            useWebMCPResource({
              uri: 'error://resource',
              name: 'Error Resource',
              read: async () => ({
                contents: [{ uri: 'error://resource', text: '{}' }],
              }),
            })
          );
        } catch (e) {
          caughtError = e as Error;
        }

        expect(caughtError).toBeInstanceOf(Error);
        expect(caughtError?.message).toBe('Resource registration failed');
      } finally {
        registerResourceSpy.mockRestore();
      }
    });
  });
});
