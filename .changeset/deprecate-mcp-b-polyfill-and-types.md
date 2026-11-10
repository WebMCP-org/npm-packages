---
'@mcp-b/webmcp-polyfill': minor
'@mcp-b/webmcp-types': minor
---

`@mcp-b/webmcp-polyfill` and `@mcp-b/webmcp-types` are deprecated. Use the official
`@w3c/webmcp-polyfill` and `webmcp-types` packages instead.

`@mcp-b/webmcp-polyfill` now depends on `@w3c/webmcp-polyfill` instead of bundling a copy of
its source. It still adds declarative tools until the official polyfill ships them. Runtime
behavior is unchanged.
