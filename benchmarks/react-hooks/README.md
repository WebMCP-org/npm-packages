# React hook comparison

Measure React commits around WebMCP tools. Render the figures with D3 and the shared
[design system](https://github.com/WebMCP-org/design-system).

[Results](RESULTS.md) · [Raw samples](results.json) · [Measurement source](measure.jsx)

## What the numbers show

Registration is measured for all four hooks. Ten parent updates with equivalent definitions
cause zero re-registrations. Ten metadata changes cause ten registrations in every hook.
Google and both of our hooks produce twenty React commits for those metadata changes;
MCP Cat produces ten. Commit counts include registration status where exposed.

Execution is a separate comparison. Starting ten overlapping calls produces one commit in
each of our hooks and ten in MCP Cat. Completing those calls produces ten commits in all
three. Google's registration counts appear alongside theirs; only its execution-state
columns are N/A because it exposes no running-call state.

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
producing forty samples. The tables report observed ranges; bars show median React commits
on a shared scale. Every range collapsed to a single value in the recorded run.

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

The report imports `@mcp-b/design-tokens` CSS, `sigvelo-chart-card`, and D3 scales from
a sibling design-system checkout. The figure separates registration calls from React commits
and includes Google's registration measurements. Build its
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
