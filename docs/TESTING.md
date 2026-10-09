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
  `document.modelContext`, not an SDK `Client`. Discovery uses `getTools()` and
  execution uses descriptor-based `executeTool()`.

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

# Native lanes (Chrome 155+): contract, contract plus Chrome WebMCP smoke, showcase
pnpm --filter mcp-e2e-tests test:native-contract
pnpm --filter mcp-e2e-tests test:native-parity
pnpm --filter mcp-e2e-tests test:native-showcase

# Shared WebMCP conformance lanes
# Standalone polyfill tests include core smoke and declarative tools
pnpm --filter @mcp-b/webmcp-polyfill test --browser.headless
# Core install, registration, execution, and abort smoke test only
pnpm --filter @mcp-b/webmcp-polyfill test:smoke
# MCP-B runtime and declarative tools
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

## Runtime Coverage Matrix

| Runtime             | Canonical caller                           | Real runtime boundary under test                         | Command                                             |
| ------------------- | ------------------------------------------ | -------------------------------------------------------- | --------------------------------------------------- |
| Tab / global        | SDK `Client` + `TabClientTransport`        | Browser page running `@mcp-b/global`                     | `pnpm --filter mcp-e2e-tests test:runtime-contract` |
| Iframe              | SDK `Client` + `IframeParentTransport`     | Parent/iframe runtime boundary                           | `pnpm --filter mcp-e2e-tests test:runtime-contract` |
| Native Chromium     | `document.modelContext`                    | Chrome 155+ with WebMCP flags in CI                      | `pnpm --filter mcp-e2e-tests test:native-contract`  |
| Local relay         | SDK `Client` over stdio                    | Real relay server + real browser runtime                 | `pnpm --filter @mcp-b/webmcp-local-relay test:e2e`  |
| Extension transport | SDK `Client` + `ExtensionClientTransport`  | Real MV3 extension using `ExtensionServerTransport`      | `pnpm --filter @mcp-b/transports test:e2e`          |
| Extension template  | SDK `Client` in an isolated content script | Imperative and declarative tools in a real MV3 extension | `pnpm --filter @mcp-b/webmcp-extension test:e2e`    |

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
- `e2e/tests/chrome-beta-webmcp.spec.ts`
- `e2e/playwright-native-showcase.config.ts`

### React hook harness

After `pnpm build`, run `pnpm test:hooks` for browser integration tests and packed-package checks.
`pnpm test:hooks:package` builds minified hook packages, verifies their client directives, and installs
tarballs into isolated React 18 and React 19 consumers. It checks server rendering without browser
globals and declarations with `skipLibCheck: false`, with strict null checking enabled and disabled.
The React 18 consumer installs core hooks only; React 19 also checks MCP-B/upstream type coexistence.

Browser tests cover StrictMode, suspended renders, metadata updates, duplicate and delayed
registrations, and cancellation. `@mcp-b/react-webmcp` tests additionally
cover Standard Schema validation and transforms. Platform failure tests mock the browser
registration boundary; successful calls use the real runtime.

For native registration, cleanup, and execution-signal propagation in the core hook:

```bash
CHROME_BIN=/path/to/chrome-canary pnpm --filter usewebmcp test:native
```

