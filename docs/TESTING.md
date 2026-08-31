# Runtime E2E Testing

This document covers the runtime testing lanes in this monorepo.

For general test-layer philosophy, see [TESTING_PHILOSOPHY.md](./TESTING_PHILOSOPHY.md).
For type-surface rules and the repo-wide no-cast policy, see [TYPE_TESTING.md](./TYPE_TESTING.md).

## Definitions

- **Canonical E2E**: tools are registered inside the real runtime, discovered through that runtime's public boundary, and called through that same boundary with zero mocked transports or fake servers.
- **Runtime API integration**: direct `page.evaluate(...)`, demo flows, and
  compatibility-shim checks that do not use the same public caller boundary as
  production clients.
- **Native Chromium exception**: for native WebMCP, the real public boundary is
  `document.modelContext`, not an SDK `Client`. Discovery uses `getTools()`.
  Chrome execution coverage feature-detects descriptor-based `executeTool()`.

## Default Commands

```bash
# Repo default: unit + canonical runtime E2E
pnpm test

# Zero-mock runtime and DOM reader E2E umbrella
pnpm test:e2e

# Playwright browser-runtime contract lane only (tab/global + iframe + native)
pnpm --filter mcp-e2e-tests test
pnpm --filter mcp-e2e-tests test:runtime-contract

# Runtime API integration lanes (not canonical E2E)
pnpm --filter mcp-e2e-tests test:integration:runtime-api
pnpm --filter mcp-e2e-tests test:integration:frameworks

# Native contract lanes (Chrome 152+ WebMCP config)
pnpm --filter mcp-e2e-tests test:native-contract:default
pnpm --filter mcp-e2e-tests test:native-showcase

# Shared WebMCP conformance lanes
pnpm --filter @mcp-b/webmcp-polyfill test:conformance
pnpm --filter @mcp-b/global test:conformance:global

# Pinned upstream WebMCP WPT (requires .reference/wpt and Chrome Canary)
CHROME_BIN=/path/to/chrome-canary pnpm test:wpt

# Upstream WebMCP IDL shape conformance (non-blocking; see below)
CHROME_BIN=/path/to/chrome-canary pnpm test:wpt:idl

# Runtime-specific canonical E2E packages
pnpm --filter @mcp-b/webmcp-local-relay test:e2e
pnpm --filter @mcp-b/transports test:e2e
pnpm --filter @mcp-b/webmcp-extension test:e2e

# Tarball validation
pnpm test:e2e:tarball:global

# DOM reader browser and stdio checks (after pnpm build)
pnpm --filter @mcp-b/smart-dom-reader test:local
pnpm --filter @mcp-b/smart-dom-reader-server test:e2e
```

Notes:

- `pnpm test:e2e` runs the canonical runtime suites and DOM reader checks sequentially for stability.
- Set `CHROME_BIN` to select an installed Chrome binary for both DOM reader checks.
- `pnpm test:e2e:ui`, `pnpm test:e2e:headed`, and `pnpm test:e2e:debug` drive the Playwright `e2e/` package only. They do not run the relay, DevTools, or extension package E2E lanes.

## Runtime Coverage Matrix

| Runtime             | Canonical caller                           | Real runtime boundary under test                         | Command                                                    |
| ------------------- | ------------------------------------------ | -------------------------------------------------------- | ---------------------------------------------------------- |
| Tab / global        | SDK `Client` + `TabClientTransport`        | Browser page running `@mcp-b/global`                     | `pnpm --filter mcp-e2e-tests test:runtime-contract`        |
| Iframe              | SDK `Client` + `IframeParentTransport`     | Parent/iframe runtime boundary                           | `pnpm --filter mcp-e2e-tests test:runtime-contract`        |
| Native Chromium     | `document.modelContext`                    | Chrome 152+ with WebMCP flags in CI                      | `pnpm --filter mcp-e2e-tests test:native-contract:default` |
| Local relay         | SDK `Client` over stdio                    | Real relay server + real browser runtime                 | `pnpm --filter @mcp-b/webmcp-local-relay test:e2e`         |
| Extension transport | SDK `Client` + `ExtensionClientTransport`  | Real MV3 extension using `ExtensionServerTransport`      | `pnpm --filter @mcp-b/transports test:e2e`                 |
| Extension template  | SDK `Client` in an isolated content script | Imperative and declarative tools in a real MV3 extension | `pnpm --filter @mcp-b/webmcp-extension test:e2e`           |

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
- `e2e/tests/chromium-native-api.spec.ts` (historical filename; explicitly
  tests MCP-B extensions and the deprecated `modelContextTesting`
  compatibility shim)
