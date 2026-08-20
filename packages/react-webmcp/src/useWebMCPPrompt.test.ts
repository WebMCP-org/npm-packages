import { initializeWebModelContext } from '@mcp-b/global';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { renderHook } from 'vitest-browser-react';
import { getBrowserMcpServer } from './model-context.js';
import { useWebMCPPrompt } from './useWebMCPPrompt.js';

const TEST_CHANNEL_ID = `useWebMCPPrompt-browser-${Date.now()}`;

function modelContext() {
  const context = getBrowserMcpServer();
  if (!context) {
    throw new Error('MCP-B model context is unavailable');
  }
  return context;
}

describe('useWebMCPPrompt in a browser runtime', () => {
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

  it('registers, executes, and unregisters a prompt', async () => {
    const unregister = vi.fn();
    const registerPrompt = vi
      .spyOn(modelContext(), 'registerPrompt')
      .mockReturnValue({ unregister });
    const argsSchema = {
      type: 'object',
      properties: {
        code: { type: 'string', description: 'Source to review' },
        language: { type: 'string' },
      },
      required: ['code'],
    } as const;
    const hook = await renderHook(() =>
      useWebMCPPrompt({
        name: 'review_code',
        description: 'Review source code',
        argsSchema,
        get: async ({ code, language }) => ({
          messages: [
            {
              role: 'user',
              content: {
                type: 'text',
                text: `Review this ${language ?? 'unknown'} code: ${code}`,
              },
            },
          ],
        }),
      })
    );

    expect(hook.result.current.isRegistered).toBe(true);
    expect(registerPrompt).toHaveBeenCalledOnce();
    const descriptor = registerPrompt.mock.calls[0]?.[0];
    if (!descriptor) throw new Error('Prompt was not registered');
    expect(descriptor).toMatchObject({
      name: 'review_code',
      description: 'Review source code',
      argsSchema: {
        type: 'object',
        properties: {
          code: {
            type: 'string',
            description: 'Source to review',
          },
          language: { type: 'string' },
        },
        required: ['code'],
      },
      get: expect.any(Function),
    });

    const response = await descriptor.get({
      code: 'const answer = 42',
      language: 'TypeScript',
    });
    expect(response.messages[0]).toMatchObject({
      role: 'user',
      content: {
        type: 'text',
        text: 'Review this TypeScript code: const answer = 42',
      },
    });

    await hook.unmount();
    expect(unregister).toHaveBeenCalledOnce();
  });

  it('uses the latest callback while re-registering changed descriptor metadata', async () => {
    const unregister = vi.fn();
    const registerPrompt = vi
      .spyOn(modelContext(), 'registerPrompt')
      .mockReturnValue({ unregister });
    const hook = await renderHook(
      ({ description, version }) =>
        useWebMCPPrompt({
          name: 'latest_prompt',
          description,
          get: async () => ({
            messages: [
              {
                role: 'user',
                content: { type: 'text', text: version },
              },
            ],
          }),
        }),
      {
        initialProps: {
          description: 'First description',
          version: 'first',
        },
      }
    );

    await hook.rerender({
      description: 'First description',
      version: 'second',
    });

    expect(registerPrompt).toHaveBeenCalledOnce();
    expect(unregister).not.toHaveBeenCalled();
    const firstDescriptor = registerPrompt.mock.calls[0]?.[0];
    if (!firstDescriptor) throw new Error('Prompt was not registered');
    const response = await firstDescriptor.get({});
    expect(response.messages[0]?.content).toMatchObject({
      type: 'text',
      text: 'second',
    });

    await hook.rerender({
      description: 'Second description',
      version: 'second',
    });

    expect(registerPrompt).toHaveBeenCalledTimes(2);
    expect(unregister).toHaveBeenCalledOnce();
    expect(registerPrompt.mock.calls[1]?.[0]).toMatchObject({
      name: 'latest_prompt',
      description: 'Second description',
    });

    await hook.unmount();
    expect(unregister).toHaveBeenCalledTimes(2);
  });

  it('registers once across re-renders when argsSchema is an inline literal', async () => {
    const unregister = vi.fn();
    const registerPrompt = vi
      .spyOn(modelContext(), 'registerPrompt')
      .mockReturnValue({ unregister });
    const hook = await renderHook(
      ({ version }: { version: string }) =>
        useWebMCPPrompt({
          name: 'inline_schema_prompt',
          description: 'Review source code',
          argsSchema: {
            type: 'object',
            properties: {
              code: { type: 'string', description: 'The code to review' },
            },
            required: ['code'],
          } as const,
          get: async ({ code }) => ({
            messages: [
              {
                role: 'user',
                content: { type: 'text', text: `${version}: ${code}` },
              },
            ],
          }),
        }),
      { initialProps: { version: 'first' } }
    );

    await hook.rerender({ version: 'second' });
    await hook.rerender({ version: 'third' });

    expect(registerPrompt).toHaveBeenCalledOnce();
    expect(unregister).not.toHaveBeenCalled();

    const descriptor = registerPrompt.mock.calls[0]?.[0];
    if (!descriptor) throw new Error('Prompt was not registered');
    const response = await descriptor.get({ code: 'const answer = 42' });
    expect(response.messages[0]?.content).toMatchObject({
      type: 'text',
      text: 'third: const answer = 42',
    });

    await hook.unmount();
    expect(unregister).toHaveBeenCalledOnce();
  });
});
