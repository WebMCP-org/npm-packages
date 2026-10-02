import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ConsentGuard,
  MAX_PRESENCE_ATTEMPTS,
  consent,
  toMcpAnnotations,
  type ConsentDecisionEvent,
  type ConsentMetadata,
} from './consent.js';
import { withPlugins } from './index.js';

const reversible: ConsentMetadata = {
  scope: ['write:notes'],
  reversible: true,
  riskLevel: 'medium',
  requiresApproval: true,
};
const presence: ConsentMetadata = { ...reversible, requireUserPresence: true };
const input = (consent: ConsentMetadata) => ({
  toolName: 'save',
  origin: 'https://app.test',
  args: { id: 1 },
  consent,
});
const pendingId = (guard: ConsentGuard) => guard.getPending()[0]!.id;

afterEach(() => vi.useRealTimers());

describe('ConsentGuard', () => {
  it('queues a request until the user decides', async () => {
    const guard = new ConsentGuard();
    const changes = vi.fn();
    guard.subscribe(changes);

    const approved = guard.request(input(reversible));
    expect(guard.getPending()).toMatchObject([{ toolName: 'save', args: { id: 1 } }]);
    await expect(guard.decide(pendingId(guard), true)).resolves.toEqual({
      success: true,
      reason: 'approved',
    });
    await expect(approved).resolves.toEqual({ approved: true, reason: 'user' });

    const denied = guard.request(input(reversible));
    await guard.decide(pendingId(guard), false);
    await expect(denied).resolves.toEqual({ approved: false, reason: 'user' });
    expect(guard.getPending()).toEqual([]);
    expect(changes).toHaveBeenCalledTimes(4);
  });

  it('denies unanswered requests after the timeout', async () => {
    vi.useFakeTimers();
    const guard = new ConsentGuard({ timeoutMs: 1000 });
    const decision = guard.request(input(reversible));
    vi.advanceTimersByTime(1000);
    await expect(decision).resolves.toEqual({ approved: false, reason: 'timeout' });
  });

  it('removes a request when its signal aborts', async () => {
    const guard = new ConsentGuard();
    const controller = new AbortController();
    const decision = guard.request({ ...input(reversible), signal: controller.signal });
    controller.abort();
    await expect(decision).resolves.toEqual({ approved: false, reason: 'cancelled' });
    expect(guard.getPending()).toEqual([]);
  });

  it('remembers session approval only for reversible tools without presence', async () => {
    const guard = new ConsentGuard({ verifyPresence: () => true });
    for (const metadata of [reversible, { ...reversible, reversible: false }, presence]) {
      const first = guard.request(input({ ...metadata }));
      await guard.decide(pendingId(guard), true, true);
      await first;
    }

    await expect(guard.request(input(reversible))).resolves.toEqual({
      approved: true,
      reason: 'session-preapproval',
    });
    void guard.request(input({ ...reversible, reversible: false }));
    void guard.request(input(presence));
    expect(guard.getPending()).toHaveLength(2);
  });

  it('starts presence verification synchronously and shares concurrent approvals', async () => {
    const verifyPresence = vi.fn(() => Promise.resolve(true));
    const guard = new ConsentGuard({ verifyPresence });
    const decision = guard.request(input(presence));
    const id = pendingId(guard);

    const first = guard.decide(id, true);
    expect(verifyPresence).toHaveBeenCalledOnce();
    expect(guard.decide(id, true)).toBe(first);
    await expect(first).resolves.toMatchObject({ success: true });
    await expect(decision).resolves.toEqual({ approved: true, reason: 'user' });
  });

  it('keeps a request pending after a failed ceremony, then locks the tool out', async () => {
    vi.useFakeTimers();
    const guard = new ConsentGuard({ verifyPresence: () => false });
    const events: ConsentDecisionEvent[] = [];
    guard.subscribeDecision((event) => events.push(event));
    const decision = guard.request(input(presence));
    const id = pendingId(guard);

    await expect(guard.decide(id, true)).resolves.toEqual({
      success: false,
      attemptsRemaining: MAX_PRESENCE_ATTEMPTS - 1,
      reason: 'presence-failed',
    });
    expect(guard.getPending()[0]).toMatchObject({
      attemptsRemaining: 2,
      lastError: expect.any(String),
    });
    await guard.decide(id, true);
    await expect(guard.decide(id, true)).resolves.toMatchObject({ reason: 'presence-lockout' });
    await expect(decision).resolves.toEqual({ approved: false, reason: 'presence-lockout' });
    expect(events.map((event) => event.reason)).toEqual([
      'presence-failed',
      'presence-failed',
      'presence-lockout',
    ]);

    // Locked out: no prompt, even for a tool approved for the session.
    expect(guard.getCooldownRemaining('https://app.test', 'save')).toBe(10_000);
    await expect(guard.request(input(presence))).resolves.toEqual({
      approved: false,
      reason: 'rate-limited',
    });

    // A served cooldown resets attempts, and the next lockout lasts longer.
    vi.advanceTimersByTime(10_000);
    void guard.request(input(presence));
    const retry = pendingId(guard);
    for (let attempt = 0; attempt < MAX_PRESENCE_ATTEMPTS; attempt++)
      await guard.decide(retry, true);
    expect(guard.getCooldownRemaining('https://app.test', 'save')).toBe(30_000);
  });

  it('pauses the timeout during a ceremony and aborts it when the request settles', async () => {
    vi.useFakeTimers();
    let finish!: (verified: boolean) => void;
    let ceremony!: AbortSignal;
    const guard = new ConsentGuard({
      timeoutMs: 1000,
      verifyPresence: (_request, signal) => {
        ceremony = signal;
        return new Promise((resolve) => (finish = resolve));
      },
    });
    const controller = new AbortController();
    const decision = guard.request({ ...input(presence), signal: controller.signal });
    const approval = guard.decide(pendingId(guard), true);
    vi.advanceTimersByTime(5000);
    expect(guard.getPending()).toHaveLength(1);

    controller.abort();
    expect(ceremony.aborted).toBe(true);
    finish(true);
    await expect(approval).resolves.toEqual({ success: false, reason: 'denied' });
    await expect(decision).resolves.toEqual({ approved: false, reason: 'cancelled' });
  });

  it('resolves the request even when a listener throws', async () => {
    const guard = new ConsentGuard();
    guard.subscribeDecision(() => {
      throw new Error('listener');
    });
    const decision = guard.request(input(reversible));
    expect(() => guard.decide(pendingId(guard), false)).toThrow('listener');
    await expect(decision).resolves.toEqual({ approved: false, reason: 'user' });
  });
});

