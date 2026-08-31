import { cleanupWebMCPPolyfill, initializeWebMCPPolyfill } from '@mcp-b/webmcp-polyfill';
import { Profiler, type ProfilerOnRenderCallback, type PropsWithChildren } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, configure, renderHook } from 'vitest-browser-react/pure';
import { useWebMCP } from './useWebMCP.js';

function withProfiler(onRender: ProfilerOnRenderCallback) {
  return function Wrapper({ children }: PropsWithChildren) {
    return (
      <Profiler id="useWebMCP" onRender={onRender}>
        {children}
      </Profiler>
    );
  };
}

beforeEach(() => initializeWebMCPPolyfill());
afterEach(async () => {
  await cleanup();
  configure({ reactStrictMode: false });
  cleanupWebMCPPolyfill();
  vi.restoreAllMocks();
});

// Profiler measures commits, not render attempts repeated by StrictMode or React's
// scheduler. Count every phase after mount, including effect-driven nested updates.
describe.each([false, true])('useWebMCP render budgets (StrictMode: %s)', (strict) => {
  beforeEach(() => configure({ reactStrictMode: strict }));

  it('adds no extra commits or registrations for equivalent inline definitions', async () => {
    const onRender = vi.fn<ProfilerOnRenderCallback>();
    const modelContext = document.modelContext;
    if (!modelContext) throw new Error('WebMCP polyfill is unavailable');
    const register = vi.spyOn(modelContext, 'registerTool');
    const hook = await renderHook(
      ({ revision }: { revision: number } = { revision: 1 }) =>
        useWebMCP({
          name: 'render_stable_tool',
          description: 'Uses the latest committed callback',
          inputSchema: {
            type: 'object',
            properties: { value: { type: 'number' } },
            required: ['value'],
          } as const,
          annotations: { readOnlyHint: true },
          execute: ({ value }) => revision + value,
        }),
      { initialProps: { revision: 1 }, wrapper: withProfiler(onRender) }
    );
    expect(onRender).toHaveBeenCalled();
    expect(register).toHaveBeenCalledTimes(strict ? 2 : 1);
    const { execute, reset, state } = hook.result.current;
    const registrations = register.mock.calls.length;
    onRender.mockClear();

    await hook.rerender({ revision: 2 });

    expect(onRender).toHaveBeenCalledTimes(1); // The requested parent render only.
    expect(register).toHaveBeenCalledTimes(registrations);
    expect(hook.result.current.state).toBe(state);
    expect(hook.result.current.execute).toBe(execute);
    expect(hook.result.current.reset).toBe(reset);
    await hook.act(async () => {
      await expect(execute({ value: 3 })).resolves.toBe(5);
    });
    expect(register).toHaveBeenCalledTimes(registrations);
    await hook.unmount();
    expect(await modelContext.getTools()).toEqual([]);
  });

  it('toggles registration without resetting state or adding effect-driven commits', async () => {
    const onRender = vi.fn<ProfilerOnRenderCallback>();
    const modelContext = document.modelContext;
    if (!modelContext) throw new Error('WebMCP polyfill is unavailable');
    const register = vi.spyOn(modelContext, 'registerTool');
    const hook = await renderHook(
      (
        { enabled, revision }: { enabled: boolean; revision: number } = {
          enabled: false,
          revision: 1,
        }
      ) =>
        useWebMCP({
          name: `render_enabled_${revision}`,
          description: 'Registers only while enabled',
          enabled,
          inputSchema: {
            type: 'object',
            properties: { query: { type: 'string', description: `Revision ${revision}` } },
          } as const,
          execute: () => revision,
        }),
      { initialProps: { enabled: false, revision: 1 }, wrapper: withProfiler(onRender) }
    );
    expect(onRender).toHaveBeenCalled();
    expect(register).not.toHaveBeenCalled();
    expect(await modelContext.getTools()).toEqual([]);

    // enabled controls exposure, not local execution or the lifetime of its state.
    await hook.act(async () => {
      await expect(hook.result.current.execute({})).resolves.toBe(1);
    });
    const { state, execute, reset } = hook.result.current;
    for (const props of [
      { enabled: false, revision: 2 },
      { enabled: true, revision: 2 },
      { enabled: false, revision: 2 },
      { enabled: false, revision: 3 },
      { enabled: true, revision: 3 },
    ]) {
      onRender.mockClear();
      await hook.rerender(props);
      expect(onRender).toHaveBeenCalledTimes(1);
      expect(hook.result.current.state).toBe(state);
      expect(hook.result.current.execute).toBe(execute);
      expect(hook.result.current.reset).toBe(reset);
      const tools = await modelContext.getTools();
      expect(tools.map(({ name }) => name)).toEqual(
        props.enabled ? [`render_enabled_${props.revision}`] : []
      );
      if (props.enabled) {
        expect(tools[0]?.inputSchema).toMatchObject({
          properties: { query: { description: `Revision ${props.revision}` } },
        });
      }
    }
    expect(register).toHaveBeenCalledTimes(2);
    await hook.act(async () => {
      await expect(execute({})).resolves.toBe(3);
    });
    expect(hook.result.current.state.executionCount).toBe(2);
    await hook.unmount();
    expect(await modelContext.getTools()).toEqual([]);
  });

  it('does not commit when resetting an already idle state', async () => {
    const onRender = vi.fn<ProfilerOnRenderCallback>();
    const hook = await renderHook(
      () => useWebMCP({ name: 'render_reset', description: 'Resets state', execute: () => 'done' }),
      { wrapper: withProfiler(onRender) }
    );
    expect(onRender).toHaveBeenCalled();
    const state = hook.result.current.state;
    onRender.mockClear();

    await hook.act(async () => hook.result.current.reset());

    expect(onRender).not.toHaveBeenCalled();
    expect(hook.result.current.state).toBe(state);
  });

  it('bounds commits for overlapping work and observable state transitions', async () => {
    const onRender = vi.fn<ProfilerOnRenderCallback>();
    const first = Promise.withResolvers<string>();
    const second = Promise.withResolvers<string>();
    const third = Promise.withResolvers<string>();
    const execute = vi
      .fn<() => Promise<string>>()
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise)
      .mockReturnValueOnce(third.promise);
    const hook = await renderHook(
      () => useWebMCP({ name: 'render_execution', description: 'Tracks pending work', execute }),
      { wrapper: withProfiler(onRender) }
    );
    expect(onRender).toHaveBeenCalled();
    const controls = hook.result.current;
    let firstRun!: Promise<unknown>;
    let secondRun!: Promise<unknown>;
    let thirdRun!: Promise<unknown>;
    onRender.mockClear();

    // Separate act scopes expose pending and settled states without timing assumptions.
    await hook.act(async () => {
      firstRun = controls.execute({});
    });
    expect(onRender).toHaveBeenCalledTimes(1);
    expect(hook.result.current.state.isExecuting).toBe(true);
    const pendingState = hook.result.current.state;
    onRender.mockClear();

    await hook.act(async () => {
      secondRun = controls.execute({});
    });
    expect(hook.result.current.state).toBe(pendingState);
    // React can commit an outer Profiler after a same-state bailout. State identity
    // catches needless allocation without relying on the scheduler skipping work.
    expect(onRender.mock.calls.length).toBeLessThanOrEqual(1);
    onRender.mockClear();

    const failure = new Error('First execution failed');
    await hook.act(async () => {
      first.reject(failure);
      await expect(firstRun).rejects.toThrow(failure);
    });
    expect(onRender).toHaveBeenCalledTimes(1);
    expect(hook.result.current.state).toMatchObject({
      isExecuting: true,
      error: failure,
      executionCount: 0,
    });
    onRender.mockClear();

    // A new overlapping execution must still clear an existing error.
    await hook.act(async () => {
      thirdRun = controls.execute({});
    });
    expect(onRender).toHaveBeenCalledTimes(1);
    expect(hook.result.current.state.error).toBeNull();
    onRender.mockClear();

    await hook.act(async () => {
      second.resolve('second');
      await secondRun;
    });
    expect(onRender).toHaveBeenCalledTimes(1);
    expect(hook.result.current.state).toMatchObject({
      isExecuting: true,
      lastResult: 'second',
      executionCount: 1,
    });
    onRender.mockClear();

    await hook.act(async () => {
      third.resolve('third');
      await thirdRun;
    });
    expect(onRender).toHaveBeenCalledTimes(1);
    expect(hook.result.current.state).toEqual({
      isExecuting: false,
      lastResult: 'third',
      error: null,
      executionCount: 2,
    });
    expect(hook.result.current.execute).toBe(controls.execute);
    expect(hook.result.current.reset).toBe(controls.reset);
    onRender.mockClear();

    await hook.act(async () => controls.reset());
    expect(onRender).toHaveBeenCalledTimes(1);
    expect(hook.result.current.state).toEqual({
      isExecuting: false,
      lastResult: null,
      error: null,
      executionCount: 0,
    });
  });
});
