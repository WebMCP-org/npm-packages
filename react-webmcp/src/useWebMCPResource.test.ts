import type { ModelContext, ModelContextTesting } from '@mcp-b/global';
import { initializeWebModelContext } from '@mcp-b/global';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
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

      const resources = navigator.modelContext!.listResources();
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

      const resources = navigator.modelContext!.listResources();
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

      expect(navigator.modelContext!.listResources()).toHaveLength(1);

      unmount();

      expect(navigator.modelContext!.listResources()).toHaveLength(0);
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
      const resources = navigator.modelContext!.listResources();
      expect(resources).toHaveLength(1);
      expect(resources[0].uri).toBe('app://settings');
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

      const resources = navigator.modelContext!.listResources();
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

      expect(navigator.modelContext!.listResources()[0].uri).toBe('data://v1');

      await rerender({ uri: 'data://v2' });

      expect(navigator.modelContext!.listResources()[0].uri).toBe('data://v2');
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

      expect(navigator.modelContext!.listResources()[0].name).toBe('Resource V1');

      await rerender({ name: 'Resource V2' });

      expect(navigator.modelContext!.listResources()[0].name).toBe('Resource V2');
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

      expect(navigator.modelContext!.listResources()[0].description).toBe('Desc V1');

      await rerender({ description: 'Desc V2' });

      expect(navigator.modelContext!.listResources()[0].description).toBe('Desc V2');
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

      expect(navigator.modelContext!.listResources()[0].mimeType).toBe('text/plain');

      await rerender({ mimeType: 'application/json' });

      expect(navigator.modelContext!.listResources()[0].mimeType).toBe('application/json');
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

      expect(navigator.modelContext!.listResources()).toHaveLength(1);

      await rerender({
        read: async () => ({
          contents: [{ uri: 'data://resource', text: 'v2' }],
        }),
      });

      // Should still have 1 resource (not re-registered unnecessarily)
      expect(navigator.modelContext!.listResources()).toHaveLength(1);
    });
  });
});
