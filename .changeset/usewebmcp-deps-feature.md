---
"@mcp-b/react-webmcp": minor
---

Add `deps` property to useWebMCP hook for automatic tool re-registration

The new `deps` option allows you to specify a dependency array that triggers tool re-registration when values change. This eliminates the need for getter functions when using dynamic values in tool descriptions or handlers.

Example usage:
```tsx
useWebMCP({
  name: 'sites_query',
  description: `Query sites. Current count: ${sites.length}`,
  handler: async () => ({ sites }),
  deps: [sites], // Re-register when sites changes
});
```

Previously, you would need getter functions like `getSiteCount: () => sites.length` to access current state. Now you can reference values directly and the tool will automatically re-register when dependencies change.

## Performance Optimizations

The hook is now optimized to minimize unnecessary JSON-RPC tool update calls:

- **Stable schema comparison**: `inputSchema`, `outputSchema`, and `annotations` are compared by content (JSON serialization), not reference. Passing a new object with the same content won't trigger re-registration.
- **Memoized JSON conversion**: Zod-to-JSON schema conversions are memoized.
- **Ref-based callbacks**: `handler`, `onSuccess`, `onError`, and `formatOutput` changes don't trigger re-registration.

**Best practice**: Use primitive values in `deps` instead of objects/arrays when possible:
```tsx
// Better: derived primitives minimize re-registrations
const siteIds = sites.map(s => s.id).join(',');
useWebMCP({
  deps: [sites.length, siteIds],
});
```
