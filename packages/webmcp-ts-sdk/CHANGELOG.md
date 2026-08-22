# @mcp-b/webmcp-ts-sdk

## 5.0.0

### Major Changes

- de0b41c: Honor `exposedTo` over the iframe bridge instead of rejecting it.

  `registerTool(tool, { exposedTo })` previously threw `NotSupportedError` unless native
  WebMCP was present, so spec-conformant child code crashed under the polyfill inside an
  `<mcp-iframe>` — the one place a userland cross-document channel actually exists. The
  composed server now stores the allowlist and only advertises a restricted tool once the
  connected embedder's origin matches it.

  `IframeChildTransport` gained `clientOrigin` and an `onclientorigin` callback that report
  the connected parent. `BrowserMcpServer` reads them duck-typed, so transports that cannot
  name a peer keep every restricted tool off the wire.

  Restricted tools fail closed. The MCP handle is disabled in the same synchronous step that
  creates it, so a tool is never listable between registration and its first audience check,
  and it stays hidden when no peer origin is ever established. Tools registered without
  `exposedTo` are untouched.

  Two limits, stated because the spec's guarantee is stronger:
  - `exposedTo` only narrows. `allowedOrigins` on the child transport still decides who may
    connect, and no allowlist widens past it.
  - Enforcement is the child's own JavaScript, not the user agent. Native WebMCP enforces
    `exposedTo` in the browser; this does not, so treat it as scoping rather than a boundary
    against a compromised child.

  `getTools({ fromOrigins })` still throws `NotSupportedError`. Parent-side discovery stays
  `@mcp-b/mcp-iframe`'s job rather than something the SDK reaches across documents to do.

- de0b41c: Move protocol behavior to the official MCP TypeScript SDK v2. The browser
  adapter exposes its composed `McpServer`, removes legacy helper APIs, and keeps
  global initialization side-effect-only through `document.modelContext`.
- de0b41c: Drop the `zod` peer dependency and remove the `zodToJsonSchema` / `isZodSchema`
  helpers. Tool, prompt and resource schemas are now plain JSON Schema objects,
  matching what `document.modelContext` accepts natively, so passing a Zod schema
  to `useWebMCPPrompt` or `registerTool` no longer works. Convert at the call site
  with `z.toJSONSchema(schema)` (Zod 4) and keep Zod as your own dependency if you
  still want it for validation.
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
- de0b41c: Stop emitting declaration source maps, and ship the MIT `LICENSE` text these
  packages already declared. Each package shipped `dist` without `src`, so every
  published `.d.ts.map` pointed at a file that was not in the tarball; editors
  already fall back to the `.d.ts` itself. `@mcp-b/webmcp-types` keeps its maps —
  it is the one package that ships `src`, so its maps resolve.
- f1dbaa0: Align declarative form execution with Chromium and the upstream Web Platform
  Tests. Autosubmit now preserves native event ordering, opaque documents report
  their effective origin, and the composed runtime forwards behavior-only form
  registration changes.
- Updated dependencies [de0b41c]
- Updated dependencies [de0b41c]
- Updated dependencies [de0b41c]
- Updated dependencies [de0b41c]
- Updated dependencies [de0b41c]
- Updated dependencies [de0b41c]
- Updated dependencies [de0b41c]
- Updated dependencies [f1dbaa0]
- Updated dependencies [f80daeb]
  - @mcp-b/webmcp-types@5.0.0
  - @mcp-b/webmcp-polyfill@5.0.0

## 4.0.0

### Major Changes

- abaf5d0: Align the WebMCP runtime surface with Chrome 152 and the current document-first API.

  This follows the current first-party WebMCP sources: the W3C WebMCP draft, Chrome's WebMCP imperative API docs, and MCP SEP-2106 for MCP JSON Schema 2020-12 output behavior. `outputSchema` remains MCP-B helper metadata because the current W3C/Chrome WebMCP tool dictionary does not define or enforce it.

  `registerTool` now resolves `undefined`; use `registerTool(tool, { signal })` and abort the signal to unregister tools. `unregisterTool` remains as deprecated compatibility where present.

  The standard producer path is `document.modelContext.getTools()` plus `document.modelContext.executeTool(tool, inputArgsJson)`. Deprecated name-based helpers remain MCP-B compatibility APIs.

  Native tool backfill now supports current `getTools`/`executeTool` contexts, MCP transport output schemas preserve rootless object schemas by adding `type: "object"` on the MCP boundary, and Chrome DevTools WebMCP calls preserve `structuredContent` alongside MCP content blocks. The documentation now calls out the breaking migration path and links to the upstream WebMCP and MCP sources that drive it.

### Patch Changes

- d05ea62: Declare the MCP TypeScript SDK as a runtime dependency for browser packages that emit runtime SDK imports.
- Updated dependencies [abaf5d0]
- Updated dependencies [6b60264]
  - @mcp-b/webmcp-types@4.0.0
  - @mcp-b/webmcp-polyfill@4.0.0

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
