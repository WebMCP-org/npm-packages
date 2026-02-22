# Next.js + WebMCP Example

Minimal Next.js app that registers a single WebMCP tool.

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

- [`app/page.tsx`](app/page.tsx) — tool registration in a `'use client'` component

## What It Does

Registers a `get_status` tool via `@mcp-b/webmcp-polyfill` in a client component that returns app status.

## Try It

[![Open in StackBlitz](https://developer.stackblitz.com/img/open_in_stackblitz.svg)](https://stackblitz.com/github/WebMCP-org/npm-packages/tree/main/examples/frameworks/nextjs)
