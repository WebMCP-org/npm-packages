import { describe, expect, it, vi } from 'vitest';
import {
  ConsentBroker,
  ConsentGuard,
  consent,
  type ConsentBrokerOptions,
  type ConsentMetadata,
} from './consent.js';
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

describe('consent plugin with legacy ConsentBroker options', () => {
  it('runs authorize()-based flow: prepares operation, calls broker.authorize with expected shape, and executes next() only after approval', async () => {
    const broker = new ConsentBroker({ policy: { mode: 'click' } });
    const authorizeSpy = vi.spyOn(broker, 'authorize');
    const bindingSpy = vi.fn((input: { revision: string }) => ({ bound: input.revision }));
    const execute = vi.fn(() => 'rolled back');

    const plugin = consent({ broker });
    expect(plugin.name).toBe('consent');

    const caller = { kind: 'reported' as const, name: 'client-test' };
    const invocation = invoke(
      {
        tool,
        binding: bindingSpy,
        execute,
        plugins: [plugin],
      },
      { revision: 'abc' },
      { caller }
    );

    await vi.waitFor(() => expect(broker.getSnapshot()).toHaveLength(1));
    const request = broker.getSnapshot()[0]!;

    // call.prepare() was invoked (proven by binding execution and operation structure)
    expect(bindingSpy).toHaveBeenCalledWith({ revision: 'abc' });
    expect(authorizeSpy).toHaveBeenCalledWith({
      invocationId: request.invocationId,
      operation: {
        tool,
        arguments: { revision: 'abc' },
        binding: { bound: 'abc' },
      },
      signal: expect.any(AbortSignal),
      caller,
    });

    // next() only runs after authorization succeeds
    expect(execute).not.toHaveBeenCalled();

    expect(await broker.decide(request.id, { approved: true })).toBe(true);
    const result = await invocation;
    expect(result).toEqual({ value: 'rolled back', response: 'rolled back' });
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it('calls call.prepare() and passes operation to broker.authorize', async () => {
    const broker = new ConsentBroker({ policy: { mode: 'click' } });
    const authorizeSpy = vi.spyOn(broker, 'authorize');
    const plugin = consent({ broker });

    const preparedOperation = {
      tool,
      arguments: { test: 123 },
      binding: undefined,
    };
    const prepareSpy = vi.fn(async () => preparedOperation);
    const nextSpy = vi.fn(async () => ({ value: 'ok', response: 'ok' }));
    const controller = new AbortController();
    const mockCall = {
      protocol: 'local' as const,
      id: 'inv-legacy',
      tool,
      signal: controller.signal,
      caller: { kind: 'unknown' as const },
      traceContext: {},
      prepare: prepareSpy,
    };

    const runPromise = plugin.aroundInvoke(mockCall, nextSpy);
    await vi.waitFor(() => expect(broker.getSnapshot()).toHaveLength(1));

    expect(prepareSpy).toHaveBeenCalledTimes(1);
    expect(authorizeSpy).toHaveBeenCalledWith({
      invocationId: 'inv-legacy',
      operation: preparedOperation,
      signal: controller.signal,
      caller: { kind: 'unknown' },
    });
    expect(nextSpy).not.toHaveBeenCalled();

    await broker.decide(broker.getSnapshot()[0]!.id, { approved: true });
    const result = await runPromise;
    expect(result).toEqual({ value: 'ok', response: 'ok' });
    expect(nextSpy).toHaveBeenCalledTimes(1);
  });

  it('blocks next() and rejects when authorization is denied', async () => {
    const broker = new ConsentBroker({ policy: { mode: 'click' } });
    const execute = vi.fn(() => 'must not run');
    const plugin = consent({ broker });

    const outcome = invoke({ tool, execute, plugins: [plugin] }, { revision: 'denied-rev' }).catch(
      (error: unknown) => error
    );

    await vi.waitFor(() => expect(broker.getSnapshot()).toHaveLength(1));
    const request = broker.getSnapshot()[0]!;

    expect(execute).not.toHaveBeenCalled();
    expect(await broker.decide(request.id, { approved: false })).toBe(false);

    expect(await outcome).toMatchObject({ kind: 'denied' });
    expect(execute).not.toHaveBeenCalled();
  });
});

describe('consent plugin with ConsentGuard', () => {
  const origin = 'https://app.example.com';
  const guardedTool = { instanceId: 'guard-1', name: 'restartService', registeringOrigin: origin };

  it('invokes next() and records decision for auto-approved calls', async () => {
    const guard = new ConsentGuard();
    const recordSpy = vi.spyOn(guard, 'recordDecision');
    const requestSpy = vi.spyOn(guard, 'request');
    const execute = vi.fn(() => 'ok');

    const metadata: ConsentMetadata = {
      scope: ['read:service'],
      reversible: true,
      riskLevel: 'low',
      requiresApproval: false,
    };

    const result = await invoke(
      { tool: guardedTool, execute, plugins: [consent(guard, metadata)] },
      { id: 1 }
    );

    expect(execute).toHaveBeenCalledOnce();
    expect(requestSpy).not.toHaveBeenCalled();
    expect(recordSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        toolName: 'restartService',
        origin,
        args: { id: 1 },
        consent: metadata,
      }),
      { approved: true, reason: 'user' }
    );
    expect(result.value).toBe('ok');
  });

  it('waits for interactive approval and then invokes next()', async () => {
    const guard = new ConsentGuard();
    const execute = vi.fn(() => 'restarted');

    const metadata: ConsentMetadata = {
      scope: ['write:service'],
      reversible: true,
      riskLevel: 'high',
      requiresApproval: true,
    };

    let pendingId: string | undefined;
    guard.subscribe((pending) => {
      if (pending[0]) pendingId = pending[0].id;
    });

    const invocation = invoke(
      { tool: guardedTool, execute, plugins: [consent(guard, metadata)] },
      { id: 2 }
    );

    await vi.waitFor(() => expect(pendingId).toBeDefined());
    expect(execute).not.toHaveBeenCalled();

    await guard.decide(pendingId!, true);
    const result = await invocation;

    expect(execute).toHaveBeenCalledOnce();
    expect(result.value).toBe('restarted');
  });

  it('invokes next() and records decision on session-preapproved path for reversible tools', async () => {
    const guard = new ConsentGuard();
    const decisionSpy = vi.fn();
    guard.subscribeDecision(decisionSpy);
    const execute = vi.fn(() => 'done');

    const metadata: ConsentMetadata = {
      scope: ['write:service'],
      reversible: true,
      riskLevel: 'medium',
      requiresApproval: true,
    };

    let pendingId: string | undefined;
    guard.subscribe((pending) => {
      if (pending[0]) pendingId = pending[0].id;
    });

    // First call: approve with rememberForSession = true
    const firstCall = invoke(
      { tool: guardedTool, execute, plugins: [consent(guard, metadata)] },
      { id: 10 }
    );
    await vi.waitFor(() => expect(pendingId).toBeDefined());
    await guard.decide(pendingId!, true, true);
    await firstCall;

    decisionSpy.mockClear();

    // Second call: resolves from session preapproval without pending prompt
    pendingId = undefined;
    const secondCall = await invoke(
      { tool: guardedTool, execute, plugins: [consent(guard, metadata)] },
      { id: 11 }
    );

    expect(pendingId).toBeUndefined();
    expect(decisionSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        toolName: 'restartService',
        origin,
        args: { id: 11 },
        consent: metadata,
        approved: true,
        reason: 'session-preapproval',
      })
    );
    expect(secondCall.value).toBe('done');
  });

  it('throws on user denial without calling execute', async () => {
    const guard = new ConsentGuard();
    const execute = vi.fn(() => 'should not run');

    const metadata: ConsentMetadata = {
      scope: ['write:service'],
      reversible: false,
      riskLevel: 'high',
      requiresApproval: true,
    };

    let pendingId: string | undefined;
    guard.subscribe((pending) => {
      if (pending[0]) pendingId = pending[0].id;
    });

    const invocation = invoke(
      { tool: guardedTool, execute, plugins: [consent(guard, metadata)] },
      {}
    );
    await vi.waitFor(() => expect(pendingId).toBeDefined());

    await guard.decide(pendingId!, false);
    await expect(invocation).rejects.toThrow('Action denied by user (user).');
    expect(execute).not.toHaveBeenCalled();
  });

  it('immediately throws rate-limited when tool is on active cooldown without calling next()', async () => {
    const guard = new ConsentGuard();
    const execute = vi.fn(() => 'should not run');

    const metadata: ConsentMetadata = {
      scope: ['write:service'],
      reversible: false,
      riskLevel: 'high',
      requiresApproval: true,
      requireUserPresence: true,
    };

    let pendingId: string | undefined;
    guard.subscribe((pending) => {
      if (pending[0]) pendingId = pending[0].id;
    });

    const first = invoke({ tool: guardedTool, execute, plugins: [consent(guard, metadata)] }, {});
    await vi.waitFor(() => expect(pendingId).toBeDefined());

    // Out-of-band verification: drive lockout via the lower-level primitives, not decide()'s automatic ceremony.
    // Fail presence MAX_PRESENCE_ATTEMPTS times
    guard.recordPresenceFailure(pendingId!);
    guard.recordPresenceFailure(pendingId!);
    const lockout = guard.recordPresenceFailure(pendingId!);
    expect(lockout.lockedOut).toBe(true);

    await guard.decide(pendingId!, false, false, 'presence-lockout');
    await expect(first).rejects.toThrow();

    // Verify cooldown is active
    expect(guard.getCooldownRemaining(origin, 'restartService')).toBeGreaterThan(0);

    // Subsequent call fails immediately at cooldown check
    execute.mockClear();
    await expect(
      invoke({ tool: guardedTool, execute, plugins: [consent(guard, metadata)] }, {})
    ).rejects.toThrow('Action rate-limited for restartService.');

    expect(execute).not.toHaveBeenCalled();
  });

  it('ensures active cooldown overrides session pre-approval', async () => {
    const guard = new ConsentGuard(30_000, vi.fn().mockResolvedValue(true));
    const execute = vi.fn(() => 'result');

    const metadata: ConsentMetadata = {
      scope: ['write:service'],
      reversible: true,
      riskLevel: 'medium',
      requiresApproval: true,
      requireUserPresence: true,
    };

    let pendingId: string | undefined;
    guard.subscribe((pending) => {
      if (pending[0]) pendingId = pending[0].id;
    });

    // Step 1: Pre-approve session
    const first = invoke({ tool: guardedTool, execute, plugins: [consent(guard, metadata)] }, {});
    await vi.waitFor(() => expect(pendingId).toBeDefined());
    await guard.decide(pendingId!, true, true);
    await first;

    // Step 2: Simulate lockout by triggering presence failures on an irreversible request
    let secondPendingId: string | undefined;
    guard.subscribe((pending) => {
      if (pending[0]) secondPendingId = pending[0].id;
    });

    const secondReqPromise = guard.request({
      toolName: 'restartService',
      origin,
      args: {},
      consent: { ...metadata, reversible: false },
    });
    expect(secondPendingId).toBeDefined();

    // Out-of-band verification: drive lockout via the lower-level primitives, not decide()'s automatic ceremony.
    guard.recordPresenceFailure(secondPendingId!);
    guard.recordPresenceFailure(secondPendingId!);
    guard.recordPresenceFailure(secondPendingId!);
    await guard.decide(secondPendingId!, false, false, 'presence-lockout');
    await secondReqPromise;

    // Step 3: Now try to invoke the reversible tool again. Cooldown check must override session approval!
    execute.mockClear();
    await expect(
      invoke({ tool: guardedTool, execute, plugins: [consent(guard, metadata)] }, {})
    ).rejects.toThrow('Action rate-limited for restartService.');

    expect(execute).not.toHaveBeenCalled();
  });
});
