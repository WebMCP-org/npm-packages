---
'@mcp-b/webmcp-local-relay': major
---

**Breaking: the browser embed now requires the upstream document WebMCP contract.**
Upgrade the page runtime, relay package, and hosted `embed.js`/widget assets
together, and pin the major version in CDN URLs so a later major never loads
under an older page runtime. Pages that stay on a 5.x runtime pin `@5` for both
scripts. Keep the existing CLI flags, MCP client configuration, and embed
`data-*` options.

```html
<!-- Before -->
<script src="https://cdn.jsdelivr.net/npm/@mcp-b/global@latest/dist/index.iife.js"></script>
<script src="https://cdn.jsdelivr.net/npm/@mcp-b/webmcp-local-relay@latest/dist/browser/embed.js"></script>

<!-- After -->
<script src="https://cdn.jsdelivr.net/npm/@mcp-b/global@6/dist/index.iife.js"></script>
<script src="https://cdn.jsdelivr.net/npm/@mcp-b/webmcp-local-relay@6/dist/browser/embed.js"></script>
```

The page must provide `document.modelContext.getTools()` and
`executeTool(tool, inputObject)`. Install `@mcp-b/global` before the embed when you
need MCP-B extensions, or initialize the upstream core polyfill for standard tools.
The embed does not install the page runtime itself.

The embed relays the page's own tools plus the tools that same-origin descendant
frames register, as returned by `getTools()`; 5.x relayed only the page's own
tools. When several frames register the same name, the embed relays and invokes
the page's own tool (otherwise the first one returned) and logs one warning per
name.

Tool results reach the agent as follows:

- A result that parses to a JSON object becomes structured content, and an MCP
  result object passes through unchanged.
- A JSON string arrives as its content, so a tool that returns `done` sends the
  text `done`. Any other result keeps its original text: a declarative tool
  that responds `10.50` stays `10.50` instead of `10.5`.
- Under the upstream polyfill core, standalone or through `@mcp-b/global`, a
  tool that throws arrives as an error result with the text
  `Tool execution failed`; the reason is not forwarded. Return
  `{ content: [...], isError: true }` when the agent needs the details.

If you supply a custom runtime or test double:

- Return discovery schemas as objects, not JSON strings. Malformed schemas are
  omitted from relay discovery.
- Accept an input object in `executeTool()`, and return JSON-serialized output.
  Native declarative tools may also return plain text. Execution failures must
  reject; a `null` result now reaches the agent as the text `null` instead of an
  interrupted-navigation error.
- Use `document.modelContext`; update older browser previews that implement a
  different contract. Polyfill installation preserves an existing native context.

Tool updates received during discovery or reconnection are now retained. A stale
initial tool list no longer overwrites newer registrations, so tools added while
the relay is reconnecting remain available after the connection is restored.

The embed now passes the page title to the widget verbatim, so a title that
contains `</script>` or a `$'` sequence no longer breaks the widget or runs as a
script inside it. The widget also connects when the browser blocks
`sessionStorage`.

Programmatic `LocalRelayMcpServer` construction also accepts `launchBrowser` to
override the platform browser launcher in embedded applications and tests; the
default behavior is unchanged.
