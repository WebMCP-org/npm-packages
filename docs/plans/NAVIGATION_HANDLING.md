# WebMCP Navigation Handling Guide

> **Status:** Implemented
> **Implemented in:** `packages/global/src/types.ts` (NavigationMetadata), `packages/transports/src/TabServerTransport.ts` (beforeunload detection)
> **Summary:** See [IMPLEMENTATION_SUMMARY.md](./IMPLEMENTATION_SUMMARY.md) for what was built.

## Problem Statement

When a WebMCP tool causes a page navigation, the current implementation has no mechanism to handle the tool call lifecycle correctly. This leads to:

1. **Hanging requests**: The client waits indefinitely for a response that never arrives
2. **Lost responses**: Tool execution completes but the response is lost during page unload
3. **Unclear state**: Agents don't know if the tool succeeded, failed, or caused navigation
4. **Poor UX**: No feedback that the tool worked as intended

### Technical Root Cause

**File: `transports/src/TabServerTransport.ts:77`**
```typescript
window.addEventListener('message', this._messageHandler);
```

**File: `transports/src/TabClientTransport.ts:86`**
```typescript
window.addEventListener('message', this._messageHandler);
```

**Current Flow When Navigation Occurs:**
```
1. Client sends tool call request via postMessage
   ↓
2. Server receives and starts tool execution
   ↓
3. Tool triggers navigation (window.location.href = '...')
   ↓
4. beforeunload event fires → NOT CAPTURED
   ↓
5. Page unloads, all event listeners destroyed
   ↓
6. Tool response (if computed) has no transport to send through
   ↓
7. Client promise never resolves/rejects → HANGS
```

---

## Proposed Solution: Multi-Layered Approach

We recommend implementing **three complementary strategies**:

### Strategy 1: Pre-Navigation Response Pattern (RECOMMENDED)

Tools that will navigate MUST send their response BEFORE triggering the navigation.

**Response Format:**
```typescript
interface NavigationMetadata {
  willNavigate: true;
  navigationUrl?: string;
  navigationTiming?: 'immediate' | 'delayed';
}

interface ToolResponse {
  content: Content[];
  metadata?: NavigationMetadata;
  // ... other fields
}
```

**Example Implementation:**
```typescript
registerTool({
  name: 'navigate_to_docs',
  description: 'Navigate to documentation page',
  inputSchema: z.object({
    section: z.string(),
  }),
  async execute(args) {
    const url = `https://docs.example.com/${args.section}`;

    // CRITICAL: Return response BEFORE navigating
    const response = {
      content: [{
        type: 'text',
        text: `Navigating to ${url}`,
      }],
      metadata: {
        willNavigate: true,
        navigationUrl: url,
        navigationTiming: 'immediate',
      },
    };

    // Schedule navigation for AFTER response is sent
    setTimeout(() => {
      window.location.href = url;
    }, 100); // Small delay ensures response transmission

    return response;
  },
});
```

**Pros:**
- ✅ Simple to implement
- ✅ Works with current architecture
- ✅ Clear developer guidance
- ✅ Client knows navigation will happen

**Cons:**
- ❌ Requires all tool authors to follow pattern
- ❌ No protection against accidental immediate navigation

---

### Strategy 2: Navigation Detection & Auto-Response

Add `beforeunload` detection to automatically send a "navigation interrupted" response for in-flight requests.

**Implementation in TabServerTransport:**

```typescript
export class TabServerTransport {
  private pendingRequests = new Map<string, JSONRPCRequest>();
  private beforeUnloadHandler?: () => void;

  async start(): Promise<void> {
    // ... existing code ...

    // Register beforeunload handler
    this.beforeUnloadHandler = () => {
      this.handleNavigationInterrupt();
    };
    window.addEventListener('beforeunload', this.beforeUnloadHandler);
  }

