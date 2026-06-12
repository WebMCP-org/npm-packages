# WebMCP Image Tool Content Investigation

Date: 2026-06-11

## Scope

This is an investigation note for adding image input/output support to the
WebMCP polyfill and preparing a shared end-to-end conformance suite that can run
against both the polyfill and a future Chromium implementation.

Companion execution plan:
[`WEBMCP_IMAGE_TOOL_CONTENT_TDD_PLAN.md`](./WEBMCP_IMAGE_TOOL_CONTENT_TDD_PLAN.md).

Implementation correction after spec review: this work extends the WebMCP API,
not the MCP API. The implementation should return direct WebMCP image values
through `document.modelContext.executeTool(...)`; it should not introduce MCP
`content` blocks, MCP clients, or the MCPB global runtime into the WebMCP
conformance path.

The motivating issue is
[webmachinelearning/webmcp#41](https://github.com/webmachinelearning/webmcp/issues/41),
which asks for image input to tools and image output from tools. The issue
specifically calls out an ergonomic browser shape such as:

```js
document.modelContext.registerTool({
  name: 'get_product_image',
  description: 'Get the product image from the page',
  inputSchema: {
    type: 'object',
    properties: { productId: { type: 'string' } },
  },
  async execute({ productId }) {
    const img = document.querySelector(`#product-${productId} img`);
    return { content: [{ type: 'image', value: img }] };
  },
});
```

For this WebMCP package, that ergonomic browser-source idea should be translated
to a direct value instead of an MCP `content` array:

```js
return { type: 'image', value: img };
```

## Refresh Status

`npm-packages` was fetched and pulled from all configured remotes. The local
checkout is clean and `main` is already at `origin/main`:

- `bf03420d chore(webmcp-local-relay): simplify browser runtime`

Chromium is different:

- Worktree: `chromium/src`
- Current branch: `webmcp-streaming-review`
- Current `HEAD`: `33601c04c6bf WebMCP: clean up streaming impl - remove ModelContextClient, simplify`
- Current `origin/main`: `d36b68b00695 [headless] Relocate default headless mode user data directory`
- Dirty files: 31,764

Because the Chromium checkout is on the unmerged streaming branch with a large
dirty worktree, I did not switch, rebase, or pull it in place. I read current
Chromium from `origin/main` via `git show origin/main:...`, and treated the
streaming branch as reference material only.

The broad Chromium fetch stalled in `index-pack` once, but a narrower filtered
fetch completed and updated local `origin/main` to match the remote ref. A
future implementation pass should either clean/create a separate Chromium
worktree or run `gclient sync` from a clean branch before editing Chromium.

## Latest Spec Snapshot

The live WebMCP spec at
[webmachinelearning.github.io/webmcp](https://webmachinelearning.github.io/webmcp/)
is dated 2026-06-11.

Important current-spec details:

- The primary surface is `document.modelContext`, not
  `navigator.modelContext`.
- `Document` has a `[SameObject] readonly attribute ModelContext modelContext`.
- `ModelContext` extends `EventTarget`.
- `registerTool(tool, options?)` returns `Promise<undefined>`.
- Registration is abort-signal driven through
  `ModelContextRegisterToolOptions.signal`.
- `ModelContextRegisterToolOptions` also has `exposedTo`.
- `ModelContextTool` includes `name`, `title`, `description`, `inputSchema`,
  `execute`, and `annotations`.
- `ToolAnnotations` includes `readOnlyHint` and `untrustedContentHint`.
- Tool names are constrained to ASCII alnum, underscore, hyphen, and period,
  length 1-128.

The spec does not yet define image content blocks, browser object-backed image
content, `content[]` result normalization, or a testing API shape for image
serialization. That means the polyfill can prototype this, but the Chromium CR
will need either spec text first or a clearly experimental implementation.

## Related Spec/Issue Signals

[webmcp#41](https://github.com/webmachinelearning/webmcp/issues/41) captures the
core image request:

- Support image input to tools.
- Support image output from tools.
- Prefer browser-side conversion so developers can pass page images/elements.
- Consider MCP's `{ type: "image", data, mimeType }` shape.
- Consider how JSON/structured responses reference associated images.

[webmcp#92](https://github.com/webmachinelearning/webmcp/issues/92) asks who
owns validation of `inputSchema`. That matters because image-bearing input is
not just JSON Schema validation; it may require WebIDL union handling,
structured clone rules, and/or explicit normalization before `execute`.

The issue comments mention Prompt API precedent: image input should consider
`ImageBitmapSource` and `BufferSource`; audio analogs include `AudioBuffer`,
`BufferSource`, and `Blob`.

## Current Polyfill State

Relevant files:

- `packages/webmcp-polyfill/src/index.ts`
- `packages/webmcp-types/src/common.ts`
- `packages/webmcp-types/src/model-context.ts`
- `packages/webmcp-types/src/tool.ts`
- `packages/webmcp-ts-sdk/src/browser-server.ts`

Current behavior:

- The polyfill installs `document.modelContext` as canonical and
  `navigator.modelContext` as a deprecated alias.
- It avoids overriding native `document.modelContext`/`navigator.modelContext`.
- `registerTool(...)` currently returns `void`, even though the live spec now
  says `Promise<undefined>`.
- `registerTool(tool, { signal })` unregisters when the signal aborts.
- `navigator.modelContextTesting` can be installed as a testing shim.
- `modelContextTesting.executeTool(name, inputArgsJson)` accepts JSON-string
  arguments and returns a serialized string or `null`.
- `document.modelContext.getTools()` and
  `document.modelContext.executeTool(tool, inputArgsJson)` are implemented as a
  Chromium producer-preview compatibility surface.
- `normalizeToolResponse(...)` passes through objects that already look like a
  `CallToolResult`, meaning `{ content: [...] }` survives as returned.
- Non-`CallToolResult` values are wrapped into a text block and optional
  `structuredContent`.

Types already include MCP-style content blocks:

- `TextContent`
- `ImageContent` with `{ type: "image", data: string, mimeType: string }`
- `AudioContent`
- `ResourceLink`
- `EmbeddedResource`
- `CallToolResult.content: Array<ContentBlock | LooseContentBlock>`

Tests already assert that raw image blocks are serializable enough for current
polyfill behavior. For example, tests cover error paths containing
`{ type: "image", data: "base64data", mimeType: "image/png" }`.

Missing for issue #41:

- No typed browser-source image block such as `{ type: "image", element }`,
  `{ type: "image", blob }`, `{ type: "image", imageBitmap }`, or
  `{ type: "image", source }`.
- No runtime conversion from `HTMLImageElement`, `HTMLCanvasElement`,
  `SVGImageElement`, `ImageBitmap`, `Blob`, `BufferSource`, etc. to base64
  `ImageContent`.
- No async normalization path for `CallToolResult.content`.
- No conformance tests for image conversion, CORS/tainted canvas behavior,
  MIME inference, ordering, or error handling.

## Current Chromium `origin/main`

Relevant current-baseline files read from Chromium `origin/main`:

- `third_party/blink/renderer/core/script_tools/model_context.idl`
- `third_party/blink/renderer/core/script_tools/model_context_tool.idl`
- `third_party/blink/renderer/core/script_tools/model_context_testing.idl`
- `third_party/blink/renderer/core/script_tools/model_context.cc`
- `third_party/blink/renderer/core/script_tools/model_context_testing.cc`
- `third_party/blink/public/mojom/content_extraction/script_tools.mojom`
- `third_party/blink/renderer/core/script_tools/model_context_test.cc`

Current Chromium main is behind the live spec and behind this repo's polyfill in
some ways, but much less than the older local streaming branch:

- It exposes `document.modelContext` and keeps `navigator.modelContext` as a
  deprecated alias.
- `ModelContext` is an `EventTarget`.
- `registerTool(...)` still returns `undefined`, while the live spec says
  `Promise<undefined>`.
- `unregisterTool(...)` is no longer in current Chromium `origin/main` IDL;
  registration cleanup is signal-driven.
- `ModelContextTool` has `name`, `title`, `description`, `inputSchema`,
  `execute`, and `annotations`.
- `ToolAnnotations` has `readOnlyHint` and `untrustedContentHint`.
- `ModelContextRegisterToolOptions` has `signal` and `exposedTo`.
- `ModelContext.getTools(options?)` returns `Promise<sequence<RegisteredTool>>`
  and supports `fromOrigins`.
- `ModelContext.executeTool(RegisteredTool, inputArgsJson, options?)` exists.
- `ModelContextTesting.executeTool(...)` only accepts JSON-string arguments.
- Tool execution returns `DOMString?`.
- JS tool results are stringified by `JSON.stringify` if object-like, otherwise
  `ToString`, then returned through the `DOMString?` callback.
- `script_tools.mojom` now carries cross-document discovery/invocation metadata:
  `name`, `title`, `description`, `input_schema`, `annotations`,
  `exposed_origins`, owner frame token, and origin.
- `script_tools.mojom` explicitly notes tool results are always strings for now
  and points to a Chromium bug for changing that.

There is no image-specific support in Chromium `origin/main`.

## Unmerged Streaming Branch Reference

The local Chromium branch `webmcp-streaming-review` is unmerged, but it shows a
useful implementation pattern for adding non-plain-JSON tool inputs.

Files added/changed by that branch include:

- `third_party/blink/renderer/core/script_tools/streamed_tool_call.idl`
- `third_party/blink/renderer/core/script_tools/streamed_tool_call.h`
- `third_party/blink/renderer/core/script_tools/streamed_tool_call.cc`
- `third_party/blink/renderer/core/script_tools/model_context_tool.idl`
- `third_party/blink/renderer/core/script_tools/model_context_testing.idl`
- `third_party/blink/renderer/core/script_tools/model_context.{h,cc}`
- `third_party/blink/renderer/core/script_tools/model_context_test.cc`
- `third_party/blink/renderer/core/script_tools/build.gni`

The pattern:

- Add new WebIDL types for the new input shape.
- Add a tool metadata flag (`stream = false`) to `ModelContextTool`.
- Mirror that flag into testing/discovery (`RegisteredTool.stream`) and Mojo
  discovery metadata (`ScriptTool.stream`).
- Add an overloaded `ModelContextTesting.executeTool(...)` for the new input
  form.
- Convert the testing input into a wrapper object delivered to the tool
  callback.
- Bridge complex values across script worlds where needed.
- Keep cancellation tied to `AbortSignal`.
- Add Blink unit coverage in `model_context_test.cc`.

The branch's `StreamedToolCall` wrapper is the main architectural reference:

- It is a `ScriptWrappable`.
- It exposes an async iterable to JavaScript.
- It owns either synthetic chunks or a `ReadableStream`.
- It validates chunk shape at iteration time.
- It cancels/cleans up reader state when aborted or finished.

For image support, the analogous object might not need async iteration, but the
same approach applies: define a wrapper/normalizer for browser-native inputs,
convert or reject at a clear boundary, and test cross-world/cancellation/error
semantics explicitly.

## Proposed Polyfill Direction

Use an explicit direct-value type model:

1. Serialized WebMCP image values:
   `{ type: "image", data, mimeType }`.
2. Browser-source image values accepted by the WebMCP polyfill and normalized
   before the result crosses producer execution:
   `element`, `blob`, and later `bufferSource`/`imageBitmap` if the spec needs
   them.

Candidate type additions:

```ts
export type WebMCPImageValue =
  | { type: 'image'; data: string; mimeType: string }
  | { type: 'image'; value: Blob | HTMLImageElement | HTMLCanvasElement; mimeType?: string };
