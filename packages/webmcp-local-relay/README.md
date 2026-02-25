# @mcp-b/webmcp-local-relay

Use tools from websites you have open in your browser, directly inside Claude, Cursor, or any MCP client.

Websites that support [WebMCP](https://github.com/WebMCP-org) register tools on the page. This relay discovers them automatically and makes them available as standard MCP tools.

## Install

### Claude Desktop

Download the `.mcpb` file from [Releases](https://github.com/WebMCP-org/npm-packages/releases) and double-click to install. No Node.js or CLI setup required.

Two optional settings appear in the Claude Desktop extension UI:

| Setting | Default | Description |
|---------|---------|-------------|
| WebSocket Port | `9333` | Local port the bridge listens on |
| Allowed Origins | `*` | Comma-separated browser origins, or `*` for all |

### Claude Code / Cursor / Any MCP Client

Add the server to your MCP config:

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

### Claude Code Plugin

Add the marketplace and install:

```text
/plugin marketplace add https://github.com/WebMCP-org/npm-packages/tree/main/packages/webmcp-local-relay
/plugin install webmcp-local-relay@webmcp-org
```

Or type `/plugin` and browse the Discover tab.

### Standalone Skill

```bash
npx skills add https://github.com/WebMCP-org/npm-packages/tree/main/packages/webmcp-local-relay --skill webmcp-local-relay -g -y
```

## Usage

Once installed, open a website that has WebMCP tools. The relay picks them up automatically.

**Step 1 — Check what's connected:**

Ask your AI agent to call `webmcp_list_sources`. This shows every browser tab currently connected, with its URL, title, and how many tools it exposes.

**Step 2 — See available tools:**

Call `webmcp_list_tools` to get the full list of relayed tools and which tab they came from.

**Step 3 — Call tools:**

Tools appear with namespaced names like `webmcp_github_com_tab123_get_issue`. Call them like any other MCP tool. The relay forwards the call to the right browser tab and returns the result.

Tools are added and removed dynamically as you navigate between pages — no restart needed.

## CLI Options

```
webmcp-local-relay [options]

  --host, -H               Bind host (default: 127.0.0.1)
  --port, -p               WebSocket port (default: 9333)
  --widget-origin          Allowed browser origins, comma-separated (default: *)
  --allowed-origin         Alias for --widget-origin
  --help, -h               Show help
```

## Security

- Binds to `127.0.0.1` by default (loopback only, not accessible from your network).
- Use `--widget-origin` to restrict which browser origins can connect.
- In production, always set explicit allowed origins instead of `*`.

---

## How It Works

```
MCP Client (Claude, Cursor, etc.)
    │ stdio (JSON-RPC)
    ▼
LocalRelayMcpServer ─── static tools: webmcp_list_sources, webmcp_list_tools
    │                └── dynamic tools: webmcp_{domain}_{tabId}_{toolName}
    │ WebSocket (ws://127.0.0.1:9333)
    ▼
RelayBridgeServer
    │
    ├── Browser Tab 1 (github.com)     → get_issue, list_repos
    ├── Browser Tab 2 (notion.so)      → search_pages, create_page
    └── Browser Tab 3 (docs.mcp-b.ai)  → custom_tool
```

1. The relay starts a WebSocket server on `127.0.0.1:9333`.
2. Browser pages with WebMCP tools connect via a widget iframe.
3. Each page sends a `hello` message with metadata, then its tool list.
4. The relay registers those tools as MCP tools over stdio.
5. When the MCP client calls a tool, the relay forwards the invocation to the correct browser tab and returns the result.
6. Tools are added/removed dynamically as tabs connect and disconnect.

### Tool Naming

Dynamic tools are namespaced to avoid collisions across tabs:

```
webmcp_{sanitized_domain}_{tabId}_{original_tool_name}
```

When multiple tabs expose the same tool name, each gets its own namespaced entry.

### Static Tools

| Tool | Description |
|------|-------------|
| `webmcp_list_sources` | Lists all connected browser tabs with metadata (URL, title, tool count) |
| `webmcp_list_tools` | Lists all relayed tools with their source tab info |

---

## Contributing

### Source Code

```
src/
├── cli.ts                 CLI entry point, parses args, starts the server
├── mcpRelayServer.ts      MCP server: static tools + dynamic tool sync
├── bridgeServer.ts        WebSocket server: manages browser connections
├── registry.ts            Multi-source tool aggregation and provider ranking
├── naming.ts              Tool name sanitization and namespacing
├── schemas.ts             Zod schemas for the browser ↔ relay protocol
└── index.ts               Public API exports
```

### Development

From repository root:

```bash
pnpm install
pnpm --filter @mcp-b/webmcp-local-relay build
pnpm --filter @mcp-b/webmcp-local-relay test
pnpm --filter @mcp-b/webmcp-local-relay test:e2e
```

Run the relay locally:

```bash
node packages/webmcp-local-relay/dist/cli.js
```

With origin restriction:

```bash
node packages/webmcp-local-relay/dist/cli.js --widget-origin https://cdn.jsdelivr.net
```

### Scripts

| Script | Description |
|--------|-------------|
| `pnpm build` | Build with tsdown |
| `pnpm build:mcpb` | Build MCPB Desktop Extension bundle |
| `pnpm test` | Run unit tests |
| `pnpm test:e2e` | Run end-to-end tests |
| `pnpm typecheck` | Type check with tsc |
| `pnpm check` | Lint and format with Biome |

### Building the MCPB Bundle

The MCPB (Desktop Extension) bundle packages the relay as a one-click install for Claude Desktop.

```bash
pnpm run build:mcpb
```

This runs `scripts/build-mcpb.sh`, which:

1. Builds the project with tsdown (same as `pnpm build`).
2. Copies the compiled JS into a `server/` staging directory.
3. Writes `manifest.json` with the current package version.
4. Runs `npm install --production` to create a standalone `node_modules`.
5. Packs everything into a `.mcpb` file using `@anthropic-ai/mcpb`.

Output: `webmcp-local-relay-<version>.mcpb` in the package root.

**Key files for the MCPB build:**

| File | Purpose |
|------|---------|
| `manifest.json` | MCPB manifest — extension metadata, server config, user settings |
| `scripts/build-mcpb.sh` | Build script that stages and packs the bundle |
| `.mcpbignore` | Excludes dev files (src, tests, configs) from the bundle |

**Bundle structure** (what's inside the `.mcpb` ZIP):

```
webmcp-local-relay-<version>.mcpb
├── manifest.json           Extension manifest
├── package.json            Dependency declarations
├── server/
│   ├── cli.js              Entry point
│   ├── index.js            Public API
│   └── mcpRelayServer-*.js Shared chunk (server + bridge + registry)
└── node_modules/           Production dependencies
```

The `manifest.json` declares `"type": "node"`, so Claude Desktop uses its bundled Node.js runtime — users don't need Node.js installed.

### Catalog Dependency Resolution

This monorepo uses pnpm `catalog:` version references. The MCPB build script resolves these to real versions before running `npm install` in the staging directory. If you add a new dependency that uses `catalog:`, update the catalog map in `scripts/build-mcpb.sh`.

### Plugin Components

| File | Purpose |
|------|---------|
| `.claude-plugin/plugin.json` | Plugin manifest for Claude Code |
| `.claude-plugin/marketplace.json` | Marketplace discovery metadata |
| `.mcp.json` | MCP server registration for plugin installs |
| `skills/webmcp-local-relay/SKILL.md` | Plugin-bundled skill |
| `manifest.json` | MCPB Desktop Extension manifest |

## License

MIT
