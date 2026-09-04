import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ConsentBroker, MAX_PRESENCE_ATTEMPTS } from './consent-broker.js';
import type { ConsentMetadata } from './consent-types.js';

/** Minimal reversible low-risk metadata reused across most tests. */
const reversibleLow: ConsentMetadata = {
  scope: ['read:deployments'],
  reversible: true,
  riskLevel: 'low',
  requiresApproval: true,
};

/** Irreversible high-risk metadata. */
const irreversibleHigh: ConsentMetadata = {
  scope: ['write:rollback'],
  reversible: false,
  riskLevel: 'high',
  requiresApproval: true,
};

/** Irreversible high-risk metadata that also requires a WebAuthn presence ceremony. */
const irreversibleHighWithPresence: ConsentMetadata = {
  ...irreversibleHigh,
  requireUserPresence: true,
};

describe('ConsentBroker', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('approve resolves with approved=true and reason=user', async () => {
    const broker = new ConsentBroker();
    let capturedId = '';
    broker.subscribe((pending) => {
      if (pending.length > 0 && capturedId === '') {
        capturedId = pending[0]!.id;
      }
    });

    const p = broker.request({
      toolName: 'getServiceHealth',
      origin: 'https://app.example.com',
      args: {},
      consent: reversibleLow,
    });

    expect(capturedId).not.toBe('');
    broker.decide(capturedId, true);

    const decision = await p;
    expect(decision.approved).toBe(true);
    expect(decision.reason).toBe('user');
  });

  it('deny resolves with approved=false and reason=user', async () => {
    const broker = new ConsentBroker();
    let capturedId = '';
    broker.subscribe((pending) => {
      if (pending.length > 0 && capturedId === '') capturedId = pending[0]!.id;
    });

    const p = broker.request({
      toolName: 'rollbackDeployment',
      origin: 'https://app.example.com',
      args: { force: true },
      consent: irreversibleHigh,
    });

    expect(capturedId).not.toBe('');
    broker.decide(capturedId, false);

    const decision = await p;
    expect(decision.approved).toBe(false);
    expect(decision.reason).toBe('user');
  });

  it('timeout auto-denies after the configured milliseconds', async () => {
    const broker = new ConsentBroker(5_000);

    const p = broker.request({
      toolName: 'getServiceHealth',
      origin: 'https://app.example.com',
      args: {},
      consent: reversibleLow,
    });

    vi.advanceTimersByTime(5_000);
    const decision = await p;

    expect(decision.approved).toBe(false);
    expect(decision.reason).toBe('timeout');
  });

  it('session-preapproval works for reversible tools', async () => {
    const broker = new ConsentBroker();
    let capturedId = '';
    broker.subscribe((pending) => {
      if (pending.length > 0 && capturedId === '') capturedId = pending[0]!.id;
    });

    // First call — user approves and remembers for session
    const p1 = broker.request({
      toolName: 'getServiceHealth',
      origin: 'https://app.example.com',
      args: {},
      consent: reversibleLow,
    });
    broker.decide(capturedId, true, /* rememberForSession */ true);
    const d1 = await p1;
    expect(d1.approved).toBe(true);
    expect(d1.reason).toBe('user');

    // Second call — should be auto-approved from cache
    const d2 = await broker.request({
      toolName: 'getServiceHealth',
      origin: 'https://app.example.com',
      args: {},
      consent: reversibleLow,
    });
    expect(d2.approved).toBe(true);
    expect(d2.reason).toBe('session-preapproval');
  });

  it('session-preapproval is refused for irreversible tools', async () => {
    const broker = new ConsentBroker();
    let capturedId = '';
    broker.subscribe((pending) => {
      if (pending.length > 0 && capturedId === '') capturedId = pending[0]!.id;
    });

    // First call — user approves with rememberForSession=true, but tool is irreversible
    const p1 = broker.request({
      toolName: 'rollbackDeployment',
      origin: 'https://app.example.com',
      args: { force: true },
      consent: irreversibleHigh,
    });
    broker.decide(capturedId, true, /* rememberForSession */ true);
    await p1;

    // Second call — must NOT be auto-approved; should enter pending queue
    let secondCallEntered = false;
    broker.subscribe((pending) => {
      if (pending.some((r) => r.toolName === 'rollbackDeployment' && r.id !== capturedId)) {
        secondCallEntered = true;
      }
    });

    const p2 = broker.request({
      toolName: 'rollbackDeployment',
      origin: 'https://app.example.com',
      args: { force: true },
      consent: irreversibleHigh,
    });

    expect(secondCallEntered).toBe(true);

    // Time out the second call so the promise resolves
    vi.advanceTimersByTime(30_000);
    const d2 = await p2;
    expect(d2.reason).toBe('timeout');
    expect(d2.approved).toBe(false);
  });

  it('concurrent requests each get independent IDs', async () => {
    const broker = new ConsentBroker();
    const ids: string[] = [];
    broker.subscribe((pending) => {
      ids.length = 0;
      ids.push(...pending.map((r) => r.id));
    });

    const p1 = broker.request({
      toolName: 'toolA',
      origin: 'https://app.example.com',
      args: {},
      consent: reversibleLow,
    });
    const p2 = broker.request({
      toolName: 'toolB',
      origin: 'https://app.example.com',
      args: {},
      consent: reversibleLow,
    });
    const p3 = broker.request({
      toolName: 'toolC',
      origin: 'https://app.example.com',
      args: {},
      consent: reversibleLow,
    });

    // All three should be pending with unique IDs
    expect(ids).toHaveLength(3);
    expect(new Set(ids).size).toBe(3);

    // Resolve all via timeout
    vi.advanceTimersByTime(30_000);
    await Promise.all([p1, p2, p3]);
    expect(ids).toHaveLength(0);
  });

  describe('presence-failure lockout', () => {
    it('recordPresenceFailure increments attempts and reports lockedOut=false below the max', async () => {
      const broker = new ConsentBroker();
      let capturedId = '';
      broker.subscribe((pending) => {
        if (pending.length > 0 && capturedId === '') capturedId = pending[0]!.id;
      });

      broker.request({
        toolName: 'rollbackDeployment',
        origin: 'https://app.example.com',
        args: { force: true },
        consent: irreversibleHighWithPresence,
      });

      expect(capturedId).not.toBe('');

      const first = broker.recordPresenceFailure(capturedId);
      expect(first).toEqual({ attempts: 1, lockedOut: false });

      const second = broker.recordPresenceFailure(capturedId);
      expect(second).toEqual({ attempts: 2, lockedOut: false });
    });

    it('locks out at MAX_PRESENCE_ATTEMPTS and the card can auto-deny with reason=presence-lockout', async () => {
      const broker = new ConsentBroker();
      let capturedId = '';
      broker.subscribe((pending) => {
        if (pending.length > 0 && capturedId === '') capturedId = pending[0]!.id;
      });

      const p = broker.request({
        toolName: 'rollbackDeployment',
        origin: 'https://app.example.com',
        args: { force: true },
        consent: irreversibleHighWithPresence,
      });

      let lastResult: { attempts: number; lockedOut: boolean } = { attempts: 0, lockedOut: false };
      for (let i = 0; i < MAX_PRESENCE_ATTEMPTS; i++) {
        lastResult = broker.recordPresenceFailure(capturedId);
      }

      expect(lastResult).toEqual({ attempts: MAX_PRESENCE_ATTEMPTS, lockedOut: true });

      // The request is still pending — recordPresenceFailure never resolves
      // it on its own. The card is responsible for calling decide().
      broker.decide(capturedId, false, false, 'presence-lockout');

      const decision = await p;
      expect(decision.approved).toBe(false);
      expect(decision.reason).toBe('presence-lockout');
    });

    it('recordPresenceFailure is a no-op for an unknown/already-resolved request id', () => {
      const broker = new ConsentBroker();
      const result = broker.recordPresenceFailure('does-not-exist');
      expect(result).toEqual({ attempts: 0, lockedOut: false });
    });
  });

  describe('cooldown / rate limiting', () => {
    it('a fresh request for a locked-out origin+tool pair is denied with reason=rate-limited and never enters the pending queue', async () => {
      const broker = new ConsentBroker();
      let capturedId = '';
      const seenPendingToolNames: string[] = [];
      broker.subscribe((pending) => {
        if (pending.length > 0 && capturedId === '') capturedId = pending[0]!.id;
        pending.forEach((r) => seenPendingToolNames.push(r.toolName));
      });

      const p1 = broker.request({
        toolName: 'rollbackDeployment',
        origin: 'https://app.example.com',
        args: { force: true },
        consent: irreversibleHighWithPresence,
      });

      for (let i = 0; i < MAX_PRESENCE_ATTEMPTS; i++) {
        broker.recordPresenceFailure(capturedId);
      }
      broker.decide(capturedId, false, false, 'presence-lockout');
      await p1;

      // A brand new call for the same origin+tool, made immediately after,
      // must be blocked before a card is ever shown.
      const d2 = await broker.request({
        toolName: 'rollbackDeployment',
        origin: 'https://app.example.com',
        args: { force: true },
        consent: irreversibleHighWithPresence,
      });

      expect(d2.approved).toBe(false);
      expect(d2.reason).toBe('rate-limited');
      // Only the first request's id should ever have appeared as pending.
      expect(seenPendingToolNames.every((name) => name === 'rollbackDeployment')).toBe(true);
    });

    it("a different tool on the same origin is unaffected by another tool's cooldown", async () => {
      const broker = new ConsentBroker();
      let capturedId = '';
      broker.subscribe((pending) => {
        if (pending.length > 0 && capturedId === '') capturedId = pending[0]!.id;
      });

      const p1 = broker.request({
        toolName: 'rollbackDeployment',
        origin: 'https://app.example.com',
        args: { force: true },
        consent: irreversibleHighWithPresence,
      });
      for (let i = 0; i < MAX_PRESENCE_ATTEMPTS; i++) {
        broker.recordPresenceFailure(capturedId);
      }
      broker.decide(capturedId, false, false, 'presence-lockout');
      await p1;

      let secondCapturedId = '';
      broker.subscribe((pending) => {
        const entry = pending.find((r) => r.toolName === 'getRecentDeployments');
        if (entry && secondCapturedId === '') secondCapturedId = entry.id;
      });

      const p2 = broker.request({
        toolName: 'getRecentDeployments',
        origin: 'https://app.example.com',
        args: {},
        consent: reversibleLow,
      });

      // Not rate-limited — different tool key — so it should enter the
      // pending queue normally rather than resolving immediately.
      expect(secondCapturedId).not.toBe('');
      broker.decide(secondCapturedId, true);
      const d2 = await p2;
      expect(d2.approved).toBe(true);
      expect(d2.reason).toBe('user');
    });

    it('cooldown expires after its duration and the tool can be requested normally again', async () => {
      const broker = new ConsentBroker();
      let capturedId = '';
      broker.subscribe((pending) => {
        if (pending.length > 0 && capturedId === '') capturedId = pending[0]!.id;
      });

      const p1 = broker.request({
        toolName: 'rollbackDeployment',
        origin: 'https://app.example.com',
        args: { force: true },
        consent: irreversibleHighWithPresence,
      });
      for (let i = 0; i < MAX_PRESENCE_ATTEMPTS; i++) {
        broker.recordPresenceFailure(capturedId);
      }
      broker.decide(capturedId, false, false, 'presence-lockout');
      await p1;

      // Base cooldown is 10s — advance past it.
      vi.advanceTimersByTime(10_001);

      let secondCapturedId = '';
      broker.subscribe((pending) => {
        const entry = pending.find(
          (r) => r.toolName === 'rollbackDeployment' && r.id !== capturedId
        );
        if (entry && secondCapturedId === '') secondCapturedId = entry.id;
      });

      const p2 = broker.request({
        toolName: 'rollbackDeployment',
        origin: 'https://app.example.com',
        args: { force: true },
        consent: irreversibleHighWithPresence,
      });

      expect(secondCapturedId).not.toBe('');
      broker.decide(secondCapturedId, true);
      const d2 = await p2;
      expect(d2.approved).toBe(true);
    });

    it('escalates the cooldown duration on repeated lockouts for the same origin+tool pair', async () => {
      const broker = new ConsentBroker();

      async function lockOutOnce() {
        let capturedId = '';
        const unsub = broker.subscribe((pending) => {
          const entry = pending.find((r) => r.toolName === 'rollbackDeployment');
          if (entry && capturedId === '') capturedId = entry.id;
        });
        const p = broker.request({
          toolName: 'rollbackDeployment',
          origin: 'https://app.example.com',
          args: { force: true },
          consent: irreversibleHighWithPresence,
        });
        for (let i = 0; i < MAX_PRESENCE_ATTEMPTS; i++) {
          broker.recordPresenceFailure(capturedId);
        }
        broker.decide(capturedId, false, false, 'presence-lockout');
        await p;
        unsub();
      }

      await lockOutOnce();
      const firstCooldown = broker.getCooldownRemaining(
        'https://app.example.com',
        'rollbackDeployment'
      );
      expect(firstCooldown).toBeGreaterThan(0);
      expect(firstCooldown).toBeLessThanOrEqual(10_000);

      // Let the first cooldown fully expire, then lock out again.
      vi.advanceTimersByTime(10_001);
      await lockOutOnce();
      const secondCooldown = broker.getCooldownRemaining(
        'https://app.example.com',
        'rollbackDeployment'
      );

      // Second lockout should escalate to roughly 3x the base cooldown (30s),
      // strictly longer than the first lockout's cooldown.
      expect(secondCooldown).toBeGreaterThan(firstCooldown);
      expect(secondCooldown).toBeLessThanOrEqual(30_000);
    });

    it('a successful approval clears any prior lockout escalation for that origin+tool pair', async () => {
      const broker = new ConsentBroker();
      let capturedId = '';
      broker.subscribe((pending) => {
        if (pending.length > 0 && capturedId === '') capturedId = pending[0]!.id;
      });

      // Lock out once.
      const p1 = broker.request({
        toolName: 'rollbackDeployment',
        origin: 'https://app.example.com',
        args: { force: true },
        consent: irreversibleHighWithPresence,
      });
      for (let i = 0; i < MAX_PRESENCE_ATTEMPTS; i++) {
        broker.recordPresenceFailure(capturedId);
      }
      broker.decide(capturedId, false, false, 'presence-lockout');
      await p1;

      // Wait out the cooldown, then approve successfully.
      vi.advanceTimersByTime(10_001);

      let secondCapturedId = '';
      broker.subscribe((pending) => {
        const entry = pending.find(
          (r) => r.toolName === 'rollbackDeployment' && r.id !== capturedId
        );
        if (entry && secondCapturedId === '') secondCapturedId = entry.id;
      });
      const p2 = broker.request({
        toolName: 'rollbackDeployment',
        origin: 'https://app.example.com',
        args: { force: true },
        consent: irreversibleHighWithPresence,
      });
      broker.decide(secondCapturedId, true);
      await p2;

      expect(broker.getCooldownRemaining('https://app.example.com', 'rollbackDeployment')).toBe(0);

      // Lock out a third time — if escalation had NOT been cleared by the
      // approval, this cooldown would be ~90s (3rd escalation). It should
      // instead be back to the base ~10s.
      let thirdCapturedId = '';
      broker.subscribe((pending) => {
        const entry = pending.find((r) => r.toolName === 'rollbackDeployment');
        if (entry && thirdCapturedId === '') thirdCapturedId = entry.id;
      });
      const p3 = broker.request({
        toolName: 'rollbackDeployment',
        origin: 'https://app.example.com',
        args: { force: true },
        consent: irreversibleHighWithPresence,
      });
      for (let i = 0; i < MAX_PRESENCE_ATTEMPTS; i++) {
        broker.recordPresenceFailure(thirdCapturedId);
      }
      broker.decide(thirdCapturedId, false, false, 'presence-lockout');
      await p3;

      const thirdCooldown = broker.getCooldownRemaining(
        'https://app.example.com',
        'rollbackDeployment'
      );
      expect(thirdCooldown).toBeGreaterThan(0);
      expect(thirdCooldown).toBeLessThanOrEqual(10_000);
    });
  });

  describe('decision events', () => {
    it('fires a decision event with reason=rate-limited for a cooldown-blocked request, without a pending entry', async () => {
      const broker = new ConsentBroker();
      let capturedId = '';
      broker.subscribe((pending) => {
        if (pending.length > 0 && capturedId === '') capturedId = pending[0]!.id;
      });

      const p1 = broker.request({
        toolName: 'rollbackDeployment',
        origin: 'https://app.example.com',
        args: { force: true },
        consent: irreversibleHighWithPresence,
      });
      for (let i = 0; i < MAX_PRESENCE_ATTEMPTS; i++) {
        broker.recordPresenceFailure(capturedId);
      }
      broker.decide(capturedId, false, false, 'presence-lockout');
      await p1;

      const events: string[] = [];
      broker.subscribeDecision((event) => {
        events.push(event.reason ?? 'unknown');
      });

      await broker.request({
        toolName: 'rollbackDeployment',
        origin: 'https://app.example.com',
        args: { force: true },
        consent: irreversibleHighWithPresence,
      });

      expect(events).toContain('rate-limited');
    });

    it('fires a decision event with reason=presence-lockout when the card auto-denies', async () => {
      const broker = new ConsentBroker();
      let capturedId = '';
      broker.subscribe((pending) => {
        if (pending.length > 0 && capturedId === '') capturedId = pending[0]!.id;
      });

      const events: string[] = [];
      broker.subscribeDecision((event) => {
        events.push(event.reason ?? 'unknown');
      });

      const p = broker.request({
        toolName: 'rollbackDeployment',
        origin: 'https://app.example.com',
        args: { force: true },
        consent: irreversibleHighWithPresence,
      });
      for (let i = 0; i < MAX_PRESENCE_ATTEMPTS; i++) {
        broker.recordPresenceFailure(capturedId);
      }
      broker.decide(capturedId, false, false, 'presence-lockout');
      await p;

      expect(events).toContain('presence-lockout');
    });
  });
});