  private handleNavigationInterrupt(): void {
    // Send auto-responses for all pending requests
    for (const [id, request] of this.pendingRequests) {
      const response = {
        jsonrpc: '2.0' as const,
        id,
        result: {
          content: [{
            type: 'text',
            text: 'Tool execution interrupted by page navigation',
          }],
          metadata: {
            navigationInterrupted: true,
            originalTool: request.method,
          },
        },
      };

      try {
        this.send(response);
      } catch (error) {
        // Best effort - may fail if page is unloading
        console.warn('Failed to send navigation interrupt response:', error);
      }
    }

    this.pendingRequests.clear();
  }

  send(message: JSONRPCMessage): void {
    // Track pending requests
    if ('method' in message && message.id) {
      this.pendingRequests.set(String(message.id), message);
    }

    // Clear from pending when response sent
    if ('result' in message || 'error' in message) {
      this.pendingRequests.delete(String(message.id));
    }

    // ... existing postMessage code ...
  }

  async close(): Promise<void> {
    if (this.beforeUnloadHandler) {
      window.removeEventListener('beforeunload', this.beforeUnloadHandler);
    }
    // ... existing code ...
  }
}
```

**Pros:**
- ✅ Automatic safety net
- ✅ Works even if tool author forgets
- ✅ Clear "navigation interrupted" signal

**Cons:**
- ❌ May not have time to send response during unload
- ❌ Adds complexity to transport layer
- ❌ Doesn't distinguish successful navigation from accidental

---

### Strategy 3: Client-Side Timeout

Add configurable timeout for all tool calls to prevent infinite hangs.

**Implementation in TabClientTransport:**

```typescript
export interface TabClientTransportOptions {
  allowedOrigins?: string[];
  channel?: string;
  requestTimeout?: number; // milliseconds, default 10000
}

export class TabClientTransport {
  private toolCallTimeout: number;
  private activeTimeouts = new Map<string, NodeJS.Timeout>();

  constructor(options: TabClientTransportOptions = {}) {
    this.requestTimeout = options.requestTimeout ?? 10000;
    // ... existing code ...
  }

  send(message: JSONRPCMessage): void {
    // Set timeout for requests
    if ('method' in message && message.id) {
      const timeoutId = setTimeout(() => {
        this.handleTimeout(message.id!);
      }, this.toolCallTimeout);

      this.activeTimeouts.set(String(message.id), timeoutId);
    }

    // ... existing postMessage code ...
  }

  private handleTimeout(requestId: string | number): void {
    this.activeTimeouts.delete(String(requestId));

    // Synthesize timeout error response
    const errorResponse = {
      jsonrpc: '2.0' as const,
      id: requestId,
      error: {
        code: -32000, // Server error
        message: 'Tool call timeout - possible navigation or unresponsive tool',
        data: {
          timeout: this.toolCallTimeout,
          possibleCause: 'navigation',
        },
      },
    };

    // Deliver to client as if server responded
    this.onmessage?.(errorResponse);
  }

  private clearTimeout(requestId: string | number): void {
    const timeoutId = this.activeTimeouts.get(String(requestId));
    if (timeoutId) {
      clearTimeout(timeoutId);
      this.activeTimeouts.delete(String(requestId));
    }
  }