The native lane enables WebMCP and fails if the API is unavailable; it does not install a polyfill.
Prior art: [GoogleChromeLabs/use-webmcp-tool](https://github.com/GoogleChromeLabs/use-webmcp-tool),
[upstream types](https://github.com/webmachinelearning/webmcp-types),
and [Standard Schema](https://standardschema.dev/).

### Framework Integration

`pnpm --filter mcp-e2e-tests test:integration:frameworks`

This lane covers framework-level integrations such as React hooks and the MCP-B validation matrix.

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
An explicit parent rerender costs one commit. Successful tool registration adds no consumer
commit, including when the native promise settles later. Registration failures remain observable
through `registrationError`; tests verify the actual registry to distinguish pending and completed
registration. Other same-state checks require preserved state identity because an outer Profiler
may report an empty commit. See [React's state bailout caveat](https://react.dev/reference/react/useState#setstate).

Deferred promises separate execution start, completion, and errors into awaited `hook.act` scopes.
Execution tests cover overlapping completions, cancellation during validation and formatting,
and committed callback snapshots. Schema tests verify stable inputs are not serialized again.
Await `rerender` and `unmount`; do not use sleeps to settle React. The
[browser React utilities](https://github.com/vitest-community/vitest-browser-react/blob/v2.0.4/src/pure.tsx)
provide the act environment and cleanup. Client tests profile a memoized consumer, then verify a
real inventory change reaches it so a disconnected observer cannot pass a zero-commit assertion.

## CI / Default Gate

The canonical runtime gate lives in `.github/workflows/e2e.yml`.

| Lane                   | Workflow     | Required check |
| ---------------------- | ------------ | -------------- |
| Lint                   | `ci.yml`     | Yes            |
| Typecheck              | `ci.yml`     | Yes            |
| Build                  | `ci.yml`     | Yes            |
| Unit Tests             | `ci.yml`     | Yes            |
| Syncpack               | `ci.yml`     | No             |
| Security Audit         | `ci.yml`     | Yes            |
| E2E Tests (Playwright) | `e2e.yml`    | Yes            |
| Extension E2E          | `e2e.yml`    | No             |
| Native API Parity      | `e2e.yml`    | No             |
| Analyze                | `codeql.yml` | Yes            |

Required checks are a repository branch-protection setting; the workflows do not
declare them.

`E2E Tests (Playwright)` runs on Chrome stable: DOM reader, reader-server
lifecycle, tab, iframe, local-relay, framework, and `@mcp-b/global` tarball
coverage. `Extension E2E` runs the extension transport and extension-template
suites in Playwright's Chromium. `Native API Parity` installs Chrome Beta, Chrome
Canary, and a Chromium snapshot and runs the pinned upstream WebMCP Web Platform
Tests against the standalone polyfill, the IDL shape lane (non-blocking), the
native runtime contract on both channels, the Chrome WebMCP smoke on Beta, the
native React hook tests, the `@mcp-b/global` native conformance suite on Canary,
the native showcase, and the native extension frame integration on the Chromium
snapshot.

`pnpm test` runs unit tests plus the local zero-mock `pnpm test:e2e` umbrella. CI adds the
framework, tarball, upstream WPT, and native lanes listed above.

The upstream suite lives in
[`webmcp`](https://github.com/web-platform-tests/wpt/tree/master/webmcp). The
workflow pins its WPT revision and injects
`packages/webmcp-polyfill/dist/index.iife.js` with native WebMCP disabled. It
runs an explicit allowlist of page-local imperative and declarative files. The
frame-tree, origin-policy, and navigation files need native coverage. The rest
need features the vendored upstream runtime does not provide yet:
`ToolActivatedEvent` and `ToolCancelEvent`, the tool pseudo-classes, and raw
(non-JSON) `executeTool()` results. The shared declarative suite runs against both
`@mcp-b/global` and the standalone polyfill. The polyfill harness lives in
`packages/webmcp-polyfill/src/declarative-forms.test.ts` and runs with that
package's default `test` and `test:coverage` scripts. Its `test:smoke` script
runs only the core install, registration, execution, and abort check. The
global harness runs through `test:conformance:global` and the package's default
test script. `test:conformance:matrix` runs the polyfill tests, global
conformance, and native conformance in sequence.

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
- The vendored upstream runtime does not define `ToolActivatedEvent`,
  `ToolCancelEvent`, or the `ontoolactivated`/`ontoolcancel` handlers, so those
  subtests fail. CI runs the lane with `continue-on-error: true` until upstream
  ships them.

## Extension Transport Testing

The extension transport fixture is a real MV3 extension built into `packages/transports/e2e/dist/extension` and exercised with:

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

These target the Playwright `e2e/` package only. They do not run the relay or extension package
E2E lanes.

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

### Chrome 155 Native Contract Lane

The native lanes require Chrome 155+ (Beta or Canary). If browser discovery fails, set
`CHROME_BIN` to the installed executable. See
[e2e/tests/CHROMIUM_TESTING.md](../e2e/tests/CHROMIUM_TESTING.md) for the WebMCP flags the
configurations pass and the native contract details.
