# React + WebMCP Example

Minimal React (Vite) app that registers a single WebMCP tool using the `useWebMCP` hook.

## Quick Start

```bash
pnpm install
pnpm dev
```

## Standalone Usage

This example uses `workspace:*` dependencies to link against the local monorepo packages. To use it outside the monorepo, replace the workspace references in `package.json`:

```json
"@mcp-b/webmcp-polyfill": "latest",
"usewebmcp": "latest"
```

## Key File

- [`src/App.tsx`](src/App.tsx) — tool registration via `useWebMCP` hook

## What It Does

Registers a `say_hello` tool via [`usewebmcp`](https://www.npmjs.com/package/usewebmcp) that returns a greeting message.

## Try It

[![Open in StackBlitz](https://developer.stackblitz.com/img/open_in_stackblitz.svg)](https://stackblitz.com/github/WebMCP-org/npm-packages/tree/main/examples/frameworks/react)
