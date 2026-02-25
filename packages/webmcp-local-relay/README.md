# @mcp-b/webmcp-local-relay

[![npm version](https://img.shields.io/npm/v/@mcp-b/webmcp-local-relay?style=flat-square)](https://www.npmjs.com/package/@mcp-b/webmcp-local-relay)
[![npm downloads](https://img.shields.io/npm/dm/@mcp-b/webmcp-local-relay?style=flat-square)](https://www.npmjs.com/package/@mcp-b/webmcp-local-relay)

Use tools from websites you already have open in your browser, directly inside Claude, Cursor, or any MCP client.

Websites register tools on `navigator.modelContext`. This relay discovers those tools and exposes them as standard MCP tools over stdio.

## At A Glance

```text
Website (WebMCP tools on page)
    |  hidden iframe + postMessage
    v
embed.js / widget.html
    |  ws://127.0.0.1:9333
    v
webmcp-local-relay (this package)
    |  stdio MCP server
    v
Claude / Cursor / any MCP client
```

## Quick Start By Role

### Website Owners

If your site already has WebMCP runtime and registered tools, add one script tag:

```html
<script src="https://cdn.jsdelivr.net/npm/@mcp-b/webmcp-local-relay@latest/dist/browser/embed.js"></script>
```

If your site does not already have WebMCP runtime, add runtime + tool registration + embed script:

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

Optional custom relay port:

```html
<script
  src="https://cdn.jsdelivr.net/npm/@mcp-b/webmcp-local-relay@latest/dist/browser/embed.js"
  data-relay-port="9444"
></script>
```

### Users (Pick One Install Path)

#### Option 1: Claude Desktop (MCPB bundle)

Download the `.mcpb` bundle from [GitHub Releases](https://github.com/WebMCP-org/npm-packages/releases) and open it in Claude Desktop.

#### Option 2: Any MCP client via `npx`

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

#### Option 3: Claude Code plugin

```text
/plugin marketplace add /Users/alexmnahas/personalRepos/WebMCP-org/npm-packages/packages/webmcp-local-relay
/plugin install webmcp-local-relay@webmcp-org
```

#### Option 4: Standalone skill (Skills CLI)

```bash
npx skills add /Users/alexmnahas/personalRepos/WebMCP-org/npm-packages/packages/webmcp-local-relay --skill webmcp-local-relay -g -y
```

## Use It In Your Agent

1. Call `webmcp_list_sources` to see connected tabs.
2. Call `webmcp_list_tools` to see relayed tools.
3. Call tools directly (e.g., `get_issue`) or use `webmcp_call_tool` to invoke by name — useful for clients that don't support dynamic tool updates.

Tools are added and removed dynamically as tabs connect, reload, and disconnect.

## What This Server Exposes

Static tools:

- `webmcp_list_sources` — lists connected browser tabs with metadata
- `webmcp_list_tools` — lists all relayed tools with source info
- `webmcp_call_tool` — invokes a relayed tool by name with JSON arguments

Dynamic tools use the original tool name (sanitized to `[a-zA-Z0-9_]`). When tools from different tabs share a name, a short tab-ID suffix is appended for disambiguation:

- Single provider: `get_issue`
- Disambiguated: `search_ed93`, `search_a1b2`

## Security

- Binds to `127.0.0.1` by default (loopback only, not accessible from your network).
- The default `allowedOrigins` is `*`, which permits any browser page to connect and register tools. This is convenient for development but means any website open in your browser can expose tools to the relay.
- **Recommended:** Use `--widget-origin` to restrict connections to only the origins you trust:
  ```bash
  webmcp-local-relay --widget-origin https://your-app.example.com,https://another-app.example.com
  ```
- Only the WebSocket `Origin` header is checked — any local process can connect regardless of origin restrictions.

## CLI

```text
webmcp-local-relay [options]

  --host, -H               Bind host (default: 127.0.0.1)
  --port, -p               WebSocket port (default: 9333)
  --widget-origin          Allowed browser origins, comma-separated (default: *)
  --allowed-origin         Alias for --widget-origin
  --help, -h               Show help
```

Run locally:

```bash
node packages/webmcp-local-relay/dist/cli.js
```

Run with strict origin policy:

```bash
node packages/webmcp-local-relay/dist/cli.js --widget-origin https://cdn.jsdelivr.net
```

## Runtime Compatibility

Supported page runtimes:

1. `@mcp-b/global` (recommended)
2. `@mcp-b/webmcp-polyfill` with `navigator.modelContextTesting`

Runtime dispatch behavior in the browser embed/widget layer:

- Uses `navigator.modelContext.listTools` + `callTool` when present.
- Falls back to `navigator.modelContextTesting.listTools` + `executeTool`.

## Architecture

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

## Troubleshooting

- `No sources connected`: ensure the page loaded `embed.js` and relay process is running.
- `No tools listed`: ensure page tools are registered on WebMCP runtime.
- `Tool not found`: tab reloaded or disconnected; call `webmcp_list_tools` again.
- Connection blocked: verify `--widget-origin` and relay port match your embed config.

## Contributing

Project layout:

```text
src/
├── cli.ts                 CLI entry point
├── mcpRelayServer.ts      MCP server (stdio + dynamic tool sync)
├── bridgeServer.ts        WebSocket relay server
├── registry.ts            Multi-source aggregation and deduplication
├── naming.ts              Tool name sanitization and namespacing
├── schemas.ts             Browser <-> relay protocol schemas
├── browser/embed.js       Script-tag loader for website owners
├── browser/widget.html    Hidden iframe bridge runtime
└── index.ts               Public API exports
```

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

Output:

- `webmcp-local-relay-<version>.mcpb`

### Plugin + Skill Files

- `.claude-plugin/plugin.json`
- `.claude-plugin/marketplace.json`
- `.mcp.json`
- `skills/webmcp-local-relay/SKILL.md`
- `.claude/skills/webmcp-local-relay/SKILL.md` (project-local development skill)

## References

- [MCP Bundle (MCPB) project](https://github.com/modelcontextprotocol/mcpb)
- [Claude Code plugins](https://docs.claude.com/en/docs/claude-code/plugins/build-a-plugin)
- [Claude Code plugin distribution](https://docs.claude.com/en/docs/claude-code/plugins/distributing-plugins)
- [Claude Code skills](https://docs.claude.com/en/docs/claude-code/skills)
- [Vercel Agent Skills repo](https://github.com/vercel-labs/agent-skills)

## License

MIT
