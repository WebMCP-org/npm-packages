# Localhost WebMCP Relay Plan

> Status: Phase 2 implemented (local MCP relay server MVP)
> Scope: MVP architecture and implementation sequence for "one script tag + one local MCP command"
> Target repo: `WebMCP-org/npm-packages`

## 1) Problem Statement

Customers want a dead-simple flow:

1. Website owner adds one script tag.
2. End user runs one local MCP server command.
3. Their MCP client (Claude Code, VS Code, etc.) can call tools exposed by any open participating website tab.

The existing building blocks in this monorepo already solve most primitives (transport handshakes, tool sync, tab/source routing), but they are split across packages and products. This plan combines them into a user-facing local relay product.

## 2) Customer Experience Target

### Website owner

```html
<script src="https://yourdomain.com/embed.js"></script>
```

No iframe markup, no local setup docs, no API keys required for the local bridge itself.

### End user

```bash
npx -y @mcp-b/webmcp-local-relay
```

Then MCP config:

```json
{
  "mcpServers": {
    "webmcp-local-relay": {
      "command": "npx",
      "args": ["-y", "@mcp-b/webmcp-local-relay"]
    }
  }
}
```

## 3) Deep-Dive Findings (Relevant Existing Code)

### A) Iframe/message transport primitives already exist

- `packages/transports/src/IframeChildTransport.ts`
- `packages/transports/src/IframeParentTransport.ts`

Both implement ready-handshake + retry semantics over `postMessage`.

### B) "Inverse iframe" pattern already exists in Char SaaS

- `../char-ai-saas/packages/char/src/host/char-iframe-proxy.ts`
- `../char-ai-saas/apps/char-ai-saas/src/embed/agent/utils/mcp-transport.ts`

This is the exact inverse pattern we need:

- iframe acts as MCP client
- host page relays server->client events into iframe
- handshake retries until proxy/server is ready

### C) Multi-source tool dedupe/routing already exists in Char ThreadManager

- `../char-ai-saas/apps/char-ai-saas/worker/chat/thread-manager/tool-registry.ts`
- `../char-ai-saas/apps/char-ai-saas/worker/chat/thread-manager/tool-selection.ts`
- `../char-ai-saas/apps/char-ai-saas/worker/chat/thread-manager/tool-invocation.ts`

Proven patterns:

- track `sourceId`, `tabId`, `connectedAt`, `lastSeenAt`
- dedupe providers by recency
- inject selector (`__sourceId`) when ambiguous
- remap stale connection IDs by stable tab identity

### D) Dynamic naming + sanitization patterns exist in chrome-devtools-mcp

- `packages/chrome-devtools-mcp/src/tools/WebMCPToolHub.ts`

Useful for stable display names and collision-safe tool IDs:

- domain extraction/sanitization
- localhost port handling
- consistent naming for multi-page tool surfaces

## 4) MVP Architecture

## 4.1 Components

1. `embed.js` (runs on customer page, loaded by script tag)
2. Hidden iframe widget (`https://yourdomain.com/widget`)
3. Local relay MCP server (stdio + localhost websocket)

## 4.2 Data flow

1. MCP client calls tool on local relay via stdio.
2. Local relay chooses a connected browser source (tab/socket).
3. Relay forwards invocation over `ws://127.0.0.1:9333` to iframe widget.
4. Widget forwards call to host-page WebMCP transport (via parent postMessage relay).
5. Result returns widget -> local relay -> MCP client.

## 4.3 Why iframe + parent relay

Cross-origin iframe cannot directly touch host DOM/tools. So:

- host page script must relay messages
- iframe can still remain origin-isolated and versioned centrally
- local websocket logic stays in iframe (no host-page localhost networking code needed)

## 5) Proposed Package Layout

## 5.1 New package: `@mcp-b/webmcp-local-relay`

Single npm package with:

- `bin` entrypoint: local MCP relay server (Node)
- static assets: `embed.js`, `widget` bundle

Rationale: keeps install/config friction minimal (one package to run + one CDN script to load).

