---
'@mcp-b/webmcp-plugins': minor
'@mcp-b/react-webmcp': minor
---

Migrate consent middleware logic from `@mcp-b/react-webmcp` into `@mcp-b/webmcp-plugins`.

### Note: Consent Classes in `@mcp-b/webmcp-plugins`

`@mcp-b/webmcp-plugins` now has two distinct consent-related classes designed for different operational models:

- **`ConsentBroker` (pre-existing, `authorize()`-based)**: The original RFC-style authorization coordinator. Use for programmatic or server-verified authorization flows.
- **`ConsentGuard` (migrated from #328)**: An interactive on-page gate managing tool request queues, WebAuthn presence ceremonies, session pre-approval, and UI subscription listeners via `guard.request()` and `guard.decide()`. Use when protecting browser tool invocations with interactive on-page approval UX (and when using `@mcp-b/react-webmcp`'s `useGuardedWebMCP`).

In `@mcp-b/react-webmcp`, `consent-broker.ts` now re-exports `ConsentGuard` directly.

### Structural Migration & Annotations

- `@mcp-b/webmcp-plugins` is the shared home of the consent middleware, consumed via `plugins: [consent(guard, metadata)]`.
- `useGuardedWebMCP` continues as a thin wrapper in `@mcp-b/react-webmcp` forwarding to `useWebMCP` and the shared consent plugin.
- `ConsentMetadata` adds an explicit `readOnly?: boolean` field alongside `idempotent?: boolean`, with fallback inference preserved for backwards compatibility.
- Denied or timed-out tool calls surface as native MCP error results (`isError: true`).

### Breaking Changes

- **`ConsentGuard.decide()` is now asynchronous**: Changes from synchronous `void` to `async Promise<DecideResult>`. Any caller or UI event handler (`onClick`) must now `await` the returned promise.

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

### Related Upstream Changes

- **`isError` error message format**: no longer includes the `"Error: "` prefix (e.g. `'Action denied by user (user).'`). Inherited from `usewebmcp`'s updated default error formatting (from #332), not a change made by this PR.
