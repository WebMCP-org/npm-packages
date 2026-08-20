---
'@mcp-b/global': patch
'@mcp-b/webmcp-extension': patch
---

Retire `@mcp-b/codemode` and `@mcp-b/extension-tools`. Both were published and
neither ships from this release. `@mcp-b/extension-tools` is replaced by
`@mcp-b/webmcp-extension`, which covers the same MV3 ground with the official MCP
client; `@mcp-b/codemode` users should move to `@cloudflare/codemode/browser`.
The vendored chrome-devtools-mcp fork is also gone — use upstream
`chrome-devtools-mcp` directly.