describe('consent plugin', () => {
  const call = (metadata: ConsentMetadata, guard: ConsentGuard, signal?: AbortSignal) => {
    const tool = withPlugins({ name: 'save', execute: (value: { id: number }) => value.id }, [
      consent(guard, metadata),
    ]);
    return tool.execute({ id: 7 }, { signal: signal ?? new AbortController().signal });
  };

  it('runs the tool only after approval', async () => {
    const guard = new ConsentGuard();
    const result = call(reversible, guard);
    expect(guard.getPending()).toMatchObject([{ toolName: 'save', args: { id: 7 } }]);
    await guard.decide(pendingId(guard), true);
    await expect(result).resolves.toBe(7);
  });

  it('rejects with NotAllowedError when denied', async () => {
    const guard = new ConsentGuard();
    const result = call(reversible, guard);
    await guard.decide(pendingId(guard), false);
    await expect(result).rejects.toMatchObject({
      name: 'NotAllowedError',
      message: 'Tool "save" was not approved (user)',
    });
  });

  it('rejects with the abort reason when cancelled', async () => {
    const guard = new ConsentGuard();
    const controller = new AbortController();
    const result = call(reversible, guard, controller.signal);
    controller.abort(new Error('stop'));
    await expect(result).rejects.toThrow('stop');
  });

  it('skips the prompt when approval is not required, but records the decision', async () => {
    const guard = new ConsentGuard();
    const events: ConsentDecisionEvent[] = [];
    guard.subscribeDecision((event) => events.push(event));
    const requiresApproval = vi.fn(() => false);

    await expect(call({ ...reversible, requiresApproval }, guard)).resolves.toBe(7);
    expect(requiresApproval).toHaveBeenCalledWith({ id: 7 });
    expect(events).toMatchObject([{ approved: true, reason: 'not-required' }]);
  });

  it('always prompts when user presence is required', async () => {
    const guard = new ConsentGuard({ verifyPresence: () => true });
    const result = call({ ...presence, requiresApproval: false }, guard);
    expect(guard.getPending()).toHaveLength(1);
    await guard.decide(pendingId(guard), true);
    await expect(result).resolves.toBe(7);
  });
});

it('maps consent metadata to MCP annotations', () => {
  expect(toMcpAnnotations({ ...reversible, riskLevel: 'low' })).toEqual({
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: false,
  });
  expect(toMcpAnnotations({ ...reversible, reversible: false, idempotent: true })).toEqual({
    readOnlyHint: false,
    destructiveHint: true,
    idempotentHint: true,
  });
  expect(toMcpAnnotations({ ...reversible, riskLevel: 'low', readOnly: false }).readOnlyHint).toBe(
    false
  );
});
