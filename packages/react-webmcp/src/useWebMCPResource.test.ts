import { initializeWebModelContext } from '@mcp-b/global';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
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

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('registers, reads, and unregisters a resource', async () => {
    const unregister = vi.fn();
    const registerResource = vi
      .spyOn(modelContext(), 'registerResource')
      .mockReturnValue({ unregister });
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
    expect(registerResource).toHaveBeenCalledOnce();
    const descriptor = registerResource.mock.calls[0]?.[0];
    if (!descriptor) throw new Error('Resource was not registered');
    expect(descriptor).toMatchObject({
      uri: 'config://settings',
      name: 'Application Settings',
      description: 'Current application configuration',
      mimeType: 'application/json',
      read: expect.any(Function),
    });

    const response = await descriptor.read(new URL('config://settings'));
    expect(response.contents[0]).toMatchObject({
      uri: 'config://settings',
      mimeType: 'application/json',
      text: '{"theme":"dark"}',
    });

    await hook.unmount();
    expect(unregister).toHaveBeenCalledOnce();
  });

  it('uses the latest reader while re-registering changed descriptor metadata', async () => {
    const unregister = vi.fn();
    const registerResource = vi
      .spyOn(modelContext(), 'registerResource')
      .mockReturnValue({ unregister });
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
      name: 'First name',
      version: 'second',
    });

    expect(registerResource).toHaveBeenCalledOnce();
    expect(unregister).not.toHaveBeenCalled();
    const firstDescriptor = registerResource.mock.calls[0]?.[0];
    if (!firstDescriptor) throw new Error('Resource was not registered');
    const response = await firstDescriptor.read(new URL('data://latest'));
    expect(response.contents[0]).toMatchObject({
      uri: 'data://latest',
      text: 'second',
    });

    await hook.rerender({
      name: 'Second name',
      version: 'second',
    });

    expect(registerResource).toHaveBeenCalledTimes(2);
    expect(unregister).toHaveBeenCalledOnce();
    expect(registerResource.mock.calls[1]?.[0]).toMatchObject({
      uri: 'data://latest',
      name: 'Second name',
    });

    await hook.unmount();
    expect(unregister).toHaveBeenCalledTimes(2);
  });
});
