# Tool Design Patterns

Best practices for designing effective MCP tools.

## Tool Categories

### Read-Only Tools

Tools that only read data without side effects.

```javascript
navigator.modelContext.registerTool({
  name: 'get_user_profile',
  description: 'Get user profile information (read-only)',
  // Mark as read-only in description
  inputSchema: { type: 'object', properties: {} },
  execute: async () => {
    // Only reads, never modifies
    const name = document.querySelector('.user-name')?.textContent;
    return { content: [{ type: 'text', text: JSON.stringify({ name }) }] };
  }
});
```

### Read-Write Tools

Tools that modify state but are reversible.

```javascript
navigator.modelContext.registerTool({
  name: 'toggle_dark_mode',
  description: 'Toggle dark mode on/off (reversible)',
  inputSchema: { type: 'object', properties: {} },
  execute: async () => {
    document.body.classList.toggle('dark-mode');
    const isDark = document.body.classList.contains('dark-mode');
    return { content: [{ type: 'text', text: `Dark mode: ${isDark}` }] };
  }
});
```

### Destructive Tools

Tools with permanent effects - mark clearly!

```javascript
navigator.modelContext.registerTool({
  name: 'delete_item',
  description: 'DELETE an item. WARNING: This action is IRREVERSIBLE!',
  inputSchema: {
    type: 'object',
    properties: {
      id: { type: 'string', description: 'Item ID to delete' },
      confirm: { type: 'boolean', description: 'Must be true to confirm deletion' }
    },
    required: ['id', 'confirm']
  },
  execute: async ({ id, confirm }) => {
    if (!confirm) {
      return {
        content: [{ type: 'text', text: 'Set confirm: true to delete' }],
        isError: true
      };
    }
    // Perform deletion...
    return { content: [{ type: 'text', text: `Deleted item ${id}` }] };
  }
});
```

## The Two-Tool Pattern

For forms and multi-step actions, split into preparation and execution.

### Why?

- Allows review before committing
- Enables iterative refinement
- Separates reversible from irreversible actions
- Gives user control over when to execute

### Example: Contact Form

```javascript
// Tool 1: Fill form (reversible)
navigator.modelContext.registerTool({
  name: 'fill_contact_form',
  description: 'Fill contact form fields. Call submit_contact_form to send.',
  inputSchema: {
    type: 'object',
    properties: {
      name: { type: 'string', description: 'Your name' },
      email: { type: 'string', description: 'Your email' },
      subject: { type: 'string', description: 'Message subject' },
      message: { type: 'string', description: 'Message body' }
    }
  },
  execute: async (params) => {
    const fields = ['name', 'email', 'subject', 'message'];
    const filled = [];

    for (const field of fields) {
      if (params[field]) {
        const input = document.querySelector(`#${field}, [name="${field}"]`);
        if (input) {
          input.value = params[field];
          filled.push(field);
        }
      }
    }

    // Return current form state
    const formState = {};
    for (const field of fields) {
      const input = document.querySelector(`#${field}, [name="${field}"]`);
      formState[field] = input?.value || '';
    }

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({ filled, currentState: formState }, null, 2)
      }]
    };
  }
});

// Tool 2: Submit form (irreversible)
navigator.modelContext.registerTool({
  name: 'submit_contact_form',
  description: 'Submit the contact form. Sends the message - cannot be undone.',
  inputSchema: { type: 'object', properties: {} },
  execute: async () => {
    const form = document.querySelector('form#contact, form[action*="contact"]');
    if (!form) {
      return { content: [{ type: 'text', text: 'Form not found' }], isError: true };
    }

    // Validate before submit
    const required = ['name', 'email', 'message'];
    for (const field of required) {
      const input = form.querySelector(`[name="${field}"]`);
      if (!input?.value?.trim()) {
        return {
          content: [{ type: 'text', text: `Missing required field: ${field}` }],
          isError: true
        };
      }
    }

    form.submit();
    return { content: [{ type: 'text', text: 'Form submitted!' }] };
  }
});
```

### Example: Shopping Cart

```javascript
// Preview: Show what will happen
navigator.modelContext.registerTool({
  name: 'preview_checkout',
  description: 'Preview checkout details before placing order',
  inputSchema: { type: 'object', properties: {} },
  execute: async () => {
    const items = [...document.querySelectorAll('.cart-item')].map(el => ({
      name: el.querySelector('.item-name')?.textContent,
      price: el.querySelector('.item-price')?.textContent
    }));
    const total = document.querySelector('.cart-total')?.textContent;

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({ items, total, message: 'Call place_order to proceed' }, null, 2)
      }]
    };
  }
});

