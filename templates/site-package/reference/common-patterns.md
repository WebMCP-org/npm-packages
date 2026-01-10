# Common Patterns for WebMCP Tools

## DOM Queries

### Get all matching elements
```typescript
const items = getAllElements('.item');
```

### Get nested element
```typescript
const title = element.querySelector('.title');
```

### Get sibling element
```typescript
const metadata = row.nextElementSibling;
```

### Get parent element
```typescript
const container = element.parentElement;
```

## Parsing

### Extract text safely
```typescript
const text = getText(element) || 'default';
```

### Parse numbers from text
```typescript
const text = "123 points";
const num = parseInt(text.match(/\d+/)?.[0] || '0');
```

### Get attribute
```typescript
const url = element.getAttribute('href') || '';
```

### Check if element exists
```typescript
if (!element) {
  return errorResponse('Element not found');
}
```

## Error Handling

### Try-catch wrapper
```typescript
execute: async (params) => {
  try {
    // Implementation
    return jsonResponse(result);
  } catch (error) {
    return errorResponse(`Operation failed: ${error}`);
  }
}
```

### Validate parameters
```typescript
if (!params.query || params.query.trim() === '') {
  return errorResponse('query parameter is required');
}
```

### Handle empty results
```typescript
if (items.length === 0) {
  return textResponse('No items found matching criteria');
}
```

## Response Patterns

### Return list
```typescript
return jsonResponse({
  count: items.length,
  items: items
});
```

### Return single item
```typescript
return jsonResponse(item);
```

### Return success message
```typescript
return textResponse('Action completed successfully');
```

### Return error
```typescript
return errorResponse('Something went wrong');
```

## Parsing Complex Structures

### Parse list of items
```typescript
interface Item {
  id: string;
  title: string;
  url: string;
}

function parseItem(element: Element): Item | null {
  try {
    // Extract required fields
    const id = element.id;
    if (!id) return null;  // Skip items without ID

    const titleLink = element.querySelector('.title a');
    const title = getText(titleLink);
    const url = titleLink?.getAttribute('href');

    if (!title || !url) return null;  // Skip incomplete items

    return { id, title, url };
  } catch (error) {
    console.error('Failed to parse item:', error);
    return null;
  }
}

// Use in tool
const elements = getAllElements('.item');
const items: Item[] = [];
for (const el of elements) {
  const item = parseItem(el);
  if (item) items.push(item);
}
```

### Handle nested metadata
```typescript
// When metadata is in a sibling element
const mainRow = element;
const metaRow = mainRow.nextElementSibling;
const author = getText(metaRow?.querySelector('.author')) || 'Unknown';
```

### Parse numbers safely
```typescript
const scoreText = getText(element.querySelector('.score')) || '0';
const score = parseInt(scoreText.match(/\d+/)?.[0] || '0');
```

## Tool Registration Patterns

### Read-only tool (no side effects)
```typescript
navigator.modelContext.registerTool({
  name: 'get_items',
  description: 'Get items from the current page',
  inputSchema: {
    type: 'object',
    properties: {
      limit: {
        type: 'number',
        description: 'Maximum number of items (default: 10)',
      }
    }
  },
  execute: async ({ limit = 10 }) => {
    try {
      const items = getAllElements('.item').slice(0, limit);
      return jsonResponse({ count: items.length, items });
    } catch (error) {
      return errorResponse(`Failed to get items: ${error}`);
    }
  }
});
```

### Read-write tool (modifies UI)
```typescript
navigator.modelContext.registerTool({
  name: 'fill_form',
  description: 'Fill form fields. Does not submit.',
  inputSchema: {
    type: 'object',
    properties: {
      name: { type: 'string' },
      email: { type: 'string' },
    }
  },
  execute: async ({ name, email }) => {
    try {
      if (name) document.querySelector('#name').value = name;
      if (email) document.querySelector('#email').value = email;
      return textResponse('Form filled successfully');
    } catch (error) {
      return errorResponse(`Fill failed: ${error}`);
    }
  }
});
```

### Destructive tool (permanent action)
```typescript
navigator.modelContext.registerTool({
  name: 'submit_form',
  description: 'Submit the form. This action is permanent.',
  inputSchema: { type: 'object', properties: {} },
  execute: async () => {
    try {
      const form = document.querySelector('form');
      if (!form) {
        return errorResponse('Form not found');
      }
      form.submit();
      return textResponse('Form submitted');
    } catch (error) {
      return errorResponse(`Submit failed: ${error}`);
    }
  }
});
```

## Search and Filter Patterns

### Search by text
```typescript
execute: async ({ query }) => {
  const items = getAllElements('.item');
  const matches = items.filter(item => {
    const text = getText(item);
    return text?.toLowerCase().includes(query.toLowerCase());
  });
  return jsonResponse({ count: matches.length, matches });
}
```

### Filter by numeric property
```typescript
execute: async ({ minPoints }) => {
  const items = getAllElements('.item');
  const filtered = items.filter(item => {
    const scoreText = getText(item.querySelector('.score')) || '0';
    const score = parseInt(scoreText.match(/\d+/)?.[0] || '0');
    return score >= minPoints;
  });
  return jsonResponse({ count: filtered.length, filtered });
}
```

## Navigation Patterns

### Navigate to URL
```typescript
execute: async ({ section }) => {
  const urls = { home: '/', about: '/about', contact: '/contact' };
  window.location.href = urls[section];
  return textResponse(`Navigating to ${section}...`);
}
```

### Click element
```typescript
execute: async ({ label }) => {
  const button = Array.from(document.querySelectorAll('button'))
    .find(btn => getText(btn)?.toLowerCase() === label.toLowerCase());

  if (!button) {
    return errorResponse(`Button "${label}" not found`);
  }

  if (button instanceof HTMLElement) {
    button.click();
  }

  return textResponse(`Clicked button: ${label}`);
}
```

## Best Practices

1. **Always validate inputs**
   ```typescript
   if (!params.id || params.id.trim() === '') {
     return errorResponse('id parameter is required');
   }
   ```

2. **Handle missing elements gracefully**
   ```typescript
   const element = document.querySelector('.optional');
   const value = element ? getText(element) : 'default';
   ```

3. **Use try-catch for all tools**
   ```typescript
   execute: async (params) => {
     try {
       // Implementation
       return jsonResponse(result);
     } catch (error) {
       return errorResponse(`Operation failed: ${error}`);
     }
   }
   ```

4. **Provide helpful error messages**
   ```typescript
   return errorResponse('No items found. Are you on the right page?');
   ```

5. **Return structured data**
   ```typescript
   return jsonResponse({
     count: items.length,
     items: items,
     metadata: { page: 1, total: 100 }
   });
   ```
