# Userscript Development Guide

Build MCP tools for websites you don't control (GitHub, Notion, Twitter, etc.).

## Overview

Userscripts let you add MCP tools to any website without modifying its source code.
The `inject_webmcp_script` tool handles everything:
1. Checks if the page already has WebMCP
2. Injects the @mcp-b/global polyfill if needed
3. **Auto-bundles TypeScript** (.ts/.tsx) via esbuild
4. Runs your tool registration code
5. Waits for tools to register

## Two Development Modes

### Quick Prototyping (Inline Code)

For quick iterations, use inline code directly:

```javascript
inject_webmcp_script({
  code: `navigator.modelContext.registerTool({...});`
})
```

### Production Development (TypeScript Files)

For serious development, use TypeScript with the helpers package:

```typescript
// mysite.ts
import { waitForElement, jsonResponse, errorResponse } from '@webmcp/helpers';

navigator.modelContext.registerTool({
  name: 'get_data',
  execute: async () => {
    const el = await waitForElement('.data');
    return jsonResponse({ data: el.textContent });
  }
});
```

```javascript
inject_webmcp_script({ file_path: './mysite.ts' })
// TypeScript auto-bundled, imports resolved
```

## Development Workflow

### 1. Navigate to Target Site

```
navigate_page({ url: "https://github.com/microsoft/vscode" })
```

### 2. Understand the Page

```
take_snapshot()
```

Look for:
- CSS selectors for key elements
- Data attributes (data-*, aria-*)
- IDs and classes
- Page structure

### 3. Write Your Tools

```javascript
navigator.modelContext.registerTool({
  name: 'get_repo_info',
  description: 'Get GitHub repository information',
  inputSchema: { type: 'object', properties: {} },
  execute: async () => {
    const title = document.querySelector('[itemprop="name"] a')?.textContent;
    const stars = document.querySelector('#repo-stars-counter-star')?.textContent;
    return {
      content: [{ type: 'text', text: JSON.stringify({ title, stars }) }]
    };
  }
});
```

### 4. Inject and Test

```
inject_webmcp_script({ code: "...your code..." })
```

### 5. Verify Tools Registered

```
diff_webmcp_tools()
```

### 6. Call Your Tools

```
webmcp_github_com_page0_get_repo_info()
```

### 7. Debug if Needed

```
list_console_messages()
```

Look for:
- JavaScript errors
- CSP violations
- Selector errors

### 8. Iterate

Fix issues and reinject. The old script is automatically replaced.

## Best Practices

### Robust Selectors

Prefer:
- Data attributes: `[data-testid="button"]`
- ARIA attributes: `[aria-label="Close"]`
- Semantic HTML: `nav`, `article`, `main`

Avoid:
- Generated class names: `.css-1abc2def`
- Deeply nested paths: `div > div > div > span`
- Position-based: `:nth-child(3)`

### Handle Missing Elements

```javascript
const element = document.querySelector('.optional-element');
const value = element?.textContent?.trim() || 'Not found';
```

### Limit Output Size

```javascript
const description = element.textContent?.trim().substring(0, 500);
return {
  content: [{ type: 'text', text: description + (description.length >= 500 ? '...' : '') }]
};
```

### Wait for Dynamic Content

If content loads asynchronously, use `@webmcp/helpers`:

```typescript
import { waitForElement, waitForElementRemoved } from '@webmcp/helpers';

execute: async () => {
  // Wait for element to appear (uses MutationObserver, more efficient)
  const content = await waitForElement('.dynamic-content');

  // Or wait for loading indicator to disappear
  await waitForElementRemoved('.loading-spinner');

  // Now scrape
  return jsonResponse({ text: content.textContent });
}
```

**Without helpers** (inline code):

```javascript
execute: async () => {
  // Wait for element to appear
  await new Promise(resolve => {
    const check = setInterval(() => {
      if (document.querySelector('.dynamic-content')) {
        clearInterval(check);
        resolve();
      }
    }, 100);
    setTimeout(resolve, 5000); // Timeout after 5s
  });

  // Now scrape
  const content = document.querySelector('.dynamic-content');
  // ...
}
```

### Group Related Tools

```javascript
// Good: Tools that work together
const tools = [
  { name: 'search_repos', /* ... */ },
  { name: 'get_repo_info', /* ... */ },
  { name: 'get_readme', /* ... */ }
];

tools.forEach(tool => navigator.modelContext.registerTool(tool));
console.log(`[WebMCP] Registered ${tools.length} GitHub tools`);
```

## Handling Authentication

You can only access what the logged-in user can see.

For auth-required pages:
1. User logs in manually
2. Agent navigates to target page
3. Agent injects and uses tools

```javascript
navigator.modelContext.registerTool({
  name: 'get_private_data',
  description: 'Get data from authenticated view',
  execute: async () => {
    // Check if logged in
    const loggedIn = document.querySelector('.user-avatar');
    if (!loggedIn) {
      return {
        content: [{ type: 'text', text: 'Please log in first' }],
        isError: true
      };
    }
    // Proceed with scraping...
  }
});
```

## CSP Restrictions

Some sites block inline scripts via Content Security Policy.

**Error example:**
```
Refused to execute inline script because it violates the following
Content Security Policy directive: "script-src 'self'"
```

**Solutions:**
1. Use browser extension approach (future feature)
2. Try on a different domain/page
3. Report in TROUBLESHOOTING.md

## Example: Complete Userscript

```javascript
/**
 * Twitter/X WebMCP Tools
 * Provides tools for scraping and navigating Twitter
 */

// Get timeline posts
navigator.modelContext.registerTool({
  name: 'get_timeline',
  description: 'Get tweets from timeline',
  inputSchema: {
    type: 'object',
    properties: {
      limit: { type: 'number', description: 'Max tweets (default: 10)' }
    }
  },
  execute: async ({ limit = 10 }) => {
    const tweets = [];
    const articles = document.querySelectorAll('article[data-testid="tweet"]');

    articles.forEach((article, i) => {
      if (i >= limit) return;

      const text = article.querySelector('[data-testid="tweetText"]')?.textContent;
      const author = article.querySelector('[data-testid="User-Name"]')?.textContent;

      tweets.push({ author, text: text?.substring(0, 280) });
    });

    return {
      content: [{ type: 'text', text: JSON.stringify(tweets, null, 2) }]
    };
  }
});

// Navigate to profile
navigator.modelContext.registerTool({
  name: 'go_to_profile',
  description: 'Navigate to a Twitter profile',
  inputSchema: {
    type: 'object',
    properties: {
      username: { type: 'string', description: 'Twitter username' }
    },
    required: ['username']
  },
  execute: async ({ username }) => {
    window.location.href = `https://twitter.com/${username.replace('@', '')}`;
    return { content: [{ type: 'text', text: `Navigating to @${username}...` }] };
  }
});

console.log('[WebMCP] Twitter tools registered');
```

## Distribution

Once your userscript is working:

1. **Save to file** - Store in `examples/` directory
2. **Document** - Add JSDoc header with website, tools list
3. **Test** - Verify on fresh page load
4. **Share** - Can be used by anyone with inject_webmcp_script
