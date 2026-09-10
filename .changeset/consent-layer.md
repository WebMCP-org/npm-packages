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
