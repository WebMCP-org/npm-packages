# Bug: Connection closes prematurely on SPA navigation

## Summary

The `WebMCPClientTransport` incorrectly closes the connection when a Single Page Application (SPA) performs client-side navigation using the History API. This causes WebMCP tool calls that trigger navigation to fail with "Connection closed" errors, even though the bridge script is still alive on the page.

## Affected File

`src/transports/WebMCPClientTransport.ts`

## Root Cause

The transport listens for `framenavigated` events (line 300):

```typescript
this._page.on('framenavigated', this._frameNavigatedHandler);
```

When this event fires for the main frame, `_handleNavigation()` is called (lines 289-294):

```typescript
this._frameNavigatedHandler = (frame: unknown) => {
  if (frame === this._page.mainFrame()) {
    // Main frame navigated, bridge is gone
    this._handleNavigation();
  }
};
```

`_handleNavigation()` (lines 395-417) then:
1. Sets `this._closed = true`
2. Sets `this._serverReady = false`
3. Calls `this.onclose?.()`

**The problem:** The `framenavigated` event fires for BOTH:
1. Full page navigations (where the bridge IS destroyed)
2. Client-side SPA navigations via History API (where the bridge is STILL ALIVE)

For SPA navigations (e.g., React Router, TanStack Router, Next.js), the page doesn't actually reload - only the URL changes. The injected bridge script remains intact and functional.

## Reproduction

1. Load a page with WebMCP tools (e.g., a React app with TanStack Router)
2. Call a WebMCP tool that triggers client-side navigation
3. The tool call fails with "Connection closed" error
4. However, the navigation succeeds and the bridge is still functional

Example failing scenario:
```typescript
// WebMCP tool handler
handler: async ({ path }) => {
  navigate({ to: path });  // TanStack Router navigation
  return { success: true };  // This response never reaches the client
}
```

## Current Workaround

Apps must delay navigation to allow the response to complete before `framenavigated` fires:

```typescript
handler: async ({ path }) => {
  setTimeout(() => navigate({ to: path }), 50);  // Delay navigation
  return { success: true };  // Response completes first
}
```

This works but is a band-aid, not a proper fix.

## Suggested Fix

Before closing the connection on `framenavigated`, check if the bridge is still available:

### Option 1: Check bridge availability before closing

```typescript
private async _handleNavigation(): Promise<void> {
  if (this._closed) return;

  // Check if bridge is still available (SPA navigation keeps it alive)
  try {
    const bridgeStillAlive = await this._page.evaluate((bridgeProp: string) => {
      return !!(window as any)[bridgeProp];
    }, CDP_BRIDGE_WINDOW_PROPERTY);

    if (bridgeStillAlive) {
      // SPA navigation - bridge survived, don't close
      return;
    }
  } catch {
    // Page is truly gone, proceed with close
  }

  // Full navigation - bridge is lost, close connection
  this._serverReady = false;
  this._closed = true;
  // ... rest of cleanup
}
```

### Option 2: Debounce/delay the navigation handler

Add a small delay before checking, since the bridge might need a moment to reinitialize after navigation:

```typescript
private _handleNavigation(): void {
  if (this._closed) return;

  // Debounce - SPA navigations happen quickly
  setTimeout(async () => {
    if (this._closed) return;

    const bridgeAvailable = await this.checkWebMCPAvailable();
    if (bridgeAvailable.available) {
      // Bridge survived - this was an SPA navigation
      return;
    }

    // Bridge is gone - close connection
    this._closeConnection();
  }, 100);
}
```

### Option 3: Listen for actual page unload instead

Instead of `framenavigated`, use signals that indicate true page destruction:
- `Page.lifecycleEvent` with `name: 'DOMContentLoaded'` or `name: 'load'` (indicates new page)
- Check if the frame's URL actually changed to a different origin
- Use `Page.frameStoppedLoading` combined with URL change detection

## Additional Context

- The bridge script is injected via CDP and communicates via `window.postMessage`
- For SPA navigations, the JavaScript context is preserved
- The `framenavigated` event is too aggressive as a signal for "bridge lost"
- The existing `checkWebMCPAvailable()` method (line 190) can be reused to verify bridge status

## Impact

Any WebMCP tool that triggers client-side navigation will fail. This affects:
- Navigation tools (`nav_goto`, etc.)
- Any tool that redirects the user after an action
- Form submissions that navigate on success

## Test Case

```typescript
it('should not close connection on SPA navigation', async () => {
  // Setup: Page with React/TanStack Router and WebMCP tools
  const transport = new WebMCPClientTransport({ page });
  await transport.start();

  // Trigger SPA navigation via the page
  await page.evaluate(() => {
    window.history.pushState({}, '', '/new-path');
    window.dispatchEvent(new PopStateEvent('popstate'));
  });

  // Transport should still be connected
  expect(transport.isClosed()).toBe(false);

  // Should still be able to send messages
  await expect(transport.send({ jsonrpc: '2.0', method: 'test', id: 1 }))
    .resolves.not.toThrow();
});
```
