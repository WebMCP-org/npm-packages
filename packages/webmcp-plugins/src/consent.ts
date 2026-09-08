import {
  InvocationFailure,
  immutableJson,
  type Caller,
  type InvocationContext,
  type InvocationResult,
  type PreparedOperation,
  type ToolIdentity,
  type WebMCPPlugin,
} from './invocation.js';

export interface PendingConsentRequest {
  readonly id: string;
  readonly invocationId: string;
  readonly operation: PreparedOperation;
  readonly caller: Caller;
  readonly expiresAt: number;
}

export interface ConsentBrokerOptions {
  timeoutMs?: number;
  onDiagnostic?: (error: unknown) => void;
  policy:
    | { mode: 'click' }
    | {
        mode: 'verified';
        /**
         * Return true only after the trusted server verifies and consumes a fresh challenge
         * bound to this request's operation and user. For passkeys, verify the registered key,
         * expected challenge, origin, RP ID, and required user verification. An assertion ID
         * alone is not verification. The protected executor must consume a grant for the same
         * operation; enrollment, account authorization, and grant storage belong to the app.
         */
        verify(
          request: PendingConsentRequest,
          proof: unknown,
          signal: AbortSignal
        ): boolean | Promise<boolean>;
      };
}

/** Framework-free pending decisions; React can subscribe to the same broker. */
export class ConsentBroker {
  private readonly pending = new Map<
    string,
    {
      request: PendingConsentRequest;
      signal: AbortSignal;
      deciding: boolean;
      settle(error?: InvocationFailure): void;
    }
  >();
  private readonly listeners = new Set<() => void>();
  private snapshot: readonly PendingConsentRequest[] = Object.freeze([]);

  private readonly timeoutMs: number;

  private readonly policy: ConsentBrokerOptions['policy'];
  private readonly onDiagnostic: ConsentBrokerOptions['onDiagnostic'];

  constructor(options: ConsentBrokerOptions) {
    if (
      options.policy?.mode !== 'click' &&
      (options.policy?.mode !== 'verified' || typeof options.policy.verify !== 'function')
    ) {
      throw new TypeError('Consent requires an explicit click policy or verification function');
    }
    this.policy = Object.freeze({ ...options.policy });
    this.onDiagnostic = options.onDiagnostic;
    this.timeoutMs = options.timeoutMs ?? 120_000;
    if (!Number.isFinite(this.timeoutMs) || this.timeoutMs <= 0 || this.timeoutMs > 2_147_483_647) {
      throw new RangeError('Consent timeout must be between 0 and 2147483647 milliseconds');
    }
  }

  readonly getSnapshot = (): readonly PendingConsentRequest[] => this.snapshot;

  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  private notify(): void {
    this.snapshot = Object.freeze(Array.from(this.pending.values(), ({ request }) => request));
    const listeners = [...this.listeners];
    for (const listener of listeners) {
      try {
        listener();
      } catch (error) {
        try {
          this.onDiagnostic?.(error);
        } catch {
          /* Diagnostics cannot strand pending decisions. */
        }
      }
    }
  }

  /** Suspend an invocation for its prepared, immutable operation; no approval is reusable. */
  async authorize(input: {
    invocationId: string;
    operation: PreparedOperation;
    signal: AbortSignal;
    caller?: Caller;
  }): Promise<void> {
    if (input.signal.aborted)
      return Promise.reject(new InvocationFailure('cancelled', input.signal.reason));
    let operation: PreparedOperation;
    let caller: Caller;
    try {
      operation = Object.freeze({
        tool: immutableJson(input.operation.tool) as ToolIdentity,
        arguments:
          input.operation.arguments === undefined
            ? undefined
            : immutableJson(input.operation.arguments),
        binding:
          input.operation.binding === undefined
            ? undefined
            : immutableJson(input.operation.binding),
      });
      caller = immutableJson(input.caller ?? { kind: 'unknown' }) as Caller;
    } catch (cause) {
      throw new InvocationFailure('denied', cause);
    }
    const request = Object.freeze({
      id: crypto.randomUUID(),
      invocationId: input.invocationId,
      expiresAt: Date.now() + this.timeoutMs,
      operation,
      caller,
    });
    const verification = new AbortController();
    return new Promise((resolve, reject) => {
      const abort = () => settle(new InvocationFailure('cancelled', input.signal.reason));
      const settle = (error?: InvocationFailure): void => {
        if (!this.pending.delete(request.id)) return;
        clearTimeout(timeout);
        input.signal.removeEventListener('abort', abort);
        if (error) verification.abort(error);
        if (error) reject(error);
        else resolve();
        this.notify();
      };
      const timeout = setTimeout(
        () => settle(new InvocationFailure('denied', new Error('Consent expired'))),
        this.timeoutMs
      );
      this.pending.set(request.id, {
        request,
        signal: verification.signal,
        deciding: false,
        settle,
      });
      input.signal.addEventListener('abort', abort, { once: true });
      this.notify();
    });
  }

  /** True only when a live request is approved; denial, expiry, or replay return false. */
  async decide(id: string, decision: { approved: boolean; proof?: unknown }): Promise<boolean> {
    const entry = this.pending.get(id);
    if (!entry || entry.deciding) return false;
    if (decision.approved !== true) {
      entry.settle(new InvocationFailure('denied', new Error('Consent denied')));
      return false;
    }
    if (Date.now() >= entry.request.expiresAt) {
      entry.settle(new InvocationFailure('denied', new Error('Consent expired')));
      return false;
    }
    entry.deciding = true;
    if (this.policy.mode === 'verified') {
      let approved = false;
      let abort!: () => void;
      const cancelled = new Promise<boolean>((resolve) => {
        abort = () => resolve(false);
        entry.signal.addEventListener('abort', abort, { once: true });
      });
      try {
        approved =
          (await Promise.race([
            this.policy.verify(entry.request, decision.proof, entry.signal),
            cancelled,
          ])) === true;
      } catch {
        /* Required verification fails closed. */
      } finally {
        entry.signal.removeEventListener('abort', abort);
      }
      if (!approved) {
        entry.settle(new InvocationFailure('denied', new Error('Consent verification failed')));
        return false;
      }
    }
    if (!this.pending.has(id) || entry.signal.aborted) return false;
    if (Date.now() >= entry.request.expiresAt) {
      entry.settle(new InvocationFailure('denied', new Error('Consent expired')));
      return false;
    }
    entry.settle();
    return true;
  }
}

export function consent({ broker }: { broker: ConsentBroker }): WebMCPPlugin {
  return {
    name: 'consent',
    aroundInvoke: async <T>(
      call: InvocationContext,
      next: () => Promise<InvocationResult<T>>
    ): Promise<InvocationResult<T>> => {
      const operation = await call.prepare();
      await broker.authorize({
        invocationId: call.id,
        operation,
        signal: call.signal,
        caller: call.caller,
      });
      call.signal.throwIfAborted();
      return next();
    },
  };
}
