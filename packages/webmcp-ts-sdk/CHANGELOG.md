# @mcp-b/webmcp-ts-sdk

## 3.0.1

### Patch Changes

- Updated dependencies [6b60264]
  - @mcp-b/webmcp-polyfill@3.0.1
  - @mcp-b/webmcp-types@3.0.1

## 3.0.0

### Major Changes

- Align the browser-adapted SDK with the WebMCP v3 document-first API through `@mcp-b/webmcp-types@3.0.0` and `@mcp-b/webmcp-polyfill@3.0.0`.

### Patch Changes

- Updated dependencies [4f3cc5e]
  - @mcp-b/webmcp-types@3.0.0
  - @mcp-b/webmcp-polyfill@3.0.0

## 2.3.1

### Patch Changes

- Updated dependencies
  - @mcp-b/webmcp-types@2.3.1
  - @mcp-b/webmcp-polyfill@2.3.1

## 2.3.0

### Minor Changes

- 9289d98: Track the April 23, 2026 WebMCP draft.
  - `registerTool(tool, options?)` accepts `ModelContextRegisterToolOptions { signal?: AbortSignal }`. Aborting the signal unregisters the tool. Pre-aborted signals short-circuit registration with a console warning.
  - `unregisterTool(name)` is `@deprecated` (removed from the spec on April 23, 2026). It still works against current Chrome Beta 147 and emits a one-time runtime deprecation warning. It will be removed in the next major version.
  - `ToolAnnotations` adds `untrustedContentHint` per the April 23 draft.
  - `@mcp-b/react-webmcp` and `@mcp-b/usewebmcp` use a per-effect `AbortController` for cleanup. On runtimes that ignore the second arg (Chrome Beta 147 native), aborting cannot remove the tool. Install `@mcp-b/global` or `@mcp-b/webmcp-polyfill` to mitigate this.
  - `BrowserMcpServer.registerTool(tool, options?)` forwards `options.signal` to the underlying native context when supported. The deprecated `{ unregister }` return handle is preserved for back-compat and will be removed in the next major version.

  Closes #188.

### Patch Changes

- Add future-facing producer shims for Chrome's WebMCP surface, including `getTools()`, `ontoolchange`, and `toolchange` support.

  Continue registering tools through the WebMCP transport when native Chrome exposes `navigator.modelContext` but blocks mirrored `registerTool()` calls inside permission-policy-restricted iframes.

- Updated dependencies
- Updated dependencies [9289d98]
  - @mcp-b/webmcp-types@2.3.0
  - @mcp-b/webmcp-polyfill@2.3.0

## 2.2.1

### Patch Changes

- Add future-facing producer APIs for Chrome's WebMCP surface, including `getTools()`, `ontoolchange`, and `toolchange` event support.
- Continue registering tools through the WebMCP transport when native Chrome blocks the mirrored `registerTool()` call inside permission-policy-restricted iframes.

## 2.2.0

### Patch Changes

- 2540527: Align MCP-B with the latest WebMCP compatibility direction by deprecating removed context APIs, accepting tool-object unregistration, and keeping the legacy unregister handle available as a deprecated compatibility path in MCP-B wrappers.
- Updated dependencies [2540527]
  - @mcp-b/webmcp-types@2.2.0
  - @mcp-b/webmcp-polyfill@2.2.0

## 2.1.0

### Patch Changes

- @mcp-b/webmcp-types@2.1.0
- @mcp-b/webmcp-polyfill@2.1.0

## 2.0.13

### Patch Changes

- @mcp-b/webmcp-types@2.0.13
- @mcp-b/webmcp-polyfill@2.0.13

## 2.0.12

### Patch Changes

- @mcp-b/webmcp-types@2.0.12
- @mcp-b/webmcp-polyfill@2.0.12

## 2.0.11

### Patch Changes

- @mcp-b/webmcp-types@2.0.11
- @mcp-b/webmcp-polyfill@2.0.11

## 2.0.10

### Patch Changes

- Remove noisy console.warn from toTransportSchema for empty schemas and schemas without root type. The normalization behavior is correct — no need to warn consumers.
  - @mcp-b/webmcp-types@2.0.10
  - @mcp-b/webmcp-polyfill@2.0.10

## 2.0.9

### Patch Changes

- Fix duplicate tool invocations when multiple bundles import @mcp-b/global in the same window
  - @mcp-b/webmcp-types@2.0.9
  - @mcp-b/webmcp-polyfill@2.0.9

## 2.0.8

### Patch Changes

- Updated dependencies
  - @mcp-b/webmcp-types@2.0.8
  - @mcp-b/webmcp-polyfill@2.0.8

## 2.0.7

### Patch Changes

- Updated dependencies
  - @mcp-b/webmcp-types@2.0.7
  - @mcp-b/webmcp-polyfill@2.0.7

## 1.1.0

### Minor Changes

- Stable release of all packages with backwards-compatible improvements.

### Patch Changes

- 02833d3: Bump all packages to new beta release
- 1f26978: Beta release for testing
- 7239bb5: Bump all packages to new beta release
- b8c2ea5: Beta release bump

## 1.0.2-beta.3

### Patch Changes

- Bump all packages to new beta release

## 1.0.2-beta.2

### Patch Changes

- Bump all packages to new beta release

## 1.0.2-beta.1

### Patch Changes

- Beta release bump

## 1.0.2-beta.0

### Patch Changes

- Beta release for testing

## 1.0.1

### Patch Changes

- Update documentation and publish packages:
  - @mcp-b/global: Add comprehensive IIFE script tag documentation with usage examples and comparison table
  - @mcp-b/webmcp-ts-sdk: Publish latest version
  - @mcp-b/react-webmcp: Publish latest version
