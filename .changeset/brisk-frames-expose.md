---
'@mcp-b/webmcp-ts-sdk': major
'@mcp-b/transports': minor
'@mcp-b/mcp-iframe': patch
---

Honor `exposedTo` over the iframe bridge instead of rejecting it.

`registerTool(tool, { exposedTo })` previously threw `NotSupportedError` unless native
WebMCP was present, so spec-conformant child code crashed under the polyfill inside an
`<mcp-iframe>` — the one place a userland cross-document channel actually exists. The
composed server now stores the allowlist and only advertises a restricted tool once the
connected embedder's origin matches it.

`IframeChildTransport` gained `clientOrigin` and an `onclientorigin` callback that report
the connected parent. `BrowserMcpServer` reads them duck-typed, so transports that cannot
name a peer keep every restricted tool off the wire.

Restricted tools fail closed. The MCP handle is disabled in the same synchronous step that
creates it, so a tool is never listable between registration and its first audience check,
and it stays hidden when no peer origin is ever established. Tools registered without
`exposedTo` are untouched.

Two limits, stated because the spec's guarantee is stronger:

- `exposedTo` only narrows. `allowedOrigins` on the child transport still decides who may
  connect, and no allowlist widens past it.
- Enforcement is the child's own JavaScript, not the user agent. Native WebMCP enforces
  `exposedTo` in the browser; this does not, so treat it as scoping rather than a boundary
  against a compromised child.

`getTools({ fromOrigins })` still throws `NotSupportedError`. Parent-side discovery stays
`@mcp-b/mcp-iframe`'s job rather than something the SDK reaches across documents to do.
