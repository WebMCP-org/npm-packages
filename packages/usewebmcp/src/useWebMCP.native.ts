import { executionState } from '@mcp-b/webmcp-plugins/execution-state';
import type { ChromeModelContext, ModelContext } from '@mcp-b/webmcp-types';
import { createElement, StrictMode } from 'react';
import { beforeAll, expect, it } from 'vitest';
import { renderHook } from 'vitest-browser-react';
import { z } from 'zod';
import { useWebMCP } from './index.js';

function hasExecution(
  context: ModelContext | undefined
): context is ChromeModelContext & Required<Pick<ChromeModelContext, 'executeTool'>> {
  return !!context && 'executeTool' in context && typeof context.executeTool === 'function';
}

beforeAll(() => {
  expect(document.modelContext, 'Run with Chrome Canary and WEBMCP_NATIVE=1').toBeDefined();
  expect(
    document.modelContext && Reflect.get(document.modelContext, '__isWebMCPPolyfill')
  ).not.toBe(true);
});

it('registers, validates, executes, and cleans up through native WebMCP in StrictMode', async () => {
  const execution = executionState();
  const failure = new Error('Count must be nonnegative');
  const hook = await renderHook(
    () =>
      useWebMCP({
        plugins: [execution],
        name: 'native_validated',
        description: 'Native validation',
        inputSchema: z.object({ count: z.string().transform(Number) }),
        execute: ({ count }) => {
          if (count < 0) throw failure;
          return { total: count + 1 };
        },
      }),
    { wrapper: ({ children }) => createElement(StrictMode, null, children) }
  );
  const context = document.modelContext;
  if (!hasExecution(context)) throw new Error('Native executeTool is unavailable');
  await hook.act(async () => {
    await expect
      .poll(async () => (await context.getTools()).some((tool) => tool.name === 'native_validated'))
      .toBe(true);
  });
  expect(hook.result.current).not.toHaveProperty('isRegistered');
  expect(hook.result.current.registrationError).toBeNull();
  const tools = (await context.getTools()).filter((tool) => tool.name === 'native_validated');
  expect(tools).toHaveLength(1);
  const tool = tools[0];
  if (!tool) throw new Error('Native tool is missing');
  await hook.act(async () => {
    const response = await context.executeTool(tool, JSON.stringify({ count: '2' }));
    expect(response && JSON.parse(response)).toEqual({ total: 3 });
    await expect(context.executeTool(tool, JSON.stringify({ count: 2 }))).rejects.toMatchObject({
      name: 'UnknownError',
    });
  });
  expect(execution.getSnapshot().error).toBeInstanceOf(TypeError);
  await hook.act(async () => {
    await expect(context.executeTool(tool, JSON.stringify({ count: '-1' }))).rejects.toMatchObject({
      name: 'UnknownError',
    });
  });
  expect(execution.getSnapshot().error).toBe(failure);
  expect(execution.getSnapshot().isExecuting).toBe(false);
  expect(execution.getSnapshot().executionCount).toBe(1);
  await hook.unmount();
  expect((await context.getTools()).some((tool) => tool.name === 'native_validated')).toBe(false);
});

it('forwards native cancellation to the handler and clears pending state', async () => {
  const execution = executionState();
  const started = Promise.withResolvers<AbortSignal>();
  const hook = await renderHook(() =>
    useWebMCP({
      plugins: [execution],
      name: 'native_cancelled',
      description: 'Native cancellation',
      execute: (_, { signal }) => {
        started.resolve(signal);
        return new Promise<never>(() => {});
      },
    })
  );
  const context = document.modelContext;
  if (!hasExecution(context)) throw new Error('Native executeTool is unavailable');
  await hook.act(async () => {
    await expect
      .poll(async () => (await context.getTools()).some((tool) => tool.name === 'native_cancelled'))
      .toBe(true);
  });
  const tool = (await context.getTools()).find((tool) => tool.name === 'native_cancelled');
  if (!tool) throw new Error('Native tool is missing');
  const controller = new AbortController();
  await hook.act(async () => {
    const execution = context.executeTool(tool, '{}', { signal: controller.signal });
    const rejection = expect(execution).rejects.toThrow();
    const signal = await started.promise;
    expect(signal.aborted).toBe(false);
    controller.abort();
    await rejection;
    await expect.poll(() => signal.aborted).toBe(true);
  });
  expect(execution.getSnapshot()).toMatchObject({ isExecuting: false, executionCount: 0 });
  await hook.unmount();
});
