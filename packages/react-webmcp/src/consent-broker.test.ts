import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ConsentBroker } from './consent-broker.js';
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
});
