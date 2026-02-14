# @mcp-b/global - Advanced Guide

This guide covers advanced usage of `@mcp-b/global`. For installation and quick start, see the [package README](../packages/global/README.md).

## Table of Contents

- [Traditional Web Standard Usage](#traditional-web-standard-usage)
- [Configuration](#configuration)
- [Native Chromium API Support](#native-chromium-api-support)
- [API Reference](#api-reference)
- [Output Schemas](#output-schemas)
- [Dynamic Tool Registration](#dynamic-tool-registration)
- [Event-Based Tool Calls](#event-based-tool-calls)
- [Testing API](#testing-api)
- [Complete Examples](#complete-examples)
- [Security Considerations](#security-considerations)

## Traditional Web Standard Usage

The Web Model Context API follows the same patterns as other browser APIs.

### Basic Pattern (Vanilla JavaScript)

```html
<!DOCTYPE html>
<html>
<head>
  <title>Web Model Context API Example</title>
  <script src="https://unpkg.com/@mcp-b/global@latest/dist/index.iife.js"></script>
</head>
<body>
  <h1>Counter App</h1>
  <p>Count: <span id="count">0</span></p>
  <button id="increment">+</button>
  <button id="decrement">-</button>

  <script>
    // State
    let count = 0;

    // DOM elements
    const countEl = document.getElementById('count');
    const incrementBtn = document.getElementById('increment');
    const decrementBtn = document.getElementById('decrement');

    // Update UI
    function updateUI() {
      countEl.textContent = count;
    }

    // Button handlers
    incrementBtn.addEventListener('click', () => { count++; updateUI(); });
    decrementBtn.addEventListener('click', () => { count--; updateUI(); });

    // Feature detection (like navigator.geolocation)
    if ('modelContext' in navigator) {
      // Register tools with the Web Model Context API
      navigator.modelContext.provideContext({
        tools: [
          {
            name: 'counter_get',
            description: 'Get the current counter value',
            inputSchema: { type: 'object', properties: {} },
            execute: async () => ({
              content: [{ type: 'text', text: String(count) }]
            })
          },
          {
            name: 'counter_set',
            description: 'Set the counter to a specific value',
            inputSchema: {
              type: 'object',
              properties: {
                value: { type: 'number', description: 'The new counter value' }
              },
              required: ['value']
            },
            execute: async ({ value }) => {
              count = value;
              updateUI();
              return {
                content: [{ type: 'text', text: `Counter set to ${count}` }]
              };
            }
          },
          {
            name: 'counter_increment',
            description: 'Increment the counter by a specified amount',
            inputSchema: {
              type: 'object',
              properties: {
                amount: { type: 'number', description: 'Amount to increment by', default: 1 }
              }
            },
            execute: async ({ amount = 1 }) => {
              count += amount;
              updateUI();
              return {
                content: [{ type: 'text', text: `Counter incremented to ${count}` }]
              };
            }
          }
        ]
      });

      console.log('Web Model Context API: Tools registered');
    } else {
      console.warn('Web Model Context API not supported');
    }
  </script>
</body>
</html>
```

### Single Tool Registration Pattern

Like `navigator.permissions.query()`, you can register tools one at a time:

```javascript
if ('modelContext' in navigator) {
  navigator.modelContext.registerTool({
    name: 'get_page_info',
    description: 'Get information about the current page',
    inputSchema: { type: 'object', properties: {} },
    execute: async () => ({
      content: [{
        type: 'text',
        text: JSON.stringify({
          title: document.title,
          url: location.href,
          timestamp: new Date().toISOString()
        }, null, 2)
      }]
    })
  });
}
```

### Event-Driven Pattern

Similar to other DOM events, you can listen for tool calls:

```javascript
if ('modelContext' in navigator) {
  navigator.modelContext.addEventListener('toolcall', (event) => {
    console.log(`Tool "${event.name}" called with:`, event.arguments);

    if (event.name === 'custom_handler') {
      event.preventDefault();
      event.respondWith({
        content: [{ type: 'text', text: 'Custom response' }]
      });
    }
  });
}
```

### Complete Standalone Example

Save this as `index.html` and open in a browser:

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>WebMCP Demo</title>
  <script src="https://unpkg.com/@mcp-b/global@latest/dist/index.iife.js"></script>
  <style>
    body { font-family: system-ui; max-width: 600px; margin: 2rem auto; padding: 0 1rem; }
    .card { border: 1px solid #ddd; border-radius: 8px; padding: 1rem; margin: 1rem 0; }
    button { padding: 0.5rem 1rem; margin: 0.25rem; cursor: pointer; }
    #log { font-family: monospace; font-size: 0.85rem; background: #f5f5f5; padding: 1rem; max-height: 200px; overflow-y: auto; }
  </style>
</head>
<body>
  <h1> WebMCP Demo</h1>

  <div class="card">
    <h2>Notes App</h2>
    <input type="text" id="noteInput" placeholder="Enter a note..." style="width: 100%; padding: 0.5rem; box-sizing: border-box;">
    <button id="addNote">Add Note</button>
    <ul id="notesList"></ul>
  </div>

  <div class="card">
    <h3>Tool Call Log</h3>
    <div id="log">Waiting for AI tool calls...</div>
  </div>

  <script>
    const notes = [];
    const noteInput = document.getElementById('noteInput');
    const addNoteBtn = document.getElementById('addNote');
    const notesList = document.getElementById('notesList');
    const logEl = document.getElementById('log');

    function renderNotes() {
      notesList.innerHTML = notes.map((note, i) =>
        `<li>${note} <button onclick="deleteNote(${i})">x</button></li>`
      ).join('');
    }

    function log(message) {
      const time = new Date().toLocaleTimeString();
      logEl.innerHTML = `[${time}] ${message}\n` + logEl.innerHTML;
    }

    addNoteBtn.addEventListener('click', () => {
      if (noteInput.value.trim()) {
        notes.push(noteInput.value.trim());
        noteInput.value = '';
        renderNotes();
      }
    });

    window.deleteNote = (index) => {
      notes.splice(index, 1);
      renderNotes();
    };

    if ('modelContext' in navigator) {
      navigator.modelContext.provideContext({
        tools: [
          {
            name: 'notes_list',
            description: 'Get all notes',
            inputSchema: { type: 'object', properties: {} },
            execute: async () => {
              log('notes_list called');
              return {
                content: [{
                  type: 'text',
                  text: notes.length ? notes.map((n, i) => `${i + 1}. ${n}`).join('\n') : 'No notes yet'
                }]
              };
            }
          },
          {
            name: 'notes_add',
            description: 'Add a new note',
            inputSchema: {
              type: 'object',
              properties: { text: { type: 'string', description: 'The note text' } },
              required: ['text']
            },
            execute: async ({ text }) => {
              log(`notes_add called: "${text}"`);
              notes.push(text);
              renderNotes();
              return { content: [{ type: 'text', text: `Added note: "${text}"` }] };
            }
          },
          {
            name: 'notes_delete',
            description: 'Delete a note by index (1-based)',
            inputSchema: {
              type: 'object',
              properties: { index: { type: 'number', description: 'Note index (1-based)' } },
              required: ['index']
            },
            execute: async ({ index }) => {
              log(`notes_delete called: index ${index}`);
              if (index < 1 || index > notes.length) {
                return { content: [{ type: 'text', text: 'Invalid index' }], isError: true };
              }
              const deleted = notes.splice(index - 1, 1)[0];
              renderNotes();
              return { content: [{ type: 'text', text: `Deleted: "${deleted}"` }] };
            }
          },
          {
            name: 'notes_clear',
            description: 'Delete all notes',
            inputSchema: { type: 'object', properties: {} },
            execute: async () => {
              log('notes_clear called');
              const count = notes.length;
              notes.length = 0;
              renderNotes();
              return { content: [{ type: 'text', text: `Cleared ${count} notes` }] };
            }
          }
        ]
      });

      log('Web Model Context API initialized');
    }
  </script>
</body>
</html>
```

## Configuration

The polyfill exposes `initializeWebModelContext(options?)` to control transport behavior. When you import `@mcp-b/global` as a module it auto-initializes by default.

- **Disable auto init**: Set `window.__webModelContextOptions = { autoInitialize: false }` before importing, then call `initializeWebModelContext()` manually.
- **Configure via script tag**:
  ```html
  <script
    src="https://unpkg.com/@mcp-b/global@latest/dist/index.iife.js"
    data-webmcp-auto-initialize="false"
    data-webmcp-allowed-origins="https://example.com,https://docs.example.com"
  ></script>
  ```
  Use `data-webmcp-options='{"transport":{"tabServer":{"allowedOrigins":["https://example.com"]}}}'` for advanced JSON configuration.
- **Supported data attributes**:
  - `data-webmcp-auto-initialize="false"` - Skip automatic setup
  - `data-webmcp-allowed-origins="https://a.com,https://b.com"` - Override `tabServer.allowedOrigins`
  - `data-webmcp-channel-id="custom-channel"` - Set the Tab transport channel

### Safe Multi-Injection Behavior

`initializeWebModelContext()` is run-once and safe to call multiple times on the same page.

| Page state before inject | Result |
| --- | --- |
| `@mcp-b/global` already initialized | No-op (first init wins) |
| Native WebMCP available | Native adapter mode (single bridge instance) |
| `@mcp-b/webmcp-polyfill` already installed | Attach-only bridge mode |
| Custom existing `navigator.modelContext` | Attach-only bridge mode |

### Dual-Server Mode (Tab + Iframe)

By default, the global package runs two MCP servers that share the same tool registry:

1. **Tab Server** (`TabServerTransport`) - For same-window communication
2. **Iframe Server** (`IframeChildTransport`) - Auto-enabled when running in an iframe

```ts
// Customize iframe server
initializeWebModelContext({
  transport: {
    iframeServer: {
      allowedOrigins: ['https://parent-app.com'],
      channelId: 'custom-iframe-channel',
    },
  },
});

// Disable iframe server (only Tab server runs)
initializeWebModelContext({
  transport: { iframeServer: false },
});

// Custom transport factory
initializeWebModelContext({
  transport: { create: () => new CustomTransport() },
});
```

## Native Chromium API Support

This package automatically detects and integrates with Chromium's native Web Model Context API when available. No configuration is required.

### Automatic Detection

When `initializeWebModelContext()` runs:

1. **Native API detected** (both `navigator.modelContext` and `navigator.modelContextTesting` present): Uses native implementation, creates MCP bridge, syncs tools automatically.
2. **No native API detected**: Installs full polyfill with identical API surface.

### Native API Features

- **Automatic tool synchronization** via `registerToolsChangedCallback()`
- **Iframe tool collection** - Native API automatically collects tools from embedded iframes
- **MCP compatibility** - MCP clients continue to work seamlessly
- **Tool change notifications** - MCP servers receive `tools/list_changed` automatically

### How Tool Synchronization Works

`@mcp-b/global` pins an internal synchronization callback through `modelContextTesting.registerToolsChangedCallback()`. This callback fires when:
- `registerTool()`, `unregisterTool()`, `provideContext()`, or `clearContext()` is called
- Tools are added from embedded iframes (native feature)

### Enabling Native API in Chromium

```bash
# Chrome 146+ early preview:
# 1) Open chrome://flags/#enable-webmcp-testing
# 2) Enable "WebMCP for testing"
# 3) Restart Chrome
```

### Iframe Tool Collection (Native Only)

When the native API is active, tools from embedded iframes are automatically collected:

```html
<!-- parent.html -->
<script type="module">
  import '@mcp-b/global';
  navigator.modelContext.registerTool({
    name: 'parent-tool',
    description: 'Tool from parent page',
    inputSchema: { type: 'object', properties: {} },
    async execute() {
      return { content: [{ type: 'text', text: 'Parent tool' }] };
    }
  });
</script>
<iframe src="child.html"></iframe>
```

```html
<!-- child.html -->
<script type="module">
  import '@mcp-b/global';
  navigator.modelContext.registerTool({
    name: 'child-tool',
    description: 'Tool from iframe',
    inputSchema: { type: 'object', properties: {} },
    async execute() {
      return { content: [{ type: 'text', text: 'Child tool' }] };
    }
  });
</script>
```

With native API, `navigator.modelContextTesting.listTools()` in the parent will show both tools.

## API Reference

### Core Methods

- `provideContext(options?)` - Register context and replace current tool set
- `registerTool(tool)` - Register a single tool (name must be unique)
- `unregisterTool(name)` - Remove a registered tool
- `clearContext()` - Clear all registered context

MCPB also exposes non-standard extension methods (`callTool`, resources/prompts APIs, extra events) for bridge ergonomics. These are not part of strict WebMCP core semantics.

### `provideContext(options?)`

Registers context and replaces the currently registered tool set.

```javascript
window.navigator.modelContext.provideContext({
  tools: [
    {
      name: "add-todo",
      description: "Add a new todo item to the list",
      inputSchema: {
        type: "object",
        properties: {
          text: { type: "string", description: "The todo item text" },
          priority: { type: "string", enum: ["low", "medium", "high"] }
        },
        required: ["text"]
      },
      async execute({ text, priority = "medium" }) {
        const todo = addTodoItem(text, priority);
        return {
          content: [{ type: "text", text: `Added todo: "${text}" with ${priority} priority` }]
        };
      }
    }
  ]
});
```

### `registerTool(tool)`

Registers a single tool. Names must be unique at registration time.

```javascript
window.navigator.modelContext.registerTool({
  name: "get-timestamp",
  description: "Get the current timestamp",
  inputSchema: { type: "object", properties: {} },
  async execute() {
    return { content: [{ type: "text", text: new Date().toISOString() }] };
  }
});
window.navigator.modelContext.unregisterTool("get-timestamp");
```

### Tool Descriptor

| Property | Type | Description |
|----------|------|-------------|
| `name` | `string` | Unique identifier for the tool |
| `description` | `string` | Natural language description of what the tool does |
| `inputSchema` | `object` | Optional JSON Schema defining input parameters |
| `outputSchema` | `object` | Optional JSON Schema defining structured output |
| `annotations` | `object` | Optional hints about tool behavior |
| `execute` | `function` | Async function that implements the tool logic |

### Tool Response Format

```typescript
{
  content: [{ type: "text", text: "Result..." }],
  isError?: boolean
}
```

### Name Collision Protection

```javascript
window.navigator.modelContext.provideContext({
  tools: [{ name: "my-tool", description: "Base", inputSchema: {}, async execute() {} }]
});

// This will throw an error (name already registered)
try {
  window.navigator.modelContext.registerTool({
    name: "my-tool", description: "Dynamic", inputSchema: {}, async execute() {}
  });
} catch (error) {
  console.error(error.message);
}
```

## Output Schemas

Output schemas enable type-safe structured responses from tools. Many AI providers compile tool definitions into TypeScript, enabling type-safe response generation.

### Basic Output Schema

```javascript
window.navigator.modelContext.provideContext({
  tools: [{
    name: "get-user-profile",
    description: "Fetch a user's profile information",
    inputSchema: {
      type: "object",
      properties: { userId: { type: "string" } },
      required: ["userId"]
    },
    outputSchema: {
      type: "object",
      properties: {
        id: { type: "string" },
        name: { type: "string" },
        email: { type: "string" },
        createdAt: { type: "string" }
      },
      required: ["id", "name", "email"]
    },
    async execute({ userId }) {
      const user = await fetchUser(userId);
      return {
        content: [{ type: "text", text: `Found user: ${user.name}` }],
        structuredContent: { id: user.id, name: user.name, email: user.email, createdAt: user.createdAt.toISOString() }
      };
    }
  }]
});
```

### Using Zod for Type-Safe Schemas

Zod schemas are automatically converted to JSON Schema:

```typescript
import { z } from 'zod';

window.navigator.modelContext.provideContext({
  tools: [{
    name: "search-products",
    description: "Search the product catalog",
    inputSchema: {
      query: z.string().describe("Search query"),
      limit: z.number().min(1).max(100).default(10),
      category: z.enum(["electronics", "clothing", "books"]).optional()
    },
    outputSchema: {
      products: z.array(z.object({ id: z.string(), name: z.string(), price: z.number(), inStock: z.boolean() })),
      total: z.number(),
      hasMore: z.boolean()
    },
    async execute({ query, limit, category }) {
      const results = await searchProducts({ query, limit, category });
      return {
        content: [{ type: "text", text: `Found ${results.total} products` }],
        structuredContent: { products: results.items, total: results.total, hasMore: results.total > limit }
      };
    }
  }]
});
```

## Dynamic Tool Registration

### React Component Example

```javascript
import { useEffect } from 'react';

function MyComponent() {
  useEffect(() => {
    window.navigator.modelContext.registerTool({
      name: "component-action",
      description: "Action specific to this component",
      inputSchema: { type: "object", properties: {} },
      async execute() {
        return { content: [{ type: "text", text: "Component action executed!" }] };
      }
    });

    return () => {
      window.navigator.modelContext.unregisterTool("component-action");
    };
  }, []);

  return <div>My Component</div>;
}
```

### `provideContext()` Replacement Behavior

```javascript
window.navigator.modelContext.registerTool({
  name: "dynamic-tool", description: "Dynamic tool",
  async execute() { return { content: [{ type: "text", text: "Dynamic!" }] }; }
});

window.navigator.modelContext.provideContext({
  tools: [{ name: "base-tool-2", description: "New base tool", async execute() {} }]
});

// Result: only the tools in provideContext() remain registered
```

## Event-Based Tool Calls

For manifest-based or advanced scenarios, handle tool calls as events:

```javascript
window.navigator.modelContext.addEventListener('toolcall', async (event) => {
  console.log(`Tool called: ${event.name}`, event.arguments);

  if (event.name === "custom-tool") {
    event.preventDefault();
    event.respondWith({
      content: [{ type: "text", text: "Custom response from event handler" }]
    });
  }
});
```

### Hybrid Approach

1. **Event dispatched first** - `toolcall` event is fired
2. **Event can override** - Call `event.preventDefault()` and `event.respondWith()`
3. **Default execution** - If not prevented, the tool's `execute()` function runs

## Testing API (`navigator.modelContextTesting`)

> **Note:** `navigator.modelContextTesting` is deprecated and kept for compatibility. For in-page consumers, use `navigator.modelContext.callTool({ name, arguments })` and `navigator.modelContext.addEventListener("toolschanged", ...)`.

### Unified Consumer API (Recommended)

```javascript
const result = await navigator.modelContext.callTool({
  name: "greet",
  arguments: { name: "Alice" }
});

navigator.modelContext.addEventListener("toolschanged", () => {
  console.log("Tools changed:", navigator.modelContext.listTools());
});
```

### Testing Helpers Module

```javascript
import { createTestHelper } from "@mcp-b/global/testing";

const testing = createTestHelper();
await testing.executeTool("greet", { name: "Alice" });
```

### Chromium Core Testing API

`navigator.modelContextTesting` exposes:

- `executeTool(toolName, inputArgsJson, options?) => Promise<string | null>`
- `listTools() => Array<{ name, description, inputSchema?: string }>`
- `registerToolsChangedCallback(callback) => void`

### Polyfill-Only Extensions

These methods are provided by the polyfill runtime. Native Chromium testing APIs may not implement them:

- `getToolCalls()` - Get history of all tool calls
- `clearToolCalls()` - Clear tool call history
- `setMockToolResponse(toolName, response)` - Bypass `execute()` with a mock response
- `clearMockToolResponse(toolName)` - Remove mock for a specific tool
- `clearAllMockToolResponses()` - Remove all mocks
- `getRegisteredTools()` - List all registered tools
- `reset()` - Clear all tool call history and mock responses

### Testing Workflow Example

```javascript
// 1. Register tools
window.navigator.modelContext.provideContext({
  tools: [{
    name: "add-todo",
    description: "Add a todo item",
    inputSchema: { type: "object", properties: { text: { type: "string" } }, required: ["text"] },
    async execute({ text }) {
      return { content: [{ type: "text", text: `Added: ${text}` }] };
    }
  }]
});

// 2. Set up mocks
window.navigator.modelContextTesting.setMockToolResponse("add-todo", {
  content: [{ type: "text", text: "Mock: Todo added successfully" }]
});

// 3. Inspect tool call history
const calls = window.navigator.modelContextTesting.getToolCalls();
console.log(`${calls.length} tool calls made`);

// 4. Clean up
window.navigator.modelContextTesting.reset();
```

## Complete Examples

### Todo List Application

```javascript
let todos = [];

window.navigator.modelContext.provideContext({
  tools: [
    {
      name: "add-todo",
      description: "Add a new todo item",
      inputSchema: {
        type: "object",
        properties: { text: { type: "string", description: "Todo text" } },
        required: ["text"]
      },
      async execute({ text }) {
        const todo = { id: Date.now(), text, done: false };
        todos.push(todo);
        return { content: [{ type: "text", text: `Added: "${text}"` }] };
      }
    },
    {
      name: "list-todos",
      description: "Get all todo items",
      inputSchema: { type: "object", properties: {} },
      async execute() {
        const list = todos.map(t => `${t.done ? 'x' : 'o'} ${t.text}`).join('\n');
        return { content: [{ type: "text", text: list || "No todos" }] };
      }
    },
    {
      name: "complete-todo",
      description: "Mark a todo as complete",
      inputSchema: {
        type: "object",
        properties: { id: { type: "number", description: "Todo ID" } },
        required: ["id"]
      },
      async execute({ id }) {
        const todo = todos.find(t => t.id === id);
        if (!todo) return { content: [{ type: "text", text: "Todo not found" }], isError: true };
        todo.done = true;
        return { content: [{ type: "text", text: `Completed: "${todo.text}"` }] };
      }
    }
  ]
});
```

### E-commerce Product Search

```javascript
window.navigator.modelContext.provideContext({
  tools: [
    {
      name: "search-products",
      description: "Search for products in the catalog",
      inputSchema: {
        type: "object",
        properties: {
          query: { type: "string", description: "Search query" },
          category: { type: "string", enum: ["electronics", "clothing", "books", "all"] },
          maxPrice: { type: "number", description: "Maximum price filter" }
        },
        required: ["query"]
      },
      async execute({ query, category = "all", maxPrice }) {
        const results = await searchProducts({ query, category: category !== "all" ? category : undefined, maxPrice });
        const summary = results.map(p => `${p.name} - $${p.price} (${p.category})`).join('\n');
        return { content: [{ type: "text", text: `Found ${results.length} products:\n${summary}` }] };
      }
    },
    {
      name: "add-to-cart",
      description: "Add a product to the shopping cart",
      inputSchema: {
        type: "object",
        properties: { productId: { type: "string" }, quantity: { type: "number", default: 1 } },
        required: ["productId"]
      },
      async execute({ productId, quantity = 1 }) {
        await addToCart(productId, quantity);
        return { content: [{ type: "text", text: `Added ${quantity}x product ${productId} to cart` }] };
      }
    }
  ]
});
```

## Security Considerations

### Origin Restrictions

By default, the MCP transport allows connections from any origin (`*`). Use `allowedOrigins` configuration to restrict access.

### Tool Validation

Always validate inputs in your tool implementations:

```javascript
{
  name: "delete-item",
  description: "Delete an item",
  inputSchema: {
    type: "object",
    properties: { id: { type: "string", pattern: "^[a-zA-Z0-9]+$" } },
    required: ["id"]
  },
  async execute({ id }) {
    if (!isValidId(id)) {
      return { content: [{ type: "text", text: "Invalid ID" }], isError: true };
    }
    await deleteItem(id);
    return { content: [{ type: "text", text: "Item deleted" }] };
  }
}
```

## Debugging

### Enable Debug Logging

```javascript
// Enable all debug logging
localStorage.setItem('WEBMCP_DEBUG', '*');

// Enable specific namespaces
localStorage.setItem('WEBMCP_DEBUG', 'WebModelContext');
localStorage.setItem('WEBMCP_DEBUG', 'NativeAdapter,MCPBridge');

// Refresh the page to apply
location.reload();
```

Available namespaces: `WebModelContext`, `NativeAdapter`, `MCPBridge`, `ModelContextTesting`

### Access Internal Bridge

```javascript
if (window.__mcpBridge) {
  console.log("MCP Server:", window.__mcpBridge.server);
  console.log("Registered tools:", window.__mcpBridge.tools);
}
```
