# WebMCP Conformance References

This file is the canonical link index for WebMCP discussions and Chromium implementation/source references used by `@mcp-b/global`.

Goal: keep one place to track standards decisions and implementation details before adding full conformance tests.

## W3C WebMCP Spec and Docs

- WebMCP repository: https://github.com/webmachinelearning/webmcp
- Rendered spec: https://webmachinelearning.github.io/webmcp/
- Spec source (`index.bs`): https://github.com/webmachinelearning/webmcp/blob/main/index.bs
- Proposal doc: https://github.com/webmachinelearning/webmcp/blob/main/docs/proposal.md
- Explainer: https://github.com/webmachinelearning/webmcp/blob/main/docs/explainer.md

## W3C Discussions / Issues

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

- ChromeStatus (Script Tools API): https://chromestatus.com/feature/5117755740913664
- Blink-dev intent thread: https://groups.google.com/a/chromium.org/g/blink-dev/c/W444JxsqxZw
- Blink-dev archive (I2P): https://www.mail-archive.com/blink-dev@chromium.org/msg14135.html
- Blink-dev archive (follow-up): https://www.mail-archive.com/blink-dev@chromium.org/msg14139.html
- Blink-dev archive (Microsoft collaboration): https://www.mail-archive.com/blink-dev@chromium.org/msg14297.html
- Chrome release notes (143): https://developer.chrome.com/release-notes/143

### Chromium Source Pointers

- Blink modules root: https://chromium.googlesource.com/chromium/src/+/refs/heads/main/third_party/blink/renderer/modules
- Chromium source search (modules): https://source.chromium.org/chromium/chromium/src/+/main:third_party/blink/renderer/modules/
- Chromium source search (`model_context`): https://source.chromium.org/chromium/chromium/src/+/main:third_party/blink/renderer/modules/model_context/
- Navigator IDL: https://github.com/chromium/chromium/blob/master/third_party/blink/renderer/core/frame/navigator.idl
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

## Conformance Test Backlog (Planned)

- [ ] API shape conformance for `navigator.modelContext` (producer + consumer methods)
- [ ] Event conformance for `toolcall` and `toolschanged` dispatch timing
- [ ] Consumer conformance for `callTool({ name, arguments })` request/result semantics
- [ ] Elicitation conformance for current WebMCP behavior (`elicitInput` form/url modes)
- [ ] Sampling conformance for `createMessage` request/response handling
- [ ] Native-vs-polyfill parity matrix (Chromium native + shimmed consumer API)
- [ ] `modelContextTesting` compatibility/deprecation behavior checks

## Runtime Conformance Matrix (Implemented)

- Shared suite: `src/conformance/runtime-core-conformance.shared.ts`
- Polyfill runtime entry: `src/conformance/polyfill-runtime.e2e.test.ts`
- Native runtime entry: `src/conformance/native-runtime.e2e.test.ts`

Run commands:

- Polyfill runtime (non-beta Chromium):
  - `pnpm --filter @mcp-b/global run test:conformance:polyfill`
- Native runtime (Chrome Beta + flags):
  - `CHROME_BIN=\"/path/to/chrome-beta\" CHROME_FLAGS=\"--enable-experimental-web-platform-features --enable-features=WebMCPTesting\" pnpm --filter @mcp-b/global run test:conformance:native`
- Matrix:
  - `CHROME_BIN=\"/path/to/chrome-beta\" CHROME_FLAGS=\"--enable-experimental-web-platform-features --enable-features=WebMCPTesting\" pnpm --filter @mcp-b/global run test:conformance:matrix`

## Native Validation Behavior Note (Observed February 15, 2026)

- In current Chrome Beta native mode (`--enable-experimental-web-platform-features --enable-features=WebMCPTesting`), `navigator.modelContext.callTool` is not exposed.
- Tool execution goes through `navigator.modelContextTesting.executeTool(toolName, inputArgsJson)`.
- Native `modelContextTesting.executeTool(...)` currently appears to validate malformed JSON parsing (throws `UnknownError: Failed to parse input arguments`) but does not enforce tool `inputSchema` type/required constraints in the same way as the polyfill path.
- `@mcp-b/webmcp-polyfill` does enforce schema checks in its testing shim path and rejects schema-invalid args.
- Conformance implication: keep dedicated native vs polyfill validation parity tests and avoid assuming schema-validation parity in native early preview.
