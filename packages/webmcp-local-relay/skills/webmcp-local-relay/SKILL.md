---
name: webmcp-local-relay
description: Use this when a user needs Claude Code to call tools exposed by browser pages through the local WebMCP relay server.
---

# WebMCP Local Relay

Use this skill when the task depends on tools coming from live browser tabs rather than static APIs.

## What This Server Provides

- A local MCP server (`@mcp-b/webmcp-local-relay`) that forwards tool calls to connected browser pages.
- Source discovery and invocation tools:
  - `webmcp_list_sources` — lists connected browser tabs with metadata
  - `webmcp_list_tools` — lists all relayed tools with source info
  - `webmcp_call_tool` — invokes a relayed tool by name (useful for clients without dynamic tool support)
- Dynamic relayed tools registered with the original tool name (e.g., `get_issue`). When multiple tabs expose the same name, a short tab-ID suffix is appended for disambiguation (e.g., `search_ed93`).

## Runtime Requirement

Connected pages must expose WebMCP tools via:

- `@mcp-b/global` (preferred), or
- `@mcp-b/webmcp-polyfill` with `navigator.modelContextTesting`.

The browser-side widget that connects to this relay handles runtime detection. The relay itself only communicates via WebSocket messages (`hello`, `tools/list`, `invoke`, `result`).

## Default Workflow

1. Call `webmcp_list_sources`.
2. If no sources are connected:
   - Tell the user to open a page that has the relay embed script installed.
   - Tell the user to make sure the local relay server is running.
3. Call `webmcp_list_tools`.
4. Pick tools that match the intended domain/tab/title.
5. Execute the selected tool.
6. If invocation fails because the tab disconnected or changed, repeat steps 1 to 4.

## Source Selection Rules

- Prefer an exact domain match for the requested task.
- If multiple tabs match, prefer the most recently active source.
- Before write/destructive actions, confirm the exact target tab URL/title with the user.

## Troubleshooting

- `No sources`: the page does not have the embed script, or the relay server is not running.
- `No tools`: iframe connected, but page has no registered `navigator.modelContext` tools (or runtime missing).
- `Tool not found`: the tab changed/reloaded; run `webmcp_list_tools` again and use the refreshed name.
- Frequent disconnects: verify widget origin configuration and localhost port are consistent.

## Developer Setup (Repo)

From the `npm-packages` repository root:

```bash
pnpm --filter @mcp-b/webmcp-local-relay build
pnpm --filter @mcp-b/webmcp-local-relay test
pnpm --filter @mcp-b/webmcp-local-relay test:e2e
```

Run relay manually during local development:

```bash
node packages/webmcp-local-relay/dist/cli.js --host 127.0.0.1 --port 9333
```

If your widget uses a fixed origin, lock it down:

```bash
node packages/webmcp-local-relay/dist/cli.js --host 127.0.0.1 --port 9333 --widget-origin https://your-widget-domain.example
```
