---
'@mcp-b/react-webmcp': minor
---

Add useGuardedWebMCP hook and ConsentBroker for opt-in consent flow.

`idempotentHint` is now driven by a new, explicit
`ConsentMetadata.idempotent` field instead of being inferred from
`reversible`/`riskLevel`. Callers relying on the old inferred
behavior should set `idempotent` explicitly.
