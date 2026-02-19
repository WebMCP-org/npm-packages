# Angular + WebMCP Example

Minimal Angular app that registers a single WebMCP tool.

## Quick Start

```bash
pnpm install
pnpm start
```

## Key File

- [`src/app/app.ts`](src/app/app.ts) — tool registration in `ngOnInit`

## What It Does

Registers a `get_status` tool via `@mcp-b/webmcp-polyfill` in the root component's `ngOnInit` lifecycle hook.

## Try It

[![Open in StackBlitz](https://developer.stackblitz.com/img/open_in_stackblitz.svg)](https://stackblitz.com/github/WebMCP-org/npm-packages/tree/main/examples/frameworks/angular)
