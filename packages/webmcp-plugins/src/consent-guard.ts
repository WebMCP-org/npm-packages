import type {
  ConsentDecision,
  ConsentMetadata,
  DecideResult,
  GuardPendingConsentRequest,
  PendingConsentRequest,
} from './consent-types.js';
import { verifyUserPresence } from './consent-presence.js';

export type { DecideResult, PendingConsentRequest };

/** Callback signature for broker subscribers. */
type Listener = (pending: GuardPendingConsentRequest[]) => void;

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
 * Framework-agnostic consent guard.
 *
 * Sits between the guarded hook and the consent card UI. When a guarded tool
 * is invoked, the hook calls {@link ConsentGuard.request}. That call suspends
 * until the user resolves the card (via {@link ConsentGuard.decide}) or the
 * per-request timeout fires.
 *
 * The guard is deliberately React-free so it can be unit-tested without a DOM
 * or renderer, and shared across framework boundaries if needed.
 *
 * Do not call {@link ConsentGuard.recordPresenceFailure} yourself in combination
 * with `decide(id, true)` for the same request: {@link ConsentGuard.decide}
 * already runs the injected presence ceremony and records failures internally
 * when `consent.requireUserPresence` is set. Calling both would double-count
 * attempts.
 *
 * ### Session preapproval
 *
 * If the user approves a call and passes `rememberForSession = true`, the
 * `origin + toolName` pair is cached in memory for the lifetime of the guard
 * instance. Subsequent calls for the same pair skip the prompt and resolve
 * immediately with `reason: 'session-preapproval'` — **but only when
 * `consent.reversible` is `true`**. Irreversible actions always prompt the
 * user, no matter how many times they have been approved before.
 *
 * ### Presence-failure lockout
 *
 * When a tool has `consent.requireUserPresence`, the supported integration is
 * `decide(id, true)`: the guard runs the injected `verifyPresence` ceremony
 * itself and records failures internally. After
 * {@link MAX_PRESENCE_ATTEMPTS} failures for the same origin+tool pair (across
 * requests), that pair enters a cooldown — further calls to
 * {@link ConsentGuard.request} for that pair are auto-denied with
 * `reason: 'rate-limited'` without ever creating a new pending card, and the
 * cooldown duration escalates (10s, 30s, 90s, ... capped at 5 minutes) each
 * time the pair gets locked out again. This exists specifically to stop an
 * automated caller from retrying an approval prompt indefinitely — the same
 * class of defense used against MFA-fatigue/push-bombing attacks.
 *
 * Once a served cooldown expires, {@link request} clears the pair's attempt
 * count via {@link clearExpiredCooldown} so the next presence failure starts a
 * fresh 3-strike window rather than instantly relocking — the escalation
 * counter (`lockoutCount`) is preserved separately, so repeat offenders still
 * face longer cooldowns on each subsequent lockout.
 */
export class ConsentGuard {
  private pending = new Map<string, GuardPendingConsentRequest>();
  private requestControls = new Map<
    string,
    {
      resolve: (d: ConsentDecision) => void;
      resetTimeout: () => void;
      clearTimeout: () => void;
    }
  >();
  private inFlightDecisions = new Map<string, Promise<DecideResult>>();

  private listeners = new Set<Listener>();
  private decisionListeners = new Set<DecisionListener>();

  /**
   * In-memory session cache.
   * Key format: `"${origin}::${toolName}"`.
   * Only reversible tools are added here.
   */
  private approvedThisSession = new Set<string>();

  /** Failed WebAuthn attempts, keyed by `${origin}::${toolName}` (not request id). */
  private presenceAttempts = new Map<string, number>();
  /** Cooldown expiry (ms epoch) per `"${origin}::${toolName}"` key. */
  private cooldownUntil = new Map<string, number>();
  /** How many times a key has been locked out, for escalating backoff. */
  private lockoutCount = new Map<string, number>();

  /**
   * @param timeoutMs - Milliseconds before an unanswered prompt is auto-denied.
   *   Defaults to 30 seconds.
   * @param verifyPresence - WebAuthn verification runner. Defaults to verifyUserPresence.
   */
  constructor(
    private readonly timeoutMs = 30_000,
    private readonly verifyPresence: () => Promise<boolean> = verifyUserPresence
  ) {}

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

  private notifyDecision(request: GuardPendingConsentRequest, decision: ConsentDecision) {
    const event: ConsentDecisionEvent = {
      ...decision,
      ...request,
      resolvedAt: Date.now(),
    };
    this.decisionListeners.forEach((fn) => fn(event));
  }

  /**
   * If the cooldown for this origin+tool key has expired, clears both the
   * cooldown expiry and the accumulated presence-attempt count for that key,
   * so the pair starts a fresh {@link MAX_PRESENCE_ATTEMPTS}-strike window.
   *
   * Deliberately does NOT clear {@link lockoutCount} — escalating backoff on
   * a repeat offender is a separate, longer-lived penalty from the attempt
   * counter reset.
   *
   * This is the only place that mutates cooldown/attempt state as a side
   * effect of time passing; {@link getCooldownRemaining} stays a pure read so
   * callers (e.g. UI countdowns) can call it freely without changing broker
   * state.
   */
  private clearExpiredCooldown(key: string): void {
    const until = this.cooldownUntil.get(key);
    if (until !== undefined && Date.now() >= until) {
      this.cooldownUntil.delete(key);
      this.presenceAttempts.delete(key);
    }
  }

