import { initializeWebModelContext } from '@mcp-b/global';
import { Suspense, createElement } from 'react';
import { beforeAll, describe, expect, it } from 'vitest';
import { renderHook } from 'vitest-browser-react';
import { getBrowserMcpServer } from './model-context.js';
import { useWebMCPResource } from './useWebMCPResource.js';

const TEST_CHANNEL_ID = `useWebMCPResource-browser-${Date.now()}`;

function modelContext() {
  const context = getBrowserMcpServer();
  if (!context) {
    throw new Error('MCP-B model context is unavailable');
  }
  return context;
}

describe('useWebMCPResource in a browser runtime', () => {
  beforeAll(() => {
    if (!document.modelContext) {
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

  it('registers, reads, and unregisters a resource through the real model context', async () => {
    const hook = await renderHook(() =>
      useWebMCPResource({
        uri: 'config://settings',
        name: 'Application Settings',
        description: 'Current application configuration',
        mimeType: 'application/json',
        read: async (uri) => ({
          contents: [
            {
              uri: uri.href,
              mimeType: 'application/json',
              text: '{"theme":"dark"}',
            },
          ],
        }),
      })
    );

    expect(hook.result.current.isRegistered).toBe(true);
    expect(modelContext().listResources()).toEqual([
      {
        uri: 'config://settings',
        name: 'Application Settings',
        description: 'Current application configuration',
        mimeType: 'application/json',
      },
    ]);

    const response = await modelContext().readResource('config://settings');
    expect(response.contents[0]).toMatchObject({
      uri: 'config://settings',
      mimeType: 'application/json',
      text: '{"theme":"dark"}',
    });

    await hook.unmount();
    expect(modelContext().listResources()).toEqual([]);
  });

  it('uses the latest reader while re-registering changed descriptor metadata', async () => {
    const hook = await renderHook(
      ({ name, version }) =>
        useWebMCPResource({
          uri: 'data://latest',
          name,
          read: async (uri) => ({
            contents: [{ uri: uri.href, text: version }],
          }),
        }),
      {
        initialProps: {
          name: 'First name',
          version: 'first',
        },
      }
    );

    await hook.rerender({
      name: 'Second name',
      version: 'second',
    });

    expect(modelContext().listResources()).toEqual([
      {
        uri: 'data://latest',
        name: 'Second name',
      },
    ]);
    const response = await modelContext().readResource('data://latest');
    expect(response.contents[0]).toMatchObject({
      uri: 'data://latest',
      text: 'second',
    });

    await hook.unmount();
  });

  it('keeps the committed reader while a newer render is suspended', async () => {
    const pending = new Promise<never>(() => {});

    const hook = await renderHook(
      ({ version, suspend }: { version: string; suspend?: boolean }) => {
        useWebMCPResource({
          uri: 'data://committed',
          name: 'Committed resource',
          read: async (uri) => ({
            contents: [{ uri: uri.href, text: version }],
          }),
        });

        if (suspend) {
          throw pending;
        }
      },
      {
        initialProps: { version: 'committed' },
        wrapper: ({ children }) => createElement(Suspense, { fallback: null }, children),
      }
    );

    await hook.rerender({ version: 'uncommitted', suspend: true });

    const response = await modelContext().readResource('data://committed');
    expect(response.contents[0]).toMatchObject({
      uri: 'data://committed',
      text: 'committed',
    });

    await hook.unmount();
  });
});
