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
 */
export async function verifyUserPresence(): Promise<boolean> {
  const credential = await ensurePresenceCredential();
  try {
    const assertion = await startAuthentication({
      optionsJSON: {
        challenge: randomChallenge(),
        allowCredentials: [{ id: credential.id, type: 'public-key' }],
        userVerification: 'required',
        timeout: 60_000,
      },
    });
    return Boolean(assertion.id);
  } catch {
    return false; // cancelled, unavailable, or the ceremony failed
  }
}

export { browserSupportsWebAuthn, platformAuthenticatorIsAvailable };
