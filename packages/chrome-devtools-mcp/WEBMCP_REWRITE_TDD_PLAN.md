# WebMCP Rewrite TDD Plan

## Goal

Rebuild Chrome DevTools MCP WebMCP support as a thin, mostly stateless proxy on top of the latest upstream `chrome-devtools-mcp`.

The new design should:

- prefer `navigator.modelContext.listTools()` and `navigator.modelContext.callTool(...)`
- fall back to `navigator.modelContextTesting.listTools()` and `executeTool(...)`
- avoid dynamic MCP tool registration
- avoid WebMCP-specific browser reconnect logic
- avoid WebMCP-specific `McpContext` state beyond the minimum needed to evaluate against a page

## Non-Goals

Do not carry forward these fork behaviors into the first rewrite:

- `WebMCPToolHub`
- auto-discovery across all pages
- automatic dynamic tool registration into the MCP server
- `connect_to_browser`
- `evaluate_in_extension_worker`
- page-global WebMCP auto-inject / auto-reconnect layers
- tool change subscriptions beyond what is strictly needed for testing or later diagnostics

## Upstream Base

Use upstream `upstream-chrome-devtools/main` at:

- commit: `94de19cdcdae9e31d0962b273ce352dc248eb5a8`
- subject: `perf: use CDP to find open DevTools pages. (#1150)`

## Reference Archive

Before deleting any fork logic, preserve the current WebMCP-specific implementation in a reference directory so it can be mined later without contaminating the new base.

Recommended archive path:

- `packages/chrome-devtools-mcp/reference/webmcp-fork/`

Archive these files first:

- `src/tools/webmcp.ts`
- `src/tools/WebMCPToolHub.ts`
- `src/transports/WebMCPClientTransport.ts`
- `src/transports/WebMCPBridgeScript.ts`
- `src/transports/bridgeConstants.ts`
- `tests/tools/webmcp.test.ts`
- `tests/tools/WebMCPToolHub.test.ts`
- `tests/transports/WebMCPClientTransport.test.ts`
- `tests/webmcp.runtime-contract.e2e.test.ts`

Archive these only if you want historical context for removed integration points:

- `src/McpContext.ts`
- `src/tools/ToolDefinition.ts`
- `src/tools/browser.ts`
- `src/tools/extension.ts`
- `src/main.ts`

## Target Runtime Contract

### Tool listing

Given a target page:

1. If `navigator.modelContext.listTools` exists, use it.
2. Otherwise, if `navigator.modelContextTesting.listTools` exists, use it.
3. Normalize the result into:
   - `name`
   - `description`
   - `inputSchema`
   - `pageId`
4. If neither surface exists, return no tools with a clear explanation.

### Tool calling

Given a target page and `{ name, arguments }`:

1. If `navigator.modelContext.callTool` exists, call it.
2. Otherwise, if `navigator.modelContextTesting.executeTool` exists:
   - serialize arguments with `JSON.stringify(args ?? {})`
   - parse the returned JSON string
   - treat `null` as interrupted navigation / unavailable execution
3. Normalize output into MCP text/resource/image blocks exactly once.

### Tool changes

Do not implement automatic sync in v1.

If diagnostics are added later, they should be separate tools such as:

- `analyze_webmcp_page`
- `analyze_webmcp_tool_churn`

They should not be required for `list_webmcp_tools` or `call_webmcp_tool`.

## First-Pass File Plan

### Delete after archival

- `src/tools/WebMCPToolHub.ts`
- WebMCP-specific code in `src/McpContext.ts`
- WebMCP-specific context extensions in `src/tools/ToolDefinition.ts`
- `src/tools/browser.ts`
- `src/tools/extension.ts`

### Rebuild on top of upstream

- `src/tools/webmcp.ts`
- small page-evaluation helper module if needed
- focused tests for listing and calling

### Keep only if still useful after rewrite

- `src/transports/WebMCPClientTransport.ts`
- `src/transports/WebMCPBridgeScript.ts`
- `src/transports/bridgeConstants.ts`

Note:
If the page-evaluation design fully replaces CDP message ferrying, these transport files may become reference-only too. Decide that after the first failing tests are written.

## TDD Execution Plan

### Phase 0: Baseline and archive

