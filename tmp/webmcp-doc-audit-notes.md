# WebMCP Docs Audit Notes (Temp)

Date: 2026-03-02
Repo: /Users/alexmnahas/personalRepos/WebMCP-org/npm-packages

## 1) Baseline Understanding (README-Only)

WebMCP in this repo is positioned as a browser-native tool surface (`navigator.modelContext`) aligned to the W3C Web Model Context API draft, with layered packages that:

- provide strict core behavior (`@mcp-b/webmcp-polyfill`, `@mcp-b/webmcp-types`),
- optionally bridge that core into full MCP server capabilities (`@mcp-b/global`, `@mcp-b/webmcp-ts-sdk`),
- expose transport options (`@mcp-b/transports`, `@mcp-b/mcp-iframe`, `@mcp-b/webmcp-local-relay`),
- provide framework ergonomics (`usewebmcp`, `@mcp-b/react-webmcp`),
- and ship high-leverage browser tooling (`@mcp-b/chrome-devtools-mcp`, `@mcp-b/extension-tools`, `@mcp-b/smart-dom-reader`).

### Package mental model from READMEs

- `@mcp-b/webmcp-types`: compile-time type package only; no runtime.
- `@mcp-b/webmcp-polyfill`: strict runtime polyfill for core methods (`provideContext`, `registerTool`, `unregisterTool`, `clearContext`) with optional testing shim.
- `@mcp-b/global`: full runtime that keeps core API shape but adds MCP bridge-style capabilities (listing/calling tools, prompts/resources/sampling, transport wiring).
- `@mcp-b/webmcp-ts-sdk`: thin SDK adaptation to support browser-style dynamic registration after connection.
- `@mcp-b/transports`: browser transport primitives for tab/iframe/extension communication.
- `usewebmcp`: React hook for strict core registration.
- `@mcp-b/react-webmcp`: React hooks for full runtime and client/provider patterns.
- `@mcp-b/webmcp-local-relay`: local bridge from browser-exposed WebMCP tools to desktop MCP clients over stdio.
- `@mcp-b/mcp-iframe`: iframe tool/resource/prompt surfacing via a custom element.
- `@mcp-b/extension-tools`: large Chrome extension API-to-tool mapping set, plus DOM extraction integration.
- `@mcp-b/smart-dom-reader`: token-efficient DOM extraction library with progressive/full strategies.
- `@mcp-b/chrome-devtools-mcp`: DevTools MCP fork with WebMCP tool discovery/calling integration.
- `agent-skills-ts-sdk`: Agent Skills parser/validator (adjacent utility package, not core WebMCP runtime).

### Repository-level understanding from READMEs

- Monorepo includes examples for multiple frameworks, E2E suites for transport/react/native behavior, and a Chromium native showcase app.
- Docs consistently present a package-selection funnel: `types` -> `polyfill` -> `global` depending on strictness/features needed.
- Positioning strongly emphasizes AI-agent interoperability across browser-native, extension, and desktop MCP clients.


## 2) Source-Validated Understanding

### Core runtime layering (confirmed in source)

- `@mcp-b/webmcp-polyfill` installs strict core methods and optional `modelContextTesting`; it intentionally skips installation if `navigator.modelContext` already exists.
- `@mcp-b/global` initializes the polyfill, creates a `BrowserMcpServer`, mirrors native/core registrations, backfills tools from both native extensions (`listTools`/`callTool` when available) and `modelContextTesting`, then replaces `navigator.modelContext` with the server adapter.
- `@mcp-b/webmcp-ts-sdk` wraps MCP server behavior with a browser-oriented `BrowserMcpServer` that supports post-connect tool registration and MCP extension features.

### React package split (confirmed)

- `usewebmcp` supports both `config.execute` and `config.handler` (execute takes precedence), with strict-core assumptions.
- `@mcp-b/react-webmcp` provider hook currently uses `handler` naming; MCP client/provider flow is in `client/McpClientProvider.tsx` with list-change notification refresh.

### Transport and relay behavior (confirmed)

- `@mcp-b/transports` exports tab/iframe/extension/userscript transports; native transports are intentionally not exported in browser package index.
- `@mcp-b/webmcp-local-relay` does register dynamic tools directly onto MCP server and emits tool-list-changed when dynamic set changes.

### Chrome DevTools MCP WebMCP integration (confirmed)

- Current implementation tracks webpage tools and invokes them through `call_webmcp_tool`; comments explicitly state tracked tools are not registered as first-class MCP tools in the server tool list.

### Extension tools implementation status (confirmed)

- Active exported API tool classes in `chrome-apis/index.ts`: 70
- Commented under-construction exports: 11
- This does not match README’s “62 out of 74”.

## 3) External WebMCP Docs (Official) Snapshot

Primary references reviewed:

- W3C CG draft spec: https://webmachinelearning.github.io/webmcp/
- WebMCP proposal repo/docs: https://github.com/webmachinelearning/webmcp
- MCP tools spec (for output schemas and tool annotations context): https://modelcontextprotocol.io/specification/2025-06-18/server/tools

### Key standard points relevant to repo docs

- Draft spec date shown: 10 February 2026.
- `ModelContextContainer` in draft IDL defines core methods (`provideContext`, `registerTool`, `unregisterTool`, `clearContext`) returning `undefined`.
- Standard API is minimal core; list/call/prompts/resources are not part of strict WebMCP core and should be labeled as extension/runtime additions.

## 4) Readme/Docs Gap Analysis and Improvements

### A. High-priority correctness gaps

1. Old WebMCP spec links still point to `nicolo-ribaudo/model-context-protocol-api` in package readmes.
   - Update to current draft/proposal URLs.

2. Example verification in `examples/README.md` references `navigator.modelContext.tools`, which is not the documented runtime API surface.
   - Replace with `navigator.modelContext.listTools?.()` (extension runtime) and/or `navigator.modelContextTesting?.listTools()` guidance depending on package/runtime.

3. `e2e/web-standards-showcase` readme/types document `registerTool()` returning registration handles (`registration.unregister()`), which conflicts with current draft core IDL semantics.
   - Either relabel as Chromium preview-specific behavior or update to standards-aligned patterns.

4. `@mcp-b/chrome-devtools-mcp` README claims webpage tools are auto-registered as first-class MCP tools; source now tracks tools and routes execution through `call_webmcp_tool`.
   - Rewrite those sections to match actual behavior.

5. `@mcp-b/extension-tools` README API count claims are stale (62/74) relative to current exported tool classes.
   - Replace hardcoded counts with generated values or wording that avoids fragile exact numbers.

### B. Medium-priority consistency gaps

6. `@mcp-b/react-webmcp` README says Zod 3.x only, while package peer dependency allows `^3.25 || ^4.0`.

7. `@mcp-b/global` README “Tool Routing Contract” says it requires `navigator.modelContextTesting` at init; source shows native sync plus optional testing shim fallback.

8. Cross-package wording around “strict core” vs “extension/runtime methods” should be unified using one canonical definition block reused across root and package readmes.

### C. Structural improvements to make docs resilient

9. Add an auto-generated “capability matrix” table at repo root (source-of-truth per package):
   - core methods
   - extension methods
   - transport support
   - testing API availability
   - React hook support

10. Add “Spec vs MCP-B Extensions” callout boxes in `global`, `webmcp-polyfill`, `webmcp-types`, and `chrome-devtools-mcp` readmes.

11. Add doc lint checks in CI for:
   - dead external links
   - deprecated URLs
   - stale count claims (tool/API counts)
   - forbidden references (e.g., `navigator.modelContext.tools`)

