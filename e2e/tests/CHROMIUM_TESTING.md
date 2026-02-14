# Chromium Native API E2E Testing Guide

This guide covers the Chromium early-preview `navigator.modelContext` and
`navigator.modelContextTesting` validation flows in this repo.

## Quick Run (Chrome Beta, recommended)

Use this path for current behavior validation:

1. Open `chrome://flags/#enable-webmcp-testing`
2. Enable **WebMCP for testing**
3. Restart Chrome Beta
4. Run:

```bash
cd e2e
pnpm test:chrome-beta:webmcp
```

This runs `tests/chrome-beta-webmcp.spec.ts` through
`playwright-chrome-beta-webmcp.config.ts` with:

```bash
--enable-experimental-web-platform-features
--enable-features=WebMCPForTesting
```

## API Surface Validated

### `navigator.modelContext`
- `provideContext(context)`
- `registerTool(tool)`
- `unregisterTool(name)`
- `clearContext()`
- `listTools()`

### `navigator.modelContextTesting`
- `executeTool(toolName, inputArgsJson, options?) => Promise<string | null>`
- `listTools() => Array<{ name: string; description: string; inputSchema?: string }>`
- `registerToolsChangedCallback(callback) => void`
- `getCrossDocumentScriptToolResult() => Promise<string>`

## Behavior and Error Semantics

### `executeTool(...)`
- `inputArgsJson` must decode to a JSON object payload.
- Invalid JSON and non-object payloads reject with `UnknownError`.
- Missing tools reject with `UnknownError`.
- Tool invocation failures are normalized to `UnknownError`.
- Aborted signals (before or during execution) reject with `UnknownError`.
- Returns `null` for navigation-indicating results.

### `listTools()`
- Returns tool entries with `name` and `description` strings.
- `inputSchema` may be omitted; when present it is a parseable JSON string payload.
- Reflects register/unregister/provide/clear updates.

### `registerToolsChangedCallback(callback)`
- Non-function callback values throw `TypeError`.
- Callback registration uses **replacement semantics** (latest callback replaces prior callback).
- Callback exceptions are caught and do not block registry operations.
- Callback fires on tool mutations (`registerTool`, `unregisterTool`, `provideContext`, `clearContext`).

## Legacy Compatibility Suite

`tests/chromium-native-api.spec.ts` still exists for broader compatibility checks,
but Chrome Beta early-preview validation should use
`tests/chrome-beta-webmcp.spec.ts` + `pnpm test:chrome-beta:webmcp`.

## Debug Tips

```bash
# Headed run
cd e2e
pnpm test:chrome-beta:webmcp:headed

# Playwright UI mode
cd e2e
pnpm test:chrome-beta:webmcp:ui
```
