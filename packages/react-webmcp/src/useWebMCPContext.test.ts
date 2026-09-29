import '@mcp-b/global';
import type { CallToolResult, WebMCP } from '@mcp-b/webmcp-ts-sdk';
import { CallToolResultSchema } from '@modelcontextprotocol/core';
import { Suspense, createElement } from 'react';
import { describe, expect, it } from 'vitest';
import { renderHook } from 'vitest-browser-react';
import { useWebMCPContext } from './useWebMCPContext.js';

function modelContext(): WebMCP.ModelContext {
  if (!document.modelContext) throw new Error('document.modelContext is unavailable');
  return document.modelContext;
}

async function executeRegisteredTool(name: string): Promise<CallToolResult> {
  const tool = (await modelContext().getTools()).find((candidate) => candidate.name === name);
  if (!tool) throw new Error(`Tool not found: ${name}`);
  return CallToolResultSchema.parse(JSON.parse(await modelContext().executeTool(tool, {})));
}

describe('useWebMCPContext in a browser runtime', () => {
  it('registers, normalizes, and unregisters a context tool', async () => {
    const hook = await renderHook(() =>
      useWebMCPContext('context_user', 'Get the current user', () => ({
        id: 'user-1',
        role: 'admin',
      }))
    );

    expect(await modelContext().getTools()).toMatchObject([
      {
        name: 'context_user',
        description: 'Get the current user',
      },
    ]);

    const response = await executeRegisteredTool('context_user');
    expect(response.content[0]).toMatchObject({
      type: 'text',
      text: '{"id":"user-1","role":"admin"}',
    });
    expect(response.structuredContent).toEqual({ id: 'user-1', role: 'admin' });

    await hook.unmount();
    expect(await modelContext().getTools()).toEqual([]);
  });

  it('uses the latest getter and exposes the canonical execution state', async () => {
    const hook = await renderHook(
      ({ value }: { value: string } = { value: 'first' }) =>
        useWebMCPContext('context_latest', 'Get latest value', () => value),
      { initialProps: { value: 'first' } }
    );

    await hook.rerender({ value: 'second' });
    expect((await executeRegisteredTool('context_latest')).content[0]).toMatchObject({
      type: 'text',
      text: 'second',
    });

    await hook.act(async () => {
      await hook.result.current.execute({});
    });
    expect(hook.result.current.state).toMatchObject({
      isExecuting: false,
      lastResult: 'second',
      error: null,
      executionCount: 2,
    });

    await hook.act(() => {
      hook.result.current.reset();
    });
    expect(hook.result.current.state).toEqual({
      isExecuting: false,
      lastResult: null,
      error: null,
      executionCount: 0,
    });

    await hook.unmount();
  });

  it('keeps the committed getter while a newer render is suspended', async () => {
    const pending = new Promise<never>(() => {});

    const hook = await renderHook<{ value: string; suspend?: boolean }, void>(
      ({ value, suspend } = { value: 'committed' }) => {
        useWebMCPContext('context_committed', 'Get committed value', () => value);

        if (suspend) {
          throw pending;
        }
      },
      {
        initialProps: { value: 'committed' },
        wrapper: ({ children }) => createElement(Suspense, { fallback: null }, children),
      }
    );

    await hook.rerender({ value: 'uncommitted', suspend: true });

    expect((await executeRegisteredTool('context_committed')).content[0]).toMatchObject({
      type: 'text',
      text: 'committed',
    });

    await hook.unmount();
  });
});
