# Troubleshooting

Common issues and solutions when developing WebMCP tools.

## Injection Issues

### CSP Blocking Inline Scripts

**Error:**
```
Refused to execute inline script because it violates the following
Content Security Policy directive: "script-src 'self'"
```

**Cause:** The website has a strict Content Security Policy that blocks inline scripts.

**Solutions:**
1. Try a different page on the same site (some pages may have different CSP)
2. Use a browser extension approach (future feature)
3. For your own apps, add `'unsafe-inline'` to CSP during development

**Affected sites:** Banking sites, enterprise apps, security-focused sites

### Script Not Executing

**Symptoms:**
- inject_webmcp_script completes but no tools register
- No console errors

**Check:**
1. Is the code valid JavaScript?
2. Are there syntax errors?
3. Is `navigator.modelContext.registerTool` called correctly?

**Debug:**
```javascript
// Add logging to your script
console.log('[WebMCP] Script starting...');
navigator.modelContext.registerTool({ ... });
console.log('[WebMCP] Tool registered');
```

Then check: `list_console_messages()`

### Tools Not Appearing

**After injection, `diff_webmcp_tools()` shows no new tools**

**Possible causes:**

1. **Handler return format wrong:**
   ```javascript
   // Wrong
   execute: async () => "Result"

   // Correct
   execute: async () => ({
     content: [{ type: 'text', text: 'Result' }]
   })
   ```

2. **Missing inputSchema:**
   ```javascript
   // Must have inputSchema, even if empty
   inputSchema: { type: 'object', properties: {} }
   ```

3. **JavaScript error in tool code:**
   Check `list_console_messages()` for errors

4. **Polyfill not loaded:**
   Try navigating away and back, then reinject

## Tool Execution Issues

### Tool Returns Error

**"Tool no longer available - page may have closed or navigated"**

The page changed since injection. Reinject the script.

### Null Reference Errors

**Error:** `TypeError: Cannot read property 'textContent' of null`

**Cause:** Element selector returned null

**Fix:** Use optional chaining:
```javascript
// Before
const text = document.querySelector('.item').textContent;

// After
const text = document.querySelector('.item')?.textContent || 'Not found';
```

### Empty Results

**Tool returns empty array or "No items found"**

**Possible causes:**

1. **Wrong selector:** Take a snapshot and verify selectors
   ```
   take_snapshot()
   ```

2. **Content not loaded:** Dynamic content may not be ready
   ```javascript
   // Wait for content
   await new Promise(resolve => setTimeout(resolve, 1000));
   ```

3. **In iframe:** Content in iframes has separate DOM
   ```javascript
   // Access iframe content
   const iframe = document.querySelector('iframe');
   const iframeDoc = iframe?.contentDocument;
   ```

4. **Shadow DOM:** Some components use shadow DOM
   ```javascript
   const shadowRoot = element.shadowRoot;
   const innerElement = shadowRoot?.querySelector('.inner');
   ```

### Stale Data

**Tool returns outdated information**

**Cause:** Page state changed but cached data used

**Fix:** Always read fresh from DOM:
```javascript
// Don't cache selectors
execute: async () => {
  // Query fresh each time
  const currentValue = document.querySelector('.value')?.textContent;
  return { content: [{ type: 'text', text: currentValue }] };
}
```

## Page-Specific Issues

### SPA Navigation

**Single Page Apps (React, Vue, etc.) - tools break after navigation**

**Cause:** SPA navigation doesn't reload the page, but DOM changes

**Solutions:**
1. Reinject script after SPA navigation
2. Use mutation observers for dynamic content
3. Query elements fresh each time (don't cache)

### Infinite Scroll

**Can only access first batch of items**

**Cause:** Items load as user scrolls

**Solution:** Scroll programmatically before scraping:
```javascript
execute: async ({ loadMore = false }) => {
  if (loadMore) {
    // Scroll to bottom to trigger load
    window.scrollTo(0, document.body.scrollHeight);
    await new Promise(r => setTimeout(r, 2000));
  }

  // Now scrape
  const items = document.querySelectorAll('.item');
  // ...
}
```

### Authentication Required

**Tool only works when logged in**

**Solution:** Check auth state and return helpful error:
```javascript
execute: async () => {
  const isLoggedIn = document.querySelector('.user-menu, .logout-button');
  if (!isLoggedIn) {
    return {
      content: [{ type: 'text', text: 'Please log in to use this tool' }],
      isError: true
    };
  }
  // Continue...
}
```

### Rate Limiting

**Site blocks after too many requests**

**Solution:** Add delays between tool calls:
```javascript
execute: async () => {
  // The agent should call this tool with reasonable frequency
  // Add a warning in description
  // ...
}

// In description:
description: 'Get data from API. Note: Avoid calling more than once per minute to prevent rate limiting.'
```

## Debugging Techniques

### Console Logging

Add strategic logging:
```javascript
execute: async () => {
  console.log('[MyTool] Starting...');

  const elements = document.querySelectorAll('.item');
  console.log('[MyTool] Found elements:', elements.length);

  elements.forEach((el, i) => {
    console.log(`[MyTool] Item ${i}:`, el.textContent?.substring(0, 50));
  });

  // ...
}
```

Then check: `list_console_messages({ types: ['log'] })`

### Snapshot Comparison

Before and after tool execution:
```
# Before
take_snapshot()

# Run tool
webmcp_..._my_tool()

# After
take_snapshot()
```

### Element Inspector

Use evaluate_script for quick DOM inspection:
```javascript
evaluate_script({
  function: `() => {
    return {
      itemCount: document.querySelectorAll('.item').length,
      hasNav: !!document.querySelector('nav'),
      title: document.title
    };
  }`
})
```

## Common Error Messages

| Error | Meaning | Solution |
|-------|---------|----------|
| `CSP directive violation` | Site blocks inline scripts | Use extension approach |
| `navigator is not defined` | Running in wrong context | Ensure code runs in page context |
| `modelContext is undefined` | Polyfill not loaded | Wait longer or reinject |
| `Cannot read property of null` | Element not found | Use optional chaining |
| `Invalid inputSchema` | Schema format wrong | Check JSON Schema syntax |
| `Tool timeout` | Handler took too long | Optimize or increase timeout |

## Getting Help

If none of these solutions work:

1. **Check console:** `list_console_messages({ types: ['error', 'warn'] })`
2. **Verify page state:** `take_snapshot()`
3. **Test minimal example:** Strip down to simplest working code
4. **Check site docs:** Some sites have official APIs