  // Override existing message handler to clear timeouts
  private handleMessage(event: MessageEvent): void {
    // ... existing validation ...

    const message = event.data.payload;

    // Clear timeout for responses
    if (('result' in message || 'error' in message) && message.id) {
      this.clearTimeout(message.id);
    }

    this.onmessage?.(message);
  }
}
```

**Pros:**
- ✅ Prevents infinite hangs
- ✅ Configurable per use case
- ✅ Clear error message to agent

**Cons:**
- ❌ False positives for legitimately slow tools
- ❌ Doesn't distinguish timeout from navigation

---

## Recommended Implementation Plan

### Phase 1: Documentation & Best Practices (Immediate)

1. **Create developer guide** with navigation patterns
2. **Add metadata field** to ToolResponse type for navigation signals
3. **Provide code examples** for common navigation scenarios
4. **Add warnings** in API documentation

**Files to Create:**
- `docs/TOOL_PATTERNS.md` - Patterns for tool authors
- `docs/NAVIGATION_TOOLS.md` - Specific guidance for navigation tools
- Update `global/README.md` with navigation warnings

**Example Documentation:**

````markdown
## Navigation Tools - Critical Pattern

⚠️ **WARNING**: Tools that trigger navigation MUST follow the pre-navigation response pattern.

### Pattern: Respond-Then-Navigate

```typescript
registerTool({
  name: 'my_navigation_tool',
  async execute(args) {
    const targetUrl = computeUrl(args);

    // 1. Prepare response FIRST
    const response = {
      content: [{ type: 'text', text: `Navigating to ${targetUrl}` }],
      metadata: { willNavigate: true, navigationUrl: targetUrl },
    };

    // 2. Schedule navigation AFTER return
    setTimeout(() => {
      window.location.href = targetUrl;
    }, 100);

    // 3. Return response BEFORE navigation
    return response;
  },
});
```

### Anti-Pattern: Navigate-Then-Respond ❌

```typescript
// DON'T DO THIS - Response will be lost!
registerTool({
  name: 'bad_navigation_tool',
  async execute(args) {
    window.location.href = computeUrl(args); // Immediate navigation

    // This response will NEVER reach the client
    return {
      content: [{ type: 'text', text: 'Navigating...' }],
    };
  },
});
```
````

---

### Phase 2: Type System Updates (Quick Win)

Update TypeScript types to formalize navigation metadata:

**File: `global/src/types.ts`**

```typescript
/**
 * Metadata for tools that trigger navigation
 */
export interface NavigationMetadata {
  /**
   * Indicates this tool will trigger page navigation
   */
  willNavigate: true;

  /**
   * The URL the page will navigate to (optional)
   */
  navigationUrl?: string;

  /**
   * When navigation will occur relative to response
   * - 'immediate': Navigation scheduled immediately after return
   * - 'delayed': Navigation will occur after some delay
   */
  navigationTiming?: 'immediate' | 'delayed';

  /**
   * Expected delay in milliseconds before navigation (if timing='delayed')
   */
  navigationDelayMs?: number;
}

/**
 * Metadata for interrupted tool calls
 */
export interface InterruptionMetadata {
  /**
   * Tool execution was interrupted by page navigation
   */
  navigationInterrupted: true;

  /**
   * The original tool that was called
   */
  originalTool: string;
}

/**
 * Extended tool response with navigation metadata
 */
export interface ToolResponse {
  content: Content[];
  isError?: boolean;
  structuredContent?: Record<string, unknown>;
  metadata?: NavigationMetadata | InterruptionMetadata | Record<string, unknown>;
}
```

**File: `global/src/global.ts` - Update executeTool to preserve metadata**

```typescript
async executeTool(
  toolName: string,
  args: Record<string, unknown>,
): Promise<ToolResponse> {
  // ... existing validation code ...

  try {
    const response = await tool.execute(validatedArgs);

    // Log navigation tools for debugging
    if (response.metadata?.willNavigate) {
      console.info(
        `[Web Model Context] Tool "${toolName}" will trigger navigation`,
        response.metadata
      );
    }

    return response;
  } catch (error) {
    // ... existing error handling ...
  }
}
```

---

### Phase 3: Transport Layer Safety (Medium Priority)

Implement Strategy 2 (Navigation Detection) and Strategy 3 (Timeouts):

**Changeset 1: Add navigation detection to TabServerTransport**
- Track pending requests
- Add `beforeunload` listener
- Send auto-responses for interrupted requests

**Changeset 2: Add timeout mechanism to TabClientTransport**
- Add `toolCallTimeout` option
- Track active timeouts
- Clear timeouts on response
- Synthesize timeout errors

**Files to Modify:**
- `transports/src/TabServerTransport.ts`
- `transports/src/TabClientTransport.ts`
- `transports/src/types.ts` (add TransportOptions interface)

---

### Phase 4: Testing & Examples (Important)

Create comprehensive test suite and example implementations:

**Test Cases:**
1. Tool that navigates immediately without response → timeout
2. Tool that responds then navigates → success with metadata
3. Tool interrupted mid-execution → interrupted response
4. Multiple pending requests during navigation → all interrupted
5. Timeout for slow tool (no navigation) → timeout error

**Example Tools to Create:**
```typescript
// examples/navigation-tools.ts

