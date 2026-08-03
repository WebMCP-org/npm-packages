# @mcp-b/webmcp-polyfill

## 5.0.0

### Major Changes

- 52928a6: Move the browser stack to the MCP TypeScript SDK v2 packages and the current
  document-first WebMCP surface. Protocol validation now belongs to the upstream
  SDK; MCP-B keeps only the browser/native adapter behavior that MCP does not
  provide.

  Remove deprecated name-based tool execution, legacy native and userscript
  transports, Zod 3-specific schema handling, and duplicated React/runtime
  contracts. Remove the retired extension-tools package and local Chrome DevTools
  MCP fork; consumers should use the upstream Chrome DevTools MCP package.
  Remove `@mcp-b/codemode`; its browser implementation now lives upstream in
  Cloudflare's `@cloudflare/codemode/browser` entry point.
  Add `@mcp-b/webmcp-extension`, which pairs an MV3 template that installs the page
  runtime with an isolated-world client, without replacing the standard
  `document.modelContext` authoring model.
  Remove the legacy React sampling and elicitation hooks, which cannot represent
  MCP 2026 multi-round input flows. The MCP client provider now accepts the full
  SDK `ConnectOptions`, including cached protocol-era verdicts.
  The React tool hook now has one implementation field, `execute`; the deprecated
  `handler` and `formatOutput` aliases and the redundant `onSuccess`/`onError`
  observers have been removed. Raw tool values use the shared MCP-B response
  normalizer, and overlapping executions keep `isExecuting` accurate until all
  work settles.
  Extension port disconnects now close the MCP connection instead of reconnecting
  the transport beneath a stale protocol session; reconnect with a new transport
  so the client and restarted service worker repeat MCP initialization.
  Extension server keep-alives now run every 25 seconds by default instead of
  every second, staying below Chrome's 30-second service-worker idle window with
  far fewer messages.

  Tab and iframe clients now require an explicit `targetOrigin`; pass `"*"` only
  when disabling origin validation is intentional. Request timeouts and
  cancellation now use the MCP client's request options instead of a second
  transport-owned timeout/interruption layer. The ineffective iframe-child ready
  retry option has also been removed.

  `@mcp-b/mcp-iframe` now auto-registers `<mcp-iframe>` only from the package root.
  Custom tag names must import `registerMCPIframeElement` from the side-effect-free
  `@mcp-b/mcp-iframe/element` entry point. The package no longer exposes its raw
  MCP client, raw item snapshots, or the deprecated `toolPrefix` and
  `refreshTools()` aliases. Advertised child list changes now update the parent
  automatically. `call-timeout` applies to tool calls, resource reads, and prompt
  gets; invalid values use the 30-second default. Prefixes allow dots. Opaque
  iframe origins require an explicit `target-origin="*"`. Refresh failures no
  longer leave partial parent registrations, and resource-template forwarding
  preserves reserved, exploded, fragment, and multi-query values. The item-list
  event is now `mcp-iframe-items-changed`, replacing the misleading
  `mcp-iframe-tools-changed` name.

  The v2-backed packages now require Node.js 20 or newer, matching the upstream
  MCP SDK engine requirement.

  `@mcp-b/webmcp-types` now owns `ModelContext` directly and uses the MCP SDK's
  JSON Schema type instead of maintaining a local schema vocabulary. Removed
  rename-only aliases include `ModelContextCore`, `ToolResponse`,
  `ModelContextToolInfo`, and `ToolRawResult`. Runtime-defined schemas fall back
  to object-or-array inputs, and the type contracts are checked with and without
  `strictNullChecks`.

  `@mcp-b/webmcp-polyfill` now keeps ESM initialization explicit and reserves
  auto-initialization for its IIFE entry. Its testing shim is opt-in, never
  replaces an existing implementation, and no longer carries removed preview
  callbacks or fake cross-document results. The strict runtime removes
  `unregisterTool()`, rejects cross-document options it cannot enforce, and
  checks document lifetime and detectable Permissions Policy before every
  registry or execution operation.
  When the polyfill owns `document.modelContext`, Chromium-compatible declarative
  form attributes now synthesize tools from the document and open shadow roots,
  stay synchronized with DOM changes, fill controls transactionally, and preserve
  manual-review or autosubmit behavior. The same browser suite runs against the
  polyfill, the global runtime, and native Chrome; the extension template proves
  those tools remain callable from its isolated content script. React consumers
  also receive narrowly scoped JSX declarations for the declarative attributes.

  `@mcp-b/webmcp-ts-sdk` now exposes the official high-level `mcpServer` as its
  advanced MCP escape hatch. Removed compatibility aliases include
  `unregisterTool`, direct resource/prompt list and read helpers, and the
  single-request sampling and elicitation shortcuts. Tool lifetimes use
  `AbortSignal`; multi-round handlers register directly on `mcpServer`.
  The `isBrowserMcpServer()` guard replaces the raw server-marker export and
  narrows the canonical document surface for explicit MCP-B extension access
  without introducing a second runtime handle.
  Aborted registrations release their tool name immediately and cannot tear down a
  replacement registration, including during React Strict Mode effect replay.

  `@mcp-b/global` keeps initialization side-effect-only. Applications use the
  strict `document.modelContext` surface normally and explicitly narrow that
  surface before calling MCP-B-only extensions. Its emitted declarations retain
  the strict WebMCP global types for package-only TypeScript consumers.

  `@mcp-b/webmcp-local-relay` removes the direct `elicitInput` mutation and relay
  messages that bypassed MCP's multi-round elicitation protocol.

  `@mcp-b/smart-dom-reader` now traverses open shadow roots as documented and
  resolves regional extraction through its module-owned reader. The undocumented
  fourth constructor-injection argument to `ProgressiveExtractor.extractRegion()`
  has been removed.

### Patch Changes

- f1dbaa0: Align declarative form execution with Chromium and the upstream Web Platform
  Tests. Autosubmit now preserves native event ordering, opaque documents report
  their effective origin, and the composed runtime forwards behavior-only form
  registration changes.
- Updated dependencies [52928a6]
  - @mcp-b/webmcp-types@5.0.0

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
