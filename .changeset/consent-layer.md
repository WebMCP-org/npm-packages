---
'@mcp-b/react-webmcp': minor
---

Add useGuardedWebMCP hook and ConsentBroker for opt-in consent flow.

Two behavior notes for existing callers of related APIs:

- `idempotentHint` is now driven by a new, explicit
  `ConsentMetadata.idempotent` field instead of being inferred from
  `reversible`/`riskLevel`. Callers relying on the old inferred
  behavior should set `idempotent` explicitly.
- A denied or timed-out guarded tool call now resolves as an MCP
  error result (`isError: true`) instead of a successful call with
  `structuredContent: { success: false }`. Any code inspecting
  `result.structuredContent.success` to detect a denial should check
  `result.isError` instead.