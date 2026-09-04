## Summary

Adds an opt-in consent layer to `@mcp-b/react-webmcp` for tools that require user approval before execution, with optional WebAuthn-based user-presence verification for high-risk operations and built-in presence failure lockout / rate-limiting (MFA-fatigue defense).

## What Changed

### Core consent flow

- **`useGuardedWebMCP`** — drop-in replacement for `useWebMCP` that gates tool invocations behind an in-page consent prompt when `consent.requiresApproval` evaluates to `true`.
- **`ConsentBroker`** — framework-agnostic broker managing pending requests, approvals, denials, timeouts, session preapproval for reversible tools, decision event streams, and presence-failure rate limiting.
- **`ConsentBrokerProvider` / `useConsentBroker` / `usePendingConsentRequests`** — React context and hooks to wire the broker into component trees.
- **`consent-annotations`** — maps `ConsentMetadata` to MCP `ToolAnnotations` (`readOnlyHint`, `destructiveHint`, `idempotentHint`) so native agent runtimes receive real signal.

### Decision recording & Audit trail

- `ConsentBroker.recordDecision()` emits a `ConsentDecisionEvent` for tool calls that bypass the interactive prompt (e.g. `requiresApproval: false`), giving subscribers (audit logs, decision history) visibility into _all_ tool calls.
- `useGuardedWebMCP` calls `recordDecision` on the no-approval path and uses conditional spreads for `inputSchema`/`annotations` to avoid passing `undefined` to `useWebMCP`.

### User-presence verification (WebAuthn) & Lockout Defense

- **`consent-presence`** — enrolls and verifies a platform-authenticator credential (Touch ID, Windows Hello, hardware key) for a local "is a human physically present" gate. Falls back to a standard click when no platform authenticator is available.
- **Presence-failure lockout & rate-limiting** — `ConsentBroker.recordPresenceFailure()` tracks failed WebAuthn verification attempts. After 3 failures (`MAX_PRESENCE_ATTEMPTS`), locks out the `origin::toolName` pair with escalating exponential cooldowns (10s, 30s, 90s, capped at 5 minutes) to protect against MFA fatigue / prompt-bombing.
- **`ConsentBroker.getCooldownRemaining()`** — returns remaining lockout time for cards to display live countdowns.
- **Immediate rejection** — `ConsentBroker.request()` instantly auto-denies calls on active cooldown with `reason: 'rate-limited'` before creating pending requests or rendering cards.
- **`requireUserPresence`** option in `ConsentMetadata` — opt-in flag for irreversible, high-risk tools.
- `@simplewebauthn/browser` added to the pnpm catalog and `react-webmcp` dependencies.

### Consent types

- `ConsentMetadata.requireUserPresence?: boolean` added.
- `ConsentDecision.reason` extended with `'presence-lockout'` and `'rate-limited'`.

## Compatibility

This is an **opt-in API**. Existing `useWebMCP` behaviour and exports remain unchanged. Applications provide their own consent UI using the pending-request hooks. The WebAuthn presence gate degrades gracefully on unsupported hardware.

## Scope

This PR only changes `packages/react-webmcp` (source, types, package.json) and `pnpm-workspace.yaml`. No application, demo, or documentation-site files are included.

## Files Changed

| File                                               | Change                                                                                                           |
| -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `packages/react-webmcp/src/consent-broker.ts`      | Add `recordDecision()`, `recordPresenceFailure()`, `getCooldownRemaining()`, rate limiting, and presence lockout |
| `packages/react-webmcp/src/consent-broker.test.ts` | Unit tests for broker, presence failure lockout, rate limiting, and backoff reset                                |
| `packages/react-webmcp/src/useGuardedWebMCP.ts`    | Record decisions on no-approval path; conditional spreads; `as any` cast                                         |
| `packages/react-webmcp/src/consent-presence.ts`    | **New** — WebAuthn enrollment and verification utilities                                                         |
| `packages/react-webmcp/src/consent-types.ts`       | Add `requireUserPresence` to `ConsentMetadata`; add `'presence-lockout'` and `'rate-limited'` decision reasons   |
| `packages/react-webmcp/src/index.ts`               | Export presence utilities                                                                                        |
| `packages/react-webmcp/package.json`               | Add `@simplewebauthn/browser` dependency                                                                         |
| `pnpm-workspace.yaml`                              | Add `@simplewebauthn/browser` to catalog                                                                         |

## Validation

```bash
pnpm --filter @mcp-b/react-webmcp... build
pnpm --filter @mcp-b/react-webmcp build
pnpm --filter @mcp-b/react-webmcp test
```

- 10 test files passed (61 tests total)
- `git diff --check` — no whitespace errors
- Pre-commit hooks pass (oxlint + oxfmt via `vp check --fix`)

## Proposal

Provide a reusable package-level approval boundary for applications where the connected agent runtime does not provide native consent UI, while still exposing standard MCP behaviour hints to runtimes that do. The optional WebAuthn presence gate raises the bar for automated consent bypass beyond synthetic clicks, backed by escalating rate-limiting defense against MFA-fatigue attacks.
