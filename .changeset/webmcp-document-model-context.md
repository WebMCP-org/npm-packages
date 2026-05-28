---
'@mcp-b/webmcp-types': minor
'@mcp-b/webmcp-polyfill': minor
---

Track the May 27, 2026 WebMCP draft that moves the `modelContext` getter from `Navigator` to `Document`.

- `@mcp-b/webmcp-polyfill` now installs `document.modelContext` as the canonical surface. `navigator.modelContext` is kept as a deprecated, backward-compatible alias that returns the same `ModelContext` instance and emits a one-time runtime deprecation warning on first access. Tools registered on either surface are observable on the other. Native detection now checks both surfaces so the polyfill no-ops when the browser exposes WebMCP on either.
- `@mcp-b/webmcp-types` adds the `Document.modelContext` global augmentation and marks `Navigator.modelContext` as `@deprecated`. Chrome 150 deprecated `navigator.modelContext` and will remove it in a future release — the deprecated alias will be removed from this polyfill in the next major version.

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
