---
name: webmcp
version: 3.0.0
description: |
  Create MCP tools for any website or web app. Use when the user wants to:
  - Add AI tools to their React/Vue/Next.js app
  - Create userscripts for sites they don't control (Notion, GitHub, etc.)
  - Test MCP tools on their running app (Rails, Django, Laravel)
  - Add MCP to vanilla JS/HTML apps
  - Create a distributable site package with tools + documentation

  Enables autonomous iteration: write code -> inject -> test -> fix -> repeat.
  Self-verifies via chrome-devtools-mcp.
  TypeScript files are auto-bundled via esbuild.
allowed-tools:
  - Read
  - Write
  - Edit
  - Bash
  - Glob
  - Grep
  - mcp__chrome-devtools__*
  - mcp__docs__SearchWebMcpDocumentation
---

# WebMCP Development

Create MCP tools for any website or web app. Inject, test, iterate.

## Quick Start

**The universal development loop:**

1. **Navigate**: `navigate_page` to target URL
2. **Reload**: `navigate_page` with `type="reload"` (clears stale state from prior sessions)
3. **Explore**: `take_snapshot` to understand page structure
4. **Write**: Tool code (just JavaScript with `execute:` function)
5. **Inject**: `inject_webmcp_script` - polyfill auto-injected if needed
6. **Verify**: `diff_webmcp_tools` to see registered tools
7. **Test**: Call tools directly: `mcp__chrome-devtools__webmcp_{domain}_page{idx}_{name}`
8. **Debug**: `list_console_messages` if failures
9. **Iterate**: Fix code, reinject, retest

**IMPORTANT**: Always reload the page before injecting to avoid stale polyfill issues.

```javascript
// Minimal tool - no imports needed!
navigator.modelContext.registerTool({
  name: 'get_page_title',
  description: 'Get the current page title',
  inputSchema: { type: 'object', properties: {} },
  execute: async () => ({
    content: [{ type: 'text', text: document.title }]
  })
});
```

## Context Detection

**React/Vue/Next.js app?**
-> See [REACT_INTEGRATION.md](references/REACT_INTEGRATION.md)

**External site (Notion, GitHub)?**
-> See [USERSCRIPT_GUIDE.md](references/USERSCRIPT_GUIDE.md)

**Running Rails/Django/Laravel app?**
-> See [PRODUCTION_TESTING.md](references/PRODUCTION_TESTING.md)

**Vanilla JS/HTML?**
-> See [VANILLA_JS.md](references/VANILLA_JS.md)

## Tool Naming

After injection, tools become first-class MCP tools:

| Your Tool Name | Becomes |
|----------------|---------|
| `search_pages` | `webmcp_notion_so_page0_search_pages` |
| `list_orders` | `webmcp_localhost_3000_page0_list_orders` |

## inject_webmcp_script Tool

The key tool for development iteration:

```javascript
// Option 1: Inline code (quick prototyping)
inject_webmcp_script({
  code: `
    navigator.modelContext.registerTool({
      name: 'my_tool',
      description: 'Description here',
      inputSchema: { type: 'object', properties: {} },
      execute: async () => ({
        content: [{ type: 'text', text: 'Result' }]
      })
    });
  `,
  wait_for_tools: true,  // Wait for registration (default: true)
  timeout: 5000          // Max wait time ms (default: 5000)
})

// Option 2: TypeScript file (production development)
inject_webmcp_script({
  file_path: './tools/src/mysite.ts'
  // TypeScript auto-bundled via esbuild (~10ms)
  // Imports from node_modules resolved automatically
})
```

**Features:**
- Auto-detects if polyfill needed (checks `navigator.modelContext`)
- Prepends @mcp-b/global polyfill if missing
- **Auto-bundles TypeScript** (.ts/.tsx) via esbuild
- Resolves imports from node_modules (e.g., @webmcp/helpers)
- Waits for tools to register
- Returns registered tool names
- Handles CSP errors gracefully

