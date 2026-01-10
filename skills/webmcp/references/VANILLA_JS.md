# Vanilla JS Integration Guide

Add MCP tools to any HTML/JS/CSS application without frameworks.

## Overview

For simple websites, static sites, or vanilla JavaScript applications:
1. Include the @mcp-b/global polyfill
2. Register your tools with `navigator.modelContext.registerTool()`
3. That's it!

## Quick Setup

### Method 1: CDN (Recommended for prototyping)

```html
<!DOCTYPE html>
<html>
<head>
  <title>My App</title>
</head>
<body>
  <h1>Hello World</h1>

  <!-- Add WebMCP polyfill -->
  <script src="https://unpkg.com/@mcp-b/global"></script>

  <!-- Register your tools -->
  <script>
    navigator.modelContext.registerTool({
      name: 'get_page_title',
      description: 'Get the page title',
      inputSchema: { type: 'object', properties: {} },
      execute: async () => ({
        content: [{ type: 'text', text: document.title }]
      })
    });
  </script>
</body>
</html>
```

### Method 2: NPM (For build systems)

```bash
npm install @mcp-b/global
```

```javascript
// main.js
import '@mcp-b/global';

navigator.modelContext.registerTool({
  name: 'my_tool',
  // ...
});
```

### Method 3: Self-Hosted

Download the IIFE bundle and serve it:
```html
<script src="/js/webmcp-global.iife.js"></script>
```

## Complete Example

```html
<!DOCTYPE html>
<html>
<head>
  <title>Todo App</title>
  <style>
    .todo { padding: 10px; border: 1px solid #ccc; margin: 5px 0; }
    .done { text-decoration: line-through; opacity: 0.5; }
  </style>
</head>
<body>
  <h1>My Todos</h1>

  <input type="text" id="new-todo" placeholder="Add todo...">
  <button id="add-btn">Add</button>

  <div id="todo-list"></div>

  <script src="https://unpkg.com/@mcp-b/global"></script>
  <script>
    // App state
    let todos = [];

    // Render function
    function render() {
      document.getElementById('todo-list').innerHTML = todos.map((t, i) => `
        <div class="todo ${t.done ? 'done' : ''}" data-id="${i}">
          <input type="checkbox" ${t.done ? 'checked' : ''} onchange="toggleTodo(${i})">
          ${t.text}
          <button onclick="deleteTodo(${i})">Delete</button>
        </div>
      `).join('');
    }

    // App functions
    window.addTodo = (text) => {
      todos.push({ text, done: false });
      render();
    };

    window.toggleTodo = (id) => {
      todos[id].done = !todos[id].done;
      render();
    };

    window.deleteTodo = (id) => {
      todos.splice(id, 1);
      render();
    };

    // UI event handlers
    document.getElementById('add-btn').onclick = () => {
      const input = document.getElementById('new-todo');
      if (input.value.trim()) {
        addTodo(input.value);
        input.value = '';
      }
    };

    // === WebMCP Tools ===

    // Get all todos
    navigator.modelContext.registerTool({
      name: 'get_todos',
      description: `List all todos. Current count: ${todos.length}`,
      inputSchema: { type: 'object', properties: {} },
      execute: async () => ({
        content: [{ type: 'text', text: JSON.stringify(todos, null, 2) }]
      })
    });

    // Add a new todo
    navigator.modelContext.registerTool({
      name: 'add_todo',
      description: 'Add a new todo item',
      inputSchema: {
        type: 'object',
        properties: {
          text: { type: 'string', description: 'The todo text' }
        },
        required: ['text']
      },
      execute: async ({ text }) => {
        addTodo(text);
        return {
          content: [{ type: 'text', text: `Added: "${text}"` }]
        };
      }
    });

    // Toggle todo completion
    navigator.modelContext.registerTool({
      name: 'toggle_todo',
      description: 'Mark a todo as done/undone',
      inputSchema: {
        type: 'object',
        properties: {
          id: { type: 'number', description: 'Todo index (0-based)' }
        },
        required: ['id']
      },
      execute: async ({ id }) => {
        if (id < 0 || id >= todos.length) {
          return {
            content: [{ type: 'text', text: `Invalid todo ID: ${id}` }],
            isError: true
          };
        }
        toggleTodo(id);
        return {
          content: [{ type: 'text', text: `Toggled todo ${id}: ${todos[id].done ? 'done' : 'not done'}` }]
        };
      }
    });

    // Delete a todo
    navigator.modelContext.registerTool({
      name: 'delete_todo',
      description: 'Delete a todo item. WARNING: Cannot be undone!',
      inputSchema: {
        type: 'object',
        properties: {
          id: { type: 'number', description: 'Todo index (0-based)' }
        },
        required: ['id']
      },
      execute: async ({ id }) => {
        if (id < 0 || id >= todos.length) {
          return {
            content: [{ type: 'text', text: `Invalid todo ID: ${id}` }],
            isError: true
          };
        }
        const deleted = todos[id].text;
        deleteTodo(id);
        return {
          content: [{ type: 'text', text: `Deleted: "${deleted}"` }]
        };
      }
    });

    // Clear completed todos
    navigator.modelContext.registerTool({
      name: 'clear_completed',
      description: 'Remove all completed todos',
      inputSchema: { type: 'object', properties: {} },
      execute: async () => {
        const beforeCount = todos.length;
        todos = todos.filter(t => !t.done);
        render();
        const removed = beforeCount - todos.length;
        return {
          content: [{ type: 'text', text: `Cleared ${removed} completed todo(s)` }]
        };
      }
    });

    console.log('[WebMCP] Todo app tools registered');
    render();
  </script>
</body>
</html>
```