- `e2e/tests/notification-batching.spec.ts`
- `e2e/tests/chrome-beta-webmcp.spec.ts`
- `e2e/playwright-native-showcase.config.ts`

### Framework Integration

`pnpm --filter mcp-e2e-tests test:integration:frameworks`

This lane covers framework-level integrations such as React hooks and validation matrices.

### React hook render regressions

`pnpm test:hooks` runs both React packages in headless Chromium through Vite+ Browser Mode and
`vitest-browser-react`. It is included in `pnpm test:unit`; CI runs the same suites with coverage.

Focused runs:

```bash
pnpm --filter usewebmcp test src/useWebMCP.rerenders.test.tsx
pnpm --filter @mcp-b/react-webmcp test src/registration-hooks.test.tsx src/client/McpClientProvider.rerenders.test.tsx
```

These suites use React's [Profiler](https://react.dev/reference/react/Profiler) to count commits
after a verified mount, including nested updates. They run with and without
[StrictMode](https://react.dev/reference/react/StrictMode), which can repeat render attempts.
Do not count component-body calls or assert wall-clock durations.

Each test pairs a commit budget with observable state, registration, or callback-identity checks.
An explicit parent rerender costs one commit; prompt/resource registration status can require a
second. React may report an empty bailout commit for a same-state update, so those checks also
require preserved state identity. See [React's state bailout caveat](https://react.dev/reference/react/useState#setstate).

Deferred promises separate pending, success, and error transitions into awaited `hook.act` scopes.
Await `rerender` and `unmount`; do not use sleeps to settle React. The
[browser React utilities](https://github.com/vitest-community/vitest-browser-react/blob/v2.0.4/src/pure.tsx)
provide the act environment and cleanup. Client tests profile a memoized consumer, then verify a
real inventory change reaches it so a disconnected observer cannot pass a zero-commit assertion.

## CI / Default Gate

The canonical runtime gate lives in `.github/workflows/e2e.yml`.

The workflow runs:

1. DOM reader, reader-server lifecycle, tab, iframe, local-relay, framework, and `@mcp-b/global` tarball E2E coverage
2. Extension transport and extension-template E2E coverage
3. The pinned upstream WebMCP Web Platform Tests against the standalone polyfill
4. Native contract and showcase integration coverage on Chrome Canary

`pnpm test` runs unit tests plus the local zero-mock `pnpm test:e2e` umbrella. CI adds the
framework, tarball, upstream WPT, and Chrome Canary lanes listed above.

The upstream suite lives in
[`webmcp`](https://github.com/web-platform-tests/wpt/tree/master/webmcp). The
workflow pins its WPT revision and injects
`packages/webmcp-polyfill/dist/index.iife.js` with native WebMCP disabled. It
runs every declarative test plus an explicit allowlist of imperative tests for
the page-local surface. Frame-tree, origin-policy, and navigation WPT are
excluded because they require native browser behavior. The shared repository
suite adds MCP-B-specific polyfill, global, and native integration coverage.

### IDL shape conformance

`pnpm test:wpt:idl` runs upstream `webmcp/idlharness.https.window.html` as a
separate invocation. It asserts API _shape_ — prototype chain, property
descriptors, enumerability, `length`/`name` — rather than behavior, so a failure
there does not mean the API misbehaves.

Two requirements beyond the behavioral lane:

- `.reference/wpt` must include the `interfaces` directory. `idl_test` fetches
  `/interfaces/{webmcp,html,dom}.idl` over HTTP at runtime, and a sparse
  checkout without it fails with `Error fetching /interfaces/webmcp.idl`. The
  workflow's `sparse-checkout` block lists it; fix an existing local clone with
  `git -C .reference/wpt sparse-checkout add interfaces` (~1.8 MB).
- The polyfill passes 20/20 subtests, matching native Chrome Canary. CI still
  runs the lane with `continue-on-error: true`; removing that line makes it
  blocking, which is a pending decision rather than a known gap.

## Extension Transport Testing

Extension transport E2E is no longer future work. The fixture is a real MV3 extension built into `packages/transports/e2e/dist/extension` and exercised with:

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
pnpm --filter @mcp-b/transports test:e2e
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

### Chrome 152 Native Contract Lane

The flagged native lane requires Chrome 152+ with:

- `--enable-experimental-web-platform-features`
- `--enable-features=WebMCPTesting,DevToolsWebMCPSupport`

`WebMCPTesting` is the Chromium feature-flag name used by the test
configuration. The native contract does not treat
`navigator.modelContextTesting` as a current browser API.

See [e2e/tests/CHROMIUM_TESTING.md](../e2e/tests/CHROMIUM_TESTING.md) for the native contract details.