// Example 1: Simple navigation
registerTool({
  name: 'navigate_to_url',
  description: 'Navigate to a specific URL',
  inputSchema: z.object({ url: z.string().url() }),
  async execute(args) {
    const response = {
      content: [{ type: 'text', text: `Navigating to ${args.url}` }],
      metadata: { willNavigate: true, navigationUrl: args.url },
    };

    setTimeout(() => window.location.href = args.url, 100);
    return response;
  },
});

// Example 2: Conditional navigation
registerTool({
  name: 'search_and_navigate',
  description: 'Search for content and optionally navigate to first result',
  inputSchema: z.object({
    query: z.string(),
    autoNavigate: z.boolean().default(false),
  }),
  async execute(args) {
    const results = await searchContent(args.query);

    if (args.autoNavigate && results.length > 0) {
      const targetUrl = results[0].url;

      const response = {
        content: [{
          type: 'text',
          text: `Found ${results.length} results. Navigating to: ${targetUrl}`,
        }],
        structuredContent: { results, navigatingTo: targetUrl },
        metadata: { willNavigate: true, navigationUrl: targetUrl },
      };

      setTimeout(() => window.location.href = targetUrl, 100);
      return response;
    }

    return {
      content: [{
        type: 'text',
        text: `Found ${results.length} results.`,
      }],
      structuredContent: { results },
    };
  },
});

// Example 3: Form submission with navigation
registerTool({
  name: 'submit_form',
  description: 'Submit a form that triggers navigation',
  inputSchema: z.object({
    formId: z.string(),
    data: z.record(z.unknown()),
  }),
  async execute(args) {
    const form = document.getElementById(args.formId) as HTMLFormElement;
    if (!form) {
      return {
        content: [{ type: 'text', text: `Form ${args.formId} not found` }],
        isError: true,
      };
    }

    // Fill form fields
    for (const [key, value] of Object.entries(args.data)) {
      const input = form.elements.namedItem(key) as HTMLInputElement;
      if (input) input.value = String(value);
    }

    const response = {
      content: [{
        type: 'text',
        text: `Submitting form ${args.formId}. This will trigger navigation.`,
      }],
      metadata: {
        willNavigate: true,
        navigationTiming: 'immediate',
      },
    };

    // Submit after response sent
    setTimeout(() => form.submit(), 100);
    return response;
  },
});
```

---

## Agent Guidance

### For AI Agents Using WebMCP Tools

When calling tools that may navigate:

1. **Check response metadata** for `willNavigate` flag
2. **Don't make follow-up calls** to the same page after navigation signal
3. **Wait for new page load** before continuing automation
4. **Handle timeout errors** gracefully (may indicate navigation)

**Example Agent Logic:**
```typescript
const response = await client.callTool('navigate_to_url', { url: targetUrl });

