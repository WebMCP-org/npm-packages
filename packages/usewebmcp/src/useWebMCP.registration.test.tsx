import { cleanupWebMCPPolyfill, initializeWebMCPPolyfill } from '@mcp-b/webmcp-polyfill';
import { executionState } from '@mcp-b/webmcp-plugins/execution-state';
import {
  Profiler,
  useLayoutEffect,
  useState,
  type ProfilerOnRenderCallback,
  type PropsWithChildren,
} from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, configure, renderHook } from 'vitest-browser-react/pure';
import { useWebMCP } from './useWebMCP.js';
import { useToolExecutionState } from './useToolExecutionState.js';

beforeEach(() => initializeWebMCPPolyfill());
afterEach(async () => {
  await cleanup();
  configure({ reactStrictMode: false });
  cleanupWebMCPPolyfill();
  vi.restoreAllMocks();
});

it('rejects changed registration metadata before passive cleanup while handler-only updates remain current', async () => {
  const register = vi.spyOn(document.modelContext, 'registerTool');
  const calls: Promise<unknown>[] = [];
  const execute = vi.fn((revision: number) => revision);
  let registered: (typeof register.mock.calls)[number][0] | undefined;
  function Tool({ revision, description }: { revision: number; description: string }) {
    useWebMCP({ name: 'layout_binding', description, execute: () => execute(revision) });
    useLayoutEffect(() => {
      if (!registered) return;
      const call = Promise.resolve(
        registered.execute({}, { signal: new AbortController().signal })
      );
      void call.catch(() => {});
      calls.push(call);
    }, [revision]);
    return null;
  }
  // act flushes passive cleanup early and hides the layout-to-passive interval.
  const actEnvironment = Reflect.get(globalThis, 'IS_REACT_ACT_ENVIRONMENT');
  Reflect.set(globalThis, 'IS_REACT_ACT_ENVIRONMENT', false);
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  try {
    root.render(<Tool revision={1} description="Original" />);
    await vi.waitFor(() => expect(register).toHaveBeenCalled());
    registered = register.mock.calls[0]?.[0];
    root.render(<Tool revision={2} description="Original" />);
    await vi.waitFor(() => expect(calls).toHaveLength(1));
    await expect(calls[0]).resolves.toBe(2);
    execute.mockClear();
    root.render(<Tool revision={3} description="Changed" />);
    await vi.waitFor(() => expect(calls).toHaveLength(2));
    await expect(calls[1]).rejects.toThrow();
    expect(execute).not.toHaveBeenCalled();
  } finally {
    root.unmount();
    host.remove();
    Reflect.set(globalThis, 'IS_REACT_ACT_ENVIRONMENT', actEnvironment);
  }
});

