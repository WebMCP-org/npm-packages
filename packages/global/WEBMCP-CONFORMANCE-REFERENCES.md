# WebMCP Conformance References

This file is the canonical link index for WebMCP discussions and Chromium implementation/source references used by `@mcp-b/global`.

Goal: keep one place to track standards decisions, implementation details, and executable conformance coverage.

## WebMCP Community Group Draft and Docs

- WebMCP repository: https://github.com/webmachinelearning/webmcp
- Rendered spec: https://webmachinelearning.github.io/webmcp/
- Spec source (`index.bs`): https://github.com/webmachinelearning/webmcp/blob/main/index.bs
- Repository explainer: https://github.com/webmachinelearning/webmcp/blob/main/README.md
- Declarative API explainer: https://github.com/webmachinelearning/webmcp/blob/main/declarative-api-explainer.md
- WebMCP Web Platform Tests: https://github.com/web-platform-tests/wpt/tree/master/webmcp
- Declarative Web Platform Tests: https://github.com/web-platform-tests/wpt/tree/master/webmcp/declarative

## Community Group Discussions / Issues

- Elicitation discussion (WebMCP vs MCP behavior): https://github.com/webmachinelearning/webmcp/issues/21
- Consumer API for in-page agents: https://github.com/webmachinelearning/webmcp/issues/51
- Naming discussion (`navigator.modelContext`): https://github.com/webmachinelearning/webmcp/issues/24
- Tool list race-condition discussion: https://github.com/webmachinelearning/webmcp/issues/30
- `outputSchema` decision: https://github.com/webmachinelearning/webmcp/issues/9
- `AbortSignal` decision: https://github.com/webmachinelearning/webmcp/issues/48
- WebExtensions integration: https://github.com/webmachinelearning/webmcp/issues/74
- WebIDL tracking: https://github.com/webmachinelearning/webmcp/issues/75
- All issues: https://github.com/webmachinelearning/webmcp/issues

## W3C Minutes and Charter

- Aug 28, 2025 (initial charter proposal): https://www.w3.org/2025/08/28-webmachinelearning-minutes.html
- Sep 11, 2025 (API design): https://www.w3.org/2025/09/11-webmachinelearning-minutes.html
- Sep 18, 2025 (naming discussion): https://www.w3.org/2025/09/18-webmachinelearning-minutes.html
- Sep 25, 2025 (charter approval): https://www.w3.org/2025/09/25-webmachinelearning-minutes.html
- Oct 2, 2025 (`navigator.modelContext` naming resolution): https://www.w3.org/2025/10/02-webmachinelearning-minutes.html
- Oct 16, 2025 (elicitation/prompt injection/declarative API): https://www.w3.org/2025/10/16-webmachinelearning-minutes.html
- Nov 9-10, 2025 (TPAC): https://www.w3.org/2025/11/09-webmachinelearning-minutes.html
- WebML CG charter: https://webmachinelearning.github.io/charter/

## Chromium Tracking and Source

### Feature Tracking / Status

- ChromeStatus (WebMCP): https://chromestatus.com/feature/5117755740913664
- Chrome WebMCP overview: https://developer.chrome.com/docs/ai/webmcp
- Chrome imperative API: https://developer.chrome.com/docs/ai/webmcp/imperative-api
- Origin trial announcement: https://developer.chrome.com/blog/ai-webmcp-origin-trial
- Current Blink intent thread: https://groups.google.com/a/chromium.org/g/blink-dev/c/gmYffo5WOE8/m/OJxuQRP3AAAJ

### Chromium Source Pointers

- ModelContext IDL: https://chromium.googlesource.com/chromium/src/+/HEAD/third_party/blink/renderer/core/script_tools/model_context.idl
- ModelContextTool IDL: https://chromium.googlesource.com/chromium/src/+/HEAD/third_party/blink/renderer/core/script_tools/model_context_tool.idl
- Document supplement IDL: https://chromium.googlesource.com/chromium/src/+/HEAD/third_party/blink/renderer/core/script_tools/model_context_supplement.idl
- Navigator compatibility API removal: https://chromium.googlesource.com/chromium/src/+/e96168449af0d831581c8e5dbedf5ae171cf6120
- Runtime enabled features docs: https://chromium.googlesource.com/chromium/src/+/HEAD/third_party/blink/renderer/platform/RuntimeEnabledFeatures.md

### Built-in AI Program / Rollout

- Built-in AI docs: https://developer.chrome.com/docs/ai/built-in
- Early preview program: https://developer.chrome.com/docs/ai/join-epp
- Preview discussion group: https://groups.google.com/a/chromium.org/g/chrome-ai-dev-preview-discuss/

## Related Explainers and Background

