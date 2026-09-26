import { createElement, StrictMode } from 'react';
import { beforeAll, expect, it } from 'vitest';
import { renderHook } from 'vitest-browser-react';
import { useWebMCP } from './index.js';

function requireNativeModelContext() {
  const context = document.modelContext;
  if (!context || typeof context.executeTool !== 'function') {
    throw new Error('Run with Chrome Canary and WEBMCP_NATIVE=1');
  }
  return context;
}

beforeAll(() => {
  const context = requireNativeModelContext();
  expect(typeof context.registerTool).toBe('function');
  expect(typeof context.getTools).toBe('function');
});

it('registers, executes, and cleans up through native WebMCP in StrictMode', async () => {
  const failure = new Error('Count must be nonnegative');
  const hook = await renderHook(
    () =>
      useWebMCP({
        name: 'native_core',
        description: 'Native WebMCP core',
        inputSchema: {
          type: 'object',
          properties: { count: { type: 'number' } },
          required: ['count'],
        } as const,
        execute: ({ count }) => {
          if (count < 0) throw failure;
          return { total: count + 1 };
        },
      }),
    { wrapper: ({ children }) => createElement(StrictMode, null, children) }
  );
  const context = requireNativeModelContext();
  await hook.act(async () => {
    await expect
      .poll(async () => (await context.getTools()).some((tool) => tool.name === 'native_core'))
      .toBe(true);
  });
  expect(hook.result.current).not.toHaveProperty('isRegistered');
  expect(hook.result.current.registrationError).toBeNull();
  const tools = (await context.getTools()).filter((tool) => tool.name === 'native_core');
  expect(tools).toHaveLength(1);
  const tool = tools[0];
  if (!tool) throw new Error('Native tool is missing');
  await hook.act(async () => {
    const response = await context.executeTool(tool, { count: 2 });
    expect(response && JSON.parse(response)).toEqual({ total: 3 });
  });
  await hook.act(async () => {
    await expect(context.executeTool(tool, { count: -1 })).rejects.toMatchObject({
      name: 'UnknownError',
    });
  });
  expect(hook.result.current.state.error).toBe(failure);
  expect(hook.result.current.state.isExecuting).toBe(false);
  expect(hook.result.current.state.executionCount).toBe(1);
  await hook.unmount();
  expect((await context.getTools()).some((tool) => tool.name === 'native_core')).toBe(false);
});

it('forwards native cancellation to the handler and clears pending state', async () => {
  const started = Promise.withResolvers<AbortSignal>();
  const hook = await renderHook(() =>
    useWebMCP({
      name: 'native_cancelled',
      description: 'Native cancellation',
      execute: (_, { signal }) => {
        started.resolve(signal);
        return new Promise<never>(() => {});
      },
    })
  );
  const context = requireNativeModelContext();
  await hook.act(async () => {
    await expect
      .poll(async () => (await context.getTools()).some((tool) => tool.name === 'native_cancelled'))
      .toBe(true);
  });
  const tool = (await context.getTools()).find((tool) => tool.name === 'native_cancelled');
  if (!tool) throw new Error('Native tool is missing');
  const controller = new AbortController();
  await hook.act(async () => {
    const execution = context.executeTool(tool, {}, { signal: controller.signal });
    const rejection = expect(execution).rejects.toThrow();
    const signal = await started.promise;
    expect(signal.aborted).toBe(false);
    controller.abort();
    await rejection;
    await expect.poll(() => signal.aborted).toBe(true);
  });
  expect(hook.result.current.state).toMatchObject({ isExecuting: false, executionCount: 0 });
  await hook.unmount();
});
