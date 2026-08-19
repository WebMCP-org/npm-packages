---
'@mcp-b/webmcp-types': major
'@mcp-b/webmcp-local-relay': patch
---

Stop declaring the WebMCP globals as unconditionally present.

`Document.modelContext`, `SubmitEvent.agentInvoked`, `SubmitEvent.respondWith()`
and the `ModelContext` interface object are now optional. No browser ships
WebMCP unflagged -- Chromium exposes it only under `--enable-features=WebMCP` --
and the declarative form members are explainer-only, appearing in neither the
specification nor WPT's `webmcp.idl`. Declaring them as always-there made
feature detection read as dead code under our own types.

The modifiers are bare optionals (`?: T`, not `?: T | undefined`): where WebMCP
is absent the property is genuinely missing, so `'modelContext' in document` is
false rather than the property being present and holding `undefined`. The
`ModelContext` interface object is `| undefined` because a `var` declaration
cannot be optional; guard it with `typeof ModelContext !== 'undefined'`.

Migration -- feature-detect, or install `@mcp-b/webmcp-polyfill`:

```ts
const modelContext = document.modelContext;
if (!modelContext) return;
await modelContext.registerTool(tool);
```

`RegisteredTool.title` and `RegisteredTool.annotations` stay optional and are
now documented. `annotations` is absent entirely when a tool registers none, and
`title` is only guaranteed by a specification default that webmcp#224 proposes
removing, so `tool.title || tool.name` is the correct read -- the spec default
makes `title` an empty string today, which `??` does not fall through.

`@mcp-b/webmcp-local-relay` no longer relies on a thrown `TypeError` to detect a
missing `document.modelContext` when subscribing to `toolchange`; it checks
first and falls back to polling as before.