## Patterns

### Exposing App State

```javascript
// Global state accessible to tools
const appState = {
  user: null,
  items: [],
  settings: {}
};

navigator.modelContext.registerTool({
  name: 'get_app_state',
  description: 'Get complete app state for debugging',
  inputSchema: { type: 'object', properties: {} },
  execute: async () => ({
    content: [{ type: 'text', text: JSON.stringify(appState, null, 2) }]
  })
});
```

### Calling App Functions

```javascript
// Your app functions
function saveData() { /* ... */ }
function loadData() { /* ... */ }
function resetApp() { /* ... */ }

// Expose via MCP
navigator.modelContext.registerTool({
  name: 'save_data',
  description: 'Save current data to storage',
  inputSchema: { type: 'object', properties: {} },
  execute: async () => {
    saveData();
    return { content: [{ type: 'text', text: 'Data saved' }] };
  }
});
```

### DOM Manipulation

```javascript
navigator.modelContext.registerTool({
  name: 'update_content',
  description: 'Update main content area',
  inputSchema: {
    type: 'object',
    properties: {
      html: { type: 'string', description: 'HTML content to insert' }
    },
    required: ['html']
  },
  execute: async ({ html }) => {
    document.getElementById('content').innerHTML = html;
    return { content: [{ type: 'text', text: 'Content updated' }] };
  }
});
```

### Event Simulation

```javascript
navigator.modelContext.registerTool({
  name: 'click_button',
  description: 'Click a button by selector',
  inputSchema: {
    type: 'object',
    properties: {
      selector: { type: 'string', description: 'CSS selector for the button' }
    },
    required: ['selector']
  },
  execute: async ({ selector }) => {
    const button = document.querySelector(selector);
    if (!button) {
      return {
        content: [{ type: 'text', text: `Button not found: ${selector}` }],
        isError: true
      };
    }
    button.click();
    return { content: [{ type: 'text', text: `Clicked ${selector}` }] };
  }
});
```

## Multi-Page Apps

For traditional multi-page websites, include the script on each page:

```html
<!-- header.html (included on all pages) -->
<script src="https://unpkg.com/@mcp-b/global"></script>
<script src="/js/webmcp-tools.js"></script>
```

```javascript
// /js/webmcp-tools.js
// Tools available on all pages
navigator.modelContext.registerTool({
  name: 'navigate_to',
  description: 'Navigate to another page',
  inputSchema: {
    type: 'object',
    properties: {
      page: { type: 'string', enum: ['home', 'about', 'contact'] }
    },
    required: ['page']
  },
  execute: async ({ page }) => {
    const urls = { home: '/', about: '/about.html', contact: '/contact.html' };
    window.location.href = urls[page];
    return { content: [{ type: 'text', text: `Navigating to ${page}...` }] };
  }
});

// Page-specific tools based on current path
if (location.pathname === '/products.html') {
  navigator.modelContext.registerTool({
    name: 'get_products',
    description: 'List products on this page',
    // ...
  });
}
```

## Dynamic Tool Registration

Update tools when state changes:

```javascript
// Initial registration
let currentTool = null;

function updateTool(itemCount) {
  // Remove old tool if exists
  // Note: Full implementation would need tool unregistration

  // Register new tool with updated description
  navigator.modelContext.registerTool({
    name: 'get_items',
    description: `Get items. Current count: ${itemCount}`,
    inputSchema: { type: 'object', properties: {} },
    execute: async () => ({
      content: [{ type: 'text', text: JSON.stringify(items) }]
    })
  });
}

// Call when state changes
items.push(newItem);
updateTool(items.length);
```

## Local Development

For local development with inject_webmcp_script:

1. Start a local server (e.g., `npx serve`)
2. Navigate to `http://localhost:3000`
3. Use `inject_webmcp_script` to test tools
4. Once working, add to your HTML files

## Production Checklist

- [ ] Include @mcp-b/global on all pages
- [ ] Tools have clear descriptions
- [ ] Error handling in all handlers
- [ ] Destructive actions require confirmation
- [ ] Console logs removed (optional)
- [ ] Test with chrome-devtools-mcp
