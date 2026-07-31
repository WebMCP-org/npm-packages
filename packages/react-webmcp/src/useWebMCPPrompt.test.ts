import { initializeWebModelContext } from '@mcp-b/global';
import { Suspense, createElement } from 'react';
import { beforeAll, describe, expect, it } from 'vitest';
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

  it('registers, executes, and unregisters a prompt through the real model context', async () => {
    const hook = await renderHook(() =>
      useWebMCPPrompt({
        name: 'review_code',
        description: 'Review source code',
        argsSchema: {
          type: 'object',
          properties: {
            code: { type: 'string', description: 'Source to review' },
            language: { type: 'string' },
          },
          required: ['code'],
        } as const,
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
    expect(modelContext().listPrompts()).toEqual([
      {
        name: 'review_code',
        description: 'Review source code',
        arguments: [
          {
            name: 'code',
            description: 'Source to review',
            required: true,
          },
          { name: 'language' },
        ],
      },
    ]);

    const response = await modelContext().getPrompt('review_code', {
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
    expect(modelContext().listPrompts()).toEqual([]);
  });

  it('uses the latest callback while re-registering changed descriptor metadata', async () => {
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
      description: 'Second description',
      version: 'second',
    });

    expect(modelContext().listPrompts()).toEqual([
      {
        name: 'latest_prompt',
        description: 'Second description',
      },
    ]);
    const response = await modelContext().getPrompt('latest_prompt');
    expect(response.messages[0]?.content).toMatchObject({
      type: 'text',
      text: 'second',
    });

    await hook.unmount();
  });

  it('keeps the committed callback while a newer render is suspended', async () => {
    const pending = new Promise<never>(() => {});

    const hook = await renderHook(
      ({ version, suspend }: { version: string; suspend?: boolean }) => {
        useWebMCPPrompt({
          name: 'committed_prompt',
          get: async () => ({
            messages: [
              {
                role: 'user',
                content: { type: 'text', text: version },
              },
            ],
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

    const response = await modelContext().getPrompt('committed_prompt');
    expect(response.messages[0]?.content).toMatchObject({
      type: 'text',
      text: 'committed',
    });

    await hook.unmount();
  });
});
