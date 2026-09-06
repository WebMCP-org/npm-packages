# React hook comparison

Measure native registrations, React owner commits, callback latency, and bundle size.

[Production report](PRODUCTION.md) · [Raw samples](production-results.json) ·
[Bundle sizes](bundle-results.json)

Results belong to the source commit and environment recorded in each artifact. Regenerate
them after source changes. Public package READMEs use tables; this README documents the harness.

## Reproduce

Run from the repository root with a Chrome build that provides native WebMCP:

```bash
pnpm install --frozen-lockfile
pnpm build
pnpm --filter usewebmcp --filter @mcp-b/react-webmcp build:prod
pnpm --dir benchmarks/react-hooks install --frozen-lockfile --ignore-scripts
CHROME_BIN=/path/to/chrome-canary node benchmarks/react-hooks/production.mjs
node benchmarks/react-hooks/bundle.mjs
```

Use a clean source checkout and run timings without concurrent builds or tests. The runner
enables native WebMCP and rejects a missing or polyfilled registry. Artifacts record the
source commit, dirty-tree flag, browser, platform, and toolchain versions.

The isolated benchmark lockfile pins React 19.2.8, MCP Cat's `webmcp-react` 1.1.0,
Google's `use-webmcp-tool` 0.2.0, and Zod 4.4.3. Our packages come from this checkout.
Competitor dependencies are excluded from the main workspace and published packages.

## Production modes

The [browser fixture](production.jsx) and [runner](production.mjs) compare nine modes:

| Mode                                      | Execution state         | Added middleware         |
| ----------------------------------------- | ----------------------- | ------------------------ |
| `usewebmcp`                               | Owner subscribes        | Built-in state observer  |
| `@mcp-b/react-webmcp`                     | Owner subscribes        | Built-in state observer  |
| MCP Cat                                   | Owner subscribes        | Package behavior         |
| Google                                    | None                    | Package behavior         |
| `usewebmcp / registration only`           | None                    | None                     |
| `usewebmcp / unsubscribed state`          | Recorded, no subscriber | State observer           |
| `usewebmcp / passthrough`                 | None                    | One passthrough function |
| `usewebmcp / OTel no-op`                  | None                    | OTel with a no-op tracer |
| `@mcp-b/react-webmcp / registration only` | None                    | None                     |

Owner commits count the component that registers the tool. Zero is a valid result, including for
Google; the separate execution-state row says whether that hook
provides state. Zero commits do not imply a loading indicator. The unsubscribed-state mode
verifies that its store records every call. OTel measures local instrumentation overhead
without a provider or exporter.

Each mode runs with 1, 10, and 100 tools; 1 or 100 schema fields; and stable or equivalent
inline schema objects. Twelve scenarios × nine modes × five measured trials produce
**540 samples**, after one warmup trial per scenario and mode. Mode order rotates.

Each sample mounts a fresh React root, performs ten unrelated parent updates, changes every
tool description, and executes ten sequential calls on the first tool. All modes use the
same JSON Schema and handler, which yields one MessageChannel task before returning.
MCP Cat uses its documented provider and preserves the native registry.

## Metrics and checks

| Metric             | Meaning                                                                          |
| ------------------ | -------------------------------------------------------------------------------- |
| Registrations      | Native `registerTool` attempts on mount, unrelated updates, and metadata changes |
| Owner commits      | Committed renders counted by a consumer layout effect                            |
| Completion latency | Time through callback, required React work, and native registration completion   |
| Callback latency   | Time until the registered callback resolves, before waiting for React            |

The harness waits for native registration promises, checks current tool metadata and handler
closures, verifies completed calls and exposed state, and confirms unmount removes every tool.
Expected aborted setup registrations are recorded; other browser errors fail the run.
Two quiet task turns confirm observed settlement but are excluded from endpoint timestamps.

Report counts show observed ranges. Timings show medians and ranges across five trials;
each trial's ten updates or calls is summarized first. These are browser completion latencies,
including scheduling, rather than CPU or paint time. Values round to 0.01 ms. No network,
transport, supplied schema validator, retained-heap measurement, or timing threshold is included.
Production uses no `act()`, `flushSync()`, or profiling build. See
[Vite production builds](https://vite.dev/guide/build),
[React profiling caveats](https://react.dev/reference/react/Profiler#caveats), and
[clock precision](https://developer.mozilla.org/en-US/docs/Web/API/Performance/now#security_requirements).

## Bundle method

The [bundle runner](bundle.mjs) measures **11 individual exports**: four existing tool
hooks, our two registration-only hooks, and the five invocation, Standard Schema, execution-state,
consent, and OTel entries. Each export is tree-shaken from its production ESM entry using
Vite+, targeting ES2022, with raw, Oxc-minified, and gzip level 9 sizes recorded.

React and React DOM are external; other imported dependencies remain included. Each sample
measures one export, not a whole application or the incremental cost of combining exports.
Application validators and runtime setup are excluded. Assertions check entry resolution,
exports, unexpected external dependencies, and optional SDK/fallback leakage into core entries.

## Historical fixtures

[RESULTS.md](RESULTS.md) and [results.json](results.json) preserve the development fixture,
which uses `act()` and overlapping calls. Its counts do not predict sequential production
behavior. Run it separately with `CHROME_BIN=/path/to/chrome-canary node benchmarks/react-hooks/run.mjs`.
The [package tests](../../docs/TESTING.md#react-hook-harness) remain the lifecycle correctness suite.

[report.html](report.html) and the older light/dark chart images are historical presentations
of earlier results, not the current README comparison. They require the separate design-system
checkout; they are not needed to reproduce current measurements.

Primary comparison sources: [MCP Cat](https://github.com/agentcathq/webmcp-react),
[GoogleChromeLabs/use-webmcp-tool](https://github.com/GoogleChromeLabs/use-webmcp-tool),
[usewebmcp](../../packages/usewebmcp/README.md), and
[the MCP-B React adapter](../../packages/react-webmcp/README.md).
