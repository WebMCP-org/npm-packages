# React hook comparison

Measure React commits around WebMCP tools. Render the chart with D3 and the shared
[design system](https://github.com/WebMCP-org/design-system).

[Results](RESULTS.md) · [Raw samples](results.json) · [Measurement source](measure.jsx)

## Performance comparison

The chart compares component re-renders in two scenarios:

- **Change a tool's description 10 times:** our hooks and Google produce 20 re-renders;
  MCP Cat produces 10. Counts include registration-status updates where exposed.
- **Run 10 overlapping calls, from start to finish:** our hooks produce 11 re-renders;
  MCP Cat produces 20. Google exposes no execution state, so this comparison does not apply.

Registration is a tie: all four make 0 registrations on 10 unrelated re-renders, and 10 registrations on 10 description changes.

These are committed React updates in a development build, not elapsed time or a general
speed ranking. The call total adds each sample's start and settle counts before summarizing.

## Reproduce the measurements

From the repository root, install and build the workspace, then install the isolated
benchmark dependencies:

```bash
pnpm install --frozen-lockfile
pnpm build
pnpm --dir benchmarks/react-hooks install --frozen-lockfile --ignore-scripts
CHROME_BIN=/path/to/chrome-canary node benchmarks/react-hooks/run.mjs
pnpm exec vp check --fix benchmarks/react-hooks/RESULTS.md
```

The runner enables native WebMCP in Chrome and rejects a missing or polyfilled registry.
Use a Chrome build with the native API available. The checked-in run used Chrome
155.0.8043.0 on macOS arm64; the exact browser, React version, date, and hook source commit
are recorded in [results.json](results.json).

The separate package and lockfile pin React 19.2.8,
[`webmcp-react` 1.1.0](https://www.npmjs.com/package/webmcp-react/v/1.1.0),
[`use-webmcp-tool` 0.2.0](https://www.npmjs.com/package/use-webmcp-tool/v/0.2.0),
and Zod 4.4.3. Our hooks are built from this checkout; the checked-in results use the
unreleased implementation in [PR #329](https://github.com/WebMCP-org/npm-packages/pull/329).
Competitor packages stay outside the main workspace and published package dependencies.

## Method

Each hook gets a fresh React root and the same native Chrome registry. MCP Cat uses its
documented provider, which preserves this native registry. No runtime is installed by
the other hooks. All hooks receive the same plain JSON Schema, annotations, delayed
handler, and arguments. Schema validation is outside this measurement.

A React `Profiler` inside the component counts committed updates, excluding initial
mount and registration. Native registration promises settle before a scenario starts.
The harness observes the expected aborted setup in StrictMode and fails on other browser
errors. Each operation runs in a separate `act()` scope so React cannot batch the whole
scenario into one update.

1. **Parent updates:** ten renders with new handler closures and equivalent inline schema
   and metadata. Ten commits are the requested baseline; additional registrations count
   as churn.
2. **Metadata updates:** ten changes to the description. Counts include registration
   status updates when the hook exposes them.
3. **Start calls:** invoke the callback passed to native `registerTool` ten times,
   keeping all handlers pending. The registry's transport and serialization are excluded.
4. **Settle calls:** resolve those handlers one at a time, allowing each update to commit.

Five trials run with StrictMode disabled and five with it enabled for every hook,
producing forty samples. The tables report observed ranges; bars show median React commits
on a shared scale. Every range collapsed to a single value in the recorded run.

The harness also checks that exactly one tool remains registered, each call uses the
latest committed props, all ten calls complete, exposed execution state returns to idle,
and unmount removes the tool. These assertions keep an inactive or broken hook from
appearing efficient. This fixture does not replace the
[lifecycle and package tests](../../docs/TESTING.md#react-hook-harness).

## Feature comparison

| Feature                         | `usewebmcp`     | `@mcp-b/react-webmcp` | MCP Cat | Google |
| ------------------------------- | --------------- | --------------------- | ------- | ------ |
| Schema validation               | Standard Schema | Standard Schema       | Zod     | Manual |
| Registration status             | Yes             | Yes                   | No      | Yes    |
| Running, result & error state   | Yes             | Yes                   | Yes     | No     |
| Call tools from React           | Yes             | Yes                   | Yes     | No     |
| Automatic MCP result formatting | No              | Yes                   | No      | Yes    |
| Prompt & resource hooks         | No              | Yes                   | No      | No     |

All four accept JSON Schema. Compared: our PR #329, [MCP Cat 1.1.0](https://www.npmjs.com/package/webmcp-react/v/1.1.0), and [Google 0.2.0](https://www.npmjs.com/package/use-webmcp-tool/v/0.2.0).

"Yes" means the hook supplies the feature. "Manual" validation runs in your handler.
Automatic MCP result formatting means the hook wraps a successful handler result in MCP content.
The core hook and MCP Cat can return MCP responses supplied by your handler.

Standard Schema support needs both Standard JSON Schema conversion and Standard Schema
validation. The hook calls your schema library; it ships no validation engine.
Google's error state covers registration, while execution errors have an `onError` callback.

First-party sources:

- [MCP Cat source and documentation](https://github.com/agentcathq/webmcp-react)
  and [published 1.1.0 package](https://www.npmjs.com/package/webmcp-react/v/1.1.0).
- [GoogleChromeLabs/use-webmcp-tool](https://github.com/GoogleChromeLabs/use-webmcp-tool),
  created by Sarah Drasner, and its
  [published 0.2.0 package](https://www.npmjs.com/package/use-webmcp-tool/v/0.2.0).
- [Core hook](../../packages/usewebmcp/README.md) and
  [MCP adapter](../../packages/react-webmcp/README.md).

## Regenerate the README images

The report imports `@mcp-b/design-tokens` CSS, `sigvelo-chart-card`, and D3 scales from
a sibling design-system checkout. Both chart panels count component re-renders on a shared
scale. Build its
`@mcp-b/viz-components` package and workspace dependencies first. The images in this
revision use design-system commit `75442b31fc8e8f7dc963c799951786c02d799f33`.

```bash
DESIGN_SYSTEM_DIR=../design-system \
  CHROME_BIN=/path/to/chrome-canary \
  node benchmarks/react-hooks/run.mjs --render
```

This reads the recorded results without rerunning measurements. It captures the chart
in light and dark themes at 2× resolution and writes them to
[`apps/documentation-website/images/react-hooks`](../../apps/documentation-website/images/react-hooks).
The adjacent `provenance.json` records the design-system commit, result-file hash, and
capture settings. The report source is [report.html](report.html).

The docs use local image paths. Package READMEs use permanent GitHub asset URLs so the
images also load on npm. After changing the report, rerender it and update both theme
URLs to the commit containing the new images.
