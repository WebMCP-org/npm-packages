# React hook comparison

Measure the React work around a WebMCP tool, then render the results with the shared
[design system](https://github.com/WebMCP-org/design-system). The published figures are
static screenshots of its D3-backed chart components.

[Results](RESULTS.md) · [Raw samples](results.json) · [Measurement source](measure.jsx)

## What the numbers show

In this fixture, starting ten overlapping calls causes one commit in `usewebmcp` and
`@mcp-b/react-webmcp`, and ten in MCP Cat's `webmcp-react`. Our hooks keep the same
pending state while additional calls start. Each completed call still updates its result
and count, producing ten commits in all three hooks.

All four hooks avoid re-registration when a parent supplies equivalent inline definitions.
Changing metadata triggers registration updates in all four. Our hooks and Google's hook
also publish registration status, so that scenario produces twenty commits compared with
MCP Cat's ten. Google's hook has no execution state; those columns are marked N/A.

These are React commit counts for a small component in a development build. They do not
measure execution time, memory, bundle size, network traffic, or application performance.
Do not turn the result into a "10× faster" claim.

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
producing forty samples. The table reports the observed range. The chart uses the median
and includes the range below it. Every range collapsed to a single value in the recorded run.

The harness also checks that exactly one tool remains registered, each call uses the
latest committed props, all ten calls complete, exposed execution state returns to idle,
and unmount removes the tool. These assertions keep an inactive or broken hook from
appearing efficient. This fixture does not replace the
[lifecycle and package tests](../../docs/TESTING.md#react-hook-harness).

## Choosing a hook

This table describes the versions measured above. "Yes" means the hook supplies the
feature without application glue.

| Capability                                     | `usewebmcp`         | `@mcp-b/react-webmcp` | MCP Cat `webmcp-react` | Google `use-webmcp-tool` |
| ---------------------------------------------- | ------------------- | --------------------- | ---------------------- | ------------------------ |
| Plain JSON Schema input                        | Yes                 | Yes                   | Yes                    | Yes                      |
| Input validation supplied by a schema library  | Standard Schema     | Standard Schema       | Zod                    | In your handler          |
| Local execution and observable execution state | Yes                 | Yes                   | Yes                    | Registration only        |
| Dedicated registration status                  | Yes                 | Yes                   | No                     | Yes                      |
| Default successful agent result                | Raw handler value   | MCP response          | MCP response           | MCP response             |
| Prompt, resource, and MCP client hooks         | Use the MCP adapter | Yes                   | No                     | No                       |

Equivalent inline definitions are stable in all four hooks in this fixture. SSR and
StrictMode support are also shared capabilities, not reasons to dismiss the alternatives.
MCP Cat includes a provider and polyfill for setup; our hooks leave runtime installation
to the application. Its hook can also use an installed runtime without that provider.
Google's smaller API is useful when registration is all a component needs.

Our core hook uses the Community Group's
[`webmcp-types`](https://github.com/webmachinelearning/webmcp-types). It calls the supplied
[Standard JSON Schema](https://standardschema.dev/json-schema) converter and
[Standard Schema](https://standardschema.dev/) validator rather than installing a validation
engine. The MCP adapter adds protocol features while sharing that lifecycle.

First-party sources:

- [MCP Cat source and documentation](https://github.com/agentcathq/webmcp-react)
  and [published 1.1.0 package](https://www.npmjs.com/package/webmcp-react/v/1.1.0).
- [GoogleChromeLabs/use-webmcp-tool](https://github.com/GoogleChromeLabs/use-webmcp-tool),
  created by Sarah Drasner, and its
  [published 0.2.0 package](https://www.npmjs.com/package/use-webmcp-tool/v/0.2.0).
- [Core hook](../../packages/usewebmcp/README.md) and
  [MCP adapter](../../packages/react-webmcp/README.md).

## Regenerate the README images

The report imports `@mcp-b/design-tokens` CSS and the existing `sigvelo-chart` and
`sigvelo-chart-card` components from a sibling design-system checkout. Build its
`@mcp-b/viz-components` package and workspace dependencies first. The images in this
revision use design-system commit `75442b31fc8e8f7dc963c799951786c02d799f33`.

```bash
DESIGN_SYSTEM_DIR=../design-system \
  CHROME_BIN=/path/to/chrome-canary \
  node benchmarks/react-hooks/run.mjs --render
```

This reads the recorded results without rerunning measurements. It captures both figures
in light and dark themes at 2× resolution and writes them to
[`apps/documentation-website/images/react-hooks`](../../apps/documentation-website/images/react-hooks).
The adjacent `provenance.json` records the design-system commit, result-file hash, and
capture settings. The report source is [report.html](report.html).

The docs use local image paths. Package READMEs use permanent GitHub asset URLs so the
images also load on npm. After changing the report, rerender it and update both theme
URLs to the commit containing the new images.
