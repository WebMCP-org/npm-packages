import type { WebMCPPlugin } from './index.js';
import { verifyUserPresence } from './presence.js';

export {
  browserSupportsWebAuthn,
  clearPresenceCredential,
  platformAuthenticatorIsAvailable,
  registerUserPresenceCredential,
  verifyUserPresence,
} from './presence.js';

export type RiskLevel = 'low' | 'medium' | 'high';

/** Consent policy for one tool. Also mapped to MCP annotations by {@link toMcpAnnotations}. */
export interface ConsentMetadata {
  /** Capability scopes shown to the user, e.g. `['write:deployments']`. */
  scope: string[];
  /** Irreversible tools are never approved for the rest of the session. */
  reversible: boolean;
  riskLevel: RiskLevel;
  /** Always, never, or depending on the call's input. */
  // oxlint-disable-next-line anti-slop/no-unknown-parameters -- the policy owner narrows its tool's input
  requiresApproval: boolean | ((input: unknown) => boolean);
  /** Require a WebAuthn user-verification ceremony on every call. Implies approval. */
  requireUserPresence?: boolean;
  /** Repeating the call with the same input has no further effect. Defaults to false. */
  idempotent?: boolean;
  /** Defaults to `riskLevel === 'low' && reversible`. */
  readOnly?: boolean;
}

export interface ConsentDecision {
  approved: boolean;
  reason:
    | 'user'
    | 'not-required'
    | 'session-preapproval'
    | 'timeout'
    | 'cancelled'
    | 'rate-limited'
    | 'presence-failed'
    | 'presence-lockout';
}

export interface PendingConsentRequest {
  id: string;
  toolName: string;
  origin: string;
  args: unknown;
  consent: ConsentMetadata;
  createdAt: number;
  /** Set after a failed presence ceremony; the request stays pending. */
  lastError?: string;
  /** Presence attempts left before this tool is locked out. */
  attemptsRemaining?: number;
}

export interface ConsentDecisionEvent extends PendingConsentRequest, ConsentDecision {
  resolvedAt: number;
}

export interface DecideResult {
  success: boolean;
  attemptsRemaining?: number;
  reason: 'approved' | 'denied' | 'presence-failed' | 'presence-lockout';
}

export interface ConsentGuardOptions {
  /** Unanswered requests are denied after this long. Defaults to 30 seconds. */
  timeoutMs?: number;
  /**
   * Presence check for tools with `requireUserPresence`. Called synchronously inside
   * {@link ConsentGuard.decide} so it keeps the click's user activation. Replace it to
   * verify on a server. `signal` aborts when the request settles. The request's timeout
   * pauses during the check, so the check must settle on its own. Defaults to
   * {@link verifyUserPresence}.
   */
  verifyPresence?: (
    request: PendingConsentRequest,
    signal: AbortSignal
  ) => boolean | Promise<boolean>;
}

export const MAX_PRESENCE_ATTEMPTS = 3;
const BASE_COOLDOWN_MS = 10_000;
const MAX_COOLDOWN_MS = 5 * 60_000;

type RequestInput = Pick<PendingConsentRequest, 'toolName' | 'origin' | 'args' | 'consent'>;

interface Entry {
  request: PendingConsentRequest;
  resolve: (decision: ConsentDecision) => void;
  /** Aborts an in-flight presence check once the request settles. */
  settled: AbortController;
  timer?: ReturnType<typeof setTimeout>;
  deciding?: Promise<DecideResult>;
  cleanup?: () => void;
}

const DENIED: DecideResult = { success: false, reason: 'denied' };

/**
 * Framework-free queue of consent requests awaiting a user's decision.
 *
 * Approving with `rememberForSession` skips later prompts for the same origin and tool,
 * only for reversible tools without `requireUserPresence`. After
 * {@link MAX_PRESENCE_ATTEMPTS} failed presence ceremonies, the origin and tool are
 * denied as `rate-limited` for a cooldown that grows 10s, 30s, 90s, up to 5 minutes, which
 * stops an agent from retrying prompts until the user gives in.
 */
export class ConsentGuard {
  readonly #timeoutMs: number;
  readonly #verifyPresence: NonNullable<ConsentGuardOptions['verifyPresence']>;
  readonly #pending = new Map<string, Entry>();
  readonly #listeners = new Set<() => void>();
  readonly #decisionListeners = new Set<(event: ConsentDecisionEvent) => void>();
  readonly #sessionApprovals = new Set<string>();
  readonly #presence = new Map<
    string,
    { attempts: number; lockouts: number; cooldownUntil: number }
  >();
  #snapshot: readonly PendingConsentRequest[] = [];

