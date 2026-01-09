# BeforeUnload Navigation Handling - Deep Analysis

## Executive Summary

This document analyzes the feasibility and implementation strategies for using the `beforeunload` event to handle navigation scenarios in WebMCP. We explore:

1. **Browser API guarantees and limitations**
2. **Request tracking architecture**
3. **Race condition scenarios**
4. **Alternative approaches (sendBeacon, service workers)**
5. **Recommended implementation with trade-offs**

---

## Part 1: BeforeUnload API Behavior

### What We Know About BeforeUnload

**MDN Documentation:**
- Fires when the window, document, and resources are about to be unloaded
- **Timing**: Fired BEFORE the unload event, while the document is still visible
- **Guarantees**: Synchronous code in the handler WILL execute
- **Limitations**: Very limited time (~10ms typically) before hard cutoff

**Browser Implementation Reality:**
```
User triggers navigation
    ↓
beforeunload event fires (synchronous)
    ├─ Event handlers run (all synchronous code guaranteed)
    ├─ Can execute: variable assignment, sync postMessage
    ├─ Cannot guarantee: async operations, network requests
    ↓
unload event fires (if not already terminated)
    ↓
Page termination (hard cutoff)
```

**Key Constraint**: We have ~10-50ms from beforeunload to page destruction.

### What Works in BeforeUnload

✅ **Guaranteed to work:**
- Synchronous JavaScript execution
- `window.postMessage()` (same-origin, synchronous dispatch)
- Reading/writing to variables
- Calling synchronous functions
- Console logging (may not show in DevTools)

