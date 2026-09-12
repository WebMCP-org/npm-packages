import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const STORAGE_KEY = 'mcp-b:consent-presence-credential';

const startRegistration = vi.fn();
const startAuthentication = vi.fn();

vi.mock('@simplewebauthn/browser', () => ({
  startRegistration: (...args: unknown[]) => startRegistration(...args),
  startAuthentication: (...args: unknown[]) => startAuthentication(...args),
  browserSupportsWebAuthn: () => true,
  platformAuthenticatorIsAvailable: () => Promise.resolve(true),
}));

async function importFreshModule() {
  vi.resetModules();
  return import('./consent-presence.js');
}

describe('consent-presence', () => {
  beforeEach(() => {
    localStorage.clear();
    startRegistration.mockReset();
    startAuthentication.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('clearPresenceCredential removes the stored credential', async () => {
    const { ensurePresenceCredential, clearPresenceCredential } = await importFreshModule();
    startRegistration.mockResolvedValue({ id: 'cred-1' });

    await ensurePresenceCredential();
    expect(localStorage.getItem(STORAGE_KEY)).not.toBeNull();

    clearPresenceCredential();
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it('re-enrolls a fresh credential after clearPresenceCredential', async () => {
    const { ensurePresenceCredential, clearPresenceCredential } = await importFreshModule();
    startRegistration.mockResolvedValueOnce({ id: 'cred-1' });
    startRegistration.mockResolvedValueOnce({ id: 'cred-2' });

    const first = await ensurePresenceCredential();
    expect(first.id).toBe('cred-1');

    clearPresenceCredential();

    const second = await ensurePresenceCredential();
    expect(second.id).toBe('cred-2');
    expect(startRegistration).toHaveBeenCalledTimes(2);
  });

  it('verifyUserPresence resolves true on a successful ceremony', async () => {
    const { verifyUserPresence } = await importFreshModule();
    startRegistration.mockResolvedValue({ id: 'cred-1' });
    startAuthentication.mockResolvedValue({ id: 'cred-1' });

    await expect(verifyUserPresence()).resolves.toBe(true);
  });

  it('verifyUserPresence resolves false on a single failed ceremony without clearing the credential', async () => {
    const { verifyUserPresence } = await importFreshModule();
    startRegistration.mockResolvedValue({ id: 'cred-1' });
    startAuthentication.mockRejectedValue(new Error('NotAllowedError'));

    await expect(verifyUserPresence()).resolves.toBe(false);
    expect(localStorage.getItem(STORAGE_KEY)).not.toBeNull();
  });

  it('auto-clears and re-enrolls after repeated consecutive failures (stale-credential heuristic)', async () => {
    const { verifyUserPresence, ensurePresenceCredential } = await importFreshModule();
    startRegistration.mockResolvedValueOnce({ id: 'cred-stale' });
    startAuthentication.mockRejectedValue(new Error('NotAllowedError'));

    // First failure establishes the stored credential.
    await ensurePresenceCredential();

    await verifyUserPresence(); // failure 1
    await verifyUserPresence(); // failure 2
    expect(localStorage.getItem(STORAGE_KEY)).not.toBeNull();

    await verifyUserPresence(); // failure 3 — crosses the threshold
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();

    // Next enrollment attempt re-registers rather than failing forever.
    startRegistration.mockResolvedValueOnce({ id: 'cred-fresh' });
    const fresh = await ensurePresenceCredential();
    expect(fresh.id).toBe('cred-fresh');
  });

  it('a successful verification resets the consecutive-failure counter', async () => {
    const { verifyUserPresence, ensurePresenceCredential } = await importFreshModule();
    startRegistration.mockResolvedValue({ id: 'cred-1' });
    await ensurePresenceCredential();

    startAuthentication.mockRejectedValueOnce(new Error('fail 1'));
    await verifyUserPresence();
    startAuthentication.mockRejectedValueOnce(new Error('fail 2'));
    await verifyUserPresence();

    // Reset via a success before hitting the threshold.
    startAuthentication.mockResolvedValueOnce({ id: 'cred-1' });
    await expect(verifyUserPresence()).resolves.toBe(true);

    // Two more failures should not yet cross the threshold, since the
    // counter was reset by the success above.
    startAuthentication.mockRejectedValueOnce(new Error('fail 3'));
    await verifyUserPresence();
    startAuthentication.mockRejectedValueOnce(new Error('fail 4'));
    await verifyUserPresence();
    expect(localStorage.getItem(STORAGE_KEY)).not.toBeNull();
  });
});
