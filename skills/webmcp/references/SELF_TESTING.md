# Self-Testing Protocol

**CRITICAL**: Every tool must be verified before the task is considered complete.

## The Testing Loop

```
┌─────────────────────────────────────────────────────────┐
│  1. INJECT                                               │
│     inject_webmcp_script({ code: "..." })               │
└────────────────────────┬────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────┐
│  2. VERIFY REGISTRATION                                  │
│     diff_webmcp_tools()                                 │
│     → Confirm tools appear as webmcp_{domain}_page{n}_* │
└────────────────────────┬────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────┐
│  3. TEST EACH TOOL                                       │
│     webmcp_{domain}_page{n}_{tool_name}({ ... })        │
│     → Call with valid parameters                         │
│     → Call with edge cases                               │
└────────────────────────┬────────────────────────────────┘
                         │
                    ┌────┴────┐
                    │ Pass?   │
                    └────┬────┘
                    YES  │   NO
           ┌─────────────┴──────────────┐
           ▼                            ▼
┌──────────────────┐     ┌─────────────────────────────────┐
│  4. DONE!        │     │  4. DEBUG                        │
│                  │     │     list_console_messages()     │
│                  │     │     take_snapshot()             │
│                  │     │     → Fix code                   │
│                  │     │     → Go back to step 1          │
└──────────────────┘     └─────────────────────────────────┘
```

## Step 1: Inject Script

```
inject_webmcp_script({
  code: `
    navigator.modelContext.registerTool({
      name: 'my_tool',
      // ...
    });
  `
})
```

**Expected output:**
```
Target: https://example.com

Injecting @mcp-b/global polyfill...
Polyfill prepended
Injecting userscript...
Script injected
Waiting for tools (5000ms)...

1 tool(s) registered:

  - my_tool
    -> webmcp_example_com_page0_my_tool

Tools are now callable as first-class MCP tools.
```

**If no tools registered:**
- Check console for JavaScript errors
- Verify tool code syntax is correct
- Ensure handler returns proper format

## Step 2: Verify Registration

```
diff_webmcp_tools()
```

**Expected output:**
```
3 WebMCP tool(s) registered:

- webmcp_example_com_page0_tool_one
  Original: tool_one
  Domain: example.com (page 0)
  Description: [WebMCP - example.com - Page 0] Description here

- webmcp_example_com_page0_tool_two
  ...
```

**Verify:**
- All expected tools appear
- Names match what you registered
- Descriptions are correct

## Step 3: Test Each Tool

### Basic Call

```
webmcp_example_com_page0_get_items({ limit: 5 })
```

**Expected:** Valid JSON or text response

### Edge Cases

Test each tool with:
1. **No parameters** (if optional)
2. **Minimum values** (limit: 1)
3. **Maximum values** (limit: 100)
4. **Invalid input** (expect graceful error)

### Verify Response Format

```javascript
// Good response
{
  content: [{ type: 'text', text: '...' }]
}

// Error response
{
  content: [{ type: 'text', text: 'Error message' }],
  isError: true
}
```

## Step 4: Debug Failures

### Check Console

```
list_console_messages({ types: ['error', 'warn'] })
```

**Common errors:**
- `ReferenceError` - Variable not defined
- `TypeError` - Calling method on null/undefined
- `SyntaxError` - Invalid JavaScript

### Check Page State

```
take_snapshot()
```

**Verify:**
- Element you're selecting exists
- Page is fully loaded
- Not on wrong page (redirected)

### Common Fixes

| Problem | Solution |
|---------|----------|
| Element not found | Use optional chaining: `el?.textContent` |
| Empty result | Check if content is dynamically loaded |
| Stale data | Page may have changed, reinject |
| CSP error | Site blocks inline scripts |

## Verification Checklist

Before marking complete:

- [ ] `diff_webmcp_tools()` shows all expected tools
- [ ] Each tool called with typical parameters
- [ ] Each tool called with edge case parameters
- [ ] Error cases return `isError: true`
- [ ] No console errors during tool execution
- [ ] Response format is valid MCP content

## Example Test Session

```
# 1. Inject
inject_webmcp_script({ code: `...hackernews.js contents...` })
→ "3 tool(s) registered: get_top_stories, search_stories, navigate_section"

# 2. Verify
diff_webmcp_tools()
→ Shows all 3 tools with correct descriptions

# 3. Test get_top_stories
webmcp_news_ycombinator_com_page0_get_top_stories({ limit: 3 })
→ Returns JSON with 3 stories

webmcp_news_ycombinator_com_page0_get_top_stories({})
→ Returns JSON with 10 stories (default)

# 4. Test search_stories
webmcp_news_ycombinator_com_page0_search_stories({ query: "AI" })
→ Returns matching stories

webmcp_news_ycombinator_com_page0_search_stories({ query: "xyznonexistent123" })
→ Returns "No stories found" message

# 5. Test navigate_section
webmcp_news_ycombinator_com_page0_navigate_section({ section: "new" })
→ Page navigates, returns confirmation

# ALL PASS - Done!
```

## After Navigation

If a tool navigates the page:
1. Previous tools may be lost
2. Reinject script on new page
3. Verify tools work in new context
