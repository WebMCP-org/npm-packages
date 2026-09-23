---
'@mcp-b/webmcp-plugins': major
'@mcp-b/react-webmcp': major
---

Add shared interactive consent through `ConsentGuard` and `consent(guard, metadata)` in
`@mcp-b/webmcp-plugins`. React exposes `ConsentBrokerProvider`, `useConsentBroker`,
`usePendingConsentRequests`, and `useGuardedWebMCP` over the same guard.

`await guard.decide(id, approved, rememberForSession?)` returns a decision result. Failed
presence checks can remain pending with `retryable` and `attemptsRemaining` feedback;
three failed attempts deny the request and start an escalating cooldown. Required user
presence is checked for every approval, including reversible tools with session preapproval.
Unsupported or failed ceremonies do not fall back to click approval. The local presence
helper supports clearing and re-enrolling a stored credential.

Use `consentBroker({ broker })` for the separate `ConsentBroker` application/server-verified
flow. Its `decide()` contract returns a boolean and is independent of `ConsentGuard`.

Guarded hooks use the latest committed consent policy without re-registering the tool.
Consent metadata exposes explicit read-only and idempotency hints. Denied or timed-out
invocations produce typed `InvocationFailure` errors and MCP error results.

These consent APIs consolidate the previously unmerged consent work. They ship with the
coordinated major release of the invocation-plugin and explicit-execution-state hook APIs.
