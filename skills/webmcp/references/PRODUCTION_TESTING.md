# Production Testing Guide

Test MCP tools on your running production app (Rails, Django, Laravel, etc.) without rebuilding.

## Overview

For server-rendered apps or production deployments, you can:
1. Navigate to your running app
2. Inject WebMCP tools via `inject_webmcp_script`
3. Test tools against real data
4. Iterate without rebuilding/redeploying

## When to Use This

- Testing tools against production data
- Prototyping before adding to codebase
- Quick admin tools without deployment
- Debugging production issues
- Demo/testing environments

## Workflow

### 1. Navigate to Your App

```
navigate_page({ url: "https://your-app.com/admin" })
```

Or for local development:
```
navigate_page({ url: "http://localhost:3000/admin" })
```

### 2. Understand the Page

```
take_snapshot()
```

### 3. Write Your Tools

```javascript
// Admin tools for a Rails app
navigator.modelContext.registerTool({
  name: 'list_users',
  description: 'List users from the admin panel',
  inputSchema: {
    type: 'object',
    properties: {
      limit: { type: 'number', description: 'Max users to return' }
    }
  },
  execute: async ({ limit = 10 }) => {
    const rows = [...document.querySelectorAll('table.users tbody tr')];
    const users = rows.slice(0, limit).map(row => ({
      id: row.querySelector('.user-id')?.textContent?.trim(),
      email: row.querySelector('.user-email')?.textContent?.trim(),
      status: row.querySelector('.user-status')?.textContent?.trim()
    }));
    return {
      content: [{ type: 'text', text: JSON.stringify(users, null, 2) }]
    };
  }
});
```

### 4. Inject and Test

```
inject_webmcp_script({ code: "...your tools..." })
```

### 5. Iterate

Fix issues, reinject, test again until working.

## Common Use Cases

### Admin Panels

```javascript
// List records from any admin table
navigator.modelContext.registerTool({
  name: 'list_records',
  description: 'List records from the admin table',
  inputSchema: {
    type: 'object',
    properties: {
      limit: { type: 'number' }
    }
  },
  execute: async ({ limit = 20 }) => {
    const table = document.querySelector('table');
    if (!table) {
      return { content: [{ type: 'text', text: 'No table found' }], isError: true };
    }

    const headers = [...table.querySelectorAll('thead th')].map(th => th.textContent?.trim());
    const rows = [...table.querySelectorAll('tbody tr')].slice(0, limit).map(tr => {
      const cells = [...tr.querySelectorAll('td')].map(td => td.textContent?.trim());
      return Object.fromEntries(headers.map((h, i) => [h, cells[i]]));
    });

    return {
      content: [{ type: 'text', text: JSON.stringify(rows, null, 2) }]
    };
  }
});
```

### Dashboard Metrics

```javascript
navigator.modelContext.registerTool({
  name: 'get_metrics',
  description: 'Get dashboard metrics',
  inputSchema: { type: 'object', properties: {} },
  execute: async () => {
    const metrics = {};

    // Scrape metric cards
    document.querySelectorAll('.metric-card, .stat-card').forEach(card => {
      const label = card.querySelector('.metric-label, .stat-label')?.textContent?.trim();
      const value = card.querySelector('.metric-value, .stat-value')?.textContent?.trim();
      if (label) metrics[label] = value;
    });

    return {
      content: [{ type: 'text', text: JSON.stringify(metrics, null, 2) }]
    };
  }
});
```

### Search and Filter

```javascript
navigator.modelContext.registerTool({
  name: 'search_records',
  description: 'Search records using the search box',
  inputSchema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Search query' }
    },
    required: ['query']
  },
  execute: async ({ query }) => {
    const searchInput = document.querySelector('input[type="search"], input[name="q"], #search');
    if (!searchInput) {
      return { content: [{ type: 'text', text: 'Search input not found' }], isError: true };
    }

    searchInput.value = query;
    searchInput.dispatchEvent(new Event('input', { bubbles: true }));

    // If there's a search button, click it
    const searchBtn = document.querySelector('button[type="submit"], .search-btn');
    if (searchBtn) searchBtn.click();

    // Or submit the form
    const form = searchInput.closest('form');
    if (form && !searchBtn) form.submit();

    return { content: [{ type: 'text', text: `Searching for "${query}"...` }] };
  }
});
```

### Form Actions

```javascript
// Fill and submit a form (two-tool pattern)
navigator.modelContext.registerTool({
  name: 'fill_edit_form',
  description: 'Fill the edit form fields',
  inputSchema: {
    type: 'object',
    properties: {
      name: { type: 'string' },
      description: { type: 'string' },
      status: { type: 'string', enum: ['active', 'inactive'] }
    }
  },
  execute: async (params) => {
    const filled = [];
    for (const [field, value] of Object.entries(params)) {
      if (value !== undefined) {
        const input = document.querySelector(`[name="${field}"], #${field}`);
        if (input) {
          input.value = value;
          input.dispatchEvent(new Event('input', { bubbles: true }));
          filled.push(field);
        }
      }
    }
    return {
      content: [{ type: 'text', text: `Filled fields: ${filled.join(', ')}` }]
    };
  }
});

navigator.modelContext.registerTool({
  name: 'submit_edit_form',
  description: 'Submit the edit form',
  inputSchema: { type: 'object', properties: {} },
  execute: async () => {
    const form = document.querySelector('form.edit-form, form[method="post"]');
    if (!form) {
      return { content: [{ type: 'text', text: 'Form not found' }], isError: true };
    }
    form.submit();
    return { content: [{ type: 'text', text: 'Form submitted' }] };
  }
});
```

## Framework-Specific Tips

### Rails Admin

```javascript
// For ActiveAdmin, Rails Admin, etc.
const rows = document.querySelectorAll('#index_table_posts tbody tr');
// or
const rows = document.querySelectorAll('.table-indexer tbody tr');
```

### Django Admin

```javascript
// For Django admin
const rows = document.querySelectorAll('#result_list tbody tr');
const form = document.querySelector('#changelist-form');
```

### Laravel Admin

```javascript
// For Laravel admin panels (Nova, Filament, etc.)
const rows = document.querySelectorAll('[data-testid="table-row"]');
// or for Filament
const rows = document.querySelectorAll('.fi-ta-row');
```

## Security Considerations

### Only Use on Your Own Apps

- Never inject scripts on sites you don't control (for admin purposes)
- Only use on your own production/staging environments
- Be aware of data sensitivity

### Authentication

- User must be logged in for tools to access protected data
- Tools can only see what the logged-in user can see
- No bypass of authorization

### Audit Trail

Consider logging tool usage:
```javascript
execute: async (params) => {
  console.log('[WebMCP Admin] Tool called:', JSON.stringify(params));
  // ... tool logic
}
```

## From Prototype to Production

Once your tools work:

1. **Document** - Write down tool names, descriptions, schemas
2. **Add to codebase** - Create proper integration
3. **Test** - Verify with actual implementation
4. **Deploy** - Ship with the app

For permanent integration in server-rendered apps:

```html
<!-- In your layout template -->
<script src="https://unpkg.com/@mcp-b/global"></script>
<script>
  // Your tools here
  navigator.modelContext.registerTool({ ... });
</script>
```

Or use the proper SDK for your framework.
