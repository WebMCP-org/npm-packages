# @mcp-b/webmcp-extension

## 6.0.0

### Major Changes

- 160acc3: **Breaking: the extension client follows the 6.0.0 page runtime.**
  `connectWebMCPClient()` and its options are unchanged. The package takes the
  major version with the fixed release group; upgrade `@mcp-b/global` in the
  MAIN-world bundle and `@mcp-b/transports` together with it. The template's
  `minimum_chrome_version` rises from 111 to 126, the 6.0 page runtime's floor;
  raise it in manifests copied from the template.

  What extension clients observe changes through the page runtime:
  - Pages register tools on `document.modelContext`; the MAIN-world bundle no
    longer provides `navigator.modelContext`. Migrate page code as described in the
    `@mcp-b/global` changeset.
  - When a native Chrome tool navigates, `executeTool()` resolves with `null`.
    The client used to receive an error result reading
    `Tool execution interrupted by navigation`; it now receives a successful
    result whose text is `null`. Check for that text if your extension reacted
    to the old error.
  - Result and error shapes otherwise follow `@mcp-b/global` 6.0.0: imperative
    results are JSON strings, native declarative tools can return plain text, and
    failures routed through upstream execution surface as `Tool execution failed`
    without the original reason.

### Patch Changes

- Updated dependencies [160acc3]
  - @mcp-b/transports@6.0.0

## 5.1.0

### Patch Changes

- @mcp-b/transports@5.1.0

## 5.0.3

### Patch Changes

- Updated dependencies [4dec56a]
  - @mcp-b/transports@5.0.3

## 5.0.2

### Patch Changes

- Updated dependencies [8fa4f02]
  - @mcp-b/transports@5.0.2

## 5.0.1

### Patch Changes

- @mcp-b/transports@5.0.1

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
