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
