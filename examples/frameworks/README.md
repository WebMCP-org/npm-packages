# Framework WebMCP Examples

These are **real, runnable mini repos** for popular frontend frameworks.

Each example demonstrates the smallest useful WebMCP flow:

1. Initialize `@mcp-b/webmcp-polyfill`.
2. Register one tool via `navigator.modelContext` (or `useWebMCP` for React).
3. Return a text payload from `execute`.

## Included examples

- [React (Vite)](./react/)
- [Next.js (App Router)](./nextjs/)
- [Vue 3 (Vite)](./vue/)
- [Svelte (Vite)](./svelte/)

## Quick start

```bash
cd examples/frameworks/react # or nextjs / vue / svelte
pnpm install
pnpm dev
```

> Note: `examples/**` is explicitly excluded from the root `pnpm-workspace.yaml` to keep these samples standalone.