## @webmcp/helpers Package

**NOTE: Not published yet.** The site-package template includes inline helpers until published.

Lightweight tree-shakable helpers for userscripts:

```typescript
// Helper functions (inlined in template until package published)
function textResponse(text: string): ToolResponse
function jsonResponse(data: unknown, indent = 2): ToolResponse
function errorResponse(message: string): ToolResponse
function getAllElements(selector: string): Element[]
function getText(selectorOrElement: string | Element | null): string | null
function waitForElement(selector: string, timeout = 5000): Promise<Element>
```

See [HELPERS_API.md](references/HELPERS_API.md) for full API.

## Calling Injected Tools

After injection, tools are automatically registered with the Chrome DevTools MCP server
and become immediately callable. The server sends `tools/list_changed` notifications
to inform clients about new tools.

### Tool Naming Convention

Tools follow the pattern: `webmcp_{sanitized_domain}_page{N}_{tool_name}`

Examples:
- `webmcp_news_ycombinator_com_page0_get_stories`
- `webmcp_old_reddit_com_page0_get_posts`
- `webmcp_github_com_page1_search_repos`

### In Claude Code Sessions

When calling tools in Claude Code, use the MCP server prefix:

```javascript
mcp__chrome-devtools__webmcp_news_ycombinator_com_page0_get_stories({
  limit: 10
})
```

The `mcp__chrome-devtools__` prefix routes the call to the correct MCP server.

### In MCP SDK / Tests

When using the MCP SDK directly (e.g., in test scripts), call by the tool name only:

```javascript
await client.callTool({
  name: 'webmcp_news_ycombinator_com_page0_get_stories',
  arguments: { limit: 10 }
})
```

**No prefix needed** - the SDK already knows which server to call.

## Self-Testing Protocol

**CRITICAL**: Verify every tool before considering done.

1. `diff_webmcp_tools` -> Tools appear as `webmcp_{domain}_page{idx}_{name}`
2. Call each tool using the correct calling convention (see above)
3. If fails: `list_console_messages` + `take_snapshot`
4. Fix -> reinject -> retest
5. Only done when ALL tools pass

See [SELF_TESTING.md](references/SELF_TESTING.md) for detailed protocol.

## Tool Design Principles

**Categories by safety:**
- **Read-only** (`readOnlyHint: true`): No side effects
- **Read-write**: Modify UI, reversible
- **Destructive** (`destructiveHint: true`): Permanent actions

**Two-tool pattern for forms:**
- `fill_*_form` (read-write) - populate fields
- `submit_*_form` (destructive) - commit changes

**Handler return format:**
```javascript
// Success
return {
  content: [{ type: 'text', text: 'Result data' }]
};

// Error
return {
  content: [{ type: 'text', text: 'Error message' }],
  isError: true
};
```

See [TOOL_DESIGN.md](references/TOOL_DESIGN.md) for patterns.

## Common Patterns

### Scraping Data

```javascript
navigator.modelContext.registerTool({
  name: 'get_items',
  description: 'Get items from the page',
  inputSchema: {
    type: 'object',
    properties: {
      limit: { type: 'number', description: 'Max items (default: 10)' }
    }
  },
  execute: async ({ limit = 10 }) => {
    const items = [];
    document.querySelectorAll('.item').forEach((el, i) => {
      if (i >= limit) return;
      items.push({
        title: el.querySelector('.title')?.textContent?.trim() || '',
        url: el.querySelector('a')?.href || ''
      });
    });
    return {
      content: [{ type: 'text', text: JSON.stringify(items, null, 2) }]
    };
  }
});
```

### Form Filling