  /**
   * Milliseconds remaining on an active cooldown for this origin+tool pair,
   * or 0 if not currently locked out. Useful for the card to render a
   * countdown.
   *
   * Pure read — does not mutate broker state, even once the cooldown has
   * expired. Expired-cooldown cleanup happens explicitly in {@link request}
   * via {@link clearExpiredCooldown}.
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
   * If the tool+origin pair is on an active cooldown (see "Presence-failure
   * lockout" above), the promise resolves immediately with
   * `reason: 'rate-limited'` — no pending entry is created and no card is
   * ever shown for this call. This active lockout overrides any cached session
   * pre-approval. If a previous cooldown for this pair has since expired, it
   * is cleared here (see {@link clearExpiredCooldown}) before the check runs,
   * so a served penalty doesn't linger.
   *
   * If the tool+origin pair is in the session-preapproval cache **and**
   * `consent.reversible` is `true`, the promise resolves synchronously with
   * `reason: 'session-preapproval'`.
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

    // 1. Clear any expired cooldown for this key first.
    this.clearExpiredCooldown(sessionKey);

    // 2. Cooldown check MUST run before the session-preapproval check.
    // This stops a caller from dodging a lockout by making a brand new tool
    // call, and guarantees that an active lockout overrides any cached session
    // pre-approval.
    if (this.getCooldownRemaining(input.origin, input.toolName) > 0) {
      const decision: ConsentDecision = { approved: false, reason: 'rate-limited' };
      this.notifyDecision({ id: crypto.randomUUID(), ...input, createdAt: Date.now() }, decision);
      return decision;
    }

    // 3. Only then check session pre-approval.
    if (input.consent.reversible && this.approvedThisSession.has(sessionKey)) {
      const decision: ConsentDecision = { approved: true, reason: 'session-preapproval' };
      this.notifyDecision({ id: crypto.randomUUID(), ...input, createdAt: Date.now() }, decision);
      return decision;
    }

    const id = crypto.randomUUID();

    return new Promise<ConsentDecision>((resolve) => {
      let timeoutId: ReturnType<typeof setTimeout> | undefined;

      const scheduleTimeout = () => {
        if (timeoutId !== undefined) {
          clearTimeout(timeoutId);
        }
        timeoutId = setTimeout(() => {
          if (this.pending.has(id)) {
            const timedOutEntry = this.pending.get(id)!;
            this.pending.delete(id);
            this.inFlightDecisions.delete(id);
            this.requestControls.delete(id);
            this.notify();
            const decision: ConsentDecision = { approved: false, reason: 'timeout' };
            this.notifyDecision(timedOutEntry, decision);
            resolve(decision);
          }
        }, this.timeoutMs);
      };

      const clearTimeoutFn = () => {
        if (timeoutId !== undefined) {
          clearTimeout(timeoutId);
          timeoutId = undefined;
        }
      };

      const entry: GuardPendingConsentRequest = {
        id,
        ...input,
        createdAt: Date.now(),
        attemptsRemaining: MAX_PRESENCE_ATTEMPTS,
      };

      this.pending.set(id, entry);
      this.requestControls.set(id, {
        resolve,
        resetTimeout: scheduleTimeout,
        clearTimeout: clearTimeoutFn,
      });

      this.notify();
      scheduleTimeout();
    });
  }

  /**
   * Records a failed/cancelled WebAuthn presence ceremony for a still-pending
   * request. Primarily an **internal** method that {@link decide} calls itself
   * when the injected `verifyPresence` ceremony fails. Does NOT resolve or
   * remove the request — it only tracks the attempt count and, once
   * {@link MAX_PRESENCE_ATTEMPTS} is reached, starts (or escalates) a cooldown
   * for the request's origin+tool pair.
   *
   * Call this directly only when verification happens *outside* the guard's
   * built-in ceremony (for example a server-verified passkey flow that never
   * uses the injected `verifyPresence` callback). In that out-of-band case the
   * caller is responsible for deciding what to do once `lockedOut` is true —
   * e.g. disabling its Approve button and calling {@link decide} with
   * `reason: 'presence-lockout'`. Do not combine a manual call with
   * `decide(id, true)` for the same request.
   */
  recordPresenceFailure(id: string): { attempts: number; lockedOut: boolean } {
    const entry = this.pending.get(id);
    if (!entry) return { attempts: 0, lockedOut: false };

    const key = `${entry.origin}::${entry.toolName}`;
    const attempts = (this.presenceAttempts.get(key) ?? 0) + 1;
    this.presenceAttempts.set(key, attempts);

    const lockedOut = attempts >= MAX_PRESENCE_ATTEMPTS;
    // Escalate once when crossing the threshold, not on every extra failure
    // while already locked out.
    if (lockedOut && attempts === MAX_PRESENCE_ATTEMPTS) {
      const escalation = (this.lockoutCount.get(key) ?? 0) + 1;
      this.lockoutCount.set(key, escalation);
      const cooldownMs = Math.min(BASE_COOLDOWN_MS * 3 ** (escalation - 1), MAX_COOLDOWN_MS);
      this.cooldownUntil.set(key, Date.now() + cooldownMs);
    }

    return { attempts, lockedOut };
  }

