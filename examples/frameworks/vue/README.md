# Vue + WebMCP Example

Minimal Vue 3 (Vite) app that registers a single WebMCP tool.

## Quick Start

```bash
pnpm install
pnpm dev
```

## Key File

- [`src/App.vue`](src/App.vue) — tool registration in `onMounted`

## What It Does

Registers a `current_route` tool via `@mcp-b/webmcp-polyfill` that returns the current route path.

## Try It

[![Open in StackBlitz](https://developer.stackblitz.com/img/open_in_stackblitz.svg)](https://stackblitz.com/github/WebMCP-org/npm-packages/tree/main/examples/frameworks/vue)
