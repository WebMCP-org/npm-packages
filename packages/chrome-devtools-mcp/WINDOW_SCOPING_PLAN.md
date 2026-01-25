# Window Scoping Implementation Plan

## Problem Statement

When multiple AI agents share the same Chrome browser (via `autoConnect`), they can interfere with each other because page operations are not scoped to the session's window.

### Current Behavior

1. **Session A** starts, connects to existing browser, creates a new window with Page A1
2. **Session B** starts, connects to same browser, creates a new window with Page B1
3. Both sessions see ALL pages: `[Page A1, Page B1]`
4. If Session B calls `select_page(pageIdx=0)`, it selects Page A1 (Session A's page!)
5. Session B can now operate on Session A's window, causing interference

### Root Cause Analysis

The issue stems from how pages are tracked and indexed:

```typescript
// McpContext.ts - createPagesSnapshot()
async createPagesSnapshot(): Promise<Page[]> {
  const allPages = await this.browser.pages();  // Gets ALL pages from ALL windows
  this.#pages = allPages.filter(...);           // No window filtering
  // ...
}

// getPageByIdx uses global indices
getPageByIdx(idx: number): Page {
  return this.#pages[idx];  // Global index across all windows
}
```

### Affected Operations

| Tool | Current Behavior | Problem |
|------|-----------------|---------|
| `list_pages` | Shows all pages | Agent sees other sessions' pages |
| `select_page` | Selects any page by global index | Can select other sessions' pages |
| `close_page` | Closes any page by global index | Can close other sessions' pages |
| `new_page` | Creates tab in arbitrary window | Tab may go to wrong window |
| `getSelectedPage()` | Returns explicitly selected page | Works correctly with `#pageExplicitlySelected` |

---

## Proposed Solution: Window-Scoped Sessions

Track which window(s) belong to each MCP session and filter all page operations to those windows.

### Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                         Chrome Browser                           │
│  ┌──────────────────┐  ┌──────────────────┐  ┌───────────────┐  │
│  │   Window A       │  │   Window B       │  │  Window C     │  │
│  │   (Session A)    │  │   (Session B)    │  │  (User's)     │  │
│  │  windowId: 101   │  │  windowId: 102   │  │  windowId: 99 │  │
│  │  ┌─────┐ ┌─────┐ │  │  ┌─────┐         │  │  ┌─────┐      │  │
│  │  │ P1  │ │ P2  │ │  │  │ P3  │         │  │  │ P4  │      │  │
│  │  └─────┘ └─────┘ │  │  └─────┘         │  │  └─────┘      │  │
│  └──────────────────┘  └──────────────────┘  └───────────────┘  │
└─────────────────────────────────────────────────────────────────┘

Session A sees: [P1, P2]  (indices 0, 1)
Session B sees: [P3]       (index 0)
User's window is invisible to both sessions
```

### Implementation Steps

#### Step 1: Add Window Tracking to McpContext

Add new private fields to track the session's window:

```typescript
// McpContext.ts
class McpContext {
  // Existing fields...

  /** The windowId that this MCP session owns. */
  #sessionWindowId?: number;

  /** CDP session for browser-level operations. */
  #browserCdpSession?: CDPSession;
}
```

#### Step 2: Capture windowId on Session Initialization

**In `main.ts`:**

When a new window is created (connected to existing browser):
```typescript
if (!wasLaunched) {
  // Connected to existing browser - create new window
  const windowId = await context.newWindow();  // Modified to return windowId
  context.setSessionWindowId(windowId);
  logger('Created new window for this MCP session, windowId:', windowId);
}
```

When browser is freshly launched:
```typescript
if (wasLaunched) {
  // Get windowId for the default page
  const page = context.getSelectedPage();
  const windowId = await context.getWindowIdForPage(page);
  context.setSessionWindowId(windowId);
  logger('Using existing window for this MCP session, windowId:', windowId);
}
```

#### Step 3: Add Window ID Helper Methods

```typescript
// McpContext.ts
class McpContext {
  /**
   * Get the windowId for a given page using CDP.
   */
  async getWindowIdForPage(page: Page): Promise<number> {
    const cdpSession = await this.#getBrowserCdpSession();
    // @ts-expect-error _targetId is internal but stable
    const targetId = page.target()._targetId;
    const { windowId } = await cdpSession.send('Browser.getWindowForTarget', {
      targetId,
    });
    return windowId;
  }

  /**
   * Set the window that this session owns.
   */
  setSessionWindowId(windowId: number): void {
    this.#sessionWindowId = windowId;
    this.logger('Session bound to windowId:', windowId);
  }

  /**
   * Get the session's window ID, or undefined if not set.
   */
  getSessionWindowId(): number | undefined {
    return this.#sessionWindowId;
  }

  /**
   * Get or create a browser-level CDP session.
   */
  async #getBrowserCdpSession(): Promise<CDPSession> {
    if (!this.#browserCdpSession) {
      this.#browserCdpSession = await this.browser.target().createCDPSession();
    }
    return this.#browserCdpSession;
  }
}
```

#### Step 4: Modify newWindow() to Return windowId

```typescript
// McpContext.ts
async newWindow(): Promise<number> {  // Changed return type
  const browserTarget = this.browser.target();
  const cdpSession = await browserTarget.createCDPSession();

  const { targetId } = await cdpSession.send('Target.createTarget', {
    url: 'about:blank',
    newWindow: true,
  });

  // Wait for the new page
  const target = await this.browser.waitForTarget(
    target => target._targetId === targetId,
    { timeout: 5000 },
  );

  const page = await target.page();
  if (!page) {
    throw new Error('Failed to get page from new window target');
  }

  // Get windowId for the new page
  const { windowId } = await cdpSession.send('Browser.getWindowForTarget', {
    targetId,
  });

  // Set window bounds...
  await cdpSession.send('Browser.setWindowBounds', {
    windowId,
    bounds: { left: 20, top: 20, width: 1800, height: 1200, windowState: 'normal' },
  });

  await cdpSession.detach();

  await this.createPagesSnapshot();
  this.selectPage(page, true);
  this.#networkCollector.addPage(page);
  this.#consoleCollector.addPage(page);
  this.#setupWebMCPAutoDetection(page);

  return windowId;  // Return the windowId
}
```

#### Step 5: Filter Pages by Window

Modify `createPagesSnapshot()` to filter pages to the session's window:

```typescript
// McpContext.ts
async createPagesSnapshot(): Promise<Page[]> {
  const allPages = await this.browser.pages(this.#options.experimentalIncludeAllPages);

  // Filter by DevTools setting first
  let filteredPages = allPages.filter(page => {
    return (
      this.#options.experimentalDevToolsDebugging ||
      !page.url().startsWith('devtools://')
    );
  });

  // If we have a session window, filter to only pages in that window
  if (this.#sessionWindowId !== undefined) {
    const pagesInWindow: Page[] = [];
    for (const page of filteredPages) {
      try {
        const windowId = await this.getWindowIdForPage(page);
        if (windowId === this.#sessionWindowId) {
          pagesInWindow.push(page);
        }
      } catch {
        // Page might be closing, skip it
      }
    }
    filteredPages = pagesInWindow;
  }

  this.#pages = filteredPages;

  // Auto-select logic remains the same...
  if (
    !this.#pageExplicitlySelected &&
    (!this.#selectedPage || this.#pages.indexOf(this.#selectedPage) === -1) &&
    this.#pages[0]
  ) {
    this.selectPage(this.#pages[0]);
  }

  await this.detectOpenDevToolsWindows();

  for (const page of this.#pages) {
    this.#setupWebMCPAutoDetection(page);
  }

  return this.#pages;
}
```

#### Step 6: Modify newPage() for Window-Scoped Tab Creation

The challenge: `browser.newPage()` doesn't guarantee which window the tab goes into.

**Solution: Focus a page in our window first, then create the new tab.**

```typescript
// McpContext.ts
async newPage(): Promise<Page> {
  // If we have a session window, ensure our window is focused
  if (this.#sessionWindowId !== undefined) {
    try {
      // Focus an existing page in our window to increase chance new tab goes there
      const existingPage = this.#pages[0];
      if (existingPage) {
        await existingPage.bringToFront();
      }
    } catch {
      // Best effort - focus might fail if page is closing
    }
  }

  const page = await this.browser.newPage();

  // Verify the new page is in our window
  if (this.#sessionWindowId !== undefined) {
    const newPageWindowId = await this.getWindowIdForPage(page);
    if (newPageWindowId !== this.#sessionWindowId) {
      // New tab went to wrong window - this is a known Chrome behavior issue
      this.logger(
        `Warning: new_page created tab in wrong window (expected ${this.#sessionWindowId}, got ${newPageWindowId}). ` +
        `Tab may not be visible in list_pages.`
      );
      // Note: We could try to close the page and retry, but that might lose state
    }
  }

  await this.createPagesSnapshot();
  this.selectPage(page, true);
  this.#networkCollector.addPage(page);
  this.#consoleCollector.addPage(page);
  this.#setupWebMCPAutoDetection(page);
  return page;
}
```

**Alternative: Use CDP to create the tab in the correct window**

After more research, there's no direct CDP way to create a tab in a specific window. The best approach is the focus-first strategy above, combined with proper error handling.

#### Step 7: Update main.ts Integration

```typescript
// main.ts - getContext()
async function getContext(): Promise<McpContext> {
  // ... existing browser connection/launch code ...

  if (context?.browser !== browser) {
    context = await McpContext.from(browser, logger, {
      experimentalDevToolsDebugging: devtools,
      experimentalIncludeAllPages: args.experimentalIncludeAllPages,
    });

    if (wasLaunched) {
      // Fresh browser launch - capture windowId from default page
      const page = context.getSelectedPage();
      const windowId = await context.getWindowIdForPage(page);
      context.setSessionWindowId(windowId);
      context.selectPage(page, true);
      logger(`Using existing window for this MCP session, windowId: ${windowId}`);

      // Resize window...
    } else {
      // Connected to existing browser - create new window
      const windowId = await context.newWindow();
      context.setSessionWindowId(windowId);
      logger(`Created new window for this MCP session, windowId: ${windowId}`);
    }

    // Initialize WebMCP tool hub...
  }
  return context;
}
```

---

## Testing Plan

### Unit Tests

1. **Test window ID capture on new window creation**
   - Create new window via `newWindow()`
   - Verify `getSessionWindowId()` returns the correct ID

2. **Test page filtering by window**
   - Create pages in multiple windows
   - Verify `getPages()` only returns pages from session's window

3. **Test page indexing is window-local**
   - Session A has pages at indices 0, 1
   - Session B has pages at index 0
   - Verify indices don't overlap

### Integration Tests

1. **Multi-session isolation**
   - Start two MCP sessions connecting to same browser
   - Each creates a new window
   - Verify each session only sees its own pages

2. **New tab creation**
   - Create new tab via `new_page`
   - Verify it appears in the session's window (or log warning if not)

3. **Page operations are scoped**
   - `close_page` only affects session's pages
   - `select_page` only selects from session's pages

### Manual Testing

1. Start Claude Code with Chrome DevTools MCP
2. Note the window that opens
3. Open a second terminal, start another Claude Code session
4. Verify a new window opens for the second session
5. Run `list_pages` in both sessions - verify isolation
6. Create tabs in each session - verify they stay in their window

---

## Risks and Mitigations

### Risk 1: Performance Impact from CDP Calls

**Issue:** Getting windowId for each page requires a CDP call, which could slow down `createPagesSnapshot()`.

**Mitigation:**
- Cache windowId per page (invalidated on navigation)
- Use parallel CDP calls for multiple pages
- Only filter if `#sessionWindowId` is set

### Risk 2: Browser.newPage() Creates Tab in Wrong Window

**Issue:** Chrome doesn't guarantee which window receives a new tab from `browser.newPage()`.

**Mitigation:**
- Focus a page in our window before creating new tab
- Log a warning if tab ends up in wrong window
- Document this as known behavior

### Risk 3: Window Closed Externally

**Issue:** User could manually close the session's window.

**Mitigation:**
- `createPagesSnapshot()` handles missing pages gracefully
- If no pages remain in our window, error is thrown with clear message

### Risk 4: Backwards Compatibility

**Issue:** Existing users might expect to see all windows.

**Mitigation:**
- Add `--no-window-scope` flag to disable window filtering
- Default to scoped behavior (safer for multi-agent scenarios)

---

## Implementation Order

1. **Phase 1: Add window tracking infrastructure** (McpContext changes)
   - Add `#sessionWindowId` field
   - Add `getWindowIdForPage()` method
   - Add `setSessionWindowId()` method

2. **Phase 2: Capture windowId on session start** (main.ts changes)
   - Modify `getContext()` to capture and set windowId

3. **Phase 3: Filter pages by window** (McpContext changes)
   - Modify `createPagesSnapshot()` to filter by windowId

4. **Phase 4: Improve newPage() for window scoping**
   - Focus window before creating tab
   - Log warning if tab goes to wrong window

5. **Phase 5: Testing and documentation**
   - Add tests
   - Update README with multi-session behavior

---

## Appendix: CDP Commands Reference

### Browser.getWindowForTarget

```json
{
  "method": "Browser.getWindowForTarget",
  "params": {
    "targetId": "target-id-string"
  }
}
// Returns: { "windowId": 123, "bounds": {...} }
```

### Target.createTarget

```json
{
  "method": "Target.createTarget",
  "params": {
    "url": "about:blank",
    "newWindow": true  // Creates new window instead of tab
  }
}
// Returns: { "targetId": "new-target-id" }
```

### Browser.setWindowBounds

```json
{
  "method": "Browser.setWindowBounds",
  "params": {
    "windowId": 123,
    "bounds": {
      "left": 20,
      "top": 20,
      "width": 1800,
      "height": 1200,
      "windowState": "normal"
    }
  }
}
```

---

## Sources

- [Chrome DevTools Protocol - Browser domain](https://chromedevtools.github.io/devtools-protocol/tot/Browser/)
- [Chrome DevTools Protocol - Target domain](https://chromedevtools.github.io/devtools-protocol/tot/Target/)
- [Puppeteer browser.newPage() documentation](https://pptr.dev/api/puppeteer.browser.newpage)