❌ **Not guaranteed:**
- `fetch()` requests (browser may cancel)
- `XMLHttpRequest` (browser may cancel)
- `setTimeout/setInterval` (won't execute)
- Promises (async code may not complete)
- `navigator.sendBeacon()` - Partially reliable (see below)

⚠️ **Partially reliable:**
- `window.postMessage()` to OTHER windows/iframes (may work)
- Event listeners on other windows (depends on timing)

---

## Part 2: SendBeacon API Analysis

### What is SendBeacon?

`navigator.sendBeacon(url, data)` is designed specifically for "fire and forget" requests during page unload.

**Guarantees (per spec):**
- Request is queued by the browser
- Browser WILL attempt to send it even after page unload
- Does not block page unload
- Returns boolean indicating if request was queued

**Limitations:**
- ❌ **Only works for HTTP requests** (not postMessage)
- ❌ **Requires a server endpoint** (can't send to parent window)
- ❌ **POST requests only**
- ❌ **Limited data types** (FormData, string, Blob, ArrayBuffer)
- ❌ **No response handling** (fire and forget)

### Why SendBeacon Doesn't Help Us

```typescript
// ❌ This won't work - sendBeacon requires an HTTP URL
navigator.sendBeacon('http://server.com', JSON.stringify(response));

// ❌ This won't work - can't send to parent window
navigator.sendBeacon(parentWindow, response);

// ✅ This would work IF we had a server
navigator.sendBeacon('https://mcp-bridge.example.com/interrupted', data);
```

**Conclusion**: SendBeacon is **not applicable** for our postMessage-based architecture unless we add a server-side component (which defeats the purpose of WebMCP being client-side only).

---

## Part 3: Request Tracking Architecture

### JSON-RPC Message Flow

**Request Structure** (Client → Server):
```typescript
{
  jsonrpc: "2.0",
  id: "req-123",           // Unique request ID
  method: "tools/call",     // Method name
  params: {
    name: "my_tool",
    arguments: { ... }
  }
}
```

**Response Structure** (Server → Client):
```typescript
{
  jsonrpc: "2.0",
  id: "req-123",           // SAME ID as request
  result: { ... }          // Or "error" field
}
```

**Key Insight**: The `id` field links requests to responses. We can track pending requests by storing all incoming requests until we send the response.

### Proposed Request Tracking

**Option A: Transport-Level Tracking** (Recommended)

Track requests at the transport layer where messages pass through:

```typescript
export class TabServerTransport implements Transport {
  // NEW: Track pending requests
  private pendingRequests = new Map<string | number, {
    request: JSONRPCMessage;
    receivedAt: number;
  }>();

  private beforeUnloadHandler?: () => void;

  async start(): Promise<void> {
    // ... existing code ...

    // NEW: Register beforeunload handler
    this.beforeUnloadHandler = () => {
      this.handleBeforeUnload();
    };
    window.addEventListener('beforeunload', this.beforeUnloadHandler);
  }

  // Override onmessage to track requests
  private _messageHandler = (event: MessageEvent) => {
    // ... existing validation ...

    const message = JSONRPCMessageSchema.parse(payload);

    // Track incoming requests
    if ('method' in message && message.id !== undefined) {
      this.pendingRequests.set(message.id, {
        request: message,
        receivedAt: Date.now(),
      });
    }

    this.onmessage?.(message);
  };

  async send(message: JSONRPCMessage): Promise<void> {
    // Clear from pending when response sent
    if (('result' in message || 'error' in message) && message.id !== undefined) {
      this.pendingRequests.delete(message.id);
    }

    // ... existing postMessage code ...
  }

  private handleBeforeUnload(): void {
    // Send interrupted responses for all pending requests
    for (const [id, { request }] of this.pendingRequests) {
      const toolName = 'method' in request ? request.method : 'unknown';

      const interruptedResponse = {
        jsonrpc: '2.0' as const,
        id,
        result: {
          content: [{
            type: 'text',
            text: `Tool execution interrupted by page navigation`,
          }],
          metadata: {
            navigationInterrupted: true,
            originalMethod: toolName,
            timestamp: Date.now(),
          },
        },
      };

      try {
        // Synchronous postMessage - will complete before unload
        window.postMessage(
          {
            channel: this._channelId,
            type: 'mcp',
            direction: 'server-to-client',
            payload: interruptedResponse,
          },
          this._clientOrigin || '*'
        );
      } catch (error) {
        // Best effort - may fail in rare cases
        console.error('[TabServerTransport] Failed to send beforeunload response:', error);
      }
    }

    this.pendingRequests.clear();
  }

  async close(): Promise<void> {
    if (this.beforeUnloadHandler) {
      window.removeEventListener('beforeunload', this.beforeUnloadHandler);
    }
    // ... existing code ...
  }
}
```

**Option B: MCP Server Level Tracking**

Track at the MCP server level (in BrowserMcpServer):

```typescript
export class BrowserMcpServer extends Server {
  private pendingToolCalls = new Map<string, {
    toolName: string;
    startedAt: number;
  }>();

  private setupNavigationHandler(): void {
    window.addEventListener('beforeunload', () => {
      // Notify for each pending tool call
      for (const [requestId, { toolName }] of this.pendingToolCalls) {
        // This is harder because we don't have direct access to transport
        // Would need to expose a method on Server class
      }
    });
  }
}
```

**Verdict**: **Option A (Transport-Level)** is better because:
- Transport layer has access to send() method
- Transport sees all JSON-RPC messages
- Cleaner separation of concerns
- MCP server shouldn't know about navigation

---

## Part 4: Race Condition Analysis

### Race Condition Scenarios

**Scenario 1: Tool completes BEFORE beforeunload**

```
Timeline:
0ms   - Tool execution starts
50ms  - Tool completes, response sent
100ms - User clicks link
100ms - beforeunload fires
```

**Outcome**: ✅ Normal flow, response already sent
**Handling**: Request is no longer in pendingRequests map

---

**Scenario 2: Tool completes DURING beforeunload**

```
Timeline:
0ms   - Tool execution starts
100ms - User clicks link
100ms - beforeunload fires → sends interrupted response
102ms - Tool completes, tries to send response
```

**Outcome**: ⚠️ Client receives TWO responses with same ID
**Handling**: PROBLEM - violates JSON-RPC spec (one response per request)

**Solution**: Add flag to prevent double responses

```typescript
export class TabServerTransport implements Transport {
  private pendingRequests = new Map<string | number, {
    request: JSONRPCMessage;
    receivedAt: number;
    interruptedSent: boolean;  // NEW FLAG
  }>();

  private handleBeforeUnload(): void {
    for (const [id, info] of this.pendingRequests) {
      // Mark as interrupted
      info.interruptedSent = true;

      // Send interrupted response
      // ...
    }
  }

  async send(message: JSONRPCMessage): Promise<void> {
    if (('result' in message || 'error' in message) && message.id !== undefined) {
      const info = this.pendingRequests.get(message.id);

      // Don't send if we already sent interrupted response
      if (info?.interruptedSent) {
        console.debug(
          `[TabServerTransport] Suppressing response for ${message.id} - ` +
          `interrupted response already sent`
        );
        this.pendingRequests.delete(message.id);
        return;
      }

      this.pendingRequests.delete(message.id);
    }

    // ... existing postMessage code ...
  }
}
```

---

**Scenario 3: Tool causes navigation directly**

```
Timeline:
0ms   - Tool execution starts
50ms  - Tool calls window.location.href = "..." (immediate)
50ms  - beforeunload fires → sends interrupted response
NEVER - Tool's actual response never sent
```

**Outcome**: ✅ Client receives interrupted response
**Problem**: Client doesn't know if tool succeeded or failed

**Solution**: This is WHY we need the pre-navigation response pattern. BeforeUnload is a **fallback**, not the primary solution.

---

**Scenario 4: Multiple rapid navigations**

```
Timeline:
0ms   - Tool A starts
10ms  - Tool B starts
50ms  - Navigation triggered
50ms  - beforeunload fires → sends TWO interrupted responses
```

**Outcome**: ✅ Both receive interrupted responses
**Handling**: Works correctly with the Map structure

---

### Edge Case: postMessage Timing

**Question**: Can postMessage fail during beforeunload?

**Answer**: Extremely unlikely but theoretically possible:

```typescript
private handleBeforeUnload(): void {
  // Worst case: loop takes too long, browser kills page mid-iteration
  for (const [id, info] of this.pendingRequests) {
    try {
      window.postMessage(/* ... */);  // Synchronous, should work
    } catch (error) {
      // Log but continue - best effort
      console.error('postMessage failed:', error);
    }
  }
}
```

**Mitigation**: Process most recent requests first (LIFO order):

```typescript
private handleBeforeUnload(): void {
  // Convert to array and reverse (newest first)
  const entries = Array.from(this.pendingRequests.entries()).reverse();

  for (const [id, info] of entries) {
    // Send interrupted response
    // ...
  }
}
```

**Rationale**: If time runs out, at least the most recent requests get responses.

---

## Part 5: Implementation Considerations

### Consideration 1: Distinguishing Navigation Types

**Problem**: We can't distinguish between:
- User clicked back button
- User clicked a link
- Tool triggered navigation
- JavaScript error caused navigation
- Redirect from server

**Impact**: All navigations send interrupted responses, even when the tool intended to navigate.

**Solution**: Rely on the tool metadata pattern:

```typescript
// Tool that navigates
{
  result: {
    content: [...],
    metadata: { willNavigate: true }  // Client knows navigation is intentional
  }
}

// vs interrupted response
{
  result: {
    content: [...],
    metadata: { navigationInterrupted: true }  // Client knows it was unexpected
  }
}
```

**Agent Logic**:
```typescript
const response = await client.callTool('my_tool');

if (response.metadata?.willNavigate) {
  // Tool succeeded and will navigate - expected
  console.log('Tool navigated as intended');
} else if (response.metadata?.navigationInterrupted) {
  // Tool was interrupted - may have failed
  console.log('Tool interrupted - check if action completed');
} else {
  // Normal tool response
  console.log('Tool completed normally');
}
```

---

### Consideration 2: Testing Challenges

**Challenge**: Hard to test beforeunload behavior programmatically.

**Testing Strategy**:

1. **Unit Tests** (Mock beforeunload):
```typescript
describe('TabServerTransport beforeunload', () => {
  it('sends interrupted responses for pending requests', () => {
    const transport = new TabServerTransport({ allowedOrigins: ['*'] });
    const mockPostMessage = jest.spyOn(window, 'postMessage');

    // Simulate request received
    transport.onmessage?.({ jsonrpc: '2.0', id: '1', method: 'test' });

    // Simulate beforeunload
    window.dispatchEvent(new Event('beforeunload'));

    expect(mockPostMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({
          id: '1',
          result: expect.objectContaining({
            metadata: expect.objectContaining({
              navigationInterrupted: true,
            }),
          }),
        }),
      }),
      '*'
    );
  });
});
```

2. **Integration Tests** (Manual with Playwright):
```typescript
test('navigation interrupts tool call', async ({ page }) => {
  // Register tool that takes 5 seconds
  await page.evaluate(() => {
    navigator.modelContext.registerTool({
      name: 'slow_tool',
      execute: async () => {
        await new Promise(resolve => setTimeout(resolve, 5000));
        return { content: [{ type: 'text', text: 'Done' }] };
      },
    });
  });

  // Start tool call
  const responsePromise = page.evaluate(() => {
    return navigator.modelContext.executeTool('slow_tool', {});
  });

  // Navigate after 1 second
  await page.waitForTimeout(1000);
  await page.goto('about:blank');

  // Should receive interrupted response, not hang
  const response = await responsePromise;
  expect(response.metadata?.navigationInterrupted).toBe(true);
});
```

3. **E2E Tests** (Real browser, real navigation):
- Test with real user clicks
- Test with window.location.href changes
- Test with form submissions
- Test with browser back/forward buttons

---

### Consideration 3: Memory Leaks

**Concern**: If beforeunload never fires (rare edge cases), pending requests stay in memory.

**Solution**: Add request timeout cleanup:

```typescript
export class TabServerTransport implements Transport {
  private pendingRequests = new Map<string | number, {
    request: JSONRPCMessage;
    receivedAt: number;
    interruptedSent: boolean;
  }>();

  private cleanupInterval?: number;
  private readonly REQUEST_TIMEOUT_MS = 300000; // 5 minutes

  async start(): Promise<void> {
    // ... existing code ...

    // Periodic cleanup of stale requests
    this.cleanupInterval = window.setInterval(() => {
      this.cleanupStaleRequests();
    }, 60000); // Check every minute
  }

  private cleanupStaleRequests(): void {
    const now = Date.now();
    const staleIds: (string | number)[] = [];

    for (const [id, info] of this.pendingRequests) {
      if (now - info.receivedAt > this.REQUEST_TIMEOUT_MS) {
        staleIds.push(id);
      }
    }

    if (staleIds.length > 0) {
      console.warn(
        `[TabServerTransport] Cleaning up ${staleIds.length} stale requests`
      );
      for (const id of staleIds) {
        this.pendingRequests.delete(id);
      }
    }
  }

  async close(): Promise<void> {
    if (this.cleanupInterval !== undefined) {
      window.clearInterval(this.cleanupInterval);
    }
    // ... existing code ...
  }
}
```

---

### Consideration 4: Notifications (No Response Expected)

**Problem**: JSON-RPC notifications have no `id` field, so no response is expected.

```typescript
{
  jsonrpc: "2.0",
  method: "notifications/tools/list_changed",
  params: {}
  // NO id field
}
```

**Solution**: Only track messages with an `id` field:

```typescript
// Track incoming requests
if ('method' in message && message.id !== undefined) {  // Check id exists
  this.pendingRequests.set(message.id, {
    request: message,
    receivedAt: Date.now(),
  });
}
```

---

### Consideration 5: Cross-Origin Scenarios

**Problem**: In iframe scenarios, beforeunload in child may need to notify parent.

**Current Architecture**:
- Same-origin: works perfectly (postMessage is synchronous)
- Cross-origin: postMessage still works, but may be slower

**Verdict**: Should work fine because:
- postMessage is synchronous dispatch (even cross-origin)
- beforeunload gives us enough time for one postMessage
- Browser won't terminate mid-postMessage

---

## Part 6: Alternative Approaches

### Alternative 1: Service Worker Architecture

**Concept**: Run MCP server in a service worker instead of the page context.

**Pros**:
- ✅ Service worker survives navigation
- ✅ Can continue tool execution across navigations
- ✅ No beforeunload needed

**Cons**:
- ❌ Major architecture change
- ❌ Can't access page DOM directly
- ❌ Complex message passing between page ↔ worker ↔ client
- ❌ Service worker lifecycle complexity
- ❌ Not all browsers support service workers fully

**Verdict**: Too large a change for this problem. Consider for v2.0.

---

### Alternative 2: Shared Worker

**Concept**: Use SharedWorker to host MCP server across navigations.

**Pros**:
- ✅ Survives navigation within same origin
- ✅ Shared across tabs

**Cons**:
- ❌ Same DOM access limitations as service worker
- ❌ Less browser support than service workers
- ❌ Complex lifecycle management

**Verdict**: Similar issues to service worker approach.

---

### Alternative 3: BroadcastChannel for Cross-Tab Communication

**Concept**: Use BroadcastChannel to communicate between old and new page.

```typescript
// Old page (before unload)
const channel = new BroadcastChannel('mcp-navigation');
channel.postMessage({
  type: 'pending-requests',
  requests: Array.from(this.pendingRequests),
});

// New page (after navigation)
const channel = new BroadcastChannel('mcp-navigation');
channel.onmessage = (event) => {
  if (event.data.type === 'pending-requests') {
    // Restore pending requests
  }
};
```

**Pros**:
- ✅ Elegant cross-navigation communication
- ✅ Simple API

**Cons**:
- ❌ Only works for same-origin navigations
- ❌ New page must load the same WebMCP code
- ❌ Client connection is still broken (would need to reconnect)
- ❌ Doesn't solve the core problem (response still lost)

**Verdict**: Interesting but doesn't solve our problem.

---

### Alternative 4: History State Persistence

**Concept**: Store pending requests in sessionStorage/localStorage.

```typescript
private handleBeforeUnload(): void {
  const pending = Array.from(this.pendingRequests.entries());
  sessionStorage.setItem('mcp-pending', JSON.stringify(pending));
}

// On new page load
const pending = sessionStorage.getItem('mcp-pending');
if (pending) {
  // Handle interrupted requests
}
```

**Pros**:
- ✅ Survives navigation
- ✅ Simple implementation

**Cons**:
- ❌ Client connection is broken, nowhere to send responses
- ❌ New page may not have WebMCP
- ❌ Doesn't help if navigating to different origin

**Verdict**: Doesn't solve the fundamental problem.

---

## Part 7: Recommended Implementation

### Three-Layer Strategy (Confirmed)

After deep analysis, I confirm the three-layer approach from the navigation handling doc:

#### **Layer 1: Pre-Navigation Response Pattern** (PRIMARY)

Tools MUST send response before navigating. This is the **only reliable solution** for tool-initiated navigation.

**Why**: No amount of beforeunload magic can distinguish "tool succeeded and navigated" from "tool failed and page crashed."

---

#### **Layer 2: Client-Side Timeout** (SAFETY NET #1)

Add timeout to prevent infinite hangs when server disappears.

**Implementation**:
```typescript
export class TabClientTransport implements Transport {
  private readonly DEFAULT_TIMEOUT = 30000;
  private activeRequests = new Map<string | number, {
    timeoutId: number;
    request: JSONRPCMessage;
  }>();

  async send(message: JSONRPCMessage): Promise<void> {
    // ... existing code ...

    if ('method' in message && message.id !== undefined) {
      const timeoutId = window.setTimeout(() => {
        this.handleRequestTimeout(message.id!);
      }, this.DEFAULT_TIMEOUT);

      this.activeRequests.set(message.id, { timeoutId, request: message });
    }
  }

  private handleRequestTimeout(requestId: string | number): void {
    const info = this.activeRequests.get(requestId);
    if (!info) return;

    this.activeRequests.delete(requestId);

    // Synthesize timeout error
    const errorResponse = {
      jsonrpc: '2.0' as const,
      id: requestId,
      error: {
        code: -32000,
        message: 'Request timeout - server may have navigated or become unresponsive',
        data: {
          timeoutMs: this.DEFAULT_TIMEOUT,
          originalMethod: 'method' in info.request ? info.request.method : undefined,
        },
      },
    };

    this.onmessage?.(errorResponse);
  }

  private _messageHandler = (event: MessageEvent) => {
    // ... existing validation ...

    const message = JSONRPCMessageSchema.parse(payload);

    // Clear timeout when response received
    if (('result' in message || 'error' in message) && message.id !== undefined) {
      const info = this.activeRequests.get(message.id);
      if (info) {
        window.clearTimeout(info.timeoutId);
        this.activeRequests.delete(message.id);
      }
    }

    this.onmessage?.(message);
  };
}
```

**Why**: Prevents hanging even if beforeunload fails or doesn't fire.

---

#### **Layer 3: BeforeUnload Detection** (SAFETY NET #2)

Send interrupted responses for pending requests during navigation.

**Implementation**: See Part 3 (Option A: Transport-Level Tracking)

**Why**: Provides faster feedback than timeout (immediate vs 30 seconds) and gives clear "interrupted" signal.

---

### Implementation Priority

**Phase 1: Types & Documentation** (Week 1)
- Add `NavigationMetadata` types
- Add `InterruptionMetadata` types
- Document pre-navigation pattern
- Create example tools

**Phase 2: Client Timeout** (Week 1)
- Implement timeout in TabClientTransport
- Add unit tests
- Add configuration option

**Phase 3: BeforeUnload Handler** (Week 2)
- Implement request tracking in TabServerTransport
- Implement beforeunload handler
- Add race condition prevention (interruptedSent flag)
- Add stale request cleanup
- Add unit tests

**Phase 4: Integration Testing** (Week 2)
- E2E tests with real navigation
- Manual testing with various scenarios
- Performance testing (ensure no overhead)

**Phase 5: Documentation** (Week 3)
- Update API docs
- Add migration guide
- Add troubleshooting guide

---

## Part 8: Decision Matrix

| Approach | Reliability | Complexity | Backwards Compat | Verdict |
|----------|-------------|------------|------------------|---------|
| **Pre-navigation pattern** | ✅✅✅ Perfect | ✅ Simple | ✅ Yes | **PRIMARY** |
| **Client timeout** | ✅✅ Good | ✅ Simple | ✅ Yes | **IMPLEMENT** |
| **BeforeUnload detection** | ✅✅ Good* | ⚠️ Medium | ✅ Yes | **IMPLEMENT** |
| **SendBeacon** | ❌ N/A | ✅ Simple | ✅ Yes | **SKIP** |
| **Service worker** | ✅✅✅ Perfect | ❌ High | ❌ No | **FUTURE** |
| **SharedWorker** | ✅✅ Good | ❌ High | ❌ No | **SKIP** |
| **BroadcastChannel** | ⚠️ Partial | ⚠️ Medium | ✅ Yes | **SKIP** |
| **State persistence** | ⚠️ Partial | ⚠️ Medium | ✅ Yes | **SKIP** |

\* Good reliability IF tool didn't complete yet. Can't distinguish success from failure.

---

## Part 9: Open Questions & Future Research

### Question 1: Can we detect tool-initiated navigation?

**Possible Approach**: Wrap navigation APIs with a flag:

```typescript
const originalAssign = window.location.assign;
let navigationPending = false;

window.location.assign = function(...args) {
  navigationPending = true;
  return originalAssign.apply(this, args);
};

// In beforeunload
if (navigationPending) {
  // This was probably tool-initiated
}
```

**Problems**:
- Doesn't cover all navigation methods (href setter, replace, reload, etc.)
- Tools can navigate via link clicks or form submissions
- Brittle and easy to bypass

**Verdict**: Not worth the complexity. Rely on metadata pattern.

---

### Question 2: Should we support resuming tool execution?

**Scenario**: Tool execution state serialized to storage, resumed on new page.

**Problems**:
- Most tools can't be serialized (closures, DOM references, etc.)
- Client would need to reconnect and match up resumed tools
- Very complex, fragile
- Service worker approach would be better if we need this

**Verdict**: Out of scope. Tools should be idempotent if retry is needed.

---

### Question 3: What about SPA navigation (no page reload)?

**SPA Navigation** (e.g., React Router):
- Doesn't trigger beforeunload
- Page stays loaded, transport stays connected
- No problem! Tools work normally

**Verdict**: SPA navigation works fine, no special handling needed.

---

### Question 4: Performance impact of request tracking?

**Overhead**:
- Map operations: O(1) average case
- BeforeUnload handler: O(n) where n = pending requests
- Memory: ~100 bytes per pending request

**Typical Case**:
- 1-3 concurrent tool calls at most
- Negligible memory/CPU impact

**Worst Case**:
- 1000 concurrent slow tools
- Still <100KB memory
- BeforeUnload loop: ~1ms for 1000 iterations

**Verdict**: Performance impact is negligible. No optimization needed.

---

## Part 10: Final Recommendation

### Implement All Three Layers

**Layer 1 (Documentation)**:
- Educate tool authors about pre-navigation pattern
- This prevents 90% of issues

**Layer 2 (Client Timeout)**:
- Prevents hangs when server disappears (any reason)
- Low complexity, high value

**Layer 3 (BeforeUnload)**:
- Provides better user experience (immediate feedback vs 30s timeout)
- Handles accidental navigation (user clicked back button during tool call)
- Medium complexity, medium value

### Why All Three?

Each layer handles different failure modes:

| Failure Mode | Layer 1 | Layer 2 | Layer 3 |
|--------------|---------|---------|---------|
| Tool navigates immediately | ❌ | ✅ (timeout) | ✅ (interrupted) |
| Tool uses pre-nav pattern | ✅ | - | - |
| User navigates during tool | - | ✅ (timeout) | ✅ (interrupted) |
| Server crashes | - | ✅ (timeout) | - |
| Network partition | - | ✅ (timeout) | - |
| Browser freeze | - | ✅ (timeout) | - |

**Conclusion**:
- Layer 1 is ESSENTIAL (solves the root cause)
- Layer 2 is HIGH VALUE (prevents hangs in all cases)
- Layer 3 is NICE TO HAVE (better UX but not strictly necessary)

### Implementation Order

1. **Week 1 Day 1-2**: Types + Documentation (Layer 1)
2. **Week 1 Day 3-5**: Client timeout (Layer 2)
3. **Week 2 Day 1-3**: BeforeUnload handler (Layer 3)
4. **Week 2 Day 4-5**: Integration testing
5. **Week 3**: Polish, examples, migration guide

**Total Effort**: ~2-3 weeks for complete implementation with testing.

---

## Appendix: Code Changes Summary

### Files to Create
- `global/src/types.ts` - Add NavigationMetadata, InterruptionMetadata
- `examples/navigation-tools.ts` - Example navigation tools

### Files to Modify
- `transports/src/TabServerTransport.ts`
  - Add pendingRequests Map
  - Add beforeunload handler
  - Add handleBeforeUnload method
  - Add cleanupStaleRequests method
  - Modify send() to track responses

- `transports/src/TabClientTransport.ts`
  - Add activeRequests Map
  - Add timeout configuration
  - Add handleRequestTimeout method
  - Modify send() to start timers
  - Modify _messageHandler to clear timers

- `global/src/global.ts`
  - Update ToolResponse type to include metadata
  - Add logging for willNavigate tools

### Documentation to Update
- `docs/NAVIGATION_HANDLING.md` - Already created
- `docs/BEFOREUNLOAD_ANALYSIS.md` - This document
- `transports/README.md` - Document timeout option
- `global/README.md` - Document navigation metadata
- Migration guide for existing tool authors

---

## Conclusion

The **beforeunload approach is viable and should be implemented**, but it's a **safety net**, not a solution. The pre-navigation response pattern is the only reliable way to handle tool-initiated navigation.

**Recommended strategy**: Implement all three layers for defense in depth.