  constructor({
    timeoutMs = 30_000,
    verifyPresence = (_request, signal) => verifyUserPresence(signal),
  }: ConsentGuardOptions = {}) {
    this.#timeoutMs = timeoutMs;
    this.#verifyPresence = verifyPresence;
  }

  /** Pending requests; the array changes identity only when the queue changes. */
  readonly getPending = (): readonly PendingConsentRequest[] => this.#snapshot;

  readonly subscribe = (listener: () => void): (() => void) => {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  };

  /** Observe every resolved request, including ones that never prompted. */
  subscribeDecision(listener: (event: ConsentDecisionEvent) => void): () => void {
    this.#decisionListeners.add(listener);
    return () => this.#decisionListeners.delete(listener);
  }

  getCooldownRemaining(origin: string, toolName: string): number {
    const until = this.#presence.get(`${origin}::${toolName}`)?.cooldownUntil ?? 0;
    return Math.max(0, until - Date.now());
  }

  /** Record a decision that needed no prompt, so decision observers see every call. */
  recordDecision(input: RequestInput, decision: ConsentDecision): ConsentDecision {
    this.#emit({ id: crypto.randomUUID(), ...input, createdAt: Date.now() }, decision);
    return decision;
  }

  /** Resolve once the user decides, the request times out, or `signal` aborts. */
  async request({
    signal,
    ...input
  }: RequestInput & { signal?: AbortSignal }): Promise<ConsentDecision> {
    const key = `${input.origin}::${input.toolName}`;
    const presence = this.#presence.get(key);
    if (presence?.cooldownUntil && Date.now() >= presence.cooldownUntil) {
      // A served cooldown starts a fresh attempt window; lockouts keep escalating.
      presence.attempts = 0;
      presence.cooldownUntil = 0;
    }
    // The lockout check runs first so session approval cannot dodge it.
    if (this.getCooldownRemaining(input.origin, input.toolName) > 0) {
      return this.recordDecision(input, { approved: false, reason: 'rate-limited' });
    }
    const { reversible, requireUserPresence } = input.consent;
    if (reversible && !requireUserPresence && this.#sessionApprovals.has(key)) {
      return this.recordDecision(input, { approved: true, reason: 'session-preapproval' });
    }
    if (signal?.aborted)
      return this.recordDecision(input, { approved: false, reason: 'cancelled' });

    const id = crypto.randomUUID();
    return new Promise((resolve) => {
      const entry: Entry = {
        request: {
          id,
          ...input,
          createdAt: Date.now(),
          ...(requireUserPresence && {
            attemptsRemaining: MAX_PRESENCE_ATTEMPTS - (presence?.attempts ?? 0),
          }),
        },
        resolve,
        settled: new AbortController(),
      };
      if (signal) {
        const abort = () => this.#settle(id, { approved: false, reason: 'cancelled' });
        signal.addEventListener('abort', abort, { once: true });
        entry.cleanup = () => signal.removeEventListener('abort', abort);
      }
      this.#pending.set(id, entry);
      this.#armTimeout(id, entry);
      this.#notify();
    });
  }