// The {type, value} source shape mirrors the Prompt API's
// LanguageModelToolResultContent.
```

For implementation, prefer a single async normalization function at the strict
producer execution boundary:

```ts
async function normalizeWebMCPExecutionResult(value: unknown): Promise<unknown>;
async function normalizeWebMCPImageValue(value: WebMCPImageValue): Promise<SerializedImageValue>;
```

Initial conversion policy:

- Existing `{ type: "image", data, mimeType }` passes through unchanged when
  `mimeType` is non-empty.
- `Blob` uses `arrayBuffer()` and base64 conversion; MIME from `blob.type` or
  explicit `mimeType`.
- `HTMLCanvasElement` uses `toBlob(...)`; reject if tainted.
- `HTMLImageElement` draws to a canvas after `decode()` if needed; reject on
  tainted canvas or incomplete/failed image.
- `ImageBitmap` draws to canvas; do not close it unless explicitly documented.
- `BufferSource` requires explicit `mimeType`.
- Prefer PNG as default canvas encoding unless the caller supplies another
  supported MIME type.

Do not silently convert arbitrary URLs in the first pass. Fetching URLs raises
network, CORS, credentials, timing, and privacy questions. Element-backed
conversion is enough to validate the core API ergonomics.

## Proposed Chromium Direction

Chromium should not start from the streaming branch. Start from a clean
`origin/main`/current upstream branch and port only the relevant patterns.

Likely Chromium implementation surfaces:

- Update WebIDL for explicit image result values if/when the spec has shape:
  `WebMCPImageValue`, `SerializedImageValue`, or similar dictionaries.
- If accepting browser object-backed image values, define WebIDL unions or
  dictionaries for accepted source types.
- Convert image sources in the renderer before resolving the tool execution
  result string.
- Reuse existing canvas/image encoding infrastructure instead of ad hoc binary
  handling.
- Keep `ModelContextTesting.executeTool(...)` returning `DOMString?` until the
  testing API changes; conformance can parse JSON from that string.
- Add Blink unit tests for each accepted source type and failure mode.

Open Chromium design questions:

- Should conversion happen only when the result has the explicit
  `{ type: "image", ... }` discriminator?
- How should tainted/cross-origin images fail: reject the tool invocation or
  return a typed image conversion error?
- Should `HTMLVideoElement` be in scope for "image" via current frame capture?
- Should SVG images preserve SVG MIME/data or rasterize to PNG?
- What are size limits for encoded image output?
- Does DevTools/content extraction need image-capability metadata in
  `script_tools.mojom`, or is this only result-time behavior?

## Conformance Suite Shape

Create a shared Playwright suite for image tool content, not a polyfill-only
unit suite. It should run in two lanes:

1. Polyfill lane: load a simple page with `@mcp-b/webmcp-polyfill`.
2. Native lane: launch Chromium with WebMCP flags and execute the same tests
   against the browser API.

Use the same public boundary in both lanes:

- Register via `document.modelContext`.
- Discover through `document.modelContext.getTools()`.
- Execute through `document.modelContext.executeTool(tool, inputArgsJson)`.
- Parse the returned `DOMString?` as a direct WebMCP value. Image values are not
  MCP `content` blocks.

Suggested test helper:

```ts
async function executeDocumentImageTool(page, name, args) {
  return page.evaluate(
    async ({ name, args }) => {
      const tools = await document.modelContext.getTools();
      const tool = tools.find((candidate) => candidate.name === name);
      if (!tool) throw new Error(`Tool not found: ${name}`);

      const result = await document.modelContext.executeTool(tool, JSON.stringify(args));
      return result === null ? null : JSON.parse(result);
    },
    { name, args }
  );
}
```

Core conformance cases:

- Existing direct base64 image value passes through unchanged.
- `Blob` image output is converted to `{ type: "image", data, mimeType }`.
- `HTMLCanvasElement` output is converted to PNG base64.
- `HTMLImageElement` output is converted after decode.
- Missing/unsupported MIME behavior is deterministic.
- Tainted/cross-origin image conversion rejects with a predictable error.
- Raw JSON values still survive when no explicit image value is present.
- `null` result behavior remains unchanged.

Use small deterministic test images:

- 1x1 or 2x2 PNG data URL for same-origin image tests.
- Canvas-drawn colored pixels for conversion tests.
- A cross-origin image fixture only when the test server setup can reliably
  create a tainted canvas case.

## Immediate Next Steps

1. Add polyfill/type support for direct browser-source image value normalization.
2. Add shared Playwright image conformance tests under `e2e/tests/`.
3. Add a polyfill Playwright config/lane if the existing runtime-contract page
   is not a clean fit.
4. Run the new suite against the polyfill.
5. After the Chromium CR starts from clean upstream main, run the same suite
   against the native implementation via `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`
   and WebMCP flags.

## Commands Useful Later

Polyfill/unit checks:

```bash
pnpm --filter @mcp-b/webmcp-polyfill test
pnpm --filter @mcp-b/webmcp-types test
```

Native conformance lane:

```bash
cd e2e
CHROME_BIN="/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary" \
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH="/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary" \
PLAYWRIGHT_ENABLE_WEBMCP_FLAGS=1 \
pnpm test:native-contract:default
```

Read latest Chromium baseline without switching away from the dirty streaming
branch:

```bash
cd chromium/src
git show origin/main:third_party/blink/renderer/core/script_tools/model_context.idl
git show origin/main:third_party/blink/renderer/core/script_tools/model_context_tool.idl
git show origin/main:third_party/blink/renderer/core/script_tools/model_context_testing.idl
```
