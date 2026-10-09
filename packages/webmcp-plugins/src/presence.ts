const STORAGE_KEY = 'mcp-b:consent-presence-credential';
/** Consecutive failures after which the stored credential is assumed stale and re-enrolled. */
const STALE_CREDENTIAL_THRESHOLD = 3;

let consecutiveFailures = 0;

const randomBytes = () => crypto.getRandomValues(new Uint8Array(32));

export function browserSupportsWebAuthn(): boolean {
  return typeof PublicKeyCredential === 'function';
}

export async function platformAuthenticatorIsAvailable(): Promise<boolean> {
  return (
    browserSupportsWebAuthn() && PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()
  );
}

function storedCredentialId(): Uint8Array<ArrayBuffer> | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    // SAFETY: only registerUserPresenceCredential writes this key, as a byte array.
    return raw ? new Uint8Array(JSON.parse(raw) as number[]) : null;
  } catch {
    return null;
  }
}

/** Forget the enrolled credential so the next verification enrolls a new one. */
export function clearPresenceCredential(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Storage can be unavailable in private browsing.
  }
  consecutiveFailures = 0;
}

/**
 * Enroll a platform-authenticator credential for this origin once. The challenge is
 * client-generated: this is a local "a human is present" gate, not server-side identity.
 */
export async function registerUserPresenceCredential(
  rpName = 'WebMCP Consent Layer',
  signal?: AbortSignal
): Promise<Uint8Array<ArrayBuffer>> {
  const existing = storedCredentialId();
  if (existing) return existing;
  // SAFETY: a `publicKey` request resolves to a PublicKeyCredential or null.
  const credential = (await navigator.credentials.create({
    publicKey: {
      rp: { name: rpName, id: location.hostname },
      user: { id: randomBytes(), name: 'consent-layer-user', displayName: 'Consent Layer User' },
      challenge: randomBytes(),
      pubKeyCredParams: [
        { alg: -7, type: 'public-key' },
        { alg: -257, type: 'public-key' },
      ],
      authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required' },
      timeout: 60_000,
      attestation: 'none',
    },
    ...(signal && { signal }),
  })) as PublicKeyCredential | null;
  if (!credential) throw new Error('Presence credential enrollment was cancelled');
  const id = new Uint8Array(credential.rawId);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...id]));
  } catch {
    // Without storage the credential is re-enrolled next time, but this ceremony still counts.
  }
  return id;
}

/**
 * Run a WebAuthn user-verification ceremony and resolve true only when the user verified
 * now. Automation can attach a virtual authenticator, so this raises the bar over a
 * synthetic click without being absolute. WebAuthn reports "declined" and "unknown
 * credential" identically, so repeated failures re-enroll rather than fail forever.
 */
export async function verifyUserPresence(signal?: AbortSignal): Promise<boolean> {
  try {
    const id = await registerUserPresenceCredential(undefined, signal);
    const assertion = await navigator.credentials.get({
      publicKey: {
        challenge: randomBytes(),
        allowCredentials: [{ id, type: 'public-key' }],
        userVerification: 'required',
        timeout: 60_000,
      },
      ...(signal && { signal }),
    });
    consecutiveFailures = 0;
    return assertion !== null;
  } catch {
    // An aborted ceremony says nothing about the credential.
    if (signal?.aborted) return false;
    if (++consecutiveFailures >= STALE_CREDENTIAL_THRESHOLD) clearPresenceCredential();
    return false;
  }
}
