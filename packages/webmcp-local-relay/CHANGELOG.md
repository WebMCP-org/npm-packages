# @mcp-b/webmcp-local-relay

## 5.1.0

## 5.0.3

### Patch Changes

- 4dec56a: Remove disconnected sources and tools from the registry when the relay stops, so restarting cannot advertise stale tools. Keep tool names and invocation routing synchronized when a connected source updates its tab identity.

## 5.0.2

## 5.0.1

## 5.0.0

### Major Changes

- de0b41c: Move the relay to MCP SDK v2 multi-round contracts and remove direct elicitation
  messages that bypassed MCP. Preserve zero-configuration loopback discovery and
  the hidden iframe connection path.

### Patch Changes

- de0b41c: Answer `relay/invoke` with an error result when the tool cannot be resolved or
  its browser source has closed. The failure previously threw synchronously out of
  the WebSocket message handler, so the relay client hung until the invoke timeout
  and the relay process itself exited through its `uncaughtException` handler.
- e789182: Exit when the parent MCP client disconnects. Stdio and parent-process detection,
  plus a five-second fallback, prevent orphaned relay processes from retaining
  memory and loopback ports.
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

- de0b41c: Stop emitting declaration source maps, and ship the MIT `LICENSE` text these
  packages already declared. Each package shipped `dist` without `src`, so every
  published `.d.ts.map` pointed at a file that was not in the tarball; editors
  already fall back to the `.d.ts` itself. `@mcp-b/webmcp-types` keeps its maps —
  it is the one package that ships `src`, so its maps resolve.
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

## 4.0.0

## 3.0.0

### Major Changes

- Align this package with the WebMCP v3 release train. This package has no direct API changes in this release.

## 2.3.1

## 2.3.0

### Patch Changes

- 3ce0b6a: Make the relay widget's per-request timeout configurable via a new `data-request-timeout` attribute on the embed script tag, and bump the default from 10s to 60s so long-running tools (e.g. those chaining several API calls) work out of the box. Closes #197.

  Usage:

  ```html
  <script
    src="https://cdn.jsdelivr.net/npm/@mcp-b/webmcp-local-relay@latest/dist/browser/embed.js"
    data-request-timeout="120000"
  ></script>
  ```

  Invalid values (non-positive integers) cause the widget to refuse to start and log an error, mirroring the existing `data-relay-port` validation behavior.

## 2.2.0

### Patch Changes

- Use workspace:\* for internal webmcp-types dependency.

## 2.1.0

### Minor Changes

- Add port range discovery, subprotocol handshake, and proactive heartbeat to the local relay.
  - **Port range**: Server tries ports 9333-9348 instead of failing on a single port. Persists chosen port to `~/.webmcp/relay-port.json` for stable restarts.
  - **Browser discovery**: Widget probes the port range sequentially with a state machine (connected, retry-same-endpoint, rediscover) and caches endpoints in sessionStorage.
  - **Subprotocol handshake**: WebSocket connections use `webmcp.v1` / `webmcp-discovery.v1` subprotocols. Server sends `server-hello` with relay identity (instanceId, label, workspace, relayId) on connect.
  - **Multi-relay selection**: New `data-relay-id` and `data-relay-workspace` embed attributes for filtering relays during discovery.
  - **Heartbeat**: Server pings connected sources every 15s and closes dead connections after 25s of no response, enabling fast rediscovery after ungraceful relay deaths.
  - **Lazy connect**: New `data-auto-connect="false"` option to defer discovery until explicit `webmcp.connect` message.
  - **Iframe permissions**: Embed iframe includes `allow="loopback-network; local-network; local-network-access"` for future browser LNA support.

## 2.0.13

### Patch Changes

- Default targetOrigin to '\*' in TabClientTransport and IframeParentTransport instead of throwing when not set. Fix relay schema backwards compatibility by making sources and toolSourceMap optional with empty defaults in RelayServerToolsSchema.

## 2.0.12

## 2.0.11

## 2.0.10

## 2.0.9

## 2.0.8

## 2.0.7