describe.each([false, true])('registration-only hook (StrictMode: %s)', (strict) => {
  beforeEach(() => configure({ reactStrictMode: strict }));

  it('adds zero commits or registrations for local and agent executions', async () => {
    const onRender = vi.fn<ProfilerOnRenderCallback>();
    const register = vi.spyOn(document.modelContext, 'registerTool');
    const pending = Promise.withResolvers<number>();
    const hook = await renderHook(
      () =>
        useWebMCP({
          name: 'registration_only',
          description: 'Run without observing execution state',
          execute: () => pending.promise,
        }),
      {
        wrapper: ({ children }: PropsWithChildren) => (
          <Profiler id="owner" onRender={onRender}>
            {children}
          </Profiler>
        ),
      }
    );
    const descriptor = register.mock.calls.at(-1)?.[0];
    if (!descriptor) throw new Error('Tool was not registered');
    const registrations = register.mock.calls.length;
    onRender.mockClear();
    const local = hook.result.current.execute({});
    const agent = descriptor.execute({}, { signal: new AbortController().signal });
    await hook.act(async () => {
      pending.resolve(42);
      await expect(local).resolves.toBe(42);
      await expect(agent).resolves.toBe(42);
    });
    expect(onRender).not.toHaveBeenCalled();
    expect(register).toHaveBeenCalledTimes(registrations);
    expect(hook.result.current).not.toHaveProperty('state');
  });

  it('updates only explicit subscribers and retains observations after they unsubscribe', async () => {
    const ownerCommits = vi.fn<ProfilerOnRenderCallback>();
    const pending = Promise.withResolvers<number>();
    const owner = await renderHook(
      () => {
        const [execution] = useState(() => executionState<number>());
        const tool = useWebMCP({
          name: 'isolated_status',
          description: 'Only status consumers update',
          execute: () => pending.promise,
          plugins: [execution],
        });
        return { tool, execution };
      },
      {
        wrapper: ({ children }: PropsWithChildren) => (
          <Profiler id="owner" onRender={ownerCommits}>
            {children}
          </Profiler>
        ),
      }
    );
    const consumer = await renderHook(() => useToolExecutionState(owner.result.current.execution));
    ownerCommits.mockClear();
    let running!: Promise<number>;
    await owner.act(async () => {
      running = owner.result.current.tool.execute({});
    });
    expect(consumer.result.current.isExecuting).toBe(true);
    expect(ownerCommits).not.toHaveBeenCalled();
    await consumer.unmount();
    await owner.act(async () => {
      pending.resolve(42);
      await running;
    });
    expect(ownerCommits).not.toHaveBeenCalled();

    const later = await renderHook(() => useToolExecutionState(owner.result.current.execution));
    expect(later.result.current).toEqual({
      isExecuting: false,
      error: null,
      lastResult: 42,
      executionCount: 1,
    });
    expect(ownerCommits).not.toHaveBeenCalled();
  });

  it('revokes waiting agent approval when registration changes while local invocation survives', async () => {
    const register = vi.spyOn(document.modelContext, 'registerTool');
    const entered = Promise.withResolvers<void>();
    const approval = Promise.withResolvers<void>();
    const execute = vi.fn(() => 'done');
    const hook = await renderHook(
      ({ revision }) =>
        useWebMCP({
          name: 'approval_lifetime',
          description: `Revision ${revision}`,
          execute,
          plugins: [
            {
              name: 'test-approval',
              aroundInvoke: async (call, next) => {
                await call.prepare();
                entered.resolve();
                await approval.promise;
                return next();
              },
            },
          ],
        }),
      { initialProps: { revision: 1 } }
    );
    const descriptor = register.mock.calls.at(-1)?.[0];
    if (!descriptor) throw new Error('Tool was not registered');
    const agent = descriptor.execute({}, { signal: new AbortController().signal });
    const rejected = expect(agent).rejects.toMatchObject({ name: 'AbortError' });
    const local = hook.result.current.execute({});
    await entered.promise;
    await hook.rerender({ revision: 2 });
    await rejected;
    expect(execute).not.toHaveBeenCalled();
    approval.resolve();
    await expect(local).resolves.toBe('done');
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it('rechecks the latest committed authority after approval without changing registration metadata', async () => {
    const register = vi.spyOn(document.modelContext, 'registerTool');
    const started = Promise.withResolvers<void>();
    const approval = Promise.withResolvers<void>();
    const execute = vi.fn(() => 'done');
    const hook = await renderHook(
      ({ authorized }) =>
        useWebMCP({
          name: 'current_authority',
          description: 'Rechecks permission before side effects',
          execute,
          checkBinding: () => {
            if (!authorized) throw new Error('Tool permission revoked');
          },
          plugins: [
            {
              name: 'test-approval',
              aroundInvoke: async (call, next) => {
                await call.prepare();
                started.resolve();
                await approval.promise;
                return next();
              },
            },
          ],
        }),
      { initialProps: { authorized: true } }
    );
    const descriptor = register.mock.calls.at(-1)?.[0];
    if (!descriptor) throw new Error('Tool was not registered');
    const registrations = register.mock.calls.length;
    const running = descriptor.execute({}, { signal: new AbortController().signal });
    await started.promise;
    await hook.rerender({ authorized: false });
    expect(register).toHaveBeenCalledTimes(registrations);
    const rejection = expect(running).rejects.toThrow('Tool permission revoked');
    approval.resolve();
    await rejection;
    expect(execute).not.toHaveBeenCalled();
  });
});
