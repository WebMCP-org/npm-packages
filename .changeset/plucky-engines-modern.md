---
'@mcp-b/global': patch
'@mcp-b/mcp-iframe': patch
'@mcp-b/react-webmcp': patch
'@mcp-b/smart-dom-reader': patch
'@mcp-b/transports': patch
'@mcp-b/webmcp-polyfill': patch
'@mcp-b/webmcp-ts-sdk': patch
'@mcp-b/webmcp-types': patch
'usewebmcp': patch
---

Require Node 20 or newer. `@mcp-b/global`, `@mcp-b/mcp-iframe`,
`@mcp-b/webmcp-polyfill` and `@mcp-b/webmcp-ts-sdk` previously allowed Node 18;
the rest declared no `engines` range at all and now state the same floor. Node 18
reached end of life in April 2025. Browser builds are unaffected — this governs
build tooling and the relay CLI.
