# @mcp-b/webmcp-types

## 6.0.0

### Major Changes

- 160acc3: **Breaking: this package now forwards the upstream `WebMCP` namespace and browser
  declarations.** The package name remains available, but its previous top-level
  exports and MCP-B types are not reproduced. It is a types-only compatibility alias
  for [`webmcp-types`](https://github.com/webmachinelearning/webmcp-types) and will
  eventually be removed; no removal date is set.

  ### Prefer the upstream dependency

  For an application:

  ```bash
  pnpm remove @mcp-b/webmcp-types
  pnpm add -D webmcp-types@0.1.9
  ```

  The version is pinned exactly: `webmcp-types` 0.1.10 adds required
  `ontoolactivated` and `ontoolcancel` members and `ToolActivatedEvent` and
  `ToolCancelEvent` globals that the vendored polyfill core does not implement, so
  0.1.9 is the last release whose `ModelContext` the runtime satisfies.

  Published libraries whose declarations reference upstream types should add it to
  `dependencies` instead. Update any `compilerOptions.types` entries and triple-slash
  references to `webmcp-types` as well.

  ```diff
  - import type { ModelContext, RegisteredTool } from '@mcp-b/webmcp-types';
  + import type { WebMCP } from 'webmcp-types';
  + type ModelContext = WebMCP.ModelContext;
  + type RegisteredTool = WebMCP.RegisteredTool;
  ```

  You can temporarily use `import type { WebMCP } from '@mcp-b/webmcp-types'` with
  the same namespace-based code. The alias has no runtime JavaScript entry point;
  use type-only imports or TypeScript's `types` configuration.

  ### Move each type to its owner

  | Old export from `@mcp-b/webmcp-types`                                                                                                                         | Replacement                                                                                     |
  | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
  | `ModelContext`, `RegisteredTool`, registration/discovery options                                                                                              | Corresponding `WebMCP.*` types from `webmcp-types`.                                             |
  | `ChromeModelContext`, `ChromeModelContextExtensions`                                                                                                          | `WebMCP.ModelContext`; `executeTool()` is now part of the core contract.                        |
  | `ChromeModelContextExecuteToolOptions`                                                                                                                        | `WebMCP.ModelContextExecuteToolOptions`.                                                        |
  | `ModelContextTesting`, `ModelContextTestingToolInfo`                                                                                                          | Removed. Use `WebMCP.ModelContext` and `WebMCP.RegisteredTool` for test code.                   |
  | `ModelContextTool`, `WebMcpToolAnnotations`, `MaybePromise`                                                                                                   | `WebMCP.ModelContextTool`, `WebMCP.ToolAnnotations`, `WebMCP.MaybePromise`.                     |
  | `ToolDescriptor`, `ToolDescriptorFromSchema`, `ToolListItem`, `ModelContextExtensions`, `ModelContextWithExtensions`, MCP `ToolAnnotations`                   | Same export names from `@mcp-b/webmcp-ts-sdk`.                                                  |
  | `InputSchema`, `WebMcpToolInput`, `InferArgsFromInputSchema`, `InferJsonSchema`, `JsonSchemaForInference`, `ToolResultFromOutputSchema`, `RegistrationHandle` | Same export names from `@mcp-b/webmcp-ts-sdk`.                                                  |
  | `CallToolResult`, `ContentBlock`, `TextContent`, `JsonObject`, `JsonValue`                                                                                    | Same export names from `@mcp-b/webmcp-ts-sdk`, re-exported from `@modelcontextprotocol/server`. |

  For standard schema inference, let `context.registerTool()` infer inline literals
  or use `WebMCP.ModelContextToolFromSchema<typeof inputSchema>`. The upstream type
  takes one schema generic; use the SDK's `ModelContextTool` helpers if you still need
  explicit input/result/name generics. Keep separately declared schemas literal
  with `as const`; a widened schema infers each property as optional `unknown`.

  The upstream declaration uses `document.modelContext`, object input to
  `executeTool()`, a JSON-string execution result, and object-valued discovery
  schemas. `RegisteredTool.title` is required (it may be `''`); update test doubles
  that omitted it. Navigator aliases/testing declarations are gone.
  `@mcp-b/webmcp-polyfill` declares the `SubmitEvent` extensions and the global
  `ModelContext` interface object. Both reach every project that imports
  `@mcp-b/webmcp-ts-sdk`, or a package whose declarations import it such as
  `@mcp-b/react-webmcp`, because the SDK re-exports `WebMCP` through the polyfill.

## 5.1.0

## 5.0.3

## 5.0.2

## 5.0.1

## 5.0.0

### Major Changes

- de0b41c: Align the public types with the current document-first WebMCP draft and the MCP
  SDK v2 JSON Schema contracts. Remove legacy aliases and model tool lifetime with
  `AbortSignal`.
- de0b41c: Stop declaring the WebMCP globals as unconditionally present.

  `Document.modelContext`, `SubmitEvent.agentInvoked`, `SubmitEvent.respondWith()`
  and the `ModelContext` interface object are now optional. No browser ships
  WebMCP unflagged — Chromium exposes it only under `--enable-features=WebMCP` —
  and the declarative form members are explainer-only, appearing in neither the
  specification nor WPT's `webmcp.idl`. Declaring them as always-there made
  feature detection read as dead code under our own types.

  The modifiers are bare optionals (`?: T`, not `?: T | undefined`): where WebMCP
  is absent the property is genuinely missing, so `'modelContext' in document` is
  false rather than the property being present and holding `undefined`. The
  `ModelContext` interface object is `| undefined` because a `var` declaration
  cannot be optional; guard it with `typeof ModelContext !== 'undefined'`.

  Migration — feature-detect, or install `@mcp-b/webmcp-polyfill`:

  ```ts
  const modelContext = document.modelContext;
  if (!modelContext) return;
  await modelContext.registerTool(tool);
  ```

  `RegisteredTool.title` and `RegisteredTool.annotations` stay optional and are
  now documented. `annotations` is absent entirely when a tool registers none, and
  `title` is only guaranteed by a specification default that webmcp#224 proposes
  removing, so `tool.title || tool.name` is the correct read — the spec default
  makes `title` an empty string today, which `??` does not fall through.

  `@mcp-b/webmcp-local-relay` no longer relies on a thrown `TypeError` to detect a
  missing `document.modelContext` when subscribing to `toolchange`; it checks
  first and falls back to polling as before.

- f80daeb: Return `RegisteredTool.inputSchema` from `getTools()` as a JSON Schema object
  instead of a serialized string, following webmcp#241 and Chrome 154.0.8013.
  The polyfill and the standalone `BrowserMcpServer` both parse a fresh object
  per call, exactly like Blink parsing its serialized copy; a schema whose
  custom `toJSON` serializes to non-object JSON is omitted rather than surfaced
  as a value consumers would mistake for a pre-154 serialized string.

  Consumers stay compatible with both generations of Chrome: the browser-server
  native backfill and the relay embed accept the object shape from new Chrome and
  the string shape that the 149–156 Origin Trial population still returns. The
  `RegisteredTool.inputSchema` type widens to `InputSchema | string` to make that
  branching explicit.

  Before this, Chrome ≥154.0.8013 broke native tool mirroring entirely:
  `JSON.parse` on the new object threw, and every native tool — including
  child-frame tools — was dropped as malformed.

### Patch Changes

- de0b41c: Require Node 20 or newer. `@mcp-b/global`, `@mcp-b/mcp-iframe`,
  `@mcp-b/webmcp-polyfill` and `@mcp-b/webmcp-ts-sdk` previously allowed Node 18;
  the rest declared no `engines` range at all and now state the same floor. Node 18
  reached end of life in April 2025. Browser builds are unaffected — this governs
  build tooling and the relay CLI.

## 4.0.0

### Major Changes

- abaf5d0: Align the WebMCP runtime surface with Chrome 152 and the current document-first API.

  This follows the current first-party WebMCP sources: the W3C WebMCP draft, Chrome's WebMCP imperative API docs, and MCP SEP-2106 for MCP JSON Schema 2020-12 output behavior. `outputSchema` remains MCP-B helper metadata because the current W3C/Chrome WebMCP tool dictionary does not define or enforce it.

  `registerTool` now resolves `undefined`; use `registerTool(tool, { signal })` and abort the signal to unregister tools. `unregisterTool` remains as deprecated compatibility where present.

  The standard producer path is `document.modelContext.getTools()` plus `document.modelContext.executeTool(tool, inputArgsJson)`. Deprecated name-based helpers remain MCP-B compatibility APIs.

  Native tool backfill now supports current `getTools`/`executeTool` contexts, MCP transport output schemas preserve rootless object schemas by adding `type: "object"` on the MCP boundary, and Chrome DevTools WebMCP calls preserve `structuredContent` alongside MCP content blocks. The documentation now calls out the breaking migration path and links to the upstream WebMCP and MCP sources that drive it.

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
