# React hook comparison

Measure production browser behavior, bundle size, and React commits around WebMCP tools.
Render the chart with D3 and the shared
[design system](https://github.com/WebMCP-org/design-system).

[Production results](PRODUCTION.md) · [Bundle sizes](bundle-results.json) · [Development fixture](RESULTS.md)

## Performance comparison

The README chart uses the production build: one tool with a stable one-field JSON Schema,
five trials, excluding mount.
Bars show medians; labels show observed ranges.

- **Change its description once:** our hooks produce 3 re-renders, MCP Cat 1, Google 2.
- **Run one asynchronous call:** our hooks produce 2 re-renders, MCP Cat 1–2.
  Google exposes no execution state.

All four register once per description change and never on unrelated updates. MCP Cat's
provider makes two registrations per tool on mount; the others make one.

Our metadata counts include the requested parent update, pending registration, and native
registration success. MCP Cat exposes no registration status. Google keeps its successful
status during replacement and does not await the native registration promise. Fewer
re-renders therefore do not imply equivalent behavior.

With 100 tools and 100 fields per schema, the core's unrelated updates measured 0.83 ms
with stable schema objects versus 1.80 ms with inline objects in the recorded run.
Define large schemas outside the component when possible.

## Reproduce the measurements

From the repository root, install and build the workspace, then install the isolated
benchmark dependencies:

```bash
pnpm install --frozen-lockfile
pnpm build
pnpm --dir benchmarks/react-hooks install --frozen-lockfile --ignore-scripts
CHROME_BIN=/path/to/chrome-canary node benchmarks/react-hooks/run.mjs
CHROME_BIN=/path/to/chrome-canary node benchmarks/react-hooks/production.mjs
node benchmarks/react-hooks/bundle.mjs
pnpm exec vp check --fix benchmarks/react-hooks
```

The runner enables native WebMCP in Chrome and rejects a missing or polyfilled registry.
Use a Chrome build with the native API available. The checked-in run used Chrome
155.0.8043.0 on macOS arm64; the exact browser, React version, date, and hook source commit
are recorded in each result file. Build from the recorded source commit to reproduce that
revision's hooks. Run timing measurements without concurrent builds or tests.

The separate package and lockfile pin React 19.2.8,
[`webmcp-react` 1.1.0](https://www.npmjs.com/package/webmcp-react/v/1.1.0),
[`use-webmcp-tool` 0.2.0](https://www.npmjs.com/package/use-webmcp-tool/v/0.2.0),
and Zod 4.4.3. Our hooks are built from this checkout; the checked-in results use the
unreleased implementation in [PR #329](https://github.com/WebMCP-org/npm-packages/pull/329).
Competitor packages stay outside the main workspace and published package dependencies.

## Production method

Each hook gets a fresh React root and the same native Chrome registry. MCP Cat uses its
documented provider, which preserves this native registry. No runtime is installed by
the other hooks. All hooks receive the same plain JSON Schema, annotations, delayed
handler, and arguments. Schema validation is outside this measurement.

The [production runner](production.mjs) builds and serves minified JavaScript with Vite.
It measures 1, 10, and 100 tools, each with 1 or 100 schema fields, using both stable
schema objects and equivalent objects created on each render. Each tool has its own schema.
One warmup and five measured trials per hook/scenario produce 240 recorded samples.
Hook order rotates to reduce order bias.

Each case mounts the tools, makes ten unrelated parent updates, changes every description,
then runs ten calls sequentially on the first tool. Every handler yields one MessageChannel
task before returning. The harness checks tool inventory, current metadata and handlers,
completed calls, and registration cleanup on unmount. Expected aborted setup registrations
are counted; other native registration or browser errors fail the run.

A consumer layout effect counts committed renders. Completion waits for native registration
promises, exposed registration/execution state, the expected render and passive effect, and
two quiet task turns. This observed quiet period is not a browser idle guarantee.
Timestamps end at the last observed consumer commit, passive effect, or native registration completion;
call timing also includes callback completion. The subsequent observation wait is excluded.
Raw samples retain callback-only latency, render counts, registrations, and aborted attempts.

The report gives medians and ranges across five trials, summarizing each trial's ten
update/call timings first. These are browser completion latencies on one machine,
including scheduling and native registration, rather than CPU or paint time.
Times round to 0.01 ms; a displayed 0.00 means less than 0.005 ms, not zero work.
Cross-origin isolation enables a higher-resolution clock. No network, transport,
schema validation, retained-heap measurement, or timing threshold is included.

Production uses no React test batching or profiling build. See
[Vite production builds](https://vite.dev/guide/build),
[React's profiling caveats](https://react.dev/reference/react/Profiler#caveats), and
[clock precision](https://developer.mozilla.org/en-US/docs/Web/API/Performance/now#security_requirements).

## Development fixture

The original [development results](RESULTS.md) remain available as a deterministic
regression fixture. They are not the README chart: test batching changes the render counts.
For ten description changes, our hooks and MCP Cat commit ten times and Google twenty.
For ten overlapping calls, our hooks commit eleven times and MCP Cat twenty.
Those counts do not predict sequential production calls.

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
producing forty samples. The development table reports observed ranges.
Every range collapsed to a single value in the recorded run.

The harness also checks that exactly one tool remains registered, each call uses the
latest committed props, all ten calls complete, exposed execution state returns to idle,
and unmount removes the tool. These assertions keep an inactive or broken hook from
appearing efficient. This fixture does not replace the
[lifecycle and package tests](../../docs/TESTING.md#react-hook-harness).

## Bundle method

The [bundle runner](bundle.mjs) imports only each package's tool hook from its production
ESM entry and tree-shakes it with Vite+, targeting ES2022. It records raw, Oxc-minified,
and gzip level 9 sizes. React is external; built-in dependencies remain included.
Application validators, providers, runtime setup, and the rest of the application are
outside this measurement. The runner checks entry resolution, the expected export,
and that no unexpected dependency was externalized.

These are reproducible hook bundle sizes for this toolchain, not total application
download sizes. Results and exact toolchain versions are in [bundle-results.json](bundle-results.json).

## Feature comparison

| Feature                         | `usewebmcp`     | `@mcp-b/react-webmcp` | MCP Cat | Google |
| ------------------------------- | --------------- | --------------------- | ------- | ------ |
| Hook bundle (gzip)              | 1.6 kB          | 2.0 kB                | 24.2 kB | 0.7 kB |
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

This reads the recorded production results without rerunning measurements. It captures the chart
in light and dark themes at 2× resolution and writes them to
[`apps/documentation-website/images/react-hooks`](../../apps/documentation-website/images/react-hooks).
The adjacent `provenance.json` records the design-system commit, result-file hash, and
capture settings. The report source is [report.html](report.html).

The docs use local image paths. Package READMEs use permanent GitHub asset URLs so the
images also load on npm. After changing the report, rerender it and update both theme
URLs to the commit containing the new images.
