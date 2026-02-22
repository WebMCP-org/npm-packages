# Astro + WebMCP Example

Minimal Astro app that registers a single WebMCP tool.

## Quick Start

```bash
pnpm install
pnpm dev
```

## Standalone Usage

This example uses `workspace:*` dependencies to link against the local monorepo packages. To use it outside the monorepo, replace the workspace reference in `package.json`:

```json
"@mcp-b/webmcp-polyfill": "latest"
```

## Key File

- [`src/pages/index.astro`](src/pages/index.astro) — tool registration in a client-side `<script>`

## What It Does

Registers a `get_status` tool via `@mcp-b/webmcp-polyfill` in a client-side `<script>` tag.

## Try It

[![Open in StackBlitz](https://developer.stackblitz.com/img/open_in_stackblitz.svg)](https://stackblitz.com/github/WebMCP-org/npm-packages/tree/main/examples/frameworks/astro)
