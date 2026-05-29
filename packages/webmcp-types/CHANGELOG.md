# @mcp-b/webmcp-types

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

## 2.3.1

### Patch Changes

- Clean the generated declaration output before building so stale files like `dist/standard-schema.d.ts` cannot be published.

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

## 2.2.0

### Patch Changes

- 2540527: Align MCP-B with the latest WebMCP compatibility direction by deprecating removed context APIs, accepting tool-object unregistration, and keeping the legacy unregister handle available as a deprecated compatibility path in MCP-B wrappers.

## 2.1.0

## 2.0.13

## 2.0.12

## 2.0.11

## 2.0.10

## 2.0.9

## 2.0.8

### Patch Changes

- Support non-object outputSchema types (string, number, boolean, array) in registerTool overload 1. Widen TOutputSchema constraint from JsonSchemaObject to JsonSchemaForInference so primitive outputSchemas work with full type inference. Add comprehensive type tests codifying real-world usage patterns.

## 2.0.7

### Patch Changes

- Fix registerTool overloads to accept raw return values (e.g. `Promise<string>`) in widened-schema and no-schema tool definitions. Previously only `CallToolResult` was accepted, requiring `as const satisfies` on every tool object.
