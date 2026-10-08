---
'@mcp-b/webmcp-polyfill': major
---

**Breaking: replace the MCP-B core implementation with the upstream WebMCP polyfill.**
Declarative tools remain available until upstream supports them.
This package vendors [upstream revision `6bf6c57`](https://github.com/webmachinelearning/webmcp-polyfill/tree/6bf6c57bbaf3d1173d7737cfb79572632d9b7871)
and uses `webmcp-types@0.1.9` for the browser contract.

The existing package name remains available as a temporary compatibility alias.
It will eventually be removed; no removal date is set. Sites using declarative
tools should keep it until the upstream polyfill supports them. Follow the
[official upstream installation instructions](https://github.com/webmachinelearning/webmcp-polyfill#readme)
when migrating to its distribution. Until that release is available, keep using
`@mcp-b/webmcp-polyfill` with the changes below.

### Replace initialization and cleanup

```diff
- import { initializeWebMCPPolyfill } from '@mcp-b/webmcp-polyfill';
- initializeWebMCPPolyfill({ installTestingShim: true });
+ import { installWebMCP } from '@mcp-b/webmcp-polyfill';
+ installWebMCP();
```

`installWebMCP()` takes no options. Remove imports of `WebMCPPolyfillInitOptions`
and calls to `cleanupWebMCPPolyfill()`: the upstream context lives for the lifetime
of the document. To remove tools, pass an `AbortController`'s signal to
`registerTool(tool, { signal })` and abort that controller during cleanup. Tests
that need a completely fresh runtime should create a new page or document realm.

The `@mcp-b/webmcp-polyfill/iife` export and `dist/index.iife.js` script still install
automatically. The script's global is now `WebMCPPolyfill.installWebMCP` (formerly
`WebMCPPolyfill.initializeWebMCPPolyfill`), and it ignores
`window.__webMCPPolyfillOptions`; remove that assignment. An ESM import alone does
not install the polyfill. Pin the major in CDN URLs (`@mcp-b/webmcp-polyfill@6`);
pages that are not ready to migrate pin `@5` instead of `@latest`.

### Use the document API and object input

`navigator.modelContext`, `navigator.modelContextTesting`, and the testing shim
are removed. Replace name-based testing calls and JSON-string arguments with a
descriptor from `getTools()` and an input object:

```diff
- const result = await navigator.modelContextTesting.executeTool('search', JSON.stringify({ query: 'docs' }));
+ const context = document.modelContext;
+ if (!context) throw new Error('WebMCP is unavailable');
+ const tool = (await context.getTools()).find((tool) => tool.name === 'search');
+ if (!tool) throw new Error('Search tool is unavailable');
+ const result = JSON.parse(await context.executeTool(tool, { query: 'docs' }));
```

- `executeTool()` resolves to a JSON string. Parse it once, including when the
  callback returns a string or `null`. The former unquoted-string and bare-`null`
  compatibility paths are gone.
- Return JSON-serializable values from callbacks. `undefined`, functions, cyclic
  objects, and other non-serializable results now reject instead of falling back
  to text.
- Every failed invocation rejects with `UnknownError: Tool execution failed`.
  The upstream core does not forward the reason a callback threw or rejected,
  so the former validation and execution messages are gone. Tools registered
  through `@mcp-b/global` or `BrowserMcpServer` that need to report details
  should return an error-flagged MCP result (`isError: true`) instead of throwing.
- `RegisteredTool.inputSchema` is an object when present. Remove branches that
  parse a serialized schema. Use `tool.title || tool.name` for display labels.
- Input schemas provide metadata and TypeScript inference, not runtime argument
  validation. Validate untrusted input in the callback.
- Registration signals remove tools. Use the separate
  `executeTool(tool, input, { signal })` signal to cancel an invocation, and pass
  the callback's `(input, { signal })` signal to cancellable work.

### Move MCP-B extensions to their packages

| Previous use of the core package                                                              | Migration                                                                                   |
| --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Declarative tools, `SubmitEvent.agentInvoked`, or `respondWith()`                             | Keep using this package until upstream declarative support is available.                    |
| MCP `outputSchema`, prompts, resources, or transports                                         | Use `@mcp-b/global`, or configure `BrowserMcpServer` from `@mcp-b/webmcp-ts-sdk`.           |
| `@mcp-b/webmcp-polyfill/schema`                                                               | Import schema conversion and MCP response helpers from `@mcp-b/webmcp-ts-sdk/schema`.       |
| Legacy Chrome input/result parsing, error factories, or browser-access helpers from `/schema` | Remove them; the upstream context owns browser execution, serialization, and access checks. |

`cleanupWebModelContext()` from `@mcp-b/global` removes its extensions and restores
the underlying context; it does not uninstall the core polyfill or its declarative layer.

`withAbortSignal` is removed; pass the execute callback's `signal` to cancellable
work instead.

### Update declarative tool code

- Declarative results are JSON strings like every other `executeTool()` result.
  A string passed to `respondWith()` arrived as plain text, as in Chrome; parse it now:

  ```diff
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      event.respondWith?.(Promise.resolve('sent'));
    });
  - const text = await context.executeTool(tool, {});
  + const text = JSON.parse(await context.executeTool(tool, {}));
  ```

- A submission that never calls `respondWith()`, or a `respondWith()` value of
  `undefined`, resolves as `null`.
- `toolactivated` fires on `document.modelContext` instead of `window`, and
  aborting the `executeTool()` signal cancels the pending call and fires
  `toolcancel` there. Both are plain `Event` instances with a `toolName` property;
  this package does not define `ToolActivatedEvent` or `ToolCancelEvent`.

  ```diff
  - window.addEventListener('toolactivated', (event) => {
  + document.modelContext?.addEventListener('toolactivated', (event) => {
      console.log(event);
    });
  ```

- Validation failures, unknown or invalid parameters, a missing submit button, and
  rejected responses reject with the generic error described above.

### Pin webmcp-types to 0.1.9

This package depends on `webmcp-types@0.1.9` exactly. `webmcp-types@0.1.10` adds
required `ontoolactivated` and `ontoolcancel` members plus `ToolActivatedEvent`
and `ToolCancelEvent` globals that the vendored core does not implement, so a
project that also depends on `webmcp-types` must pin the same version until the
runtime catches up:

```bash
pnpm add webmcp-types@0.1.9
```

### Check the browser baseline

`installWebMCP()` returns without defining `document.modelContext` on engines that
lack an API the vendored core calls, so `if (!document.modelContext)` remains the
feature check. The 5.x polyfill had no such floor.

| API                             | Chrome | Firefox | Safari |
| ------------------------------- | ------ | ------- | ------ |
| `String.prototype.toWellFormed` | 111    | 119     | 16.4   |
| `AbortSignal.any()`             | 116    | 124     | 17.4   |
| `Promise.withResolvers()`       | 119    | 121     | 17.4   |
| `URL.parse()`                   | 126    | 126     | 18     |

### Check browser and frame setup

Use a secure page (HTTPS or localhost). Installation preserves existing contexts,
including partial native implementations; it does not upgrade older browser
previews with JSON-string execution. Your browser or supplied context must support
the object-input contract above.

Load the polyfill in every participating frame. Same-origin discovery includes
parents and siblings, so tools can share a name across frames: select the intended
`window`/`origin` and pass the discovered descriptor back to `executeTool()`.
For cross-origin tools, configure the iframe's `tools` permission, the registering
tool's `exposedTo`, and the caller's `getTools({ fromOrigins })`. The vendored
runtime rejects opaque and extension-scheme exposure origins; do not remove origin
restrictions to work around that rejection. See the
[upstream frame setup](https://github.com/webmachinelearning/webmcp-polyfill#frames).
