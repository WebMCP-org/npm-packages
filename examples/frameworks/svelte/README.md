# Svelte + WebMCP Example

Minimal Svelte 5 (Vite) app that registers a single WebMCP tool.

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

- [`src/App.svelte`](src/App.svelte) — tool registration in `onMount`

## What It Does

Registers a `get_info` tool via `@mcp-b/webmcp-polyfill` that returns basic app info.

## Try It

[![Open in StackBlitz](https://developer.stackblitz.com/img/open_in_stackblitz.svg)](https://stackblitz.com/github/WebMCP-org/npm-packages/tree/main/examples/frameworks/svelte)
