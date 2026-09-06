import { cleanupWebMCPPolyfill, initializeWebMCPPolyfill } from '@mcp-b/webmcp-polyfill';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, renderHook } from 'vitest-browser-react';
import { useWebMCP } from './useWebMCP.js';

beforeEach(() => initializeWebMCPPolyfill());
afterEach(async () => {
  await cleanup();
  cleanupWebMCPPolyfill();
  vi.restoreAllMocks();
});

it.each(['output', 'error'] as const)(
  'cancels asynchronous %s formatting without disturbing another call or accepting late completion',
  async (stage) => {
    const formatting = Promise.withResolvers<string>();
    const started = Promise.withResolvers<void>();
    const survivor = Promise.withResolvers<string>();
    const format = vi.fn(() => {
      started.resolve();
      return formatting.promise;
    });
    const execute = vi
      .fn<() => string | Promise<string>>()
      .mockImplementationOnce(() => {
        if (stage === 'error') throw new Error('Handler failed');
        return 'raw';
      })
      .mockReturnValueOnce(survivor.promise);
    const register = vi.spyOn(document.modelContext, 'registerTool');
    const hook = await renderHook(() =>
      useWebMCP({
        name: `cancel_${stage}_formatting`,
        description: 'Cancels formatting independently of other calls',
        execute,
        ...(stage === 'output' ? { formatOutput: format } : { formatError: format }),
      })
    );
    const tool = register.mock.calls[0]?.[0];
    if (!tool) throw new Error('Tool was not registered');
    const controller = new AbortController();
    let cancelled!: Promise<unknown>;
    let surviving!: Promise<string>;
    await hook.act(async () => {
      cancelled = Promise.resolve(tool.execute({}, { signal: controller.signal }));
      await started.promise;
      surviving = hook.result.current.execute({});
    });
    const reason = new Error('Cancelled while formatting');
    await hook.act(async () => {
      const rejection = expect(cancelled).rejects.toBe(reason);
      controller.abort(reason);
      await rejection;
    });
    expect(hook.result.current.state).toEqual({
      isExecuting: true,
      lastResult: null,
      error: reason,
      executionCount: 0,
    });
    await hook.act(async () => {
      survivor.resolve('success');
      await expect(surviving).resolves.toBe('success');
    });
    expect(hook.result.current.state).toEqual({
      isExecuting: false,
      lastResult: 'success',
      error: null,
      executionCount: 1,
    });
    const settled = hook.result.current.state;
    await hook.act(async () => {
      if (stage === 'output') formatting.resolve('too late');
      else formatting.reject(new Error('Late formatter failure'));
      await Promise.allSettled([formatting.promise]);
    });
    expect(hook.result.current.state).toBe(settled);
    expect(format).toHaveBeenCalledTimes(1);
  }
);

it('preserves completed results and counts when overlapping calls settle in one batch', async () => {
  const first = Promise.withResolvers<string>();
  const second = Promise.withResolvers<string>();
  const failed = Promise.withResolvers<string>();
  const failure = new Error('Third call failed');
  const execute = vi
    .fn<() => Promise<string>>()
    .mockReturnValueOnce(first.promise)
    .mockReturnValueOnce(second.promise)
    .mockReturnValueOnce(failed.promise);
  const hook = await renderHook(() =>
    useWebMCP({ name: 'same_batch_calls', description: 'Combines completion updates', execute })
  );
  let calls!: Promise<string>[];
  await hook.act(async () => {
    calls = [
      hook.result.current.execute({}),
      hook.result.current.execute({}),
      hook.result.current.execute({}),
    ];
  });
  expect(hook.result.current.state.isExecuting).toBe(true);
  await hook.act(async () => {
    const outcomes = Promise.allSettled(calls);
    second.resolve('second');
    first.resolve('first');
    failed.reject(failure);
    await expect(outcomes).resolves.toEqual([
      { status: 'fulfilled', value: 'first' },
      { status: 'fulfilled', value: 'second' },
      { status: 'rejected', reason: failure },
    ]);
  });
  expect(hook.result.current.state).toEqual({
    isExecuting: false,
    lastResult: 'first',
    error: failure,
    executionCount: 2,
  });
});

it.each(['output', 'error'] as const)(
  'uses the committed %s formatter from each call start across a configuration update',
  async (stage) => {
    const pending = Promise.withResolvers<string>();
    const failure = new Error('Handler failed');
    const register = vi.spyOn(document.modelContext, 'registerTool');
    const hook = await renderHook(
      ({ revision }) =>
        useWebMCP({
          name: `snapshot_${stage}_formatter`,
          description: 'Keeps each execution configuration consistent',
          execute: () => {
            if (revision === 'A') return pending.promise;
            if (stage === 'error') throw failure;
            return 'next';
          },
          formatOutput: (value) => `${revision}:${value}`,
          formatError: (error) => `${revision}:${error.message}`,
        }),
      { initialProps: { revision: 'A' } }
    );
    const tool = register.mock.calls[0]?.[0];
    if (!tool) throw new Error('Tool was not registered');
    let first!: Promise<unknown>;
    await hook.act(async () => {
      first = Promise.resolve(tool.execute({}, { signal: new AbortController().signal }));
    });
    await hook.rerender({ revision: 'B' });
    expect(register).toHaveBeenCalledTimes(1);
    await hook.act(async () => {
      if (stage === 'output') pending.resolve('first');
      else pending.reject(failure);
      await expect(first).resolves.toBe(stage === 'output' ? 'A:first' : 'A:Handler failed');
      await expect(tool.execute({}, { signal: new AbortController().signal })).resolves.toBe(
        stage === 'output' ? 'B:next' : 'B:Handler failed'
      );
    });
    expect(hook.result.current.state).toEqual({
      isExecuting: false,
      lastResult: stage === 'output' ? 'next' : null,
      error: stage === 'output' ? null : failure,
      executionCount: stage === 'output' ? 2 : 0,
    });
  }
);
