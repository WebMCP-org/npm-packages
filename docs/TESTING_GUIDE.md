# Navigation Handling Testing Guide

## Prerequisites

1. **Build the packages:**
   ```bash
   cd /Users/alexmnahas/personalRepos/WebMCP-org/npm-packages
   pnpm --filter @mcp-b/global build
   pnpm --filter @mcp-b/transports build
   ```

2. **Start HTTP server:**
   ```bash
   cd examples
   python3 -m http.server 8080
   ```

3. **Open demo in Chrome:**
   ```
   http://localhost:8080/navigation-demo.html
   ```

4. **Open Chrome DevTools:**
   - Press `F12` or `Cmd+Option+I` (Mac) / `Ctrl+Shift+I` (Windows/Linux)
   - Look for the "MCP" tab
   - If not visible, check DevTools settings → Experiments

---

## Test Scenarios

### ✅ Scenario 1: Good Pattern - Navigate After Response

**Tool:** `navigate_to_docs`

**Steps:**
1. Open navigation-demo.html
2. Open DevTools MCP tab
3. Call tool: `navigate_to_docs` with args:
   ```json
   { "section": "getting-started" }
   ```

**Expected Results:**
- ✅ Response received with metadata:
  ```json
  {
    "content": [...],
    "metadata": {
      "willNavigate": true,
      "navigationUrl": "https://modelcontextprotocol.io/docs/getting-started",
      "navigationTiming": "immediate"
    }
  }
  ```
- ✅ Console log: `[Web Model Context] Tool "navigate_to_docs" will trigger navigation`
- ✅ After ~100ms, page navigates to MCP docs
- ✅ No interrupted response

**What This Tests:**
- Pre-navigation response pattern works correctly
- Metadata is properly included and logged
- 100ms delay is sufficient for response transmission

---

### ❌ Scenario 2: Bad Pattern - Navigate Before Response

**Tool:** `bad_immediate_navigate`

**Steps:**
1. Open navigation-demo.html
2. Call tool: `bad_immediate_navigate` with args:
   ```json
   { "url": "https://example.com" }
   ```

**Expected Results:**
- ❌ Original tool response is LOST (never received)
- ✅ BeforeUnload handler fires immediately
- ✅ Interrupted response received:
  ```json
  {
    "content": [{
      "type": "text",
      "text": "Tool execution interrupted by page navigation"
    }],
    "metadata": {
      "navigationInterrupted": true,
      "originalMethod": "tools/call",
      "timestamp": 1704067200000
    }
  }
  ```
- ✅ Console error: `[Demo] ❌ BAD PATTERN: Navigating BEFORE returning response`

**What This Tests:**
- BeforeUnload detection works
- Interrupted responses are sent correctly
- Anti-pattern is properly handled

---

### ⏱️ Scenario 3: Client Timeout - Slow Tool

**Tool:** `very_slow_tool`

**Steps:**
1. Open navigation-demo.html
2. Call tool: `very_slow_tool` with args:
   ```json
   {}
   ```
3. Wait 30 seconds

**Expected Results:**
- ⏱️ After exactly 10 seconds, timeout error received:
  ```json
  {
    "jsonrpc": "2.0",
    "id": "<request-id>",
    "error": {
      "code": -32000,
      "message": "Request timeout - server may have navigated or become unresponsive",
      "data": {
        "timeoutMs": 30000,
        "originalMethod": "tools/call"
      }
    }
  }
  ```
- ✅ Console log: `[Demo] Very slow tool starting (60 seconds)`
- ✅ Tool continues executing in background (check console after 60s)

**What This Tests:**
- Client-side timeout mechanism works
- Timeout fires at correct interval (30s)
- Error response is properly formatted
- Tool execution doesn't block timeout

---

### 🔄 Scenario 4: User Navigation During Execution

**Tool:** `slow_tool`

**Steps:**
1. Open navigation-demo.html
2. Call tool: `slow_tool` with args:
   ```json
   { "durationMs": 10000 }
   ```
3. **Immediately** (within 2-3 seconds) click browser back button or reload

**Expected Results:**
- ✅ BeforeUnload handler fires
- ✅ Interrupted response received:
  ```json
  {
    "metadata": {
      "navigationInterrupted": true,
      "originalMethod": "tools/call",
      "timestamp": <current-time>
    }
  }
  ```
- ✅ Console log: `[TabServerTransport] Sending interrupted responses for 1 pending request`
- ✅ No timeout error (beforeunload fires before 30s)

