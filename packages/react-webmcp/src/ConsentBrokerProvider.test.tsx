import { Component, type ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, renderHook } from 'vitest-browser-react';
import { ConsentGuard } from './consent-broker.js';
import {
  ConsentBrokerProvider,
  useConsentBroker,
  usePendingConsentRequests,
} from './ConsentBrokerProvider.js';
import type { ConsentMetadata } from './consent-types.js';

afterEach(async () => {
  await cleanup();
  vi.restoreAllMocks();
});

const reversibleLow: ConsentMetadata = {
  scope: ['read:deployments'],
  reversible: true,
  riskLevel: 'low',
  requiresApproval: true,
};

class ErrorCatcher extends Component<
  { children: ReactNode; onError: (error: Error) => void },
  { error: Error | null }
> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error) {
    this.props.onError(error);
  }

  render() {
    if (this.state.error) return null;
    return this.props.children;
  }
}

describe('ConsentBrokerProvider', () => {
  it('creates one default broker and shares it across the tree and rerenders', async () => {
    const hook = await renderHook(() => useConsentBroker(), {
      wrapper: ({ children }) => <ConsentBrokerProvider>{children}</ConsentBrokerProvider>,
    });

    const first = hook.result.current;
    expect(first).toBeInstanceOf(ConsentGuard);

    await hook.rerender();
    expect(hook.result.current).toBe(first);
  });

  it('uses an injected broker instead of allocating a default', async () => {
    const broker = new ConsentGuard();
    const hook = await renderHook(() => useConsentBroker(), {
      wrapper: ({ children }) => (
        <ConsentBrokerProvider broker={broker}>{children}</ConsentBrokerProvider>
      ),
    });

    expect(hook.result.current).toBe(broker);
  });

  it('isolates default brokers across separate provider trees', async () => {
    const left = await renderHook(() => useConsentBroker(), {
      wrapper: ({ children }) => <ConsentBrokerProvider>{children}</ConsentBrokerProvider>,
    });
    const right = await renderHook(() => useConsentBroker(), {
      wrapper: ({ children }) => <ConsentBrokerProvider>{children}</ConsentBrokerProvider>,
    });

    expect(left.result.current).toBeInstanceOf(ConsentGuard);
    expect(right.result.current).toBeInstanceOf(ConsentGuard);
    expect(left.result.current).not.toBe(right.result.current);
  });
});

describe('useConsentBroker', () => {
  it('throws when called outside ConsentBrokerProvider', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const errors: Error[] = [];

    function Outside() {
      useConsentBroker();
      return null;
    }

    await render(
      <ErrorCatcher
        onError={(error) => {
          errors.push(error);
        }}
      >
        <Outside />
      </ErrorCatcher>
    );

    await vi.waitFor(() => {
      expect(errors.some((error) => error.message.includes('useConsentBroker'))).toBe(true);
    });
  });
});

describe('usePendingConsentRequests', () => {
  it('starts empty and re-renders as requests are queued and resolved', async () => {
    const broker = new ConsentGuard();
    const hook = await renderHook(() => usePendingConsentRequests(), {
      wrapper: ({ children }) => (
        <ConsentBrokerProvider broker={broker}>{children}</ConsentBrokerProvider>
      ),
    });

    expect(hook.result.current).toEqual([]);

    const pending = broker.request({
      toolName: 'getServiceHealth',
      origin: 'https://app.example.com',
      args: { env: 'prod' },
      consent: reversibleLow,
    });

    await vi.waitFor(() => expect(hook.result.current).toHaveLength(1));
    expect(hook.result.current[0]).toMatchObject({
      toolName: 'getServiceHealth',
      origin: 'https://app.example.com',
      args: { env: 'prod' },
      consent: reversibleLow,
    });
    expect(hook.result.current[0]?.id).toEqual(expect.any(String));

    await broker.decide(hook.result.current[0]!.id, true);
    await pending;
    await vi.waitFor(() => expect(hook.result.current).toEqual([]));
  });

  it('reflects retry state in usePendingConsentRequests on presence failures and lockout', async () => {
    const verifyPresence = vi.fn().mockResolvedValue(false);
    const broker = new ConsentGuard(30_000, verifyPresence);
    const hook = await renderHook(() => usePendingConsentRequests(), {
      wrapper: ({ children }) => (
        <ConsentBrokerProvider broker={broker}>{children}</ConsentBrokerProvider>
      ),
    });

    const pendingPromise = broker.request({
      toolName: 'rollbackDeployment',
      origin: 'https://app.example.com',
      args: { force: true },
      consent: {
        scope: ['rollback'],
        reversible: false,
        riskLevel: 'high',
        requiresApproval: true,
        requireUserPresence: true,
      },
    });

    await vi.waitFor(() => expect(hook.result.current).toHaveLength(1));
    const reqId = hook.result.current[0]!.id;

    // Simulate clicking Approve from the UI card (Attempt 1)
    const res1 = await broker.decide(reqId, true);
    expect(res1).toEqual({
      success: false,
      retryable: true,
      attemptsRemaining: 2,
      reason: 'presence-failed',
    });

    // Card should stay open, showing updated attemptsRemaining & lastError
    await vi.waitFor(() => {
      expect(hook.result.current).toHaveLength(1);
      expect(hook.result.current[0]?.attemptsRemaining).toBe(2);
      expect(hook.result.current[0]?.lastError).toBe('Presence verification failed');
    });

    // User clicks Approve again (Attempt 2)
    const res2 = await broker.decide(reqId, true);
    expect(res2).toEqual({
      success: false,
      retryable: true,
      attemptsRemaining: 1,
      reason: 'presence-failed',
    });
    await vi.waitFor(() => {
      expect(hook.result.current[0]?.attemptsRemaining).toBe(1);
    });

    // Attempt 3: escalates to lockout, card closes
    const res3 = await broker.decide(reqId, true);
    expect(res3).toEqual({
      success: false,
      retryable: false,
      reason: 'presence-lockout',
    });

    // Request is removed from pending, card closes
    await vi.waitFor(() => expect(hook.result.current).toHaveLength(0));
    const decision = await pendingPromise;
    expect(decision).toEqual({ approved: false, reason: 'presence-lockout' });
  });

  it('unsubscribes from the broker on unmount', async () => {
    const broker = new ConsentGuard();
    const unsubscribe = vi.fn();
    const subscribe = vi.spyOn(broker, 'subscribe').mockImplementation((listener) => {
      const originalUnsubscribe = ConsentGuard.prototype.subscribe.call(broker, listener);
      return () => {
        unsubscribe();
        originalUnsubscribe();
      };
    });

    const hook = await renderHook(() => usePendingConsentRequests(), {
      wrapper: ({ children }) => (
        <ConsentBrokerProvider broker={broker}>{children}</ConsentBrokerProvider>
      ),
    });

    expect(subscribe).toHaveBeenCalledOnce();
    await hook.unmount();
    expect(unsubscribe).toHaveBeenCalledOnce();
  });

  it('throws when called outside ConsentBrokerProvider', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const errors: Error[] = [];

    function Outside() {
      usePendingConsentRequests();
      return null;
    }

    await render(
      <ErrorCatcher
        onError={(error) => {
          errors.push(error);
        }}
      >
        <Outside />
      </ErrorCatcher>
    );

    await vi.waitFor(() => {
      expect(errors.some((error) => error.message.includes('useConsentBroker'))).toBe(true);
    });
  });
});