  /**
   * Resolve a pending consent request asynchronously.
   *
   * @param id - The {@link GuardPendingConsentRequest.id} to resolve.
   * @param approved - Whether the user approved the call.
   * @param rememberForSession - If `true` **and** the tool's
   *   `consent.reversible` is also `true`, cache this approval so future calls
   *   for the same tool+origin skip the prompt. Irreversible tools are never
   *   cached regardless of this flag.
   * @param reason - Defaults to `'user'` (an explicit button press). Pass
   *   `'presence-lockout'` when recording an automated lockout deny.
   * @returns A Promise resolving to {@link DecideResult}.
   */
  decide(
    id: string,
    approved: boolean,
    rememberForSession = false,
    reason?: ConsentDecision['reason']
  ): Promise<DecideResult> {
    const entry = this.pending.get(id);
    if (!entry) {
      return Promise.resolve({ success: false, retryable: false, reason: 'denied' });
    }

    // Mid-retry bailout: Deny immediately cancels the request, clears any pending timeout,
    // and resolves the broker.request() promise as denied.
    if (!approved) {
      this.inFlightDecisions.delete(id);
      this.pending.delete(id);
      const controls = this.requestControls.get(id);
      controls?.clearTimeout();
      this.requestControls.delete(id);
      this.notify();

      const decisionReason = reason ?? 'user';
      const decision: ConsentDecision = { approved: false, reason: decisionReason };
      this.notifyDecision(entry, decision);
      controls?.resolve(decision);

      return Promise.resolve({
        success: false,
        retryable: false,
        reason: decisionReason === 'presence-lockout' ? 'presence-lockout' : 'denied',
      });
    }

    // Concurrency guard: return the identical in-flight promise on rapid repeated approvals
    const inFlight = this.inFlightDecisions.get(id);
    if (inFlight) {
      return inFlight;
    }

    // TRANSIENT ACTIVATION: execute verifyPresence synchronously in this call stack frame!
    let presencePromise: Promise<boolean> | undefined;
    if (entry.consent.requireUserPresence) {
      try {
        presencePromise = this.verifyPresence();
      } catch {
        presencePromise = Promise.resolve(false);
      }
    }

    const execute = async (): Promise<DecideResult> => {
      try {
        if (entry.consent.requireUserPresence) {
          let verified = false;
          try {
            verified = (await presencePromise!) === true;
          } catch {
            verified = false;
          }

          // Check if request was cancelled/denied while ceremony was in-flight
          if (!this.pending.has(id)) {
            return { success: false, retryable: false, reason: 'denied' };
          }

          if (!verified) {
            const { attempts, lockedOut } = this.recordPresenceFailure(id);

            if (!lockedOut) {
              const attemptsRemaining = Math.max(0, MAX_PRESENCE_ATTEMPTS - attempts);
              entry.lastError = 'Presence verification failed';
              entry.attemptsRemaining = attemptsRemaining;

              this.requestControls.get(id)?.resetTimeout();
              this.notifyDecision(entry, { approved: false, reason: 'presence-failed' });
              this.notify();

              return {
                success: false,
                retryable: true,
                attemptsRemaining,
                reason: 'presence-failed',
              };
            } else {
              // Attempt 3: lockout escalation
              this.notifyDecision(entry, { approved: false, reason: 'presence-lockout' });
              this.pending.delete(id);
              const controls = this.requestControls.get(id);
              controls?.clearTimeout();
              this.requestControls.delete(id);
              this.notify();

              const decision: ConsentDecision = { approved: false, reason: 'presence-lockout' };
              controls?.resolve(decision);

              return {
                success: false,
                retryable: false,
                reason: 'presence-lockout',
              };
            }
          }
        }

        // Check if request was cancelled/denied while ceremony was in-flight
        if (!this.pending.has(id)) {
          return { success: false, retryable: false, reason: 'denied' };
        }

        this.pending.delete(id);
        const controls = this.requestControls.get(id);
        controls?.clearTimeout();
        this.requestControls.delete(id);
        this.notify();

        const sessionKey = `${entry.origin}::${entry.toolName}`;
        this.lockoutCount.delete(sessionKey);
        this.cooldownUntil.delete(sessionKey);
        this.presenceAttempts.delete(sessionKey);
        if (rememberForSession && entry.consent.reversible) {
          this.approvedThisSession.add(sessionKey);
        }

        const decision: ConsentDecision = { approved: true, reason: 'user' };
        this.notifyDecision(entry, decision);
        controls?.resolve(decision);

        return { success: true, reason: 'approved' };
      } finally {
        this.inFlightDecisions.delete(id);
      }
    };

    const decisionPromise = execute();
    this.inFlightDecisions.set(id, decisionPromise);
    return decisionPromise;
  }
}