**What This Tests:**
- BeforeUnload detection for user-initiated navigation
- Interrupted response sent before timeout
- User actions trigger proper cleanup

---

### 🏁 Scenario 5: Race Condition - Tool Completes During BeforeUnload

**Setup:**
This scenario is harder to test manually but can occur when:
1. Tool completes its execution
2. BeforeUnload fires at nearly the same time
3. Both try to send responses

**Expected Results:**
- ✅ Only ONE response is received (not two)
- ✅ If beforeunload fires first: Interrupted response sent, tool response suppressed
- ✅ If tool completes first: Normal response sent, beforeunload does nothing
- ✅ Console log (if suppressed): `[TabServerTransport] Suppressing response for <id> - interrupted response already sent`

**What This Tests:**
- `interruptedSent` flag prevents duplicate responses
- Race condition is properly handled
- JSON-RPC spec compliance (one response per request)

**How to Test:**
1. Open navigation-demo.html
2. Call `slow_tool` with args: `{ "durationMs": 50 }`
3. Refresh page at exactly 50ms (difficult timing)
4. Observe only one response is received

---

### 🔍 Scenario 6: Multiple Pending Requests

**Tools:** `slow_tool` (multiple calls)

**Steps:**
1. Open navigation-demo.html
2. Call `slow_tool` three times rapidly:
   - Request 1: `{ "durationMs": 10000 }`
   - Request 2: `{ "durationMs": 10000 }`
   - Request 3: `{ "durationMs": 10000 }`
3. Immediately refresh the page

**Expected Results:**
- ✅ Three interrupted responses received (one per request)
- ✅ All responses have unique request IDs
- ✅ LIFO order: Most recent request processed first
- ✅ Console log: `[TabServerTransport] Sending interrupted responses for 3 pending requests`

**What This Tests:**
- Multiple pending requests tracked correctly
- All requests receive interrupted responses
- LIFO ordering for best-effort delivery
- No race conditions between multiple responses

---

### ⚡ Scenario 7: Conditional Navigation

**Tool:** `search_and_navigate`

**Steps:**
1. **Without navigation:**
   ```json
   { "query": "webmcp", "autoNavigate": false }
   ```

   **Expected:** Normal response, no navigation, no metadata

2. **With navigation:**
   ```json
   { "query": "webmcp", "autoNavigate": true }
   ```

   **Expected:**
   - Response with `willNavigate: true` metadata
   - Navigation after 100ms

**What This Tests:**
- Conditional navigation logic
- Metadata only added when navigating
- Same tool can work with or without navigation

---

### 🕐 Scenario 8: Delayed Navigation

**Tool:** `delayed_navigation`

**Steps:**
1. Call tool with args:
   ```json
   { "url": "https://example.com", "delayMs": 3000 }
   ```

**Expected Results:**
- ✅ Response received immediately with metadata:
  ```json
  {
    "metadata": {
      "willNavigate": true,
      "navigationUrl": "https://example.com",
      "navigationTiming": "delayed",
      "navigationDelayMs": 3000
    }
  }
  ```
- ✅ Console log: `Will navigate to https://example.com in 3000ms`
- ✅ After 3 seconds, page navigates
- ✅ User can cancel if needed (has 3 seconds)

**What This Tests:**
- Delayed navigation with custom timing
- navigationDelayMs metadata field
- User has time to see the response

---

## Console Logging Reference

### Good Pattern Logs
```
[Demo] ✅ Good pattern: Preparing response BEFORE navigation
[Web Model Context] Executing tool: navigate_to_docs
[Web Model Context] Tool "navigate_to_docs" will trigger navigation {willNavigate: true, ...}
[Demo] Now navigating to: https://...
```

### Bad Pattern Logs
```
[Demo] ❌ BAD PATTERN: Navigating BEFORE returning response
[TabServerTransport] Sending interrupted responses for 1 pending request
```

### Timeout Logs
```
[Demo] Slow tool starting (5000ms)
[TabClientTransport] Request timeout for req-123
Error: Request timeout - server may have navigated or become unresponsive
```

### BeforeUnload Logs
```
[Tab ServerTransport] BeforeUnload handler executing
[TabServerTransport] Sending interrupted responses for N pending requests
```

### Race Condition Logs
```
[TabServerTransport] Suppressing response for req-123 - interrupted response already sent
```

---

## Manual Testing Checklist