// Execute: Perform the action
navigator.modelContext.registerTool({
  name: 'place_order',
  description: 'Place the order. WARNING: This will charge your payment method!',
  inputSchema: {
    type: 'object',
    properties: {
      confirm: { type: 'boolean', description: 'Must be true to confirm order' }
    },
    required: ['confirm']
  },
  execute: async ({ confirm }) => {
    if (!confirm) {
      return { content: [{ type: 'text', text: 'Set confirm: true to place order' }], isError: true };
    }

    document.querySelector('#place-order-button').click();
    return { content: [{ type: 'text', text: 'Order placed!' }] };
  }
});
```

## Input Schema Design

### Required vs Optional Parameters

```javascript
inputSchema: {
  type: 'object',
  properties: {
    query: { type: 'string', description: 'Search query' },      // Required
    limit: { type: 'number', description: 'Max results (default: 10)' }, // Optional
    sort: { type: 'string', enum: ['date', 'relevance'], description: 'Sort order' }
  },
  required: ['query']  // Only query is required
}
```

### Enum for Fixed Options

```javascript
properties: {
  category: {
    type: 'string',
    enum: ['electronics', 'books', 'clothing', 'home'],
    description: 'Product category'
  }
}
```

### Nested Objects

```javascript
properties: {
  filters: {
    type: 'object',
    properties: {
      minPrice: { type: 'number' },
      maxPrice: { type: 'number' },
      brand: { type: 'string' }
    }
  }
}
```

## Error Handling

### Graceful Errors

```javascript
execute: async ({ id }) => {
  const element = document.querySelector(`#item-${id}`);

  if (!element) {
    return {
      content: [{ type: 'text', text: `Item ${id} not found` }],
      isError: true
    };
  }

  // Continue with logic...
}
```

### Validation

```javascript
execute: async ({ email }) => {
  // Validate input
  if (!email.includes('@')) {
    return {
      content: [{ type: 'text', text: 'Invalid email format' }],
      isError: true
    };
  }

  // Proceed...
}
```

### Try-Catch

```javascript
execute: async (params) => {
  try {
    const result = await someOperation(params);
    return { content: [{ type: 'text', text: JSON.stringify(result) }] };
  } catch (error) {
    return {
      content: [{ type: 'text', text: `Error: ${error.message}` }],
      isError: true
    };
  }
}
```

## Response Formatting

### Structured Data

```javascript
// Return as JSON for structured data
return {
  content: [{
    type: 'text',
    text: JSON.stringify({
      count: items.length,
      items: items,
      hasMore: items.length === limit
    }, null, 2)
  }]
};
```

### Human-Readable

```javascript
// Return formatted text for direct display
return {
  content: [{
    type: 'text',
    text: `Found ${count} results:\n\n${items.map((i, n) => `${n+1}. ${i.title}`).join('\n')}`
  }]
};
```

### Truncated Content

```javascript
const fullText = element.textContent || '';
const truncated = fullText.length > 1000;
const text = truncated ? fullText.substring(0, 1000) + '...' : fullText;

return {
  content: [{
    type: 'text',
    text: JSON.stringify({
      content: text,
      truncated,
      fullLength: fullText.length
    })
  }]
};
```

## Naming Conventions

### Tool Names

- Use `snake_case`
- Start with verb: `get_`, `list_`, `create_`, `update_`, `delete_`
- Be specific: `get_user_profile` not just `get_user`

### Descriptions

- Start with verb
- Include what it does and important caveats
- Mention related tools if part of a flow

```javascript
// Good
description: 'Get the top posts from the current subreddit. Returns title, score, and author.'

// Better (mentions flow)
description: 'Fill order form fields. Call submit_order to place the order.'

// For destructive actions
description: 'DELETE the selected item. WARNING: This cannot be undone!'
```
