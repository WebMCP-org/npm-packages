# WebMCP Local Relay

[![npm version](https://img.shields.io/npm/v/@mcp-b/webmcp-local-relay?style=flat-square)](https://www.npmjs.com/package/@mcp-b/webmcp-local-relay)

Use WebMCP tools from any website, right inside your AI client.

```text
 Browser                        Your machine
┌─────────────────┐            ┌─────────────────┐
│  Website with    │            │  webmcp-local-  │
│  WebMCP tools    │───────────│  relay           │
│                  │  localhost │                  │
└─────────────────┘            └────────┬────────┘
                                        │ stdio
                                        ▼
                               Claude / Cursor / etc.
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

## For Website Owners

Add one script tag to expose your page's WebMCP tools to the relay:

```html
<script src="https://cdn.jsdelivr.net/npm/@mcp-b/webmcp-local-relay@latest/dist/browser/embed.js"></script>
```

That's it. If your page already registers tools on `navigator.modelContext`, they'll be picked up automatically.

New to WebMCP? Here's the full setup:

```html
<script src="https://cdn.jsdelivr.net/npm/@mcp-b/global@latest/dist/index.iife.js"></script>
<script>
  navigator.modelContext.registerTool({
    name: 'get_page_title',
    description: 'Get the current page title',
    inputSchema: { type: 'object', properties: {} },
    execute: async () => ({ content: [{ type: 'text', text: document.title }] }),
  });
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

Tool registration references:

- [`@mcp-b/global` quick start and `registerTool`](../global/README.md)
- [WebMCP proposal examples for `registerTool`](https://github.com/webmachinelearning/webmcp/blob/main/docs/proposal.md)

---

## Reference

### Other Install Methods

The JSON config above works for most clients. Here are additional options:

**Claude Desktop (MCPB bundle)** — download the `.mcpb` file from [GitHub Releases](https://github.com/WebMCP-org/npm-packages/releases) and double-click to install. No terminal needed.

**Direct CLI** — run the relay standalone:

```bash
npx @mcp-b/webmcp-local-relay
```

### Exposed Tools

The relay exposes three static management tools that are always available:

| Tool | Description |
|------|-------------|
| `webmcp_list_sources` | Lists connected browser tabs with metadata (tab ID, origin, URL, title, icon, tool count) |
| `webmcp_list_tools` | Lists all relayed tools with source info |
| `webmcp_call_tool` | Invokes a relayed tool by name with JSON arguments — useful for clients that don't support dynamic tool registration |

**Dynamic tools** are registered directly on the MCP server using the original tool name, sanitized to `[a-zA-Z0-9_]`. When tools from different tabs share a name, a short tab-ID suffix is appended for disambiguation:

- Single provider: `get_issue`
- Multiple providers with the same name: `search_ed93`, `search_a1b2`

### CLI Options

```text
webmcp-local-relay [options]

  --host, -H               Bind host (default: 127.0.0.1)
  --port, -p               WebSocket port (default: 9333)
  --widget-origin          Allowed browser origins, comma-separated (default: *)
  --allowed-origin         Alias for --widget-origin
  --help, -h               Show help
```

Examples:

```bash
# Default: loopback on port 9333
npx @mcp-b/webmcp-local-relay

# Custom port
npx @mcp-b/webmcp-local-relay --port 9444

# Restrict to trusted origins only
npx @mcp-b/webmcp-local-relay --widget-origin https://your-app.example.com,https://another-app.example.com
```

### Security

- Binds to `127.0.0.1` by default (loopback only, not accessible from your network).
- The default `allowedOrigins` is `*`, which permits any browser page to connect and register tools. This is convenient for development but means any website open in your browser can expose tools to the relay.
- **Recommended:** Use `--widget-origin` to restrict connections to only the origins you trust:
  ```bash
  webmcp-local-relay --widget-origin https://your-app.example.com,https://another-app.example.com
  ```
- Only the WebSocket `Origin` header is checked — any local process can connect regardless of origin restrictions.

### Architecture

```text
MCP Client (Claude, Cursor, etc.)
    | stdio (JSON-RPC)
    v
LocalRelayMcpServer
    | static + dynamic MCP tools
    v
RelayBridgeServer (ws://127.0.0.1:9333)
    | ws messages
    v
Widget iframe (embed.js -> widget.html)
    | postMessage bridge
    v
Host page WebMCP runtime (navigator.modelContext)
```

**How it connects:** The embed script injects a hidden iframe into the host page. The iframe opens a WebSocket to the relay on `localhost`. Tools are discovered via `navigator.modelContext` (or `navigator.modelContextTesting` as fallback) and forwarded to the relay, which registers them as standard MCP tools over stdio.

### Runtime Compatibility

Supported page runtimes:

1. `@mcp-b/global` (recommended)
2. `@mcp-b/webmcp-polyfill` with `navigator.modelContextTesting`

Runtime dispatch behavior in the browser embed/widget layer:

- Uses `navigator.modelContext.listTools` + `callTool` when present.
- Falls back to `navigator.modelContextTesting.listTools` + `executeTool`.

### WebMCP Standard Status

WebMCP is an emerging web platform proposal. This relay works today with polyfills and will support native browser implementations as they mature.

- [W3C WebML CG draft](https://webmachinelearning.github.io/webmcp/)
- [Proposal repository](https://github.com/webmachinelearning/webmcp)
- [Proposal details (`navigator.modelContext`, `registerTool`, etc.)](https://github.com/webmachinelearning/webmcp/blob/main/docs/proposal.md)

For Chromium/Chrome Canary native preview testing:

1. Open `chrome://flags/#enable-webmcp-testing`
2. Enable **WebMCP for testing**
3. Restart the browser

### Troubleshooting

| Problem | Fix |
|---------|-----|
| `No sources connected` | Ensure the page loaded `embed.js` and the relay process is running |
| `No tools listed` | Ensure page tools are registered on the WebMCP runtime before `embed.js` loads |
| `Tool not found` | Tab reloaded or disconnected — call `webmcp_list_tools` again to refresh |
| Connection blocked | Verify `--widget-origin` matches your page's origin, and relay port matches `data-relay-port` |

---

## Contributing

### Project Layout

```text
src/
├── cli.ts                 CLI entry point
├── cli-utils.ts           CLI argument parsing
├── mcpRelayServer.ts      MCP server (stdio + dynamic tool sync)
├── bridgeServer.ts        WebSocket relay server
├── registry.ts            Multi-source aggregation and deduplication
├── naming.ts              Tool name sanitization and namespacing
├── schemas.ts             Browser <-> relay protocol schemas
├── browser/embed.js       Script-tag loader for website owners
├── browser/widget.html    Hidden iframe bridge runtime
└── index.ts               Public API exports
```

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

### Plugin and Skill Files

| File | Purpose |
|------|---------|
| `.claude-plugin/plugin.json` | Claude Code plugin definition |
| `.claude-plugin/marketplace.json` | Plugin marketplace metadata |
| `.mcp.json` | MCP server configuration |
| `skills/webmcp-local-relay/SKILL.md` | Claude Code skill documentation |
| `manifest.json` | MCPB bundle manifest |

### References

- [MCP Bundle (MCPB) project](https://github.com/modelcontextprotocol/mcpb)
- [Claude Code plugins](https://docs.claude.com/en/docs/claude-code/plugins/build-a-plugin)
- [Claude Code plugin distribution](https://docs.claude.com/en/docs/claude-code/plugins/distributing-plugins)
- [Claude Code skills](https://docs.claude.com/en/docs/claude-code/skills)
- [Vercel Agent Skills repo](https://github.com/vercel-labs/agent-skills)

## License

MIT