if (response.metadata?.willNavigate) {
  console.log('Tool will navigate - waiting for page load');

  // Don't make more calls on this connection
  // Wait for page load event or reconnect
  await waitForPageLoad();

  // Reconnect to new page's MCP server
  await reconnectClient();
}
```

### For Tool Authors

**Checklist for Navigation Tools:**

- [ ] Response returned BEFORE navigation triggered
- [ ] Navigation scheduled with `setTimeout` (minimum 100ms delay)
- [ ] Response includes `metadata.willNavigate = true`
- [ ] Response includes `metadata.navigationUrl` if known
- [ ] Tested with actual agent to confirm response received
- [ ] Documentation warns users about navigation behavior
- [ ] Error cases (invalid URL) don't navigate

---

## Migration Guide

### For Existing Navigation Tools

If you have existing tools that navigate:

**Before:**
```typescript
registerTool({
  name: 'go_to_page',
  async execute(args) {
    window.location.href = args.url; // ❌ Immediate navigation
    return { content: [{ type: 'text', text: 'Navigating' }] };
  },
});
```

**After:**
```typescript
registerTool({
  name: 'go_to_page',
  async execute(args) {
    // ✅ Response first, navigate second
    const response = {
      content: [{ type: 'text', text: `Navigating to ${args.url}` }],
      metadata: { willNavigate: true, navigationUrl: args.url },
    };

    setTimeout(() => window.location.href = args.url, 100);
    return response;
  },
});
```

---

## Alternative Patterns

### Pattern A: Two-Phase Tool

Split navigation into separate "prepare" and "execute" phases:

```typescript
registerTool({
  name: 'prepare_navigation',
  async execute(args) {
    const url = computeUrl(args);
    return {
      content: [{ type: 'text', text: `Ready to navigate to ${url}` }],
      structuredContent: { navigationReady: true, url },
    };
  },
});

registerTool({
  name: 'execute_navigation',
  inputSchema: z.object({ url: z.string().url() }),
  async execute(args) {
    const response = {
      content: [{ type: 'text', text: 'Navigating now' }],
      metadata: { willNavigate: true, navigationUrl: args.url },
    };

    setTimeout(() => window.location.href = args.url, 100);
    return response;
  },
});
```

### Pattern B: Iframe Isolation

For complex scenarios, load target in iframe first:

```typescript
registerTool({
  name: 'preview_then_navigate',
  async execute(args) {
    // Load in hidden iframe to check validity
    const iframe = document.createElement('iframe');
    iframe.style.display = 'none';
    iframe.src = args.url;
    document.body.appendChild(iframe);

    await new Promise(resolve => iframe.onload = resolve);

    // Now navigate main window
    const response = {
      content: [{ type: 'text', text: `URL verified, navigating to ${args.url}` }],
      metadata: { willNavigate: true, navigationUrl: args.url },
    };

    setTimeout(() => window.location.href = args.url, 100);
    return response;
  },
});
```

---

## Future Enhancements

### Potential Improvements

1. **Navigation Hooks**: Allow tools to register pre-navigation callbacks
2. **State Persistence**: Serialize pending requests to sessionStorage
3. **Service Worker Integration**: Use service worker to detect navigation and send responses
4. **WebTransport**: Use more reliable transport that survives navigation
5. **Split-Architecture**: Server runs in service worker, not page context

### Research Questions

1. Can we use `sendBeacon` API to guarantee response delivery during unload?
2. Should we support "navigation without response" as a valid pattern?
3. How do other agent frameworks handle this (Playwright, Puppeteer)?
4. Can we detect "soft navigations" (SPA route changes)?

---

## Summary

**Immediate Action Items:**

1. ✅ Document the pre-navigation response pattern
2. ✅ Add navigation metadata types
3. ✅ Create example navigation tools
4. ⏳ Implement timeout mechanism (Phase 3)
5. ⏳ Implement navigation detection (Phase 3)

**Long-term Strategy:**

- **Primary Solution**: Pre-navigation response pattern (documentation + types)
- **Safety Net**: Client-side timeouts to prevent hangs
- **Future Enhancement**: Navigation detection for auto-responses

**Developer Guidance:**

> ⚠️ **Golden Rule**: Tools that navigate MUST return their response BEFORE triggering navigation. Use `setTimeout` to delay navigation by at least 100ms after returning.

This approach balances **immediate fixes** (documentation), **near-term safety** (timeouts), and **long-term robustness** (navigation detection).
