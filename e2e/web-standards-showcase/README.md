# Native Chromium WebMCP showcase

This app exercises the current native WebMCP surface in Chrome without loading
an MCP-B runtime or polyfill. It uses `document.modelContext` for registration
and discovery, and it feature-detects Chrome's optional `executeTool()`
extension.

The authoritative API definition lives in the
[WebMCP specification](https://webmachinelearning.github.io/webmcp/). For
Chrome's preview status and enrollment details, see the
[Chrome WebMCP early preview](https://developer.chrome.com/blog/webmcp-epp).
The
[Model Context Tool Inspector](https://chromewebstore.google.com/detail/model-context-tool-inspec/gbpdfapgefenggkahomfgkhfehlcenpd)
can inspect tools exposed by a page.

## What the showcase covers

- Dynamic tool registration through `document.modelContext.registerTool()`
- Asynchronous discovery through `document.modelContext.getTools()`
- Cleanup of showcase-owned registrations through `AbortSignal`
- Descriptor-based execution when Chrome exposes `executeTool()`
- Native `toolchange` events
- Same-origin parent and iframe contexts
- A live editor and generated forms for tool inputs

The app does not load `@mcp-b/global`, and it rejects contexts carrying the
MCP-B polyfill marker. It does not depend on the deprecated
`navigator.modelContext` alias or the removed `navigator.modelContextTesting`
API.

## Requirements

- Chrome Canary or Dev 152 or newer
- Node.js 22.12 or newer
- pnpm

The dedicated Playwright configuration chooses an installed Chrome 152+ binary.
Override the selection with `CHROME_BIN` or
`PLAYWRIGHT_NATIVE_SHOWCASE_EXECUTABLE_PATH`.

## Run the showcase

From the repository root:

```bash
pnpm --dir e2e/web-standards-showcase dev
```

Open `http://localhost:5174` in Chrome launched with the flags documented in
[CHROMIUM_FLAGS.md](./CHROMIUM_FLAGS.md).

## Current API patterns

### Register and clean up a tool

WebMCP ties registration cleanup to an `AbortSignal`. Keep the controller for
every registration you own.

```javascript
const controller = new AbortController();

await document.modelContext.registerTool(
  {
    name: 'counter_increment',
    description: 'Increment a counter',
    inputSchema: {
      type: 'object',
      properties: {
        amount: { type: 'number' },
      },
      required: ['amount'],
    },
    async execute({ amount }) {
      return `Incremented by ${amount}`;
    },
  },
  { signal: controller.signal }
);

// Remove this registration later.
controller.abort();
```

The showcase's Bucket A and Bucket B labels describe local groups of
controllers. They are not browser API buckets.

### Discover registered descriptors

`getTools()` is asynchronous and returns registered descriptors. Each descriptor
includes browser-owned fields such as `window` and `origin`.

```javascript
const tools = await document.modelContext.getTools();
const counterTool = tools.find((tool) => tool.name === 'counter_increment');
```

### Execute a discovered descriptor

Chrome's current preview may expose `executeTool()` on
`document.modelContext`. The method is not part of the strict WebMCP core, so
feature-detect it. Pass a descriptor returned by `getTools()`, not a tool name.

```javascript
const context = document.modelContext;
const executeTool = context.executeTool;

if (typeof executeTool === 'function') {
  const tool = (await context.getTools()).find(
    (candidate) => candidate.name === 'counter_increment'
  );

  if (tool) {
    const result = await executeTool.call(context, tool, JSON.stringify({ amount: 2 }));
    console.log(result);
  }
}
```

## Removed preview APIs

The showcase does not emulate removed native methods.

| Removed preview API                                      | Current approach                                                                       |
| -------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `navigator.modelContext`                                 | Use `document.modelContext`.                                                           |
| `navigator.modelContextTesting.listTools()`              | Await `document.modelContext.getTools()`.                                              |
| `navigator.modelContextTesting.executeTool(name, input)` | Feature-detect `document.modelContext.executeTool()` and pass a discovered descriptor. |
| `unregisterTool(name)`                                   | Abort the signal retained for a registration you own.                                  |
| `clearContext()`                                         | Abort each locally retained controller. WebMCP has no global clear operation.          |
| `provideContext()`                                       | Register the desired tools and manage their controllers as a local group.              |

Testing call logs, mock responses, and whole-context reset controls have no
current WebMCP replacement. The separate
`tests/chromium-native-api.spec.ts` lane intentionally tests MCP-B compatibility
shims for those older integrations; it is not native conformance coverage.

MCP `outputSchema` and `structuredContent` are also outside the strict WebMCP
core. The showcase's structured-result template returns an ordinary structured
value without claiming native output-schema support.

## Run tests

From `e2e/`:

```bash
pnpm test:native-showcase
pnpm test:native-showcase:headed
pnpm test:native-showcase:ui
pnpm test:native-showcase:debug
```

The native suite captures `document.modelContext` before application code runs.
It then verifies:

- the document-owned native surface
- `getTools()` discovery
- AbortSignal registration cleanup
- descriptor-based execution when `executeTool()` exists
- live-editor registration
- iframe lifecycle behavior

## Build and type-check

From the repository root:

```bash
pnpm --filter web-standards-showcase typecheck
pnpm --filter web-standards-showcase build
```

## Source map

```text
e2e/web-standards-showcase/
├── index.html
├── iframe-test.html
├── src/
│   ├── api/detection.ts
│   ├── examples/templates.ts
│   ├── iframe-main.ts
│   ├── lib/utils.ts
│   └── main.ts
├── CHROMIUM_FLAGS.md
└── package.json
```

`src/lib/utils.ts` retains AbortControllers for showcase-owned registrations.
It does not add methods to the native context.
