# @mcp-b/webmcp-extension

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

- Updated dependencies [52928a6]
  - @mcp-b/transports@5.0.0
