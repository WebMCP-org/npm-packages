import { describe, expect, it, vi } from 'vitest';
import { ConsentBroker, consent, type ConsentBrokerOptions } from './consent.js';
import { InvocationFailure, invoke } from './invocation.js';

const tool = { instanceId: 'rollback-1', name: 'rollback' };

describe('ConsentBroker', () => {
  it('waits for explicit approval of the prepared operation before executing', async () => {
    const broker = new ConsentBroker({ policy: { mode: 'click' } });
    const execute = vi.fn(() => 'rolled back');
    const result = invoke({ tool, execute, plugins: [consent({ broker })] }, { revision: 'abc' });
    await vi.waitFor(() => expect(broker.getSnapshot()).toHaveLength(1));
    const request = broker.getSnapshot()[0]!;
    expect(request.operation.arguments).toEqual({ revision: 'abc' });
    expect(execute).not.toHaveBeenCalled();
    expect(await broker.decide(request.id, { approved: true })).toBe(true);
    await expect(result).resolves.toEqual({ value: 'rolled back', response: 'rolled back' });
    expect(broker.getSnapshot()).toEqual([]);
    expect(await broker.decide(request.id, { approved: true })).toBe(false);
    expect(execute).toHaveBeenCalledTimes(1);
  });
  it('cancels pending consent and blocks a late approval', async () => {
    const broker = new ConsentBroker({ policy: { mode: 'click' } });
    const abort = new AbortController();
    const operation = { tool, arguments: {}, binding: undefined };
    const authorization = broker.authorize({
      invocationId: 'cancelled',
      operation,
      signal: abort.signal,
    });
    const outcome = authorization.catch((error: unknown) => error);
    const request = broker.getSnapshot()[0]!;
    const reason = new Error('user cancelled');
    abort.abort(reason);
    expect(broker.getSnapshot()).toEqual([]);
    expect(await outcome).toEqual(new InvocationFailure('cancelled', reason));
    expect(await broker.decide(request.id, { approved: true })).toBe(false);
    await expect(
      broker.authorize({ invocationId: 'preabort', operation, signal: abort.signal })
    ).rejects.toMatchObject({ kind: 'cancelled', cause: reason });
  });

  it('requires application verification and binds it to the exact pending operation', async () => {
    const verify = vi.fn(async () => false);
    const broker = new ConsentBroker({ policy: { mode: 'verified', verify } });
    const execute = vi.fn(() => 'must not run');
    const outcome = invoke(
      { tool, execute, plugins: [consent({ broker })] },
      { revision: 'abc' }
    ).catch((error: unknown) => error);
    await vi.waitFor(() => expect(broker.getSnapshot()).toHaveLength(1));
    const request = broker.getSnapshot()[0]!;
    const proof = { assertionId: 'not-verification' };
    expect(await broker.decide(request.id, { approved: true, proof })).toBe(false);
    expect(verify).toHaveBeenCalledWith(request, proof, expect.any(AbortSignal));
    expect(await outcome).toMatchObject({ kind: 'denied' });
    expect(execute).not.toHaveBeenCalled();
    expect(broker.getSnapshot()).toEqual([]);
  });

  it('claims verification once and ignores its completion after cancellation', async () => {
    let complete!: (approved: boolean) => void;
    const verify = vi.fn(
      () =>
        new Promise<boolean>((resolve) => {
          complete = resolve;
        })
    );
    const broker = new ConsentBroker({ policy: { mode: 'verified', verify } });
    const abort = new AbortController();
    const authorization = broker
      .authorize({
        invocationId: 'once',
        operation: { tool, arguments: {}, binding: undefined },
        signal: abort.signal,
      })
      .catch((error: unknown) => error);
    const request = broker.getSnapshot()[0]!;
    const decision = broker.decide(request.id, { approved: true, proof: 'proof' });
    const duplicate = broker.decide(request.id, { approved: true, proof: 'proof' });
    expect(verify).toHaveBeenCalledTimes(1);
    expect(await duplicate).toBe(false);
    abort.abort();
    expect(await authorization).toMatchObject({ kind: 'cancelled' });
    complete(true);
    expect(await decision).toBe(false);
    expect(broker.getSnapshot()).toEqual([]);
  });

  it('denies unanswered requests and cancels in-flight verification when they expire', async () => {
    vi.useFakeTimers();
    try {
      let verificationSignal: AbortSignal | undefined;
      const broker = new ConsentBroker({
        timeoutMs: 100,
        policy: {
          mode: 'verified',
          verify: (_request, _proof, signal) => {
            verificationSignal = signal;
            return new Promise<boolean>(() => {});
          },
        },
      });
      const outcome = broker
        .authorize({
          invocationId: 'timeout',
          operation: { tool, arguments: {}, binding: undefined },
          signal: new AbortController().signal,
        })
        .catch((error: unknown) => error);
      const request = broker.getSnapshot()[0]!;
      const decision = broker.decide(request.id, { approved: true });
      await vi.advanceTimersByTimeAsync(100);
      expect(broker.getSnapshot()).toEqual([]);
      expect(verificationSignal?.aborted).toBe(true);
      expect(await outcome).toMatchObject({ kind: 'denied' });
      expect(await decision).toBe(false);
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it('settles denial despite broken listeners and keeps other subscribers informed', async () => {
    const broker = new ConsentBroker({
      policy: { mode: 'click' },
      onDiagnostic: () => {
        throw new Error('broken diagnostics');
      },
    });
    broker.subscribe(() => {
      throw new Error('broken UI');
    });
    const subscriber = vi.fn();
    const unsubscribe = broker.subscribe(subscriber);
    const outcome = broker
      .authorize({
        invocationId: 'deny',
        operation: { tool, arguments: {}, binding: undefined },
        signal: new AbortController().signal,
      })
      .catch((error: unknown) => error);
    const request = broker.getSnapshot()[0]!;
    expect(subscriber).toHaveBeenCalledTimes(1);
    expect(await broker.decide(request.id, { approved: false })).toBe(false);
    expect(await outcome).toMatchObject({ kind: 'denied' });
    expect(subscriber).toHaveBeenCalledTimes(2);
    const snapshot = broker.getSnapshot();
    expect(broker.getSnapshot()).toBe(snapshot);
    expect(Object.isFrozen(snapshot)).toBe(true);
    unsubscribe();
  });

  it('rejects approval past its deadline even when the timer has not run', async () => {
    vi.useFakeTimers();
    try {
      const broker = new ConsentBroker({ policy: { mode: 'click' }, timeoutMs: 100 });
      const outcome = broker
        .authorize({
          invocationId: 'late',
          operation: { tool, arguments: {}, binding: undefined },
          signal: new AbortController().signal,
        })
        .catch((error: unknown) => error);
      const request = broker.getSnapshot()[0]!;
      vi.setSystemTime(Date.now() + 101);
      expect(await broker.decide(request.id, { approved: true })).toBe(false);
      expect(await outcome).toMatchObject({ kind: 'denied' });
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it('captures the required policy and accepts only a verified one-use approval', async () => {
    const verify = vi.fn(async () => true);
    const options: ConsentBrokerOptions = { policy: { mode: 'verified', verify } };
    const broker = new ConsentBroker(options);
    options.policy = { mode: 'click' };
    const outcome = broker.authorize({
      invocationId: 'verified',
      operation: { tool, arguments: { revision: 'abc' }, binding: undefined },
      signal: new AbortController().signal,
    });
    const request = broker.getSnapshot()[0]!;
    expect(await broker.decide(request.id, { approved: true, proof: 'assertion' })).toBe(true);
    await expect(outcome).resolves.toBeUndefined();
    expect(verify).toHaveBeenCalledTimes(1);
    expect(await broker.decide(request.id, { approved: true, proof: 'assertion' })).toBe(false);
    // JavaScript callers must not accidentally get click-only consent from malformed configuration.
    // @ts-expect-error a verifier is required
    expect(() => new ConsentBroker({ policy: { mode: 'verified' } })).toThrow(TypeError);
  });
  it('notifies a listener once even when it re-subscribes during notification', async () => {
    const broker = new ConsentBroker({ policy: { mode: 'click' } });
    let notifications = 0;
    let unsubscribe = () => {};
    const listener = () => {
      notifications++;
      if (notifications < 3) {
        unsubscribe();
        unsubscribe = broker.subscribe(listener);
      }
    };
    unsubscribe = broker.subscribe(listener);
    const outcome = broker.authorize({
      invocationId: 'resubscribe',
      operation: { tool, arguments: {}, binding: undefined },
      signal: new AbortController().signal,
    });
    expect(notifications).toBe(1);
    unsubscribe();
    await broker.decide(broker.getSnapshot()[0]!.id, { approved: true });
    await outcome;
  });

  it('snapshots direct authorization inputs before a caller can mutate the displayed operation', async () => {
    const broker = new ConsentBroker({ policy: { mode: 'click' } });
    const operation = {
      tool: { ...tool },
      arguments: { destination: { revision: 'abc' } },
      binding: { revision: 'abc' },
    };
    const caller = { kind: 'reported' as const, name: 'client-a' };
    const outcome = broker.authorize({
      invocationId: 'snapshot',
      operation,
      caller,
      signal: new AbortController().signal,
    });
    operation.arguments.destination.revision = 'changed';
    operation.binding.revision = 'changed';
    operation.tool.name = 'changed';
    caller.name = 'changed';
    const request = broker.getSnapshot()[0]!;
    expect(request.operation).toEqual({
      tool,
      arguments: { destination: { revision: 'abc' } },
      binding: { revision: 'abc' },
    });
    expect(request.caller).toEqual({ kind: 'reported', name: 'client-a' });
    expect(Object.isFrozen(request.operation.arguments)).toBe(true);
    await broker.decide(request.id, { approved: true });
    await outcome;
  });
});