```javascript
// Step 1: Fill form (read-write, reversible)
navigator.modelContext.registerTool({
  name: 'fill_contact_form',
  description: 'Fill contact form fields. Call submit_contact_form to send.',
  inputSchema: {
    type: 'object',
    properties: {
      name: { type: 'string' },
      email: { type: 'string' },
      message: { type: 'string' }
    }
  },
  execute: async ({ name, email, message }) => {
    if (name) document.querySelector('#name').value = name;
    if (email) document.querySelector('#email').value = email;
    if (message) document.querySelector('#message').value = message;
    return { content: [{ type: 'text', text: 'Form filled' }] };
  }
});

// Step 2: Submit form (destructive)
navigator.modelContext.registerTool({
  name: 'submit_contact_form',
  description: 'Submit the contact form. Sends the message.',
  inputSchema: { type: 'object', properties: {} },
  execute: async () => {
    document.querySelector('form#contact').submit();
    return { content: [{ type: 'text', text: 'Form submitted' }] };
  }
});
```

### Navigation

```javascript
navigator.modelContext.registerTool({
  name: 'navigate_to',
  description: 'Navigate to a section',
  inputSchema: {
    type: 'object',
    properties: {
      section: { type: 'string', enum: ['home', 'about', 'contact'] }
    },
    required: ['section']
  },
  execute: async ({ section }) => {
    const urls = { home: '/', about: '/about', contact: '/contact' };
    window.location.href = urls[section];
    return { content: [{ type: 'text', text: `Navigating to ${section}...` }] };
  }
});
```

## When to Use This Skill

**Use when:**
- Creating MCP tools for any website
- Testing tools on your running app
- Adding MCP to vanilla JS/HTML/CSS apps
- Prototyping before committing to an approach

**Don't use when:**
- Site already has WebMCP (just use existing tools)
- Just exploring without building tools

## API Reference

Search docs for specifics:
```
mcp__docs__SearchWebMcpDocumentation("registerTool inputSchema")
mcp__docs__SearchWebMcpDocumentation("tool annotations")
```

## Example Scripts

Reference implementations available in `examples/`:
- `hackernews.js` - Hacker News
- `github.js` - GitHub repositories
- `wikipedia.js` - Wikipedia articles
- `reddit.js` - Reddit posts/comments
- `youtube.js` - YouTube videos
- `twitter.js` - Twitter/X
- `amazon.js` - Amazon products
- `linkedin.js` - LinkedIn profiles/jobs
- `stackoverflow.js` - Stack Overflow Q&A
- `notion.js` - Notion pages/databases
- `google-docs.js` - Google Docs

## Creating a Site Package

For distributable tools + documentation, use the site package template:

```bash
# Copy template
cp -r templates/site-package ./mysite-mcp

# Update placeholders: {{site}}, {{Site}}, {{site_url}}
# Edit: SKILL.md, tools/src/{{site}}.ts, etc.

# Install dependencies
cd mysite-mcp/tools && npm install

# Develop tools
inject_webmcp_script({ file_path: "./mysite-mcp/tools/src/mysite.ts" })
```

**Site package structure:**
```
mysite-mcp/
├── SKILL.md              # Main skill (Setup + Workflows)
├── tools/
│   ├── package.json      # Dependencies (@webmcp/helpers)
│   └── src/mysite.ts     # Tool implementations
├── reference/
│   ├── api.md            # Detailed API docs
│   └── workflows.md      # Usage examples
└── README.md
```

The SKILL.md includes a **Setup section** that tells future agents where to find and inject the tools.

## Troubleshooting

See [TROUBLESHOOTING.md](references/TROUBLESHOOTING.md)

**Common issues:**

| Issue | Solution |
|-------|----------|
| Connection timeout / stale polyfill | `navigate_page` with `type="reload"`, then reinject |
| CSP blocking injection | Use browser extension approach |
| Tools not registering | Check console for errors |
| Stale tools after navigation | Reinject script |
| Selector not finding element | Use take_snapshot to verify page state |
| TypeScript build fails | Check for syntax errors, run `pnpm install` |
| Imports not resolved | Ensure dependencies in package.json, run install |
| `handler` not recognized | Use `execute:` instead of `handler:` in tool definition |
