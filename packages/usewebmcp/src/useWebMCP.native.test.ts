import { createElement, StrictMode } from 'react';
import { beforeAll, expect, it, vi } from 'vitest';
import { renderHook } from 'vitest-browser-react';
import { useWebMCP } from './index.js';

function requireNativeModelContext() {
  const context = document.modelContext;
  if (!context || typeof context.executeTool !== 'function') {
    throw new Error('Run with Chrome Canary and WEBMCP_NATIVE=1');
  }
  return context;
}

async function registeredTool(name: string) {
  const context = requireNativeModelContext();
  const tool = await vi.waitFor(async () => {
    const found = (await context.getTools()).find((candidate) => candidate.name === name);
    if (!found) throw new Error(`${name} is not registered`);
    return found;
  });
  return { context, tool };
}

beforeAll(() => {
  const context = requireNativeModelContext();
  expect(context.registerTool).toBeTypeOf('function');
  expect(context.getTools).toBeTypeOf('function');
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
  const { context, tool } = await registeredTool('native_core');
  expect(hook.result.current).not.toHaveProperty('isRegistered');
  expect(hook.result.current.registrationError).toBeNull();
  expect((await context.getTools()).filter((tool) => tool.name === 'native_core')).toHaveLength(1);
  await hook.act(async () => {
    expect(JSON.parse(await context.executeTool(tool, { count: 2 }))).toEqual({ total: 3 });
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
  const { context, tool } = await registeredTool('native_cancelled');
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

it('returns an undefined result to native agents as null', async () => {
  const hook = await renderHook(() =>
    useWebMCP({ name: 'native_void', description: 'Returns nothing', execute: () => {} })
  );
  const { context, tool } = await registeredTool('native_void');
  await hook.act(async () => {
    await expect(context.executeTool(tool, {})).resolves.toBe('null');
  });
  expect(hook.result.current.state).toMatchObject({ error: null, executionCount: 1 });
  await hook.unmount();
});