  /**
   * Resolve a pending request. Call from the approval click handler: presence ceremonies
   * start synchronously to keep its user activation. Repeated approvals while one is in
   * flight share its result.
   */
  decide(id: string, approved: boolean, rememberForSession = false): Promise<DecideResult> {
    const entry = this.#pending.get(id);
    if (!entry) return Promise.resolve(DENIED);
    if (!approved) {
      this.#settle(id, { approved: false, reason: 'user' });
      return Promise.resolve(DENIED);
    }
    if (entry.deciding) return entry.deciding;

    let verified: Promise<boolean> | undefined;
    if (entry.request.consent.requireUserPresence) {
      // The timeout pauses while the user is in the ceremony and restarts if it fails.
      clearTimeout(entry.timer);
      try {
        verified = Promise.resolve(this.#verifyPresence(entry.request, entry.settled.signal));
      } catch {
        verified = Promise.resolve(false);
      }
    }
    entry.deciding = (async (): Promise<DecideResult> => {
      const ok = verified ? (await verified.catch(() => false)) === true : true;
      // The request may have timed out or been cancelled during the ceremony.
      if (this.#pending.get(id) !== entry) return DENIED;
      const { origin, toolName, consent } = entry.request;
      const key = `${origin}::${toolName}`;
      if (ok) {
        this.#presence.delete(key);
        if (rememberForSession && consent.reversible) this.#sessionApprovals.add(key);
        this.#settle(id, { approved: true, reason: 'user' });
        return { success: true, reason: 'approved' };
      }
      const presence = this.#presence.get(key) ?? { attempts: 0, lockouts: 0, cooldownUntil: 0 };
      this.#presence.set(key, presence);
      presence.attempts += 1;
      if (presence.attempts >= MAX_PRESENCE_ATTEMPTS) {
        if (presence.attempts === MAX_PRESENCE_ATTEMPTS) {
          presence.lockouts += 1;
          presence.cooldownUntil =
            Date.now() + Math.min(BASE_COOLDOWN_MS * 3 ** (presence.lockouts - 1), MAX_COOLDOWN_MS);
        }
        this.#settle(id, { approved: false, reason: 'presence-lockout' });
        return { success: false, reason: 'presence-lockout' };
      }
      const attemptsRemaining = MAX_PRESENCE_ATTEMPTS - presence.attempts;
      entry.request = {
        ...entry.request,
        lastError: 'Presence verification failed',
        attemptsRemaining,
      };
      // The request stays pending, so the user can retry.
      delete entry.deciding;
      this.#armTimeout(id, entry);
      this.#emit(entry.request, { approved: false, reason: 'presence-failed' });
      this.#notify();
      return { success: false, attemptsRemaining, reason: 'presence-failed' };
    })();
    return entry.deciding;
  }

  #armTimeout(id: string, entry: Entry): void {
    clearTimeout(entry.timer);
    entry.timer = setTimeout(
      () => this.#settle(id, { approved: false, reason: 'timeout' }),
      this.#timeoutMs
    );
  }

  #settle(id: string, decision: ConsentDecision): void {
    const entry = this.#pending.get(id);
    if (!entry) return;
    this.#pending.delete(id);
    clearTimeout(entry.timer);
    entry.cleanup?.();
    entry.settled.abort();
    // Resolve first so a throwing listener cannot leave the call hanging.
    entry.resolve(decision);
    this.#notify();
    this.#emit(entry.request, decision);
  }

  #notify(): void {
    this.#snapshot = Array.from(this.#pending.values(), (entry) => entry.request);
    // oxlint-disable-next-line unicorn/no-useless-spread -- a listener may unsubscribe while notified
    for (const listener of [...this.#listeners]) listener();
  }

  #emit(request: PendingConsentRequest, decision: ConsentDecision): void {
    const event = { ...request, ...decision, resolvedAt: Date.now() };
    // oxlint-disable-next-line unicorn/no-useless-spread -- a listener may unsubscribe while notified
    for (const listener of [...this.#decisionListeners]) listener(event);
  }
}

/**
 * Ask `guard` before each call when `metadata` requires approval. Refusals reject with a
 * `NotAllowedError` DOMException; cancellation rejects with the call's abort reason.
 */
export function consent(guard: ConsentGuard, metadata: ConsentMetadata): WebMCPPlugin {
  return {
    name: 'consent',
    async aroundExecute(call, next) {
      const request = {
        toolName: call.name,
        origin: globalThis.location?.origin ?? 'unknown',
        args: call.input,
        consent: metadata,
      };
      const required =
        metadata.requireUserPresence === true ||
        (typeof metadata.requiresApproval === 'function'
          ? metadata.requiresApproval(call.input)
          : metadata.requiresApproval);
      if (!required) {
        guard.recordDecision(request, { approved: true, reason: 'not-required' });
        return next();
      }
      const decision = await guard.request({ ...request, signal: call.signal });
      if (decision.reason === 'cancelled') throw call.signal.reason;
      if (!decision.approved) {
        throw new DOMException(
          `Tool "${call.name}" was not approved (${decision.reason})`,
          'NotAllowedError'
        );
      }
      return next();
    },
  };
}

/** MCP behavior hints derived from consent metadata. */
export function toMcpAnnotations(metadata: ConsentMetadata) {
  return {
    readOnlyHint: metadata.readOnly ?? (metadata.riskLevel === 'low' && metadata.reversible),
    destructiveHint: !metadata.reversible,
    idempotentHint: metadata.idempotent ?? false,
  };
}
