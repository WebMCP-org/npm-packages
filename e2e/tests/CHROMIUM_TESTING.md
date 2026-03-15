# Chromium Native Contract Testing

This guide covers the native Chromium WebMCP validation lanes in this repo.

## Definitions

- **Canonical native contract**: validates the real browser API surface directly through `navigator.modelContext` and `navigator.modelContextTesting`.
- **Native parity / showcase integration**: keeps broader compatibility and demo coverage, but is not the canonical E2E gate.

## Quick Run

### Default Chromium Canonical Contract

```bash
cd e2e
pnpm test:native-contract:default
```

### Chrome Beta Canonical Contract

1. Open `chrome://flags/#enable-webmcp-testing`
2. Enable **WebMCP for testing**
3. Restart Chrome Beta
4. Run:

```bash
cd e2e
pnpm test:native-contract:beta
```

This uses `playwright-chrome-beta-webmcp.config.ts` with:

- `--enable-experimental-web-platform-features`
- `--enable-features=WebMCPTesting`

## Why Native Is Different

For tab, iframe, relay, DevTools, and extension runtimes, the canonical caller is an SDK `Client` over the runtime's real transport.

For native Chromium, the real public boundary is the browser API itself. The canonical contract therefore uses:

- `navigator.modelContext.registerTool(...)`
- `navigator.modelContext.unregisterTool(...)`
- `navigator.modelContextTesting.listTools()`
- `navigator.modelContextTesting.executeTool(...)`

That is intentional and is the only exception to the SDK-client rule.

## Canonical Assertions

The native contract lane proves that:

1. tool registration is visible through the browser API
2. tool execution works through `modelContextTesting.executeTool(...)`
3. dynamic registration and unregistration are reflected in `listTools()`
4. runtime-thrown tool errors propagate through the native browser API

## Integration Lanes

These lanes still exist and are useful for broader compatibility checks:

```bash
cd e2e
pnpm test:native-parity:default
pnpm test:native-parity:beta
pnpm test:native-showcase
pnpm test:integration:runtime-api
```

They cover suites such as:

- `tests/chrome-beta-webmcp.spec.ts`
- `tests/chromium-native-api.spec.ts`
- `playwright-native-showcase.config.ts`

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

## Debug Tips

```bash
# Headed Chrome Beta run
cd e2e
pnpm test:chrome-beta:webmcp:headed

# Playwright UI for Chrome Beta integration lane
cd e2e
pnpm test:chrome-beta:webmcp:ui
```
