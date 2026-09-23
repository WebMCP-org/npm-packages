# React hook benchmarks

The production harness compares native WebMCP registration, React commits, call
completion, and bundle size for `usewebmcp`, `@mcp-b/react-webmcp`, MCP Cat
1.1.0, and Google's `use-webmcp-tool` 0.2.0.

## Recorded results

One tool with a stable one-field JSON Schema, five trials, excluding mount.
Recorded on 2026-09-06 with React 19.2.8 and Chrome 155.0.8043.0 on an Apple
M3 Max (macOS arm64), from hook source commit
`e4bc3510295d19fdd8653b47a9694b0bfe8c8819`.

| Metric                               | usewebmcp | MCP-B React | MCP Cat |             Google |
| ------------------------------------ | --------: | ----------: | ------: | -----------------: |
| Registrations on mount               |         1 |           1 |       2 |                  1 |
| Registrations per unrelated update   |         0 |           0 |       0 |                  0 |
| Registrations per description change |         1 |           1 |       1 |                  1 |
| Re-renders per description change    |         1 |           1 |       1 |                  2 |
| Re-renders per sequential call       |         2 |           2 |     1–2 | No execution state |
| Hook bundle, gzip                    |    1.7 kB |      2.1 kB | 24.2 kB |             0.7 kB |

The bundle measurement imports one tool hook from each production ESM entry,
excludes React, and includes built-in dependencies. It is not a whole-app size.
Google does not expose execution state. All hooks completed their calls and
cleaned up registrations in the recorded run. Times vary by machine and browser;
the runner imposes no timing threshold.

## Run it

From the repository root, use a Chrome build with native WebMCP:

```bash
pnpm install --frozen-lockfile
pnpm build
pnpm --filter usewebmcp --filter @mcp-b/react-webmcp build:prod
pnpm --dir benchmarks/react-hooks install --frozen-lockfile --ignore-scripts
CHROME_BIN=/path/to/chrome-canary node benchmarks/react-hooks/production.mjs
node benchmarks/react-hooks/bundle.mjs
```

The runners write `production-results.json`, `PRODUCTION.md`, and
`bundle-results.json` in this directory. These generated files are ignored by
Git. Run timings without concurrent builds or tests. The browser runner rejects
a missing or polyfilled WebMCP registry and checks registration, current
handlers, completed calls, and cleanup.

The browser runner measures 1, 10, and 100 tools with 1 or 100 schema fields,
using stable and inline schema objects. Each scenario has one warmup and five
measured trials. It measures mount, ten unrelated parent updates, a description
change, and ten sequential calls. Every handler yields one MessageChannel task.
The generated report gives medians and observed ranges; raw samples preserve
individual operations and environment details.

The isolated benchmark lockfile pins React 19.2.8, MCP Cat 1.1.0, Google 0.2.0,
and Zod 4.4.3. Our hooks are built from this checkout. Competitor dependencies
stay outside the main workspace and published packages.
