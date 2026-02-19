# Vanilla TypeScript + WebMCP Example

Minimal Vite + TypeScript app (no framework) that registers a single WebMCP tool.

## Quick Start

```bash
pnpm install
pnpm dev
```

## Key File

- [`src/main.ts`](src/main.ts) — tool registration at the top level

## What It Does

Registers a `get_status` tool via `@mcp-b/webmcp-polyfill` directly in the entry script.

## Try It

[![Open in StackBlitz](https://developer.stackblitz.com/img/open_in_stackblitz.svg)](https://stackblitz.com/github/WebMCP-org/npm-packages/tree/main/examples/frameworks/vanilla)
