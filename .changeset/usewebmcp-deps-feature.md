---
"@mcp-b/react-webmcp": minor
---

Add `deps` argument to useWebMCP hook for automatic tool re-registration

The new `deps` argument (second parameter) allows you to specify a dependency array that triggers tool re-registration when values change. This follows the idiomatic React pattern used by `useEffect`, `useMemo`, and `useCallback`.

Example usage:
```tsx
useWebMCP(
  {
    name: 'sites_query',
    description: `Query sites. Current count: ${sites.length}`,
    handler: async () => ({ sites }),
  },
  [sites] // Re-register when sites changes
);
```

Previously, you would need getter functions like `getSiteCount: () => sites.length` to access current state. Now you can reference values directly and the tool will automatically re-register when dependencies change.

## Performance Optimizations

The hook is optimized to minimize unnecessary JSON-RPC tool update calls:

- **Memoized JSON conversion**: Zod-to-JSON schema conversions are memoized to avoid recomputation on every render.
- **Ref-based callbacks**: `handler`, `onSuccess`, `onError`, and `formatOutput` changes don't trigger re-registration.
- **Single useLayoutEffect**: All callback refs are updated synchronously in a single effect for better performance.

## IMPORTANT: Memoize Your Schemas

Following standard React practices (like React Hook Form and React Query), `inputSchema`, `outputSchema`, and `annotations` use **reference equality** for dependency tracking. You must memoize these values to prevent unnecessary re-registration:

```tsx
// ✅ Good: Memoized schema (recommended)
const outputSchema = useMemo(() => ({
  count: z.number(),
  items: z.array(z.string()),
}), []);

useWebMCP({ name: 'query', outputSchema, handler: ... });

// ✅ Good: Static schema outside component
const OUTPUT_SCHEMA = {
  count: z.number(),
  items: z.array(z.string()),
};

function MyComponent() {
  useWebMCP({ name: 'query', outputSchema: OUTPUT_SCHEMA, handler: ... });
}

// ❌ Bad: Inline schema (re-registers every render!)
useWebMCP({
  name: 'query',
  outputSchema: { count: z.number() }, // Creates new object every render
  handler: ...
});
```

**Best practice for deps**: Use primitive values instead of objects/arrays when possible:
```tsx
// Better: derived primitives minimize re-registrations
const siteIds = sites.map(s => s.id).join(',');
const siteCount = sites.length;

useWebMCP(
  { name: 'sites_query', description: '...', handler: async () => ({ sites }) },
  [siteCount, siteIds] // Only re-register when these primitives change
);
```

## New Demo Application

Added comprehensive demo app at `e2e/mcp-ui-with-webmcp/apps/webmcp-demo` showcasing:
- All `useWebMCP` features with proper memoization patterns
- Integration with React 19 and Tailwind v4
- Five working MCP tools with structured outputs
- Real-world examples of the `deps` parameter
