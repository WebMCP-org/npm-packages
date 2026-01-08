# WebMCP Setup Troubleshooting

Common issues and solutions when setting up WebMCP in web applications.

## Installation Issues

### Package Not Found

**Symptom:**
```
npm ERR! 404 Not Found - GET https://registry.npmjs.org/@mcp-b/react-webmcp
```

**Solutions:**
1. Verify package name is correct
2. Check npm registry is accessible
3. Try with specific version: `npm install @mcp-b/react-webmcp@0.3.0`
4. Clear npm cache: `npm cache clean --force`

### Peer Dependency Warnings

**Symptom:**
```
npm WARN react-webmcp@0.3.0 requires a peer of react@^17.0.0 || ^18.0.0 || ^19.0.0
```

**Solutions:**
1. Install missing peer dependencies: `npm install react react-dom`
2. Check your React version is compatible (17+)
3. Upgrade React if needed: `npm install react@latest react-dom@latest`

## Runtime Issues

### Global Bridge Not Loading

**Symptom:**
```
Uncaught ReferenceError: webMCP is not defined
```

**Solutions:**
1. Verify the script tag is in your HTML:
   ```html
   <script src="https://unpkg.com/@mcp-b/global@latest/dist/index.global.js"></script>
   ```
2. Check browser console for 404 errors
3. Try using a specific version instead of `@latest`
4. Ensure script is loaded before your app code
5. For Next.js, add to `pages/_document.tsx` or `app/layout.tsx`

### Tools Not Registering

**Symptom:**
- No errors but tools don't appear in MCP clients

**Solutions:**
1. Check that global bridge loaded successfully (console message)
2. Verify tool registration happens after bridge initializes
3. Check for JavaScript errors in console
4. Use `await` when creating client in async contexts
5. Ensure tool names are unique

### CORS Errors

**Symptom:**
```
Access to fetch at 'https://api.example.com' has been blocked by CORS policy
```

**Solutions:**
1. This is not a WebMCP issue - configure your API CORS headers
2. For development, use a CORS proxy or disable browser security (not recommended)
3. Ensure your backend allows the origin your app runs on

## Browser Compatibility

### Older Browsers

**Symptom:**
- WebMCP not working in older browsers

**Solutions:**
1. WebMCP requires modern browser features (ES2020+)
2. Minimum versions:
   - Chrome 90+
   - Firefox 88+
   - Safari 14+
   - Edge 90+
3. Add polyfills if targeting older browsers
4. Check browser console for specific errors

### Mobile Browsers

**Symptom:**
- Issues on mobile devices

**Solutions:**
1. WebMCP works on mobile browsers (Chrome, Safari)
2. Chrome DevTools MCP requires desktop Chrome for connection
3. Consider responsive design for tool interactions
4. Test on actual devices, not just desktop emulators

## Framework-Specific Issues

### React: Hook Errors

**Symptom:**
```
Error: Invalid hook call. Hooks can only be called inside the body of a function component.
```

**Solutions:**
1. Ensure `useWebMCP` is called inside a React component
2. Check React version is 17+ (hooks requirement)
3. Don't call `useWebMCP` conditionally
4. Don't call inside loops or callbacks

### React: Infinite Re-renders

**Symptom:**
- Browser freezes or crashes
- Console shows thousands of tool registrations

**Solutions:**
1. Memoize schemas with `useMemo`:
   ```tsx
   const outputSchema = useMemo(() => ({
     success: z.boolean()
   }), []);
   ```
2. Use primitive values in deps array:
   ```tsx
   useWebMCP({ ... }, [count]); // Good
   useWebMCP({ ... }, [{ count }]); // Bad - new object every render
   ```
3. Ensure callbacks are stable with `useCallback`

### Next.js: Server-Side Rendering Issues

**Symptom:**
```
ReferenceError: window is not defined
```

**Solutions:**
1. Wrap WebMCP code in client-side check:
   ```tsx
   'use client'; // For App Router

   import dynamic from 'next/dynamic';

   const WebMCPComponent = dynamic(
     () => import('./WebMCPComponent'),
     { ssr: false }
   );
   ```
2. Use `useEffect` to register tools only on client
3. Add global bridge script in `_document.tsx` or layout

### Vue: Reactivity Issues

**Symptom:**
- Tools don't update when reactive state changes

**Solutions:**
1. Re-register tools when state changes:
   ```typescript
   watch([count, message], () => {
     client.updateTool('my_tool', {
       description: `Count: ${count.value}`
     });
   });
   ```
2. Use computed properties for descriptions
3. Ensure tool handler captures latest state

## Testing Issues

### Chrome DevTools MCP Connection Failed

**Symptom:**
- Can't connect Chrome DevTools MCP to page

**Solutions:**
1. Ensure page is served over HTTP/HTTPS (not `file://`)
2. Page must be on localhost or HTTPS
3. Check Chrome DevTools MCP is running
4. Verify no browser extensions blocking connection
5. Try in incognito mode

### Tools Timeout

**Symptom:**
```
Error: Tool execution timed out after 30000ms
```

**Solutions:**
1. Reduce handler execution time
2. Move long-running tasks to background
3. Use web workers for heavy computation
4. Return partial results with progress updates
5. Consider tool execution limits

## Performance Issues

### Slow Tool Registration

**Symptom:**
- Page freezes during initial load

**Solutions:**
1. Register tools lazily (when needed)
2. Batch tool registrations
3. Avoid registering unnecessary tools
4. Use code splitting for large tool sets
5. Profile with browser DevTools

### Memory Leaks

**Symptom:**
- Browser memory usage grows over time

**Solutions:**
1. Unregister tools when components unmount (React)
2. Clean up event listeners
3. Avoid capturing large objects in tool closures
4. Use WeakMap/WeakSet for object references
5. Profile with Chrome DevTools memory profiler

## Production Issues

### Tools Exposed in Production

**Symptom:**
- Security concern about exposing tools publicly

**Solutions:**
1. Implement authentication/authorization
2. Gate tool registration behind feature flags
3. Use environment-specific builds
4. Consider tool access controls
5. See [SECURITY.md](SECURITY.md) for best practices

### Bundle Size Too Large

**Symptom:**
- App bundle size increased significantly

**Solutions:**
1. Tree-shake unused WebMCP packages
2. Use dynamic imports for tools
3. Split tools into separate chunks
4. Consider using IIFE only (no npm packages)
5. Analyze bundle with webpack-bundle-analyzer

## Getting Help

If you're still stuck:

1. Check browser console for errors
2. Search [GitHub Issues](https://github.com/WebMCP-org/npm-packages/issues)
3. Review [WebMCP Documentation](https://docs.mcp-b.ai)
4. Ask in discussions or file an issue
5. Include:
   - Browser and version
   - Framework and version
   - WebMCP package versions
   - Minimal reproduction code
   - Error messages and stack traces
