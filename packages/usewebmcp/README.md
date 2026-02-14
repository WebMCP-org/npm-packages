# usewebmcp

> React hooks for strict core WebMCP (`navigator.modelContext`) usage.

`usewebmcp` is intentionally separate from `@mcp-b/react-webmcp`.

- Use `usewebmcp` when you want strict core WebMCP-only hooks.
- Use `@mcp-b/react-webmcp` when you want full MCP-B runtime hooks (core + MCP-B extensions).

## Install

```bash
pnpm add usewebmcp zod
```

## Quick Example

```tsx
import { useWebMCP } from 'usewebmcp';
import { z } from 'zod';

function App() {
  useWebMCP({
    name: 'counter_get',
    description: 'Get current count',
    inputSchema: {},
    outputSchema: {
      count: z.number(),
    },
    handler: async () => ({ count: 42 }),
  });

  return null;
}
```
