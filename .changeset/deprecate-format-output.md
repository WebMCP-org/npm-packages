---
"@mcp-b/react-webmcp": minor
---

Deprecate `formatOutput` option in favor of `outputSchema`

The `formatOutput` option is now deprecated and will show a console warning when used.
This aligns the React hooks with the MCP specification which recommends using `outputSchema`
for structured tool responses via `structuredContent`.

**Migration:**

```typescript
// Before (deprecated)
useWebMCP({
  name: 'get_count',
  handler: async () => ({ count: 5 }),
  formatOutput: (result) => `Count is ${result.count}`,
});

// After (recommended)
useWebMCP({
  name: 'get_count',
  outputSchema: {
    count: z.number().describe('The current count'),
  },
  handler: async () => ({ count: 5 }),
});
```

When `outputSchema` is defined, the MCP response includes `structuredContent` with the typed
output, which is the standard way for AI agents to consume tool results.
