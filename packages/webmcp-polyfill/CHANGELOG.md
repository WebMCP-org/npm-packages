# @mcp-b/webmcp-polyfill

## 4.0.1

### Patch Changes

- @mcp-b/webmcp-types@4.0.1

## 4.0.0

### Major Changes

- abaf5d0: Align the WebMCP runtime surface with Chrome 152 and the current document-first API.

  This follows the current first-party WebMCP sources: the W3C WebMCP draft, Chrome's WebMCP imperative API docs, and MCP SEP-2106 for MCP JSON Schema 2020-12 output behavior. `outputSchema` remains MCP-B helper metadata because the current W3C/Chrome WebMCP tool dictionary does not define or enforce it.

  `registerTool` now resolves `undefined`; use `registerTool(tool, { signal })` and abort the signal to unregister tools. `unregisterTool` remains as deprecated compatibility where present.

  The standard producer path is `document.modelContext.getTools()` plus `document.modelContext.executeTool(tool, inputArgsJson)`. Deprecated name-based helpers remain MCP-B compatibility APIs.

  Native tool backfill now supports current `getTools`/`executeTool` contexts, MCP transport output schemas preserve rootless object schemas by adding `type: "object"` on the MCP boundary, and Chrome DevTools WebMCP calls preserve `structuredContent` alongside MCP content blocks. The documentation now calls out the breaking migration path and links to the upstream WebMCP and MCP sources that drive it.

### Patch Changes

- 6b60264: Validate `registerTool()` tool names per WebMCP §4.2 and throw `InvalidStateError` for invalid names and descriptions (fixes #224).
- Updated dependencies [abaf5d0]
  - @mcp-b/webmcp-types@4.0.0

## 3.0.0

### Major Changes

- 4f3cc5e: Track the May 27, 2026 WebMCP draft that moves the `modelContext` getter from `Navigator` to `Document`.
  - `@mcp-b/webmcp-polyfill` now installs `document.modelContext` as the canonical surface. `navigator.modelContext` is kept as a deprecated, backward-compatible alias that returns the same `ModelContext` instance and emits a one-time runtime deprecation warning on first access. Tools registered on either surface are observable on the other. Native detection now checks both surfaces so the polyfill no-ops when the browser exposes WebMCP on either.
  - `@mcp-b/webmcp-types` adds the `Document.modelContext` global augmentation and marks `Navigator.modelContext` as `@deprecated`. Chrome 150 deprecated `navigator.modelContext` and will remove it in a future release; the deprecated alias remains available in this release as a migration fallback.
  - Breaking: the removed `provideContext()` and `clearContext()` APIs remain absent from the strict WebMCP types and polyfill runtime. Consumers still calling those legacy APIs should migrate to explicit `registerTool()` and `unregisterTool()` calls.

  Migration:

  ```ts
  const modelContext = document.modelContext || navigator.modelContext;
  if (modelContext) {
    modelContext.registerTool({
      /* ... */
    });
  }
  ```

  Tracks [webmachinelearning/webmcp#173](https://github.com/webmachinelearning/webmcp/issues/173) and [webmachinelearning/webmcp#184](https://github.com/webmachinelearning/webmcp/pull/184).

### Patch Changes

- Updated dependencies [4f3cc5e]
  - @mcp-b/webmcp-types@3.0.0

## 2.3.1

### Patch Changes

- Updated dependencies
  - @mcp-b/webmcp-types@2.3.1

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

## 2.2.0

### Patch Changes

- 2540527: Align MCP-B with the latest WebMCP compatibility direction by deprecating removed context APIs, accepting tool-object unregistration, and keeping the legacy unregister handle available as a deprecated compatibility path in MCP-B wrappers.
- Updated dependencies [2540527]
  - @mcp-b/webmcp-types@2.2.0

## 2.1.0

### Patch Changes

- @mcp-b/webmcp-types@2.1.0

## 2.0.13

### Patch Changes

- @mcp-b/webmcp-types@2.0.13

## 2.0.12

### Patch Changes

- @mcp-b/webmcp-types@2.0.12

## 2.0.11

### Patch Changes

- @mcp-b/webmcp-types@2.0.11

## 2.0.10

### Patch Changes

- @mcp-b/webmcp-types@2.0.10

## 2.0.9

### Patch Changes

- @mcp-b/webmcp-types@2.0.9

## 2.0.8

### Patch Changes

- Updated dependencies
  - @mcp-b/webmcp-types@2.0.8

## 2.0.7

### Patch Changes

- Updated dependencies
  - @mcp-b/webmcp-types@2.0.7
