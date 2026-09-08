# React hook comparison

Measure native registrations, React commits, callback latency, and bundle size in a production
browser. [Report](PRODUCTION.md) · [Raw samples](production-results.json) ·
[Bundle sizes](bundle-results.json)

Results belong to the source commit and environment recorded in each artifact. Regenerate them
after source changes. This production harness is the comparison source; package tests own
[lifecycle correctness](../../docs/TESTING.md#react-hook-harness).

## Reproduce

From the repository root, with a Chrome build that provides native WebMCP:

```bash
pnpm install --frozen-lockfile
pnpm build
pnpm --filter usewebmcp --filter @mcp-b/react-webmcp build:prod
pnpm --dir benchmarks/react-hooks install --frozen-lockfile --ignore-scripts
CHROME_BIN=/path/to/chrome-canary node benchmarks/react-hooks/production.mjs
node benchmarks/react-hooks/bundle.mjs
```

The runners consume these built production entries. Run timings from a clean checkout without
concurrent builds or tests. The runner enables native
WebMCP and rejects a missing/polyfilled registry. Artifacts record source commit, dirty-tree status,
browser, platform, and toolchain versions.

To check deterministic behavior without rewriting artifacts:

```bash
CHROME_BIN=/path/to/chrome-canary pnpm test:hooks:eval
```

CI runs this same production evaluation. Registration and commit assertions are gates;
hardware-dependent durations have no pass/fail threshold.

The isolated benchmark lockfile pins React 19.2.8, MCP Cat's `webmcp-react` 1.1.0,
Google's `use-webmcp-tool` 0.2.0, and Zod 4.4.3. Our packages come from the checkout.
Competitor dependencies are excluded from the main workspace and published packages.

## Production modes

The [fixture](production.jsx) and [runner](production.mjs) compare nine modes:

| Mode                      | Execution-state subscription | Added plugins                |
| ------------------------- | ---------------------------- | ---------------------------- |
| `usewebmcp`               | None                         | None                         |
| `@mcp-b/react-webmcp`     | None                         | None                         |
| MCP Cat                   | Owner, package behavior      | Package behavior             |
| Google                    | None                         | Package behavior             |
| Core + state in owner     | Registration owner           | Execution state              |
| Core + state in child     | Status child                 | Execution state              |
| Core + unsubscribed state | Recorded, no subscriber      | Execution state              |
| Core + passthrough        | None                         | One named passthrough plugin |
| Core + OTel no-op         | None                         | OTel with a no-op tracer     |

Owner commits count the component registering the tool. Status-child commits are counted
separately. A zero owner count does not imply that no child updates, or that a loading indicator
exists. The unsubscribed-state mode verifies that its store records every call. OTel measures
local instrumentation overhead without a provider or exporter.

Each mode runs with 1, 10, and 100 tools; 1 or 100 schema fields; and stable or equivalent inline
schema objects. Twelve scenarios × nine modes × five trials produce **540 samples**, after one
warmup per scenario/mode. Mode order rotates.

Each sample mounts a fresh root, performs ten unrelated parent updates, changes every description,
and calls the first tool ten times sequentially. All modes use the same JSON Schema and handler,
which yields one MessageChannel task. MCP Cat uses its documented provider and native registry.

## Metrics and checks

| Metric             | Meaning                                                                        |
| ------------------ | ------------------------------------------------------------------------------ |
| Registrations      | Native `registerTool` attempts during mount and updates                        |
| Owner commits      | Committed renders in the registration component's layout effect                |
| Child commits      | Committed renders in the optional status child                                 |
| Completion latency | Time through callback, required React work, and native registration completion |
| Callback latency   | Time until the registered callback resolves, before waiting for React          |

The harness awaits native registration promises, verifies metadata and current handler closures,
checks completed results and exposed state, and confirms unmount removes tools. Expected aborted
setup attempts are recorded; other browser errors fail. Two quiet task turns confirm settlement
but are excluded from endpoint timestamps.

Counts show observed ranges. Timing summaries report medians and ranges across five trials;
each trial's ten updates/calls is summarized first. These are browser completion latencies,
including scheduling, not CPU or paint time. Values round to 0.01 ms. No network, transport,
application schema validator, retained-heap measurement, or timing threshold is included.

Production uses no `act()`, `flushSync()`, or profiling build. See
[Vite production builds](https://vite.dev/guide/build),
[React profiling caveats](https://react.dev/reference/react/Profiler#caveats), and
[clock precision](https://developer.mozilla.org/en-US/docs/Web/API/Performance/now#security_requirements).

## Bundle method

The [bundle runner](bundle.mjs) measures four tool hooks and five plugin entries:
runner, Standard Schema, execution state, consent, and OTel. Each entry is tree-shaken
from production ESM with Vite+, targeting ES2022. Artifacts include raw, Oxc-minified, and gzip
level 9 sizes.

React and React DOM are external; other imported dependencies remain included. Each entry measures
one export, except consent, which measures the usable `ConsentBroker` + `consent` pair. Sizes do
not represent a complete application or the incremental cost of combining plugins. Application
validators and browser setup are excluded. Assertions check exports, dependency resolution, and
unexpected MCP SDK/polyfill initializer code in the core bundle.

Primary comparison sources: [MCP Cat](https://github.com/agentcathq/webmcp-react),
[GoogleChromeLabs/use-webmcp-tool](https://github.com/GoogleChromeLabs/use-webmcp-tool),
[usewebmcp](../../packages/usewebmcp/README.md), and
[the MCP-B adapter](../../packages/react-webmcp/README.md).
