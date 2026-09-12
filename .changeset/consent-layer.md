---
'@mcp-b/webmcp-plugins': major
'@mcp-b/react-webmcp': major
---

Migrate consent middleware logic from `@mcp-b/react-webmcp` into `@mcp-b/webmcp-plugins`.

### Note: Consent Classes in `@mcp-b/webmcp-plugins`

`@mcp-b/webmcp-plugins` now has two distinct consent-related classes designed for different operational models:

- **`ConsentBroker` (pre-existing, `authorize()`-based)**: The original RFC-style authorization coordinator. Use for programmatic or server-verified authorization flows.
- **`ConsentGuard` (migrated from #328)**: An interactive on-page gate managing tool request queues, WebAuthn presence ceremonies, session pre-approval, and UI subscription listeners via `guard.request()` and `guard.decide()`. Use when protecting browser tool invocations with interactive on-page approval UX (and when using `@mcp-b/react-webmcp`'s `useGuardedWebMCP`).

`ConsentBroker.decide()` and `ConsentGuard.decide()` are intentionally separate contracts (`Promise<boolean>` vs `Promise<DecideResult>`) for two different operational models — they are not interchangeable and are never merged into one signature. Correspondingly, the plugin factory is now two functions: `consent(guard, metadata)` for `ConsentGuard`, and `consentBroker({ broker })` for `ConsentBroker` (previously both were overloads of a single `consent()` function).

In `@mcp-b/react-webmcp`, `consent-broker.ts` now re-exports `ConsentGuard` directly.

### Structural Migration & Annotations

- `@mcp-b/webmcp-plugins` is the shared home of the consent middleware, consumed via `plugins: [consent(guard, metadata)]`.
- `useGuardedWebMCP` continues as a thin wrapper in `@mcp-b/react-webmcp` forwarding to `useWebMCP` and the shared consent plugin.
- `ConsentMetadata` adds an explicit `readOnly?: boolean` field alongside `idempotent?: boolean`, with fallback inference preserved for backwards compatibility.
- Denied or timed-out tool calls surface as native MCP error results (`isError: true`), now via a typed `InvocationFailure` (`kind: 'denied'`) rather than a plain `Error`.

### Breaking Changes

- **`ConsentGuard.decide()` is now asynchronous**: Changes from synchronous `void` to `async Promise<DecideResult>`. Any caller or UI event handler (`onClick`) must now `await` the returned promise.

  This is a real breaking change for existing consumers, not a pre-release API adjustment — `@mcp-b/react-webmcp` is a published, actively-used package. Any code written against the previous synchronous `decide()` compiles unchanged against the new signature but behaves incorrectly at runtime, since nothing forces the `await`:

  ```tsx
  // Before (synchronous decide) — this pattern silently breaks:
  function ApproveButton({ id }: { id: string }) {
    return (
      <button
        onClick={() => {
          guard.decide(id, true);
          closeCard(); // ran immediately after the previous sync decide()
        }}
      >
        Approve
      </button>
    );
  }

  // After (async decide) — required change:
  function ApproveButton({ id }: { id: string }) {
    return (
      <button
        onClick={async () => {
          const result = await guard.decide(id, true);
          if (result.success) closeCard();
          // handle result.retryable / result.reason for presence failures, etc.
        }}
      >
        Approve
      </button>
    );
  }
  ```

  The "before" pattern does not throw or fail to compile — `closeCard()` just runs before the decision (and any WebAuthn presence ceremony) has actually resolved, and any `if (guard.decide(id, true))`-style truthiness check on the returned `Promise` is now always `true` regardless of `success`. Audit your own `onClick`/`decide()` call sites for this pattern before upgrading.

- **`consent()` no longer accepts a `{ broker }` options object.** Use the new `consentBroker({ broker })` export for the `ConsentBroker`-backed flow; `consent(guard, metadata)` is now exclusively the `ConsentGuard`-backed flow. This removes a runtime `instanceof` dispatch that previously let a single `consent()` call silently behave differently depending on its first argument's runtime type.

### New Features & UX Improvements

- **Asynchronous Presence Verification & Retry UX**:
  - `ConsentGuard.decide()` returns a `DecideResult` object:
    - `{ success: true, reason: 'approved' }`: The request was approved (and presence verified if required).
    - `{ success: false, retryable: true, attemptsRemaining: number, reason: 'presence-failed' }`: WebAuthn verification failed or was cancelled (attempts 1 or 2). The request remains pending, allowing the user to retry.
    - `{ success: false, retryable: false, reason: 'presence-lockout' }`: WebAuthn verification failed on the 3rd attempt. The request is rejected and enters exponential cooldown backoff.
    - `{ success: false, retryable: false, reason: 'denied' }`: The request was explicitly denied by the user.
- **New `PendingConsentRequest` Fields**: `lastError?: string`, `attemptsRemaining?: number`.
- **Transient User Activation**: `decide(id, true)` executes `verifyUserPresence()` synchronously within its own call frame, satisfying browser WebAuthn transient activation requirements.
- **Concurrency & Mid-Retry Guards**: overlapping `decide()` calls return the identical in-flight Promise; clicking "Deny" mid-retry immediately cancels the request; the timeout clock resets after each failed attempt.
- **Audit Logging**: every presence attempt (retryable failures and terminal lockouts) is recorded via `subscribeDecision()`.
- **Presence credential recovery**: `consent-presence` now exports `clearPresenceCredential()` for an explicit "forget this device" flow, and `verifyUserPresence()` auto-clears the stored credential after repeated consecutive failures on the assumption it's stale (WebAuthn cannot itself distinguish "declined" from "no such credential" — this is a best-effort recovery heuristic, not a detection).

### Related Upstream Changes

- **`isError` error message format**: no longer includes the `"Error: "` prefix (e.g. `'Action denied by user (user).'`). Inherited from `usewebmcp`'s updated default error formatting (from #332), not a change made by this PR.
