# Chromium native contract testing

This guide describes native Chrome and MCP-B runtime coverage.

## Native boundary

Native tests capture `document.modelContext` before the test app can install a
runtime or polyfill. They use:

- `registerTool(tool, { signal })`
- `await getTools()`
- `toolchange` events
- `executeTool(registeredTool, inputObject)`

`executeTool()` receives a descriptor returned by `getTools()`. Calls use the object-input contract from upstream `webmcp-types`.

Current Chrome no longer exposes `navigator.modelContext` as the canonical
surface. `navigator.modelContextTesting` is also outside the current native
contract.

## Run the native contract

From `e2e/`:

```bash
CHROME_BIN="/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary" \
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH="/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary" \
pnpm test:native-contract:default
```

The configuration requires Chrome 155 or newer and launches it with:

```text
--enable-experimental-web-platform-features
--enable-features=WebMCPTesting,DevToolsWebMCPSupport
```

`WebMCPTesting` is the Chromium feature-flag name used by this environment. Its
name does not make the removed `navigator.modelContextTesting` object part of
native conformance.

## Native assertions

The contract lanes verify:

1. The captured context is native rather than an MCP-B polyfill.
2. `getTools()` returns registered descriptors with browser-owned metadata.
3. AbortSignal cleanup removes an owned registration.
4. Descriptor-based execution works through `executeTool()` with object input.
5. Tool errors propagate through the native browser surface.
6. The showcase registers tools and handles parent/iframe lifecycles without
   the testing shim.

Relevant files:

- `tests/runtime-contract-native.spec.ts`
- `tests/chrome-beta-webmcp.spec.ts`
- `tests/native-showcase.spec.ts`
- `playwright-chrome-beta-webmcp.config.ts`
- `playwright-native-showcase.config.ts`

## MCP-B runtime coverage

The default Playwright configuration runs the global runtime without native
WebMCP and verifies `document.modelContext`, the MCP transports, and the iframe
bridge. Run it from `e2e/`:

```bash
pnpm test:runtime-contract:transport
pnpm test:mcp-iframe
```

`pnpm test:runtime-contract` runs both and then the native contract, which
needs Chrome 155 or newer.
