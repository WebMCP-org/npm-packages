import { InvocationFailure, type AroundInvoke, type InvocationResult } from './invocation.js';

/** Observable state for successful, failed, and overlapping invocations. */
export interface ToolExecutionState<T = unknown> {
  isExecuting: boolean;
  lastResult: T | null;
  error: Error | null;
  executionCount: number;
}

/** Stable idle state shared with server rendering and initial hydration. */
export const INITIAL_EXECUTION_STATE = Object.freeze({
  isExecuting: false,
  lastResult: null,
  error: null,
  executionCount: 0,
});

export interface ExecutionState<T = unknown> {
  aroundInvoke: AroundInvoke<T>;
  subscribe(listener: () => void): () => void;
  getSnapshot(): ToolExecutionState<T>;
  reset(): void;
}

/** Create once per tool owner; subscribing never changes its lifetime. */
export function createExecutionState<T = unknown>(
  options: { onDiagnostic?: (error: unknown) => void } = {}
): ExecutionState<T> {
  const listeners = new Set<() => void>();
  let snapshot: ToolExecutionState<T> = INITIAL_EXECUTION_STATE;
  let pending = 0;
  const publish = (next: ToolExecutionState<T>) => {
    if (
      snapshot.isExecuting === next.isExecuting &&
      Object.is(snapshot.lastResult, next.lastResult) &&
      snapshot.error === next.error &&
      snapshot.executionCount === next.executionCount
    )
      return;
    snapshot = Object.freeze(next);
    // oxlint-disable-next-line unicorn/no-useless-spread -- Resubscribing during notification must not revisit a listener.
    for (const listener of [...listeners]) {
      try {
        listener();
      } catch (error) {
        // An observer must never change the tool's result or skip other observers.
        try {
          options.onDiagnostic?.(error);
        } catch {
          /* Diagnostics are also observers. */
        }
      }
    }
  };
  return {
    async aroundInvoke(_call, next) {
      pending++;
      publish({ ...snapshot, isExecuting: true, error: null });
      let result: InvocationResult<T>;
      try {
        result = await next();
      } catch (failure) {
        pending--;
        const cause = failure instanceof InvocationFailure ? failure.cause : failure;
        publish({
          ...snapshot,
          isExecuting: pending > 0,
          error: cause instanceof Error ? cause : new Error(String(cause)),
        });
        throw failure;
      }
      pending--;
      publish({
        isExecuting: pending > 0,
        lastResult: result.value,
        error: null,
        executionCount: snapshot.executionCount + 1,
      });
      return result;
    },
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    getSnapshot(): ToolExecutionState<T> {
      return snapshot;
    },
    reset() {
      publish({ ...INITIAL_EXECUTION_STATE, isExecuting: pending > 0 });
    },
  };
}
