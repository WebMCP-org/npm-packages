import { expect, it, vi } from 'vitest';
import { createExecutionState } from './execution-state.js';
import { invoke, unwrapInvocation } from './invocation.js';

const tool = { instanceId: 'state-owner', name: 'state_tool' };
const call = {
  protocol: 'local' as const,
  id: 'state-call',
  tool,
  signal: new AbortController().signal,
  caller: { kind: 'unknown' as const },
  traceContext: {},
  prepare: async () => ({ tool, arguments: {}, binding: null }),
};

it('isolates subscriber and diagnostic failures from execution and other subscribers', async () => {
  const diagnostic = vi.fn(() => {
    throw new Error('Diagnostic failed');
  });
  const state = createExecutionState<number>({ onDiagnostic: diagnostic });
  state.subscribe(() => {
    throw new Error('Subscriber failed');
  });
  const listener = vi.fn();
  const unsubscribe = state.subscribe(listener);
  const result = { value: 1, response: 1 };
  await expect(state.aroundInvoke(call, async () => result)).resolves.toBe(result);
  expect(listener).toHaveBeenCalledTimes(2);
  expect(diagnostic).toHaveBeenCalledTimes(2);
  unsubscribe();
  state.reset();
  expect(listener).toHaveBeenCalledTimes(2);
});

it('keeps idle snapshots stable and does not notify for an empty reset', () => {
  const state = createExecutionState<number>();
  const listener = vi.fn();
  const unsubscribe = state.subscribe(listener);
  const snapshot = state.getSnapshot();
  expect(snapshot).toEqual({
    isExecuting: false,
    lastResult: null,
    error: null,
    executionCount: 0,
  });
  state.reset();
  expect(state.getSnapshot()).toBe(snapshot);
  expect(listener).not.toHaveBeenCalled();
  unsubscribe();
});

it('does not revisit a listener that resubscribes while being notified', async () => {
  const state = createExecutionState<number>();
  let resubscribed = false;
  const listener = vi.fn(() => {
    if (resubscribed) return;
    resubscribed = true;
    unsubscribe();
    unsubscribe = state.subscribe(listener);
  });
  let unsubscribe = state.subscribe(listener);
  await state.aroundInvoke(call, async () => ({ value: 1, response: 1 }));
  expect(listener).toHaveBeenCalledTimes(2);
  unsubscribe();
});

it('records running and successful raw values without any subscriber', async () => {
  const state = createExecutionState<number>();
  const pending = Promise.withResolvers<{ value: number; response: unknown }>();
  const run = state.aroundInvoke(call, () => pending.promise);
  expect(state.getSnapshot().isExecuting).toBe(true);
  const result = { value: 42, response: { content: [{ type: 'text', text: '42' }] } };
  pending.resolve(result);
  await expect(run).resolves.toBe(result);
  expect(state.getSnapshot()).toEqual({
    isExecuting: false,
    lastResult: 42,
    error: null,
    executionCount: 1,
  });
});

it('retains overlapping work when a call fails or observations reset', async () => {
  const state = createExecutionState<number>();
  const first = Promise.withResolvers<{ value: number; response: unknown }>();
  const second = Promise.withResolvers<{ value: number; response: unknown }>();
  const firstRun = state.aroundInvoke(call, () => first.promise);
  const pendingState = state.getSnapshot();
  const secondRun = state.aroundInvoke(call, () => second.promise);
  expect(state.getSnapshot()).toBe(pendingState);

  const failure = new Error('First call failed');
  first.reject(failure);
  await expect(firstRun).rejects.toBe(failure);
  expect(state.getSnapshot()).toMatchObject({
    isExecuting: true,
    error: failure,
    executionCount: 0,
  });
  state.reset();
  expect(state.getSnapshot()).toMatchObject({ isExecuting: true, error: null, executionCount: 0 });

  second.resolve({ value: 2, response: 'two' });
  await secondRun;
  expect(state.getSnapshot()).toEqual({
    isExecuting: false,
    lastResult: 2,
    error: null,
    executionCount: 1,
  });
});

it('observes the original failure after async agent formatting, never a successful envelope', async () => {
  const state = createExecutionState<number>();
  const failure = new Error('Denied by handler');
  const formatting = Promise.withResolvers<unknown>();
  const formatStarted = Promise.withResolvers<void>();
  const run = unwrapInvocation(
    invoke(
      {
        tool,
        execute: () => {
          throw failure;
        },
        middleware: [state.aroundInvoke],
        formatError: () => {
          formatStarted.resolve();
          return formatting.promise;
        },
      },
      {},
      { forAgent: true }
    ),
    true
  );
  await formatStarted.promise;
  expect(state.getSnapshot()).toMatchObject({ isExecuting: true, error: null, executionCount: 0 });
  const response = { content: [{ type: 'text', text: 'Try again' }], isError: true };
  formatting.resolve(response);
  await expect(run).resolves.toBe(response);
  expect(state.getSnapshot()).toEqual({
    isExecuting: false,
    lastResult: null,
    error: failure,
    executionCount: 0,
  });
});

it('settles cancellation and ignores a late completion without a subscriber', async () => {
  const state = createExecutionState<number>();
  const started = Promise.withResolvers<void>();
  const pending = Promise.withResolvers<number>();
  const controller = new AbortController();
  const run = unwrapInvocation(
    invoke(
      {
        tool,
        execute: () => {
          started.resolve();
          return pending.promise;
        },
        middleware: [state.aroundInvoke],
      },
      {},
      { signal: controller.signal }
    )
  );
  await started.promise;
  const reason = new Error('Cancelled');
  const rejected = expect(run).rejects.toBe(reason);
  controller.abort(reason);
  await rejected;
  await vi.waitFor(() =>
    expect(state.getSnapshot()).toMatchObject({ isExecuting: false, error: reason })
  );
  const snapshot = state.getSnapshot();
  pending.resolve(99);
  await pending.promise;
  expect(state.getSnapshot()).toBe(snapshot);
  expect(snapshot.executionCount).toBe(0);
});

it('retains a completed success when its observer aborts the caller during notification', async () => {
  const state = createExecutionState<number>();
  const controller = new AbortController();
  state.subscribe(() => {
    if (state.getSnapshot().executionCount === 1) controller.abort(new Error('Too late'));
  });
  const run = unwrapInvocation(
    invoke(
      {
        tool,
        execute: () => 42,
        middleware: [state.aroundInvoke],
      },
      {},
      { signal: controller.signal }
    )
  );
  await expect(run).resolves.toBe(42);
  expect(state.getSnapshot()).toEqual({
    isExecuting: false,
    error: null,
    lastResult: 42,
    executionCount: 1,
  });
});
