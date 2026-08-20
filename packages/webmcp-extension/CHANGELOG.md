# @mcp-b/webmcp-extension

## 5.0.0

### Major Changes

- de0b41c: Add the MV3 extension package and template. A minimal MAIN-world entry installs
  the page runtime while the isolated content script receives the official MCP
  client over the browser transport.

### Patch Changes

- de0b41c: Retire `@mcp-b/codemode` and `@mcp-b/extension-tools`. Both were published and
  neither ships from this release. `@mcp-b/extension-tools` is replaced by
  `@mcp-b/webmcp-extension`, which covers the same MV3 ground with the official MCP
  client; `@mcp-b/codemode` users should move to `@cloudflare/codemode/browser`.
  The vendored chrome-devtools-mcp fork is also gone — use upstream
  `chrome-devtools-mcp` directly.
- Updated dependencies [de0b41c]
- Updated dependencies [de0b41c]
- Updated dependencies [de0b41c]
- Updated dependencies [de0b41c]
  - @mcp-b/transports@5.0.0
