# WebMCP Image Tool Content TDD Plan

Date: 2026-06-11

## Purpose

This plan prepares the next implementation pass for image input and output in
WebMCP tools. It is intentionally test-first and end-to-end only. Do not add
unit tests for this work unless the scope changes; the contract must be proven
through a real page, real `document.modelContext` registration, and real
Playwright-driven tool execution.

Companion investigation:
[`WEBMCP_IMAGE_TOOL_CONTENT_INVESTIGATION.md`](./WEBMCP_IMAGE_TOOL_CONTENT_INVESTIGATION.md).

Primary external references:

- [WebMCP spec](https://webmachinelearning.github.io/webmcp/)
- [webmachinelearning/webmcp#41](https://github.com/webmachinelearning/webmcp/issues/41)
- [webmachinelearning/webmcp#92](https://github.com/webmachinelearning/webmcp/issues/92)

## Corrected API Direction

This plan targets the WebMCP API, not the MCP API and not the MCPB bridge
extensions. The implementation must use the strict `@mcp-b/webmcp-polyfill`
runtime and the `document.modelContext` producer surface:

```ts
const tools = await document.modelContext.getTools();
const resultJson = await document.modelContext.executeTool(tool, JSON.stringify(args));
```

Image values are direct WebMCP tool results. They are not MCP `content` blocks,
and the E2E suite must not use an MCP client such as `window.mcpClient`.

## Non-Negotiables

- Use `document.modelContext` as the producer API in new tests and examples.
  Treat `navigator.modelContext` as a compatibility alias only.
- Prove behavior through Playwright E2E tests.
- Run the same contract against:
  - the polyfill/runtime path
  - regular Chromium/Chrome without WebMCP native support, where the polyfill is
    expected to install
  - custom Chromium builds with native WebMCP enabled and the polyfill disabled
- Prefer Web APIs for image conversion. Reach for dependencies only when a Web
  API cannot do the job in browser E2E.
- Start with direct serialized WebMCP image values:
  `{ type: "image", data: string, mimeType: string }`.
- Add browser-source ergonomics after the serialized contract is green.
- Keep each TDD cycle vertical: one failing E2E behavior, minimal implementation,
  then refactor while green.

## Desired Contract

### Stable Serialized Image Value

The first stable image shape is a direct WebMCP tool result:

```ts
type SerializedImageValue = {
  type: 'image';
  data: string;
  mimeType: string;
};
```

`data` is base64 without a `data:` URL prefix. `mimeType` is an explicit MIME
type such as `image/png`. This is not wrapped in an MCP `content` array.

This shape should work in both directions:

- tool output can return serialized image values directly
- tool input can receive serialized image values as ordinary JSON-like arguments

### Browser-Source Image Output

Once serialized image blocks pass, add browser-source output forms. Proposed
minimum set:

```ts
type BrowserImageOutput =
  | { type: 'image'; data: string; mimeType: string }
  | { type: 'image'; value: Blob | HTMLImageElement | HTMLCanvasElement; mimeType?: string };
// The {type, value} source shape mirrors the Prompt API's
// LanguageModelToolResultContent.
```

Defer `ImageBitmap`, `ImageData`, `SVGImageElement`, `HTMLVideoElement`, and
`BufferSource` until the core path is green. The type surface can be designed so
they fit later, but do not implement them speculatively.

### Browser-Source Image Input

Input should start serialized. Browser-source input is a later phase because
callers pass arguments through JSON-string execution surfaces today:

```ts
await document.modelContext.executeTool(
  tool,
  JSON.stringify({
    image: { type: 'image', data, mimeType: 'image/png' },
  })
);
```

Native browser object input can be explored after Chromium has a real non-string
input path or after the spec defines one.

## Test Harness Direction

Reuse the existing runtime contract harness:

- `e2e/runtime-contract/core.js`
- `e2e/runtime-contract/browser-contract.js`
- `e2e/test-app/src/runtime-contract.ts`
- `e2e/tests/runtime-contract.helpers.ts`
- `e2e/tests/runtime-contract-tab.spec.ts`
- `e2e/tests/runtime-contract-native.spec.ts`

Add a new focused suite rather than expanding the existing text-only contract
files too much:

- `e2e/tests/runtime-contract-image-values.spec.ts`

Add image-specific helpers only when the first test needs them:

- `imageToolNames`
- `registerImageToolsInPage(page)`
- `executeDocumentImageTool(...)`
- `expectSerializedImageValue(...)`

Keep helpers behavior-oriented. They should not mirror implementation internals.

## Required Harness Cleanup Before Image Tests

The current runtime contract harness still often starts from
`navigator.modelContext`. Before adding image tests, switch new image setup to
`document.modelContext`.

Recommended approach:

1. Update `installBrowserRuntimeContract` call sites to pass
   `document.modelContext`.
2. Update error messages from `navigator.modelContext` to
   `document.modelContext` where the code is testing the primary producer API.
3. Keep compatibility assertions that `navigator.modelContext` aliases
   `document.modelContext` in native-transition tests.
4. Do not remove existing `navigator` compatibility tests in the same change.

This should be its own small green change before image behavior begins.

## Browser Modes

### Polyfill Mode

Use the existing app import:

```ts
import { initializeWebMCPPolyfill } from '@mcp-b/webmcp-polyfill';

initializeWebMCPPolyfill();
```

This mode should run on ordinary Playwright Chromium. Because regular Chromium
does not expose native `document.modelContext`, the strict WebMCP polyfill
installs the producer API.

Command shape:

```sh
pnpm --filter mcp-e2e-tests exec playwright test \
  tests/runtime-contract-image-values.spec.ts
```

### Chrome/Chromium With Polyfill Fallback

Use the same test suite on a specific installed browser or executable path:

```sh
PLAYWRIGHT_CHROMIUM_CHANNEL=chrome pnpm --filter mcp-e2e-tests exec playwright test \
  tests/runtime-contract-image-values.spec.ts
```

or:

```sh
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/path/to/chrome pnpm --filter mcp-e2e-tests exec playwright test \
  tests/runtime-contract-image-values.spec.ts
```

The expected behavior is still polyfill-backed unless native WebMCP exists and
the global package is configured not to wrap it.

### Native Custom Chromium Mode

For the later C++ implementation, run the same image contract against a custom
Chromium build with native flags enabled and the polyfill disabled for the page
under test.

Add a dedicated config during implementation:

- `e2e/playwright-webmcp-image-native.config.ts`

Expected command shape:

```sh
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/path/to/chromium/out/Default/Chromium.app/Contents/MacOS/Chromium \
PLAYWRIGHT_ENABLE_WEBMCP_FLAGS=1 \
WEBMCP_E2E_RUNTIME=native \
pnpm --filter mcp-e2e-tests exec playwright test \
  --config=e2e/playwright-webmcp-image-native.config.ts
```

The native config should:

- launch with `--enable-experimental-web-platform-features`
- launch with `--enable-features=WebMCPTesting,DevToolsWebMCPSupport` if still
  required by that Chromium revision
- avoid importing any polyfill or bridge runtime on the image-native test page
- fail fast if `document.modelContext.getTools` or
  `document.modelContext.executeTool` is missing

## Test Page Strategy

The current `runtime-contract.html` imports `@mcp-b/global`, which is a bridge
runtime and is not the right API surface for this WebMCP image work. Add an
image-specific test page pair so the polyfill mode can use
`@mcp-b/webmcp-polyfill` and native mode can avoid any runtime wrapper:

- `e2e/test-app/runtime-contract-image-polyfill.html`
- `e2e/test-app/runtime-contract-image-native.html`
- `e2e/test-app/src/runtime-contract-image-polyfill.ts`
- `e2e/test-app/src/runtime-contract-image-native.ts`

Both pages should install the same image tools through a shared browser module:

- `e2e/runtime-contract/image-contract.js`

The shared module should accept a `ModelContext` argument and should never import
`@mcp-b/global`. The polyfill page imports `@mcp-b/webmcp-polyfill` before
calling the shared module; the native page does not.

This keeps the conformance suite honest: the tests can choose the runtime by
page URL rather than relying on runtime conditionals hidden inside the page.

## Fixtures

Use tiny deterministic images that are easy to assert:

- `one_by_one_png`: a 1x1 PNG base64 string
- `two_by_one_png`: a 2x1 PNG base64 string with two known pixels
- optional later fixture: a same-origin static PNG served from
  `e2e/test-app/public/`

Store textual fixtures in code first. Add binary files only when testing
`HTMLImageElement` loading or same-origin canvas draw behavior.

The first fixture should be small enough to inline in
`e2e/runtime-contract/image-contract.js` so tests do not depend on network timing
or asset loading.

## Vertical TDD Slices

### Slice 0: Document API Harness

Failing E2E behavior:

- a test page registers a text tool through `document.modelContext`
- `document.modelContext.getTools()` can discover it
- `document.modelContext.executeTool(...)` can execute it

Minimal implementation:

- make the image-contract harness use `document.modelContext`
- keep old runtime-contract pages working

Acceptance:

- the new image contract page reaches `data-status="ready"`
- a text smoke tool runs through `document.modelContext.executeTool(...)`

### Slice 1: Serialized Image Output Through `document.modelContext.executeTool`

Failing E2E behavior:

- page registers `get_serialized_png`
- tool returns:

```js
{
  type: "image",
  data: ONE_BY_ONE_PNG_BASE64,
  mimeType: "image/png"
}
```

- Playwright discovers the registered tool with `document.modelContext.getTools()`
- Playwright calls the tool through `document.modelContext.executeTool(tool, "{}")`
- test parses the returned string and asserts the direct image value exactly
  matches the fixture

Minimal implementation:

- preserve direct serialized image values through producer execution

Acceptance:

- polyfill mode passes on ordinary Playwright Chromium
- no browser-source conversion exists yet

### Slice 2: Serialized Image Input

Failing E2E behavior:

- page registers `describe_input_image`
- test passes:

```js
{
  image: { type: "image", data: ONE_BY_ONE_PNG_BASE64, mimeType: "image/png" }
}
```

- tool returns direct JSON metadata describing the received image:
  `{ inputType: "image", mimeType: "image/png", dataLength: N }`

Minimal implementation:

- ensure JSON-string arguments survive unchanged into `execute`
- do not add binary/browser object input yet

Acceptance:

- invocation log records the image value shape without lossy conversion
- returned metadata matches the fixture

### Slice 3: Blob Image Output

Failing E2E behavior:

- page registers `get_blob_png`
- tool creates a `Blob` from fixture bytes using Web APIs
- tool returns `{ type: "image", blob }`
- caller receives serialized `{ type, data, mimeType }`

Minimal implementation:

- use `Blob.arrayBuffer()`
- convert bytes to base64 with browser APIs
- infer `mimeType` from `blob.type`; require explicit `mimeType` if absent

Acceptance:

- no Node-only APIs in browser code
- result equals fixture base64 and `image/png`

### Slice 4: Canvas Image Output

Failing E2E behavior:

- page registers `get_canvas_png`
- tool paints a deterministic canvas
- tool returns `{ type: "image", value: canvas }`
- caller receives a direct serialized PNG image value

Minimal implementation:

- use `HTMLCanvasElement.toBlob()`
- reject null blob results with a clear tool execution error
- default canvas output MIME to `image/png`

Acceptance:

- returned value is `image/png`
- test verifies it is a valid PNG, not necessarily byte-identical across browser
  encoders unless the fixture path is deterministic enough

### Slice 5: Image Element Output

Failing E2E behavior:

- page loads a same-origin PNG into `<img>`
- tool returns `{ type: "image", value: img }`
- caller receives a direct serialized image value

Minimal implementation:

- draw same-origin image to a canvas
- serialize canvas to PNG
- reject incomplete image elements

Acceptance:

- same-origin image element passes
- missing/unloaded image element produces a clear error

### Slice 6: Error Semantics

Failing E2E behavior:

- unsupported image source fails predictably
- tainted canvas or cross-origin image conversion fails predictably
- missing `mimeType` for raw `data` fails if the serialized shape cannot be
  trusted

Minimal implementation:

- centralize browser image normalization behind one narrow function
- preserve existing thrown-tool error propagation behavior

Acceptance:

- test assertions match user-visible error class/message shape already used by
  the runtime, not internal function names

## Conformance Matrix

| Behavior                                                             | Polyfill Chromium | Regular Chrome fallback | Native custom Chromium                  |
| -------------------------------------------------------------------- | ----------------- | ----------------------- | --------------------------------------- |
| Register via `document.modelContext.registerTool`                    | Required          | Required                | Required                                |
| Discover image tool                                                  | Required          | Required                | Required                                |
| `document.modelContext.executeTool` receives serialized image output | Required          | Required                | Required                                |
| Serialized image input reaches tool `execute`                        | Required          | Required                | Required                                |
| Blob output converts to serialized image value                       | Required          | Required                | Optional until spec text exists         |
| Canvas output converts to serialized image value                     | Required          | Required                | Optional until spec text exists         |
| Image element output converts to serialized image value              | Required          | Required                | Optional until spec text exists         |
| Cross-origin/tainted conversion error                                | Required          | Required                | Required if browser-source output ships |

Native optional items should be marked with explicit `test.skip` conditions tied
to runtime capability detection, not broad browser-name skips.

## Expected Implementation Areas

Do not edit all of these in one pass. They are the likely files the future agent
will touch as each failing E2E test demands it.

Polyfill/runtime:

- `packages/webmcp-polyfill/src/index.ts`
- `packages/webmcp-ts-sdk/src/browser-server.ts`
- `packages/webmcp-types/src/common.ts`
- `packages/webmcp-types/src/tool.ts`
- `packages/webmcp-types/src/model-context.ts`

E2E:

- `e2e/runtime-contract/image-contract.js`
- `e2e/test-app/runtime-contract-image-polyfill.html`
- `e2e/test-app/runtime-contract-image-native.html`
- `e2e/test-app/src/runtime-contract-image-polyfill.ts`
- `e2e/test-app/src/runtime-contract-image-native.ts`
- `e2e/tests/runtime-contract-image-values.spec.ts`
- `e2e/tests/runtime-contract.helpers.ts`
- `e2e/playwright-webmcp-image-native.config.ts`
- `e2e/package.json`

Chromium later:

- `third_party/blink/renderer/core/script_tools/model_context.idl`
- `third_party/blink/renderer/core/script_tools/model_context_tool.idl`
- `third_party/blink/renderer/core/script_tools/model_context_testing.idl`
- `third_party/blink/renderer/core/script_tools/model_context.cc`
- `third_party/blink/renderer/core/script_tools/model_context_testing.cc`
- `third_party/blink/public/mojom/content_extraction/script_tools.mojom`
- `third_party/blink/renderer/core/script_tools/model_context_test.cc`

## Web API Preference

Use Web APIs in browser code:

- `Blob.arrayBuffer()`
- `FileReader` only if needed for older runtime compatibility
- `HTMLCanvasElement.toBlob()`
- `CanvasRenderingContext2D.drawImage(...)`
- `Uint8Array`
- `btoa(...)` for byte-to-base64 conversion after converting bytes to a binary
  string in chunks

Avoid:

- Node `Buffer` in browser-executed code
- hand-written PNG encoders
- custom MIME sniffing beyond simple required-field checks and `blob.type`

If conversion complexity grows, isolate it behind a small `normalizeImageValue`
module and keep the public accepted shapes narrow.

## Suggested Test Helper Semantics

The test helper should normalize the producer execution boundary:

- discover by `document.modelContext.getTools()`
- execute by `document.modelContext.executeTool(tool, JSON.stringify(args))`
- parse non-null string results as direct WebMCP values
- preserve `null`/error result behavior

Example helper contract:

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

Keep assertions in tests:

```ts
expect(result).toEqual({
  type: 'image',
  data: ONE_BY_ONE_PNG_BASE64,
  mimeType: 'image/png',
});
```

Do not test private normalization functions from Playwright.

## Definition Of Done For Polyfill Phase

- `runtime-contract-image-values.spec.ts` passes in ordinary Playwright
  Chromium.
- The same spec passes when targeting installed Chrome through
  `PLAYWRIGHT_CHROMIUM_CHANNEL=chrome` or an executable path.
- New image behavior uses `document.modelContext` for registration and producer
  execution.
- Existing text runtime-contract suites still pass.
- No unit tests were added for image support.
- Image output returned through `document.modelContext.executeTool` has the
  direct serialized WebMCP value shape.
- Unsupported browser-source image values fail with clear E2E-covered errors.

## Definition Of Done For Native Chromium Phase

- A clean Chromium worktree exists separate from the dirty streaming branch.
- The same Playwright image contract runs with the polyfill disabled.
- Native `document.modelContext` exposes the image behavior under test.
- Native `document.modelContext.getTools()` and
  `document.modelContext.executeTool(...)` can discover and execute the
  image-producing tools.
- Any optional browser-source ergonomics are either implemented natively or
  skipped by capability detection with a linked issue.
- The Chromium CR links to the WebMCP issue and this repo's passing conformance
  suite.

## First Implementation Prompt

Use this prompt for the next coding agent:

> Implement Slice 0 and Slice 1 from
> `docs/plans/WEBMCP_IMAGE_TOOL_CONTENT_TDD_PLAN.md` using the strict
> `@mcp-b/webmcp-polyfill` runtime. Do not use MCP clients, `@mcp-b/global`, or
> MCP `content` arrays. Add only Playwright E2E coverage. Use
> `document.modelContext` for registration, discovery, and execution. Make the
> first serialized direct `{ type: "image", data, mimeType }` output test pass
> through the polyfill runtime path, then run that E2E spec and the existing
> runtime-contract spec.
