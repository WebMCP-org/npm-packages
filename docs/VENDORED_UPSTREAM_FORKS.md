# Vendored Upstream Forks

This repo keeps `packages/chrome-devtools-mcp` in-tree so MCP-B changes and fork updates can land atomically.

That package is not treated like a normal workspace package.

## Boundary Rules

- Root install, lint, typecheck, build, unit-test, and default E2E flows exclude `packages/chrome-devtools-mcp`.
- Root CI installs the MCP-B workspace with `pnpm install:workspace:ci`.
- Workflows that actually need the fork install it explicitly with `pnpm install:chrome-devtools-mcp:ci` and build it explicitly with `npm --prefix packages/chrome-devtools-mcp run build`.
- The vendored fork should keep local patches minimal and easy to audit.
- Any MCP-B-specific fork changes should be clearly separated from upstream sync commits.

## Local Development

For normal MCP-B work:

```bash
pnpm install:workspace
pnpm build
pnpm typecheck
```

When you are actively working on the vendored fork:

```bash
pnpm install:workspace
pnpm install:chrome-devtools-mcp
npm --prefix packages/chrome-devtools-mcp run build
```

Run fork-local commands through the package directly:

```bash
npm --prefix packages/chrome-devtools-mcp test
npm --prefix packages/chrome-devtools-mcp run typecheck
```

## Why This Exists

Without an explicit boundary, workspace-wide installs run vendored lifecycle scripts and unrelated MCP-B changes start failing on upstream-specific setup. The stricter install split keeps the fork in this repo without letting it leak into default MCP-B development and CI.
