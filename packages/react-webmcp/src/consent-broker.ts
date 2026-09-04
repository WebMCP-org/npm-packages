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

export const MAX_PRESENCE_ATTEMPTS = 3;
const BASE_COOLDOWN_MS = 10_000;
const MAX_COOLDOWN_MS = 5 * 60_000;

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
 *
 * ### Presence-failure lockout
 *
 * When a tool has `consent.requireUserPresence`, the card calls
 * {@link ConsentBroker.recordPresenceFailure} each time the WebAuthn ceremony
 * fails or is cancelled. After {@link MAX_PRESENCE_ATTEMPTS} failures on the
 * same pending request, the origin+tool pair enters a cooldown — further
 * calls to {@link ConsentBroker.request} for that pair are auto-denied with
 * `reason: 'rate-limited'` without ever creating a new pending card, and the
 * cooldown duration escalates (10s, 30s, 90s, ... capped at 5 minutes) each
 * time the pair gets locked out again. This exists specifically to stop an
 * automated caller from retrying an approval prompt indefinitely — the same
 * class of defense used against MFA-fatigue/push-bombing attacks.
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

  /** Failed WebAuthn attempts for a given pending request id. */
  private presenceAttempts = new Map<string, number>();
  /** Cooldown expiry (ms epoch) per `"${origin}::${toolName}"` key. */
  private cooldownUntil = new Map<string, number>();
  /** How many times a key has been locked out, for escalating backoff. */
  private lockoutCount = new Map<string, number>();

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
   * Subscribe to resolution events (approved, denied, timed out, rate-limited,
   * or presence-lockout).
   */
  subscribeDecision(fn: DecisionListener): () => void {
    this.decisionListeners.add(fn);
    return () => this.decisionListeners.delete(fn);
  }

  /** Record a tool decision that did not require an interactive prompt. */
  recordDecision(
    input: {
      toolName: string;
      origin: string;
      args: unknown;
      consent: ConsentMetadata;
    },
    decision: ConsentDecision
  ) {
    this.notifyDecision({ id: crypto.randomUUID(), ...input, createdAt: Date.now() }, decision);
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
   * Milliseconds remaining on an active cooldown for this origin+tool pair,
   * or 0 if not currently locked out. Useful for the card to render a
   * countdown.
   */
  getCooldownRemaining(origin: string, toolName: string): number {
    const key = `${origin}::${toolName}`;
    const until = this.cooldownUntil.get(key);
    if (!until) return 0;
    return Math.max(0, until - Date.now());
  }

  /**
   * Request user consent for a tool invocation.
   *
   * If the tool+origin pair is in the session-preapproval cache **and**
   * `consent.reversible` is `true`, the promise resolves synchronously with
   * `reason: 'session-preapproval'`.
   *
   * If the tool+origin pair is on an active cooldown (see "Presence-failure
   * lockout" above), the promise resolves immediately with
   * `reason: 'rate-limited'` — no pending entry is created and no card is
   * ever shown for this call.
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
      this.notifyDecision({ id: crypto.randomUUID(), ...input, createdAt: Date.now() }, decision);
      return decision;
    }

    // Reject immediately, before showing a card, if this tool is on cooldown.
    // This is what stops a caller from dodging a lockout by making a brand
    // new tool call instead of retrying the same pending request.
    if (this.getCooldownRemaining(input.origin, input.toolName) > 0) {
      const decision: ConsentDecision = { approved: false, reason: 'rate-limited' };
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
          this.presenceAttempts.delete(id);
          this.notify();
          const decision: ConsentDecision = { approved: false, reason: 'timeout' };
          this.notifyDecision(timedOutEntry, decision);
          resolve(decision);
        }
      }, this.timeoutMs);
    });
  }

  /**
   * Records a failed/cancelled WebAuthn presence ceremony for a still-pending
   * request. Does NOT resolve or remove the request — it only tracks the
   * attempt count and, once {@link MAX_PRESENCE_ATTEMPTS} is reached, starts
   * (or escalates) a cooldown for the request's origin+tool pair. The card
   * is responsible for deciding what to do once `lockedOut` is true — e.g.
   * disabling its own Approve button and calling {@link decide} with
   * `reason: 'presence-lockout'`.
   */
  recordPresenceFailure(id: string): { attempts: number; lockedOut: boolean } {
    const entry = this.pending.get(id);
    if (!entry) return { attempts: 0, lockedOut: false };

    const attempts = (this.presenceAttempts.get(id) ?? 0) + 1;
    this.presenceAttempts.set(id, attempts);

    const lockedOut = attempts >= MAX_PRESENCE_ATTEMPTS;
    if (lockedOut) {
      const key = `${entry.origin}::${entry.toolName}`;
      const escalation = (this.lockoutCount.get(key) ?? 0) + 1;
      this.lockoutCount.set(key, escalation);
      const cooldownMs = Math.min(BASE_COOLDOWN_MS * 3 ** (escalation - 1), MAX_COOLDOWN_MS);
      this.cooldownUntil.set(key, Date.now() + cooldownMs);
    }

    return { attempts, lockedOut };
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
   * @param reason - Defaults to `'user'` (an explicit button press). Pass
   *   `'presence-lockout'` when the card is auto-denying after
   *   {@link recordPresenceFailure} reports `lockedOut: true`, so the audit
   *   log doesn't misrepresent an automatic deny as a human decision.
   */
  decide(
    id: string,
    approved: boolean,
    rememberForSession = false,
    reason: ConsentDecision['reason'] = 'user'
  ) {
    const entry = this.pending.get(id);
    if (!entry) return;

    this.pending.delete(id);
    this.presenceAttempts.delete(id);
    this.notify();

    const sessionKey = `${entry.origin}::${entry.toolName}`;
    if (approved) {
      // A successful approval clears any prior lockout escalation for this
      // tool — the escalating backoff is meant for repeated failures, not a
      // permanent penalty.
      this.lockoutCount.delete(sessionKey);
      this.cooldownUntil.delete(sessionKey);
      if (rememberForSession && entry.consent.reversible) {
        this.approvedThisSession.add(sessionKey);
      }
    }

    const decision: ConsentDecision = { approved, reason };
    this.notifyDecision(entry, decision);
    entry.resolve(decision);
  }
}