## 5.2 Optional extraction (after MVP)

- `@mcp-b/transports` enhancement:
  - add reusable `IframeToParentClientTransport` abstraction based on Char's implementation
- `@mcp-b/webmcp-embed-relay` browser runtime module for script/widget logic

For MVP, keep internal to move fast.

## 6) Protocols and Message Shapes

## 6.1 Iframe <-> host page (postMessage)

Reuse existing MCP-style envelope convention:

- `channel`
- `type: "mcp"`
- `direction: "client-to-server" | "server-to-client"`
- `payload: JSON-RPC message or ready sentinel`

Plus internal relay messages (`char-` equivalent renamed for webmcp-local-relay) for lifecycle/diagnostics.

## 6.2 Widget <-> localhost relay (WebSocket)

Use explicit envelopes (not raw JSON-RPC only):

- `hello` (widget -> local): origin/url/title/tab metadata
- `tools/list` snapshot and `tools/changed` notifications
- `invoke` / `result` with `callId`
- `ping` / `pong`

This avoids coupling browser-side wire protocol to MCP stdio internals.

## 7) Tool Identity, Dedupe, and Active-Tab Strategy

This is the highest complexity area; copy Char's approach with a smaller first pass.

## 7.1 Source identity

Track per websocket connection:

- `sourceId` (connection-scoped, ephemeral)
- `tabId` (stable browser-tab identity generated in widget and persisted in `sessionStorage`)
- `origin`, `url`, `title`, `connectedAt`, `lastSeenAt`
- `visibilityState`, `focused` (best effort) — *not yet implemented*

## 7.2 Dedupe policy

For same `(tabId, toolName)`, keep most recent provider (`lastSeenAt`), matching Char's canonical-provider strategy.

## 7.3 Ambiguity policy (different tabs expose same tool name)

MVP options:

1. Namespaced tool IDs by default (recommended)
2. If exposing merged names, require selector arg (like `__sourceId`) when multiple providers exist

Recommendation: use namespaced IDs in MVP for predictable behavior.

Example:

- `webmcp_github_com_tababc123_get_issue`
- `webmcp_notion_so_tabdef456_search_pages`

## 7.4 Active tab selection

MVP heuristic:

- prefer explicitly selected source when provided
- else choose latest `focused && visible`
- fallback to highest `lastSeenAt`

No browser-extension dependency in MVP.

## 8) Security Model

## 8.1 Local relay server hardening

- Bind websocket server to `127.0.0.1` only.
- Validate `Origin` header against widget origin allowlist. — *implemented*
- Validate `Host` for localhost-style access to reduce DNS rebinding surface. — *deferred*
- Enforce message size limits and per-connection rate limits. — *message size: implemented via maxPayloadBytes; rate limits: deferred*
- Ignore unknown message types.

## 8.2 Browser embedding hardening

- `embed.js` enforces single iframe instance (idempotent inject).
- iframe uses strict target origins for postMessage.
- no wildcard origin except transitional ready broadcasts where required by transport semantics.

## 8.3 Trust statement

Any site that includes the script can expose tools to the local relay. This is expected, but must be clearly documented.

## 9) Implementation Phases

## Phase 0: Spec + contracts

- Finalize wire envelope schemas for websocket side.
- Finalize tool naming and ambiguity rules.
- Define environment variables (`PORT`, allowed origins, debug log level).

Deliverables:

- protocol doc
- TS schema module (Zod)

## Phase 1: Browser runtime MVP (`embed.js` + widget)

- `embed.js` injection logic + duplicate prevention + retry behavior
- host-page relay bridge (server->client forwarding to iframe)
- iframe local websocket connector (single port `9333`, exponential backoff)
- iframe->host MCP client transport (based on Char inverse transport)

Deliverables:

- working browser bridge to host WebMCP tools
- local connection lifecycle telemetry

## Phase 2: Local MCP relay server MVP

- stdio MCP server with list-tools and call-tool
- websocket server for iframe connections
- source registry, heartbeat, and disconnect cleanup
- forward call/response path end-to-end

