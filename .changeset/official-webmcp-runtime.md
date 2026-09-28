---
'@mcp-b/webmcp-polyfill': major
---

**Breaking: replace the MCP-B core implementation with the upstream WebMCP polyfill.**
This package vendors [upstream revision `439c6c3`](https://github.com/webmachinelearning/webmcp-polyfill/tree/439c6c341f1c632c63498ba206e2bd8471cb8efb)
and uses `webmcp-types@^0.1.9` for the browser contract.

The existing package name remains available as a temporary compatibility alias.
It will eventually be removed; no removal date is set. Follow the
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
automatically. An ESM import alone does not install the polyfill.

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
  to text. Catch execution failures; error names/messages follow upstream.
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
| Declarative forms, `SubmitEvent.agentInvoked`, or `respondWith()`                             | Install and import `@mcp-b/global` in the browser entry.                                    |
| MCP `outputSchema`, prompts, resources, or transports                                         | Use `@mcp-b/global`, or configure `BrowserMcpServer` from `@mcp-b/webmcp-ts-sdk`.           |
| `@mcp-b/webmcp-polyfill/schema`                                                               | Import schema conversion and MCP response helpers from `@mcp-b/webmcp-ts-sdk/schema`.       |
| Legacy Chrome input/result parsing, error factories, or browser-access helpers from `/schema` | Remove them; the upstream context owns browser execution, serialization, and access checks. |

`cleanupWebModelContext()` from `@mcp-b/global` removes its extensions and restores
the underlying context; it does not uninstall the core polyfill.

If you use `withAbortSignal` from the new schema entry, pass an explicit signal
and remove the former third `getAbortReason` argument. Await the operation directly
when you have no signal.

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
