# Chromium native contract testing

This guide separates native Chrome coverage from MCP-B compatibility coverage.

## Native boundary

Native tests capture `document.modelContext` before the test app can install a
runtime or polyfill. They use:

- `registerTool(tool, { signal })`
- `await getTools()`
- `toolchange` events
- Chrome's optional `executeTool(registeredTool, inputJson)` extension

`executeTool()` receives a descriptor returned by `getTools()`. Tests
feature-detect the method because it is a Chromium preview extension, not strict
WebMCP core.

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

The configuration requires Chrome 152 or newer and launches it with:

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
4. Descriptor-based execution works when Chrome exposes `executeTool()`.
5. Tool errors propagate through the native browser surface.
6. The showcase registers tools and handles parent/iframe lifecycles without
   the testing shim.

Relevant files:

- `tests/runtime-contract-native.spec.ts`
- `tests/chrome-beta-webmcp.spec.ts`
- `tests/native-showcase.spec.ts`
- `playwright-chrome-beta-webmcp.config.ts`
- `playwright-native-showcase.config.ts`

## MCP-B compatibility lane

`tests/chromium-native-api.spec.ts` has a historical filename. It runs against
the `@mcp-b/global` test app in ordinary Playwright Chromium and intentionally
checks:

- MCP-B `listTools()` and by-name `unregisterTool()`
- the deprecated `navigator.modelContextTesting` compatibility shim
- shim execution, event, and error behavior

It is runtime integration coverage, not native Chromium conformance.

Run it from `e2e/`:

```bash
pnpm test:chromium-native-api
```

Testing call history, mock responses, arbitrary by-name unregistration, and a
global context reset have no current WebMCP replacement. Keep those assertions
in compatibility suites rather than presenting them as native behavior.

## Native showcase

Run the interactive native lane with:

```bash
pnpm test:native-showcase
pnpm test:native-showcase:headed
pnpm test:native-showcase:ui
```

See
[`web-standards-showcase/CHROMIUM_FLAGS.md`](../web-standards-showcase/CHROMIUM_FLAGS.md)
for Chrome selection, launch flags, and troubleshooting.
