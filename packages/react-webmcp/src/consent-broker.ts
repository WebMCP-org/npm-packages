import type { ConsentDecision, ConsentMetadata, PendingConsentRequest } from './consent-types.js';

/** Callback signature for broker subscribers. */
type Listener = (pending: PendingConsentRequest[]) => void;

/** Event emitted when a consent request is resolved. */
export interface ConsentDecisionEvent extends ConsentDecision {
  id: string;
  toolName: string;
  origin: string;
  args: unknown;
  consent: ConsentMetadata;
  createdAt: number;
  resolvedAt: number;
}

type DecisionListener = (event: ConsentDecisionEvent) => void;

/**
 * Framework-agnostic consent broker.
 *
 * Sits between the guarded hook and the consent card UI. When a guarded tool
 * is invoked, the hook calls {@link ConsentBroker.request}. That call suspends
 * until the user resolves the card (via {@link ConsentBroker.decide}) or the
 * per-request timeout fires.
 *
 * The broker is deliberately React-free so it can be unit-tested without a DOM
 * or renderer, and shared across framework boundaries if needed.
 *
 * ### Session preapproval
 *
 * If the user approves a call and passes `rememberForSession = true`, the
 * `origin + toolName` pair is cached in memory for the lifetime of the broker
 * instance. Subsequent calls for the same pair skip the prompt and resolve
 * immediately with `reason: 'session-preapproval'` — **but only when
 * `consent.reversible` is `true`**. Irreversible actions always prompt the
 * user, no matter how many times they have been approved before.
 */
export class ConsentBroker {
  private pending = new Map<
    string,
    PendingConsentRequest & {
      resolve: (d: ConsentDecision) => void;
    }
  >();

  private listeners = new Set<Listener>();
  private decisionListeners = new Set<DecisionListener>();

  /**
   * In-memory session cache.
   * Key format: `"${origin}::${toolName}"`.
   * Only reversible tools are added here.
   */
  private approvedThisSession = new Set<string>();

  /**
   * @param timeoutMs - Milliseconds before an unanswered prompt is auto-denied.
   *   Defaults to 30 seconds.
   */
  constructor(private readonly timeoutMs = 30_000) {}

  /**
   * Subscribe to changes in the pending request list.
   *
   * The callback is called immediately on any change (request added, request
   * resolved, timeout). Returns an unsubscribe function.
   */
  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  /**
   * Subscribe to resolution events (approved or denied).
   */
  subscribeDecision(fn: DecisionListener): () => void {
    this.decisionListeners.add(fn);
    return () => this.decisionListeners.delete(fn);
  }

  private notify() {
    const list = Array.from(this.pending.values());
    this.listeners.forEach((fn) => fn(list));
  }

  private notifyDecision(request: PendingConsentRequest, decision: ConsentDecision) {
    const event: ConsentDecisionEvent = {
      ...decision,
      ...request,
      resolvedAt: Date.now(),
    };
    this.decisionListeners.forEach((fn) => fn(event));
  }

  /**
   * Request user consent for a tool invocation.
   *
   * If the tool+origin pair is in the session-preapproval cache **and**
   * `consent.reversible` is `true`, the promise resolves synchronously in the
   * next microtask with `reason: 'session-preapproval'`.
   *
   * Otherwise, the request is added to the pending queue, subscribers are
   * notified (so the consent card can render), and the promise waits for either
   * a {@link decide} call or the configured timeout.
   */
  async request(input: {
    toolName: string;
    origin: string;
    args: unknown;
    consent: ConsentMetadata;
  }): Promise<ConsentDecision> {
    const sessionKey = `${input.origin}::${input.toolName}`;

    if (input.consent.reversible && this.approvedThisSession.has(sessionKey)) {
      const decision: ConsentDecision = { approved: true, reason: 'session-preapproval' };
      // Notify decision for cache hits too, fabricating a pending request structure
      this.notifyDecision({ id: crypto.randomUUID(), ...input, createdAt: Date.now() }, decision);
      return decision;
    }

    const id = crypto.randomUUID();

    return new Promise<ConsentDecision>((resolve) => {
      const entry = { id, ...input, createdAt: Date.now(), resolve };
      this.pending.set(id, entry);
      this.notify();

      setTimeout(() => {
        if (this.pending.has(id)) {
          const timedOutEntry = this.pending.get(id)!;
          this.pending.delete(id);
          this.notify();
          const decision: ConsentDecision = { approved: false, reason: 'timeout' };
          this.notifyDecision(timedOutEntry, decision);
          resolve(decision);
        }
      }, this.timeoutMs);
    });
  }

  /**
   * Resolve a pending consent request.
   *
   * @param id - The {@link PendingConsentRequest.id} to resolve.
   * @param approved - Whether the user approved the call.
   * @param rememberForSession - If `true` **and** the tool's
   *   `consent.reversible` is also `true`, cache this approval so future calls
   *   for the same tool+origin skip the prompt. Irreversible tools are never
   *   cached regardless of this flag.
   */
  decide(id: string, approved: boolean, rememberForSession = false) {
    const entry = this.pending.get(id);
    if (!entry) return;

    this.pending.delete(id);
    this.notify();

    if (approved && rememberForSession && entry.consent.reversible) {
      this.approvedThisSession.add(`${entry.origin}::${entry.toolName}`);
    }

    const decision: ConsentDecision = { approved, reason: 'user' };
    this.notifyDecision(entry, decision);
    entry.resolve(decision);
  }
}
