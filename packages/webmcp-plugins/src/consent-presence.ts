import {
  startRegistration,
  startAuthentication,
  browserSupportsWebAuthn,
  platformAuthenticatorIsAvailable,
} from '@simplewebauthn/browser';

const STORAGE_KEY = 'mcp-b:consent-presence-credential';

interface StoredCredential {
  id: string;
}

function getStoredCredential(): StoredCredential | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function randomChallenge(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/**
 * Removes the locally stored presence credential id, so the next
 * {@link ensurePresenceCredential} call enrolls a fresh one.
 *
 * Use this for an explicit "forget this device" / reset flow, or
 * automatically when {@link verifyUserPresence} suspects the stored
 * credential id is no longer recognized by the authenticator (see the
 * "Known limitation" note there).
 */
export function clearPresenceCredential(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* Storage may be unavailable (private browsing, disabled cookies, etc). */
  }
  consecutiveFailures = 0;
}

/**
 * Consecutive {@link verifyUserPresence} failures for the currently stored
 * credential, tracked in-memory only (resets on page reload). Used purely as
 * a recovery heuristic — see the "Known limitation" note on
 * {@link verifyUserPresence} for why this can't be exact.
 */
let consecutiveFailures = 0;

/** After this many consecutive failures, assume the stored credential id is
 * stale (revoked, cleared by the OS, etc.) rather than repeatedly declined,
 * and clear it so the next attempt re-enrolls instead of failing forever. */
const STALE_CREDENTIAL_THRESHOLD = 3;

/**
 * Enrolls a platform-authenticator credential for this origin, once.
 * Self-attested, client-generated challenge — not a substitute for a real
 * relying-party server. Exists purely as a local "is a human physically
 * present right now" gate, not remote identity verification.
 */
export async function ensurePresenceCredential(
  rpName = 'WebMCP Consent Layer'
): Promise<StoredCredential> {
  const existing = getStoredCredential();
  if (existing) return existing;

  const cred = await startRegistration({
    optionsJSON: {
      rp: { name: rpName, id: window.location.hostname },
      user: {
        id: randomChallenge(),
        name: 'consent-layer-user',
        displayName: 'Consent Layer User',
      },
      challenge: randomChallenge(),
      pubKeyCredParams: [
        { alg: -7, type: 'public-key' },
        { alg: -257, type: 'public-key' },
      ],
      authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required' },
      timeout: 60_000,
      attestation: 'none',
    },
  });

  const stored: StoredCredential = { id: cred.id };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
  return stored;
}

/**
 * Runs a WebAuthn user-verification ceremony against the enrolled credential.
 * Resolves true only if the authenticator reports the user was verified for
 * THIS call, right now.
 *
 * Caveat: automation tooling (Playwright/CDP) can register a virtual
 * authenticator (`WebAuthn.addVirtualAuthenticator`, `isUserVerified: true`)
 * that answers this ceremony without real hardware. This raises the bar over
 * a plain synthetic click substantially but is not an absolute guarantee.
 * See NOTES.md "Known limitations".
 *
 * Known limitation — stale credentials: the WebAuthn spec deliberately makes
 * "no such credential" and "user declined" surface as the *same*
 * `NotAllowedError`, specifically to stop a page from probing which
 * credentials exist. That means this function cannot reliably distinguish
 * "the user said no" from "the stored credential id no longer exists" (e.g.
 * the passkey was removed from Touch ID / Windows Hello outside the
 * browser). As a best-effort recovery heuristic, after
 * {@link STALE_CREDENTIAL_THRESHOLD} consecutive failures this function
 * clears the stored credential via {@link clearPresenceCredential} so the
 * next call re-enrolls, on the assumption that a real user declining
 * repeatedly is rarer than a genuinely stale credential id. This is a
 * heuristic, not a detection — a user who legitimately keeps declining will
 * eventually get a fresh enrollment prompt instead of a permanent failure,
 * which is the safer failure mode of the two.
 */
export async function verifyUserPresence(): Promise<boolean> {
  try {
    const credential = await ensurePresenceCredential();
    const assertion = await startAuthentication({
      optionsJSON: {
        challenge: randomChallenge(),
        allowCredentials: [{ id: credential.id, type: 'public-key' }],
        userVerification: 'required',
        timeout: 60_000,
      },
    });
    consecutiveFailures = 0;
    return Boolean(assertion.id);
  } catch {
    // cancelled, unavailable, credential no longer recognized, or the
    // ceremony otherwise failed — WebAuthn does not let us tell these apart.
    consecutiveFailures += 1;
    if (consecutiveFailures >= STALE_CREDENTIAL_THRESHOLD) {
      clearPresenceCredential();
    }
    return false;
  }
}

export {
  browserSupportsWebAuthn,
  ensurePresenceCredential as registerUserPresenceCredential,
  platformAuthenticatorIsAvailable,
};