Deliverables:

- working `npx` command with MCP client integration

## Phase 3: Multi-tab quality pass

- dedupe + canonical provider logic
- tab/source listing tool(s)
- source selection support for ambiguous tools
- active tab heuristics

Deliverables:

- predictable multi-tab behavior
- explainable tool routing

## Phase 4: Security + packaging hardening

- origin/host checks, rate limits, payload guards
- docs for threat model and local trust assumptions
- publish pipeline and release docs

Deliverables:

- production-ready package release

## 10) Test Strategy

### Unit

- tool naming/sanitization
- source ranking and dedupe
- selector resolution and ambiguity handling
- websocket envelope validation

### Integration

- local relay + headless browser page with host/iframe bridge
- reconnect behavior when local relay starts late
- reconnect behavior on tab reload/navigation

### E2E

- script tag page + local relay + MCP inspector flow
- multi-tab same-tool conflict
- disconnect mid-invocation timeout behavior

## 11) "MCP Binary" Distribution Research and Recommendation

## Findings

- Most MCP clients are command-based for local servers (stdio); `npx ...` is standard.
- npm `bin` is the simplest cross-platform executable path for Node-based MCP servers.
- MCP Registry supports publishing local servers via npm and also `.mcpb` bundle artifacts.
- `.mcpb` (MCP Bundles) are now the standard "single-click install" packaging format for clients that support bundles.
- Node SEA/single-executable is possible but adds packaging/signing complexity across platforms.

## Recommendation

1. **Ship both from day one:** npm CLI (`bin`) + `.mcpb` bundle output.
2. **Prefer `.mcpb` in docs** for clients with bundle support (best end-user install UX).
3. **Keep `npx` as universal fallback** for clients/environments that do not support bundles.
4. **Publish MCP Registry metadata** for both npm and `.mcpb` distribution paths.
5. **Later:** evaluate native SEA binaries only if install friction remains a blocker.

This gives "binary-like" UX immediately where supported, without sacrificing compatibility.

### 11.1 MCPB packaging requirements for this project

For `@mcp-b/webmcp-local-relay`, produce:

1. `manifest.json` compatible with MCPB spec
2. bundled server runtime files (Node entrypoint + dependencies)
3. build artifact: `webmcp-local-relay.mcpb`

Recommended CI additions:

1. `pack:mcpb` script to generate bundle from release build output
2. schema validation step for `manifest.json`
3. smoke test that bundle launches stdio server and responds to `tools/list`

### 11.2 Runtime strategy inside MCPB

Use Node runtime in the bundle manifest for lowest implementation risk and best parity with existing npm CLI flow.

That keeps one codebase for:

- `npx -y @mcp-b/webmcp-local-relay`
- `.mcpb` bundle installs

## 12) Non-Goals (MVP)

- Browser extension dependency
- Cloud account/auth requirement for local relay
- Perfect OS-level active-tab detection
- Cross-browser synchronized identity beyond per-tab/session metadata

## 13) Open Questions

1. Should ambiguous tools be hidden unless selected source exists, or always exposed with required selector?
2. Should the default port be strictly single-port (`9333`) or small probe range (`9333-9335`)?
3. ~~Should we expose a `list_sources` tool in MVP, or defer to v1.1?~~ **Resolved:** Yes, `webmcp_list_sources` is included in MVP.
4. ~~Do we want namespaced tool IDs by default, or legacy raw names + selector strategy?~~ **Resolved:** Namespaced tool IDs by default (`webmcp_{domain}_tab{tabId}_{toolName}`).

## 14) Proposed Immediate Next Work Items

1. Create `@mcp-b/webmcp-local-relay` package scaffold with `bin` entrypoint and static `embed.js`/widget build outputs.
2. Port Char inverse iframe-client transport pattern into this package (or `@mcp-b/transports` behind experimental export).
3. Implement local source registry and deterministic routing policy before adding advanced UX features.
4. Add a small integration harness page under `examples/` to validate "script tag + npx" end-to-end.
