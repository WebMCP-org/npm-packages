# Test results

This file used to contain a one-off Chromium API test summary from an older
preview. It is no longer the source of truth.

Use the maintained testing docs instead:

- [docs/TESTING.md](./TESTING.md)
- [e2e/tests/CHROMIUM_TESTING.md](../e2e/tests/CHROMIUM_TESTING.md)

For release verification, use the commands in [AGENTS.md](../AGENTS.md):

```bash
pnpm build
pnpm typecheck
vp check
pnpm test:unit
pnpm test:e2e
```

The native WebMCP lanes exercise the current `document.modelContext` and
`navigator.modelContextTesting` browser surfaces. The polyfill/global lanes
exercise the same core behavior through `@mcp-b/webmcp-polyfill` and
`@mcp-b/global`.
