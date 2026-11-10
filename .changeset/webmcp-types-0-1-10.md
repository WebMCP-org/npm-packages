---
'@mcp-b/webmcp-polyfill': patch
'@mcp-b/webmcp-types': patch
'@mcp-b/webmcp-ts-sdk': patch
'usewebmcp': patch
---

Update `webmcp-types` to 0.1.10, the version `@w3c/webmcp-polyfill` resolves. It adds
`ontoolactivated` and `ontoolcancel` to `ModelContext`, so an object you type as `ModelContext`
yourself now needs both.
