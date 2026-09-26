import { installWebMCP } from '@mcp-b/webmcp-polyfill';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, renderHook } from 'vitest-browser-react';
import { useWebMCP } from './useWebMCP.js';

beforeEach(() => installWebMCP());
afterEach(async () => {
  await cleanup();
  vi.restoreAllMocks();
});

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