- Google Script Tools explainer repo: https://github.com/explainers-by-googlers/script-tools
- Script Tools explainer: https://github.com/explainers-by-googlers/script-tools/blob/main/explainer.md
- Script Tools proposal: https://github.com/explainers-by-googlers/script-tools/blob/main/proposal.md
- Script Tools bikeshed: https://github.com/explainers-by-googlers/script-tools/blob/main/index.bs
- Microsoft archived explainer (historical): https://github.com/MicrosoftEdge/MSEdgeExplainers/blob/main/WebModelContext/explainer.md

## Conformance test backlog

- [ ] Cross-document `getTools({ fromOrigins })` exposure and Permissions Policy behavior
- [ ] Event conformance for standard `toolchange` dispatch timing
- [ ] Optional Chromium `executeTool` behavior without treating it as standard API

## Runtime Conformance Matrix (Implemented)

- Shared suite: `conformance/runtime-core-conformance.shared.ts`
- Global runtime entry: `packages/global/conformance/global-runtime.e2e.test.ts`
- Polyfill runtime entry: `packages/webmcp-polyfill/conformance/polyfill-runtime.e2e.test.ts`
- Native Chromium runtime entry: `conformance/native-runtime.e2e.test.ts`
- Shared declarative suite: `conformance/declarative-forms-conformance.shared.ts`
- Pinned upstream declarative and page-local imperative WPT:
  - Selection and runner: `scripts/run-webmcp-wpt.mjs`
  - CI revision and job: `.github/workflows/e2e.yml`

Current MCP-B alignment note:

- The July 28, 2026 WebMCP draft defines the strict `document.modelContext` surface as `registerTool(tool, options?)`, `getTools(options?)`, `ontoolchange`, and inherited `EventTarget` methods.
- `getTools({ fromOrigins })` returns `RegisteredTool` values. Their `inputSchema` fields contain serialized JSON Schema.
- The polyfill registers an `abort` listener on `options.signal` and removes the tool when the signal aborts; pre-aborted signals reject with `AbortError`.
- `BrowserMcpServer.registerTool(tool, options?)` accepts the same shape, resolves `undefined`, and forwards `options.signal` to the underlying native context when the caller provides one.
- Chromium's `executeTool(registeredTool, inputArguments, options?)` remains an experimental implementation extension. It is feature-detected and excluded from strict core types.
- Current Chromium HEAD no longer exposes `navigator.modelContext` or `navigator.modelContextTesting`. MCP-B retains both only as deprecated optional compatibility surfaces.
- Keep browser-surface tests explicit so experimental Chromium behavior is not mistaken for a WebMCP guarantee.

Run commands:

- Pinned upstream WebMCP WPT against the standalone polyfill:
  - `CHROME_BIN="/path/to/chrome-canary" pnpm test:wpt`
- WebMCP polyfill runtime (non-native Chromium):
  - `pnpm --filter @mcp-b/webmcp-polyfill run test:conformance`
- Global runtime (non-native Chromium):
  - `pnpm --filter @mcp-b/global run test:conformance:global`
- WebMCP polyfill runtime through the global matrix alias:
  - `pnpm --filter @mcp-b/global run test:conformance:polyfill`
- Native runtime (Chrome 152+ Dev/Canary + flags):
  - `CHROME_BIN=\"/path/to/chrome-dev-or-canary\" CHROME_FLAGS=\"--enable-features=WebMCP\" pnpm --filter @mcp-b/global run test:conformance:native`
- Matrix:
  - `CHROME_BIN=\"/path/to/chrome-dev-or-canary\" CHROME_FLAGS=\"--enable-features=WebMCP\" pnpm --filter @mcp-b/global run test:conformance:matrix`

`vitest.conformance.native.config.ts` auto-detects Chrome Canary/Dev on macOS and common Linux Chrome binaries when `CHROME_BIN` is not set, but it rejects any executable below Chrome 152.

## Native validation behavior note (updated July 30, 2026)

- WebMCP remains experimental and is in an origin trial rather than generally shipped stable.
- Native conformance discovers tools through `await document.modelContext.getTools()`.
- Native conformance does not depend on either removed navigator API.
- Native conformance does not rely on removed preview methods such as `provideContext()` or `clearContext()`.
- If Chromium exposes `document.modelContext.executeTool(...)`, the suite invokes it with the exact `RegisteredTool` returned by `getTools()`. It does not invoke the extension when absent.
- Current Chromium source notes that tool input schema enforcement during execution is incomplete.
- `@mcp-b/webmcp-polyfill` likewise treats input schemas as advertised metadata during direct and testing-shim execution; it parses the JSON input but does not validate it against the schema.
- `@mcp-b/webmcp-polyfill` and `BrowserMcpServer` accept `registerTool(tool, { signal })`; aborting the signal owns removal.
- Conformance implication: do not assert execution-time schema validation in native or polyfill conformance; MCP transport validation belongs to the official MCP server.
