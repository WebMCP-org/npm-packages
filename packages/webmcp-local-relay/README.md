# WebMCP Local Relay

[![npm version](https://img.shields.io/npm/v/@mcp-b/webmcp-local-relay?style=flat-square)](https://www.npmjs.com/package/@mcp-b/webmcp-local-relay)

Use WebMCP tools from any website, right inside your AI client.

```text
 Browser Tab                          Local Machine
┌──────────────────────┐             ┌──────────────────────┐
│                      │  WebSocket  │                      │
│   Website with       ├────────────▶  webmcp-local-relay   │
│   WebMCP tools       │  localhost  │   (MCP server)       │
│                      │             │                      │
└──────────────────────┘             └──────────┬───────────┘
                                                │
                                          stdio │ JSON-RPC
                                                │
                                     ┌──────────▼───────────┐
                                     │                      │
                                     │   Claude / Cursor /  │
                                     │   any MCP client     │
                                     │                      │
                                     └──────────────────────┘
```

Open a website that has WebMCP tools. Run the relay. The tools show up in your MCP client.

## Install

```json
{
  "mcpServers": {
    "webmcp-local-relay": {
      "command": "npx",
      "args": ["-y", "@mcp-b/webmcp-local-relay@latest"]
    }
  }
}
```

Add this to your MCP client config — works with Claude Desktop, Cursor, Windsurf, Claude Code, or anything that speaks MCP.

## Use

Once connected, your AI client can see and call tools from any open browser tab that supports WebMCP:

1. `webmcp_list_sources` — see which tabs are connected
2. `webmcp_list_tools` — see all available tools
3. Call any tool directly by name (e.g., `create_issue`, `search_docs`)

Tools appear and disappear automatically as you open, reload, and close tabs.
Tools that require MCP task execution are omitted, and multi-round `input_required` results return an error.

## For Website Owners

Add one script tag to expose your page's WebMCP tools to the relay:

```html
<script src="https://cdn.jsdelivr.net/npm/@mcp-b/webmcp-local-relay@latest/dist/browser/embed.js"></script>
```

That's it. If your page already registers tools on `document.modelContext`, they'll be picked up automatically.

New to WebMCP? Here's the full setup:

```html
<script src="https://cdn.jsdelivr.net/npm/@mcp-b/global@latest/dist/index.iife.js"></script>
<script>
  void document.modelContext
    .registerTool({
      name: 'get_page_title',
      description: 'Get the current page title',
      inputSchema: { type: 'object', properties: {} },
      execute: async () => ({ content: [{ type: 'text', text: document.title }] }),
    })
    .catch(console.error);
</script>
<script src="https://cdn.jsdelivr.net/npm/@mcp-b/webmcp-local-relay@latest/dist/browser/embed.js"></script>
```

Custom relay port:

```html
<script
  src="https://cdn.jsdelivr.net/npm/@mcp-b/webmcp-local-relay@latest/dist/browser/embed.js"
  data-relay-port="9444"
></script>
```

Increase the per-request timeout (default `60000` ms) for tools that chain
several slow API calls and might exceed one minute:

```html
<script
  src="https://cdn.jsdelivr.net/npm/@mcp-b/webmcp-local-relay@latest/dist/browser/embed.js"
  data-request-timeout="120000"
></script>
```

The relay allows `65000` ms by default. If the page timeout is higher, start the
relay with a slightly larger limit, for example `--invoke-timeout 125000` for
the `120000` ms page setting above.

Tool registration references:

- [`@mcp-b/global` quick start and `registerTool`](https://docs.mcp-b.ai/packages/global/reference)
- [WebMCP specification for `registerTool`](https://webmachinelearning.github.io/webmcp/)

---

## Reference

### Other Install Methods

The JSON config above works for most clients. Here are additional options:

**Claude Desktop (MCPB bundle)** — download the `.mcpb` file from [GitHub Releases](https://github.com/WebMCP-org/npm-packages/releases) and double-click to install. It starts with the zero-configuration defaults: loopback, automatic port discovery, and all page origins allowed. No terminal is needed.

**Direct CLI** — run the relay standalone:

```bash
npx @mcp-b/webmcp-local-relay
```

### Exposed Tools

The relay exposes three static management tools that are always available:

| Tool                  | Description                                                                         |
| --------------------- | ----------------------------------------------------------------------------------- |
| `webmcp_list_sources` | Lists connected browser tabs that publish tools, with tab metadata                  |
| `webmcp_list_tools`   | Lists all relayed tools with source info                                            |
| `webmcp_open_page`    | Opens a URL, or in server mode refreshes a connected source page by matching origin |

**Dynamic tools** are registered directly on the MCP server using the original tool name, sanitized to `[a-zA-Z0-9_]`. When tools from different tabs share a name, a short tab-ID suffix is appended for disambiguation:

- Single provider: `get_issue`
- Multiple providers with the same name: `search_ed93`, `search_a1b2`

Names are limited to 128 characters. Sanitization, truncation, or tab-prefix collisions receive deterministic `_2`, `_3`, and later suffixes.

### CLI Options

```text
webmcp-local-relay [options]

  --host, -H               Bind host for local websocket relay (default: 127.0.0.1)
  --port, -p               Preferred root port for the local relay cluster (default: 9333)
  --widget-origin          Allowed host page origin(s), comma-separated (default: *)
  --allowed-origin         Deprecated alias for --widget-origin
  --ws-origin              Deprecated alias for --widget-origin
  --label                  Human-readable relay label reported during discovery
  --workspace              Optional workspace name reported during discovery
  --relay-id               Stable relay identifier reported during discovery
  --invoke-timeout         Browser tool invocation timeout in milliseconds (default: 65000)
  --max-payload            Maximum WebSocket payload size in bytes (default: 10000000)
  --help, -h               Show help
```

Examples:

```bash
# Default: loopback on port 9333
npx @mcp-b/webmcp-local-relay

# Custom port
npx @mcp-b/webmcp-local-relay --port 9444

# Restrict to tools from trusted host pages
npx @mcp-b/webmcp-local-relay --widget-origin https://myapp.com
```

### Security

- Binds to `127.0.0.1` by default (loopback only, not accessible from your network).
- The default `allowedOrigins` is `*`, which permits any browser page to connect and register tools. This is convenient for development but means any website open in your browser can expose tools to the relay.
- `--widget-origin` validates the browser's WebSocket `Origin` header. The injected blob iframe inherits the host page origin, so browser connections cannot override it in `hello`.
- **Recommended:** Use `--widget-origin` to restrict which websites can register tools:

  ```bash
  # Only allow tools from myapp.com
  webmcp-local-relay --widget-origin https://myapp.com

  # Allow multiple origins
  webmcp-local-relay --widget-origin https://app1.com,https://app2.com
  ```

- `--widget-origin` is not local-process authentication. An Origin-less browser-protocol client falls back to its claimed `hello.origin`, while the internal relay-to-relay protocol is outside this browser-origin check. Keep the relay bound to loopback unless you add a separate trusted boundary.
- [Chrome 147 and later](https://developer.chrome.com/release-notes/147) can ask a public site for Local Network Access permission before it opens the loopback WebSocket. This browser permission is separate from relay configuration.

### Architecture

```text
┌──────────────────────────────────────┐
│        MCP Client                    │
│   (Claude, Cursor, Windsurf, etc.)   │
└──────────────────┬───────────────────┘
                   │ stdio / JSON-RPC
┌──────────────────▼───────────────────┐
│        LocalRelayMcpServer           │
│   webmcp_list_sources                │
│   webmcp_list_tools                  │
│   + dynamic tools from browser       │
└──────────────────┬───────────────────┘
                   │ in process
┌──────────────────▼───────────────────┐
│        RelayBridgeServer             │
│   Manages connections, routes calls  │
└──────────────────┬───────────────────┘
                   │ WebSocket (ws://127.0.0.1:9333)
┌──────────────────▼───────────────────┐
│        Widget iframe                 │
│   embed.js injects widget.html       │
└──────────────────┬───────────────────┘
                   │ postMessage
┌──────────────────▼───────────────────┐
│        Host page                     │
│   WebMCP runtime + registered tools  │
└──────────────────────────────────────┘
```

**How it connects:** The embed script fetches the sibling `widget.html`, injects configuration, and loads it as a hidden blob iframe that inherits the host page origin. The iframe opens a WebSocket to the relay on `localhost`. Self-hosted copies must serve both `embed.js` and `widget.html`; cross-origin hosts must allow the widget fetch with CORS. The relay fails closed if that fetch fails.

After a disconnect, the widget retries the last endpoint once after about `500ms`, then rescans the relay range after `10s`, `20s`, and `30s`. If no relay responds, it enters a dormant state and probes the configured or cached endpoint every two minutes; returning to the tab or sending `webmcp.connect` triggers immediate rediscovery.

**Client mode:** When a candidate port is already owned by a compatible WebMCP relay, a second instance joins it in client mode and proxies tool operations through it. A non-relay service is skipped while scanning the default range; an explicitly selected occupied port fails. If the server relay later stops, the client attempts to promote itself back to server mode. This enables multiple MCP clients to share the same browser connections without manual configuration.

### Runtime Compatibility

Supported page runtimes:

1. `@mcp-b/global` (recommended for the complete MCP-B runtime)
2. Current native Chrome with `document.modelContext.getTools()` and its descriptor-based `executeTool()` extension, which this relay requires to invoke tools
3. `@mcp-b/webmcp-polyfill`

Runtime dispatch behavior in the browser embed/widget layer:

- Uses asynchronous `document.modelContext.getTools()` and the exact returned
  descriptor with feature-detected `executeTool()`.
- Refreshes the descriptor before every invocation so Chrome never receives a
  stale registration object.

### WebMCP Standard Status

WebMCP is an emerging web platform proposal. This relay works with the current native Chrome preview and MCP-B runtimes, but native extension details can still change as implementations mature.

- [W3C WebML CG draft](https://webmachinelearning.github.io/webmcp/)
- [Proposal repository](https://github.com/webmachinelearning/webmcp)
- [WebMCP specification (`document.modelContext`, `registerTool`, etc.)](https://webmachinelearning.github.io/webmcp/)

For Chromium/Chrome Canary native preview testing:

1. Open `chrome://flags/#enable-webmcp-testing`
2. Enable **WebMCP for testing**
3. Restart the browser

### Troubleshooting

| Problem                  | Fix                                                                                                                                       |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `No sources connected`   | Ensure the page loaded `embed.js` and the relay process is running                                                                        |
| `No tools listed`        | Ensure tools are registered on the page's WebMCP runtime. If tools register after load, confirm your runtime emits the `toolchange` event |
| `Tool not found`         | Tab reloaded or disconnected — call `webmcp_list_tools` again to refresh                                                                  |
| Connection blocked       | Verify `--widget-origin` matches your host page's origin (e.g., `https://myapp.com`), and relay port matches `data-relay-port`            |
| `Host response timeout:` | The host page exceeded its timeout (default 60s). Raise `data-request-timeout` and keep CLI `--invoke-timeout` slightly higher            |

---

## Contributing

### Project Layout

```text
src/
├── cli.ts                      CLI entry point
├── cli-utils.ts                CLI argument parsing
├── mcpRelayServer.ts           MCP server (stdio + dynamic tool sync)
├── bridgeServer.ts             WebSocket relay server
├── registry.ts                 Multi-source aggregation and deduplication
├── naming.ts                   Tool name sanitization and namespacing
├── schemas.ts                  Browser <-> relay protocol schemas
├── browser/embed.ts            Script-tag loader for website owners
├── browser/widget.ts           Widget IIFE entry point (calls startWidgetRuntime)
├── browser/widgetRuntime.ts    Hidden iframe bridge runtime
├── browser/shared.ts           Shared browser-side utilities
└── index.ts                    Public API exports
```

`dist/browser/widget.html` is generated at build time by
`scripts/build-widget-html.js`, which wraps the bundled `widget.js` (compiled
from `widget.ts` + `widgetRuntime.ts`) into a minimal HTML shell.

### Build and Test

From repository root:

```bash
pnpm install
pnpm --filter @mcp-b/webmcp-local-relay build
pnpm --filter @mcp-b/webmcp-local-relay test
pnpm --filter @mcp-b/webmcp-local-relay test:e2e
```

### Build MCPB Bundle

```bash
pnpm --filter @mcp-b/webmcp-local-relay build:mcpb
```

Produces `webmcp-local-relay-<version>.mcpb` for distribution via Claude Desktop.

### References

- [MCP Bundle (MCPB) project](https://github.com/modelcontextprotocol/mcpb)
- [Claude Code plugins](https://docs.claude.com/en/docs/claude-code/plugins/build-a-plugin)
- [Claude Code plugin distribution](https://docs.claude.com/en/docs/claude-code/plugins/distributing-plugins)
- [Claude Code skills](https://docs.claude.com/en/docs/claude-code/skills)
- [Vercel Agent Skills repo](https://github.com/vercel-labs/agent-skills)

## License

MIT
