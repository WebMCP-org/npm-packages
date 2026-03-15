# Runtime E2E Testing

This document covers the runtime testing lanes in this monorepo.

For general test-layer philosophy, see [TESTING_PHILOSOPHY.md](./TESTING_PHILOSOPHY.md).
For type-surface rules and the repo-wide no-cast policy, see [TYPE_TESTING.md](./TYPE_TESTING.md).

## Definitions

- **Canonical E2E**: tools are registered inside the real runtime, discovered through that runtime's public boundary, and called through that same boundary with zero mocked transports or fake servers.
- **Runtime API integration**: direct `page.evaluate(...)`, `navigator.modelContextTesting`, demo flows, and other browser-accurate checks that do not use the same public caller boundary as production clients.
- **Native Chromium exception**: for native WebMCP, the real public boundary is `navigator.modelContext` / `navigator.modelContextTesting`, not an SDK `Client`.

## Default Commands

```bash
# Repo default: unit + canonical runtime E2E
pnpm test

# Canonical zero-mock runtime E2E umbrella
pnpm test:e2e

# Playwright browser-runtime contract lane only (tab/global + iframe + native)
pnpm --filter mcp-e2e-tests test
pnpm --filter mcp-e2e-tests test:runtime-contract

# Runtime API integration lanes (not canonical E2E)
pnpm --filter mcp-e2e-tests test:integration:runtime-api
pnpm --filter mcp-e2e-tests test:integration:frameworks

# Native contract lanes
pnpm --filter mcp-e2e-tests test:native-contract:default
pnpm --filter mcp-e2e-tests test:native-contract:beta

# Native parity / showcase integration lanes
pnpm --filter mcp-e2e-tests test:native-parity:default
pnpm --filter mcp-e2e-tests test:native-parity:beta
pnpm --filter mcp-e2e-tests test:native-showcase

# Runtime-specific canonical E2E packages
pnpm --filter @mcp-b/webmcp-local-relay test:e2e
pnpm --filter @mcp-b/chrome-devtools-mcp test:e2e
pnpm --filter @mcp-b/extension-tools test:e2e

# Tarball validation
pnpm test:e2e:tarball:global
```

Notes:

- `pnpm test:e2e` is the canonical zero-mock umbrella and runs sequentially for stability.
- `pnpm test:e2e:ui`, `pnpm test:e2e:headed`, and `pnpm test:e2e:debug` drive the Playwright `e2e/` package only. They do not run the relay, DevTools, or extension package E2E lanes.

## Runtime Coverage Matrix

| Runtime                   | Canonical caller                                           | Real runtime boundary under test                    | Command                                                    |
| ------------------------- | ---------------------------------------------------------- | --------------------------------------------------- | ---------------------------------------------------------- |
| Tab / global              | SDK `Client` + `TabClientTransport`                        | Browser page running `@mcp-b/global`                | `pnpm --filter mcp-e2e-tests test:runtime-contract`        |
| Iframe                    | SDK `Client` + `IframeParentTransport`                     | Parent/iframe runtime boundary                      | `pnpm --filter mcp-e2e-tests test:runtime-contract`        |
| Native Chromium           | `navigator.modelContext` / `navigator.modelContextTesting` | Native browser API                                  | `pnpm --filter mcp-e2e-tests test:native-contract:default` |
| Native Chromium (flagged) | `navigator.modelContext` / `navigator.modelContextTesting` | Chrome Beta with WebMCP flags                       | `pnpm --filter mcp-e2e-tests test:native-contract:beta`    |
| Local relay               | SDK `Client` over stdio                                    | Real relay server + real browser runtime            | `pnpm --filter @mcp-b/webmcp-local-relay test:e2e`         |
| DevTools bridge           | SDK `Client` + `WebMCPClientTransport`                     | Real page discovered through DevTools bridge        | `pnpm --filter @mcp-b/chrome-devtools-mcp test:e2e`        |
| Extension transport       | SDK `Client` + `ExtensionClientTransport`                  | Real MV3 extension using `ExtensionServerTransport` | `pnpm --filter @mcp-b/extension-tools test:e2e`            |

## Canonical E2E Assertions

Every canonical runtime suite is expected to prove all of the following against the real runtime:

1. Initial discovery returns the expected base tools.
2. A successful call returns the expected payload.
3. The runtime records the invocation.
4. Dynamic registration becomes discoverable without restarting.
5. Dynamic unregistration removes the tool and later calls fail through the real runtime error surface.
6. Runtime-thrown tool errors propagate to the caller.

The shared browser/server fixture lives in `e2e/runtime-contract/` and defines the deterministic tool set:

- `echo`
- `sum`
- `dynamic_tool`
- `always_fail`

The shared test-only hook is `window.__WEBMCP_E2E__` / `globalThis.__WEBMCP_E2E__` with:

- `isReady()`
- `registerDynamicTool()`
- `unregisterDynamicTool(name?)`
- `readInvocations()`
- `resetInvocations()`

## Integration Lanes

These are useful and still required, but they are not the canonical E2E gate.

### Runtime API Integration

`pnpm --filter mcp-e2e-tests test:integration:runtime-api`

This lane keeps direct runtime and demo validation for:

- `e2e/tests/tab-transport.spec.ts`
- `e2e/tests/mcp-iframe-element.spec.ts`
- `e2e/tests/chromium-native-api.spec.ts`
- `e2e/tests/notification-batching.spec.ts`
- `e2e/tests/chrome-beta-webmcp.spec.ts`
- `e2e/playwright-native-showcase.config.ts`

### Framework Integration

`pnpm --filter mcp-e2e-tests test:integration:frameworks`

This lane covers framework-level integrations such as React hooks and validation matrices.

## CI / Default Gate

The canonical runtime gate lives in `.github/workflows/e2e.yml`.

The workflow runs:

1. `pnpm test:e2e`
2. Native contract on default Chromium
3. Native contract on Chrome Beta with WebMCP flags
4. Native showcase integration coverage
5. Tarball validation for `@mcp-b/global`

`pnpm test` at the repo root includes this gate by default.

## Extension Transport Testing

Extension transport E2E is no longer future work. The fixture is a real MV3 extension built into `packages/extension-tools/dist/e2e-extension` and exercised with:

- real background service worker
- real `ExtensionServerTransport`
- real extension page client using `ExtensionClientTransport`
- real SDK `Client`

## Debugging

### Playwright UI / Headed Runs

```bash
pnpm test:e2e:ui
pnpm test:e2e:headed
pnpm test:e2e:debug
```

These target the Playwright `e2e/` package only.

### Package-Specific Runtime E2E

```bash
pnpm --filter @mcp-b/webmcp-local-relay test:e2e
pnpm --filter @mcp-b/chrome-devtools-mcp test:e2e
pnpm --filter @mcp-b/extension-tools test:e2e
```

## Troubleshooting

### Playwright Browser Installation

```bash
pnpm --filter mcp-e2e-tests exec playwright install chromium
```

### Port Conflicts

The Playwright tab/global runtime-contract lane uses `PLAYWRIGHT_TAB_TRANSPORT_PORT=4173` by default and only reuses an existing server when `PLAYWRIGHT_REUSE_SERVER=1`.

If the configured port is in use:

```bash
lsof -ti:4173 | xargs kill
```

### Chrome Beta Native Contract Lane

The flagged native lane requires Chrome Beta with:

- `--enable-experimental-web-platform-features`
- `--enable-features=WebMCPTesting`

See [e2e/tests/CHROMIUM_TESTING.md](../e2e/tests/CHROMIUM_TESTING.md) for the native contract details.