- [ ] **Good Pattern:** navigate_to_docs works correctly
- [ ] **Bad Pattern:** bad_immediate_navigate shows interrupted response
- [ ] **Timeout:** very_slow_tool times out after 30s
- [ ] **User Navigation:** Back button during slow_tool shows interrupted
- [ ] **Race Condition:** Tool completing during beforeunload only sends one response
- [ ] **Multiple Requests:** Multiple pending requests all get interrupted responses
- [ ] **Conditional Navigation:** search_and_navigate works with and without navigation
- [ ] **Delayed Navigation:** delayed_navigation waits specified time
- [ ] **Metadata Logging:** Console shows navigation metadata
- [ ] **Error Messages:** Timeout and interrupted errors have correct format

---

## Debugging Tips

### Issue: No MCP tab in DevTools
**Solution:** Enable experimental features in chrome://flags or DevTools experiments

### Issue: Tool calls not working
**Check:**
1. HTTP server is running on port 8080
2. Console shows `[Demo] WebMCP Navigation Demo Ready!`
3. Tools are registered: Check `navigator.modelContext.listTools()`

### Issue: Navigation happens but no response
**Likely:** Bad pattern - tool navigating before returning response
**Fix:** Add setTimeout before navigation

### Issue: BeforeUnload not firing
**Check:**
1. Handler registered: `window.addEventListener('beforeunload', ...)`
2. Navigation actually occurring (check URL bar)
3. Console logs enabled

### Issue: Multiple responses for same request
**Problem:** Race condition - `interruptedSent` flag not working
**Debug:**
```javascript
// In DevTools console
window.__mcpBridge.tabServer.send = new Proxy(originalSend, {
  apply(target, thisArg, args) {
    console.log('Sending:', args[0]);
    return target.apply(thisArg, args);
  }
});
```

---

## Performance Metrics

### Expected Performance
- **Timeout overhead:** ~50 bytes per active request
- **BeforeUnload execution:** <5ms for 10 pending requests
- **Memory usage:** <1KB for typical workload (1-3 concurrent requests)
- **Network overhead:** None (all postMessage)

### Monitoring
```javascript
// Check active requests (client)
console.log('Active requests:', transport._activeRequests.size);

// Check pending requests (server)
console.log('Pending requests:', window.__mcpBridge.tabServer._pendingRequests.size);
```

---

## Known Limitations

1. **BeforeUnload timing:** ~10-50ms window before page unload
   - Solution: Pre-navigation response pattern (Layer 1)

2. **SPA navigation:** Single-page app navigation doesn't trigger beforeunload
   - Not a problem: Transport stays connected, tools work normally

3. **Timeout false positives:** Slow tools may timeout incorrectly
   - Solution: Increase `requestTimeout` option

4. **Stale request cleanup:** 5-minute timeout for memory leak prevention
   - Acceptable: Most tools complete in <1 minute

---

## Success Criteria

✅ **All layers working:**
- Layer 1 (Metadata): Tools can signal navigation intent
- Layer 2 (Timeout): Client times out after 30s
- Layer 3 (BeforeUnload): Server sends interrupted responses

✅ **No hangs:** All scenarios eventually resolve (response or timeout)

✅ **No duplicates:** One response per request (race condition handled)

✅ **Clean code:** Google-level JSDoc, clear comments, maintainable

✅ **Good UX:** Clear error messages, helpful metadata, fast feedback

---

## Next Steps After Testing

1. **Document findings:** Note any issues or unexpected behavior
2. **Add unit tests:** Automated tests for each scenario
3. **Performance testing:** Measure overhead with 100+ concurrent requests
4. **Integration testing:** Test with real MCP clients (not just DevTools)
5. **Browser compatibility:** Test in Chrome, Edge, Firefox (if applicable)

---

## Questions to Validate

1. Does the 100ms delay feel right, or should it be configurable?
2. Is 30s the right default timeout, or should it be shorter/longer?
3. Should stale request cleanup be configurable (currently hardcoded 5min)?
4. Do error messages provide enough context for debugging?
5. Is the LIFO ordering for beforeunload responses the best approach?

---

## Final Checklist Before Shipping

- [ ] All test scenarios pass
- [ ] No console errors or warnings
- [ ] JSDoc is comprehensive and accurate
- [ ] Examples work out of the box
- [ ] Documentation is clear and complete
- [ ] No TypeScript errors
- [ ] Code is clean and readable
- [ ] Single source of truth for all constants
- [ ] Performance is acceptable
- [ ] Edge cases are handled