1. Create `reference/webmcp-fork/` and copy the current WebMCP files there.
2. Re-vendor or replace `packages/chrome-devtools-mcp` source with upstream `94de19c`.
3. Re-apply only package/monorepo glue needed to build inside this repo.
4. Confirm upstream package builds before reintroducing WebMCP.

Verification:

- `pnpm -C packages/chrome-devtools-mcp typecheck`
- `pnpm -C packages/chrome-devtools-mcp test`

### Phase 1: Add the smallest browser-side probe

Write the first failing tests before implementation.

Tests to add:

1. `list_webmcp_tools` returns tools from `navigator.modelContext.listTools()`
2. `list_webmcp_tools` falls back to `navigator.modelContextTesting.listTools()`
3. `list_webmcp_tools` returns a clear empty result when neither API exists
4. malformed testing `inputSchema` strings are normalized to `{ type: "object", properties: {} }`

Implementation target:

- a tiny browser evaluation helper that inspects the page and returns normalized tool metadata

Verification:

- focused `webmcp` unit/integration tests only

### Phase 2: Add stateless tool execution

Write failing tests first:

1. `call_webmcp_tool` uses `navigator.modelContext.callTool(...)` when available
2. it falls back to `navigator.modelContextTesting.executeTool(...)`
3. testing fallback parses serialized JSON results
4. testing fallback reports invalid JSON cleanly
5. testing fallback treats `null` as interrupted execution
6. call errors are surfaced without trying to preserve old transport state

Implementation target:

- page evaluation helper for execution
- no client cache
- no tool hub
- no background sync

Verification:

- focused `webmcp` tests
- one browser integration test covering both list and call on a real page

### Phase 3: Integrate with upstream page model

Write failing tests first:

1. `list_webmcp_tools` targets the selected upstream page by default
2. `list_webmcp_tools({ pageId })` targets a specific upstream page
3. `call_webmcp_tool({ pageId })` calls the specified page
4. page reload does not require cached transport cleanup because calls are stateless

Implementation target:

- align on upstream `pageId`, not legacy `page_index`
- make tools fit upstream page/tool conventions cleanly

Verification:

- `pages` + `webmcp` focused tests

### Phase 4: Remove fork state and dead code

Write failing tests first where practical:

1. package still builds and tests after removing `WebMCPToolHub`
2. no code path depends on `getToolHub()`
3. no code path depends on `getWebMCPClient()`
4. no code path depends on reconnect-specific WebMCP context

Implementation target:

- remove dead context methods
- remove dead tools
- remove dead imports/docs/prompts that assume dynamic registration

Verification:

- `pnpm -C packages/chrome-devtools-mcp typecheck`
- `pnpm -C packages/chrome-devtools-mcp test`

### Phase 5: Documentation cleanup

Write/update tests first only if docs generation is checked in CI.

Update:

- tool descriptions
- prompts
- README sections describing WebMCP behavior
- any docs claiming WebMCP tools become first-class registered MCP tools

The docs must describe WebMCP as:

- explicit list/call tools
- page-targeted
- stateless by default
- core `modelContext` first, `modelContextTesting` fallback second

## Suggested Test Breakdown

### Keep

- transport/runtime tests only if transport remains in the final design
- runtime contract tests that exercise real `navigator.modelContext` behavior

### Rewrite

- current `tests/tools/webmcp.test.ts`

Rewrite around:

- selected page behavior
- `pageId` targeting
- core API preference
- testing fallback
- schema normalization
- error normalization

### Delete

- `tests/tools/WebMCPToolHub.test.ts` if the tool hub is removed

## Nice-to-Have Diagnostics After v1

These are separate follow-up tools, not part of the base rewrite:

- `analyze_webmcp_page` to report whether a page exposes:
  - producer-only core API
  - consumer extensions
  - deprecated testing API
- `analyze_webmcp_tool_inventory` to flag:
  - too many tools
  - duplicate names
  - malformed schemas
  - rapid tool churn

## Immediate Next Actions

1. Archive current WebMCP fork files into `reference/webmcp-fork/`.
2. Replace the package source with clean upstream `94de19c`.
3. Restore monorepo packaging glue only.
4. Add the first four failing `list_webmcp_tools` tests.
5. Implement the minimal browser-side list helper.
6. Add the six failing `call_webmcp_tool` tests.
7. Implement the minimal browser-side call helper.
8. Remove remaining fork-only WebMCP state.
