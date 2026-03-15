# Browser Runtime Contract Tests

This package contains the Playwright-driven browser runtime contract lanes for the monorepo.

## What This Package Covers

`pnpm --filter mcp-e2e-tests test` runs the canonical Playwright runtime-contract lane for:

- tab/global runtime
- iframe runtime
- native Chromium runtime

This package also keeps non-canonical integration lanes for direct runtime APIs, demos, and framework integrations.

Other canonical runtime E2E lanes live in package-specific commands:

- `pnpm --filter @mcp-b/webmcp-local-relay test:e2e`
- `pnpm --filter @mcp-b/chrome-devtools-mcp test:e2e`
- `pnpm --filter @mcp-b/extension-tools test:e2e`

## Canonical E2E Definition

A test is canonical E2E only if it proves:

1. tools are registered inside the real runtime
2. tools are discovered through the runtime's public boundary
3. tools are called through that same boundary
4. no mocked transports or fake servers are used

Native Chromium is the one exception to the SDK-client rule: its real public boundary is `navigator.modelContext` / `navigator.modelContextTesting`, so the canonical native tests use those APIs directly.

## Structure

```text
e2e/
├── runtime-contract/
│   ├── browser-contract.js
│   ├── server-contract.js
│   └── core.js
├── test-app/
│   ├── runtime-contract.html
│   ├── runtime-contract-iframe-client.html
│   ├── runtime-contract-iframe-child.html
│   └── src/
│       ├── runtime-contract.ts
│       ├── runtime-contract-iframe-client.ts
│       └── runtime-contract-iframe-child.ts
├── tests/
│   ├── runtime-contract-tab.spec.ts
│   ├── runtime-contract-iframe.spec.ts
│   ├── runtime-contract-native.spec.ts
│   ├── tab-transport.spec.ts
│   ├── mcp-iframe-element.spec.ts
│   ├── chromium-native-api.spec.ts
│   └── chrome-beta-webmcp.spec.ts
├── playwright.config.ts
└── package.json
```

## Shared Runtime Contract

The shared runtime fixture lives in `e2e/runtime-contract/`.

It registers the same deterministic tool set everywhere:

- `echo`
- `sum`
- `dynamic_tool`
- `always_fail`

It also exposes the test-only hook `window.__WEBMCP_E2E__` / `globalThis.__WEBMCP_E2E__` with:

- `isReady()`
- `registerDynamicTool()`
- `unregisterDynamicTool(name?)`
- `readInvocations()`
- `resetInvocations()`

The shared hook is for runtime mutation and inspection only. Canonical E2E does not use it as the subject under test for tool invocation.

## Commands

### From Repo Root

```bash
# Repo-wide canonical runtime E2E umbrella
pnpm test:e2e

# This package only: tab/global + iframe + native contract lane
pnpm --filter mcp-e2e-tests test
pnpm --filter mcp-e2e-tests test:runtime-contract

# Playwright convenience commands for this package
pnpm test:e2e:ui
pnpm test:e2e:headed
pnpm test:e2e:debug
```

### From `e2e/`

```bash
# Canonical browser runtime contract lane
pnpm test
pnpm test:runtime-contract

# Native contract
pnpm test:native-contract:default
pnpm test:native-contract:beta

# Runtime API integration (not canonical E2E)
pnpm test:integration:runtime-api

# Framework integration (not canonical E2E)
pnpm test:integration:frameworks

# Older targeted commands retained for focused runs
pnpm test:tab-transport
pnpm test:mcp-iframe
pnpm test:chromium-native-api
pnpm test:native-showcase
pnpm test:chrome-beta:webmcp
```

## Canonical Assertions

The browser runtime-contract specs assert the same contract everywhere:

1. initial discovery returns the expected tools
2. a successful call returns the expected payload
3. the runtime records the invocation
4. dynamic registration becomes discoverable without restart
5. unregistration removes the tool and later calls fail through the real runtime error surface
6. runtime-thrown tool errors propagate

## Runtime API Integration Lanes

These suites remain valuable, but they are not the default E2E definition:

- `tests/tab-transport.spec.ts`
- `tests/mcp-iframe-element.spec.ts`
- `tests/chromium-native-api.spec.ts`
- `tests/notification-batching.spec.ts`
- `tests/chrome-beta-webmcp.spec.ts`
- `playwright-native-showcase.config.ts`

## Manual Runtime Pages

```bash
pnpm --filter mcp-tab-transport-test-app dev
```

Then open:

- `http://localhost:5173/runtime-contract.html`
- `http://localhost:5173/runtime-contract-iframe-client.html`

These pages host the shared runtime contract used by the Playwright lane.

## Troubleshooting

### Port Already in Use

The Playwright tab/global runtime-contract lane uses:

- `PLAYWRIGHT_TAB_TRANSPORT_PORT=4173`
- `PLAYWRIGHT_REUSE_SERVER=1` to explicitly reuse an already-running server

If needed:

```bash
lsof -ti:4173 | xargs kill
```

### Playwright Browsers Not Installed

```bash
pnpm --filter mcp-e2e-tests exec playwright install chromium
```

### Native Chromium Details

See [tests/CHROMIUM_TESTING.md](./tests/CHROMIUM_TESTING.md) for the canonical native contract lanes and the Chrome Beta flagged lane.
