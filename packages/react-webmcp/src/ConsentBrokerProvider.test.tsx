import { Component, type ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, renderHook } from 'vitest-browser-react';
import { ConsentBroker } from './consent-broker.js';
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
    expect(first).toBeInstanceOf(ConsentBroker);

    await hook.rerender();
    expect(hook.result.current).toBe(first);
  });

  it('uses an injected broker instead of allocating a default', async () => {
    const broker = new ConsentBroker();
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

    expect(left.result.current).toBeInstanceOf(ConsentBroker);
    expect(right.result.current).toBeInstanceOf(ConsentBroker);
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
    const broker = new ConsentBroker();
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

    broker.decide(hook.result.current[0]!.id, true);
    await pending;
    await vi.waitFor(() => expect(hook.result.current).toEqual([]));
  });

  it('unsubscribes from the broker on unmount', async () => {
    const broker = new ConsentBroker();
    const unsubscribe = vi.fn();
    const subscribe = vi.spyOn(broker, 'subscribe').mockImplementation((listener) => {
      const originalUnsubscribe = ConsentBroker.prototype.subscribe.call(broker, listener);
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
