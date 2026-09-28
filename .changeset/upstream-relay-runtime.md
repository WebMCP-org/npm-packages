---
'@mcp-b/webmcp-local-relay': major
---

**Breaking: the browser embed now requires the upstream document WebMCP contract.**
Upgrade the page runtime, relay package, and hosted `embed.js`/widget assets
together. Keep the existing CLI flags, MCP client configuration, and embed
`data-*` options.

The page must provide `document.modelContext.getTools()` and
`executeTool(tool, inputObject)`. Install `@mcp-b/global` before the embed when you
need MCP-B extensions, or initialize the upstream core polyfill for standard tools.
The embed does not install the page runtime itself.

If you supply a custom runtime or test double:

- Return discovery schemas as objects, not JSON strings. Malformed schemas are
  omitted from relay discovery.
- Accept an input object in `executeTool()`, and return JSON-serialized output.
  Native declarative forms may also return plain text; the relay converts both
  formats to MCP responses. Bare `null` results are no longer adapted, and
  execution failures must reject.
- Use `document.modelContext`; update older browser previews that implement a
  different contract. Polyfill installation preserves an existing native context.

Tool updates received during discovery or reconnection are now retained. A stale
initial tool list no longer overwrites newer registrations, so tools added while
the relay is reconnecting remain available after the connection is restored.
The existing page-to-widget bridge remains in use.

Programmatic `LocalRelayMcpServer` construction also accepts `launchBrowser` to
override the platform browser launcher in embedded applications and tests; the
default behavior is unchanged.
