# @mcp-b/global

> Web Model Context API polyfill - Implement `window.agent` for AI-powered web applications

[![npm version](https://img.shields.io/npm/v/@mcp-b/global?style=flat-square)](https://www.npmjs.com/package/@mcp-b/global)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](https://opensource.org/licenses/MIT)

This package implements the [Web Model Context API](https://github.com/webmachinelearning/webmcp) (`window.agent`) specification, bridging it to the Model Context Protocol (MCP) SDK. It allows web developers to expose JavaScript functions as "tools" that AI agents can discover and invoke.

## 🚀 Quick Start

### Via Script Tag (Recommended)

Add the script to your HTML `<head>`:

```html
<!DOCTYPE html>
<html>
<head>
  <script src="https://unpkg.com/@mcp-b/global@latest/dist/index.js"></script>
</head>
<body>
  <h1>My AI-Powered App</h1>

  <script>
    // Register tools with AI agents
    window.agent.provideContext({
      tools: [
        {
          name: "get-page-title",
          description: "Get the current page title",
          inputSchema: {
            type: "object",
            properties: {}
          },
          async execute() {
            return {
              content: [{
                type: "text",
                text: document.title
              }]
            };
          }
        }
      ]
    });
  </script>
</body>
</html>
```

### Via NPM

```bash
npm install @mcp-b/global
```

```javascript
import '@mcp-b/global';

// window.agent is now available
window.agent.provideContext({
  tools: [/* your tools */]
});
```

## 📖 API Reference

### `window.agent.provideContext(context)`

Register tools that AI agents can invoke.

**Parameters:**
- `context.tools` - Array of tool descriptors

**Example:**

```javascript
window.agent.provideContext({
  tools: [
    {
      name: "add-todo",
      description: "Add a new todo item to the list",
      inputSchema: {
        type: "object",
        properties: {
          text: {
            type: "string",
            description: "The todo item text"
          },
          priority: {
            type: "string",
            enum: ["low", "medium", "high"],
            description: "Priority level"
          }
        },
        required: ["text"]
      },
      async execute({ text, priority = "medium" }) {
        // Add todo to your app
        const todo = addTodoItem(text, priority);

        return {
          content: [{
            type: "text",
            text: `Added todo: "${text}" with ${priority} priority`
          }]
        };
      }
    }
  ]
});
```

### Tool Descriptor

Each tool must have:

| Property | Type | Description |
|----------|------|-------------|
| `name` | `string` | Unique identifier for the tool |
| `description` | `string` | Natural language description of what the tool does |
| `inputSchema` | `object` | JSON Schema defining input parameters |
| `execute` | `function` | Async function that implements the tool logic |

### Tool Response Format

Tools must return an object with:

```typescript
{
  content: [
    {
      type: "text",      // or "image", "resource"
      text: "Result..."  // the response content
    }
  ],
  isError?: boolean     // optional error flag
}
```

## 🎯 Complete Examples

### Todo List Application

```javascript
let todos = [];

window.agent.provideContext({
  tools: [
    {
      name: "add-todo",
      description: "Add a new todo item",
      inputSchema: {
        type: "object",
        properties: {
          text: { type: "string", description: "Todo text" }
        },
        required: ["text"]
      },
      async execute({ text }) {
        const todo = { id: Date.now(), text, done: false };
        todos.push(todo);
        updateUI();
        return {
          content: [{ type: "text", text: `Added: "${text}"` }]
        };
      }
    },
    {
      name: "list-todos",
      description: "Get all todo items",
      inputSchema: { type: "object", properties: {} },
      async execute() {
        const list = todos.map(t =>
          `${t.done ? '✓' : '○'} ${t.text}`
        ).join('\n');
        return {
          content: [{ type: "text", text: list || "No todos" }]
        };
      }
    },
    {
      name: "complete-todo",
      description: "Mark a todo as complete",
      inputSchema: {
        type: "object",
        properties: {
          id: { type: "number", description: "Todo ID" }
        },
        required: ["id"]
      },
      async execute({ id }) {
        const todo = todos.find(t => t.id === id);
        if (!todo) {
          return {
            content: [{ type: "text", text: "Todo not found" }],
            isError: true
          };
        }
        todo.done = true;
        updateUI();
        return {
          content: [{ type: "text", text: `Completed: "${todo.text}"` }]
        };
      }
    }
  ]
});

function updateUI() {
  // Update your UI
  document.getElementById('todo-list').innerHTML =
    todos.map(t => `<li>${t.done ? '✓' : ''} ${t.text}</li>`).join('');
}
```

### E-commerce Product Search

```javascript
window.agent.provideContext({
  tools: [
    {
      name: "search-products",
      description: "Search for products in the catalog",
      inputSchema: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "Search query"
          },
          category: {
            type: "string",
            description: "Filter by category",
            enum: ["electronics", "clothing", "books", "all"]
          },
          maxPrice: {
            type: "number",
            description: "Maximum price filter"
          }
        },
        required: ["query"]
      },
      async execute({ query, category = "all", maxPrice }) {
        const results = await searchProducts({
          query,
          category: category !== "all" ? category : undefined,
          maxPrice
        });

        const summary = results.map(p =>
          `${p.name} - $${p.price} (${p.category})`
        ).join('\n');

        return {
          content: [{
            type: "text",
            text: `Found ${results.length} products:\n${summary}`
          }]
        };
      }
    },
    {
      name: "add-to-cart",
      description: "Add a product to the shopping cart",
      inputSchema: {
        type: "object",
        properties: {
          productId: { type: "string" },
          quantity: { type: "number", default: 1 }
        },
        required: ["productId"]
      },
      async execute({ productId, quantity = 1 }) {
        await addToCart(productId, quantity);
        return {
          content: [{
            type: "text",
            text: `Added ${quantity}x product ${productId} to cart`
          }]
        };
      }
    }
  ]
});
```

## 🔧 Event-Based Tool Calls (Advanced)

For manifest-based or advanced scenarios, you can handle tool calls as events:

```javascript
window.agent.addEventListener('toolcall', async (event) => {
  console.log(`Tool called: ${event.name}`, event.arguments);

  if (event.name === "custom-tool") {
    // Prevent default execution
    event.preventDefault();

    // Provide custom response
    event.respondWith({
      content: [{
        type: "text",
        text: "Custom response from event handler"
      }]
    });
  }

  // If not prevented, the tool's execute function will run normally
});
```

### Hybrid Approach

The API supports both approaches simultaneously:

1. **Event dispatched first** - `toolcall` event is fired
2. **Event can override** - Call `event.preventDefault()` and `event.respondWith()`
3. **Default execution** - If not prevented, the tool's `execute()` function runs

This allows flexibility for different use cases.

## 🏗️ Architecture

```
┌─────────────────┐
│   AI Agent      │
│  (MCP Client)   │
└────────┬────────┘
         │ MCP Protocol
         │ (JSON-RPC)
┌────────▼────────┐
│   MCP Server    │
│   (Internal)    │
└────────┬────────┘
         │
┌────────▼────────┐
│ window.agent    │ ◄── Your app registers tools here
│   (This pkg)    │
└─────────────────┘
```

This package:
1. Exposes `window.agent` API (Web Model Context standard)
2. Internally creates an MCP Server
3. Bridges tool calls between the two protocols
4. Uses TabServerTransport for browser communication

## 🔍 Feature Detection

Check if the API is available:

```javascript
if ("agent" in window) {
  // API is available
  window.agent.provideContext({ tools: [...] });
} else {
  console.warn("Web Model Context API not available");
}
```

## 🐛 Debugging

In development mode, access the internal bridge:

```javascript
if (window.__mcpBridge) {
  console.log("MCP Server:", window.__mcpBridge.server);
  console.log("Registered tools:", window.__mcpBridge.tools);
}
```

## 📦 What's Included

- **Web Model Context API** - Standard `window.agent` interface
- **MCP Bridge** - Automatic bridging to Model Context Protocol
- **Tab Transport** - Communication layer for browser contexts
- **Event System** - Hybrid tool call handling
- **TypeScript Types** - Full type definitions included

## 🔒 Security Considerations

### Origin Restrictions

By default, the MCP transport allows connections from any origin (`*`). For production, you should configure allowed origins:

```javascript
// Future configuration API
window.agent.configure({
  allowedOrigins: [
    'https://your-app.com',
    'https://trusted-agent.com'
  ]
});
```

### Tool Validation

Always validate inputs in your tool implementations:

```javascript
{
  name: "delete-item",
  description: "Delete an item",
  inputSchema: {
    type: "object",
    properties: {
      id: { type: "string", pattern: "^[a-zA-Z0-9]+$" }
    },
    required: ["id"]
  },
  async execute({ id }) {
    // Additional validation
    if (!isValidId(id)) {
      return {
        content: [{ type: "text", text: "Invalid ID" }],
        isError: true
      };
    }

    // Proceed with deletion
    await deleteItem(id);
    return {
      content: [{ type: "text", text: "Item deleted" }]
    };
  }
}
```

## 🤝 Related Packages

- [`@mcp-b/transports`](../transports) - MCP transport implementations
- [`@mcp-b/mcp-react-hooks`](../mcp-react-hooks) - React hooks for MCP
- [`@modelcontextprotocol/sdk`](https://www.npmjs.com/package/@modelcontextprotocol/sdk) - Official MCP SDK

## 📚 Resources

- [Web Model Context API Explainer](https://github.com/webmachinelearning/webmcp)
- [Model Context Protocol Spec](https://modelcontextprotocol.io/)
- [Microsoft Edge Explainer](https://github.com/MicrosoftEdge/MSEdgeExplainers/blob/main/WebModelContext/explainer.md)

## 📝 License

MIT - see [LICENSE](../../LICENSE) for details

## 🙋 Support

- [GitHub Issues](https://github.com/WebMCP-org/npm-packages/issues)
- [Documentation](https://docs.mcp-b.ai)
- [Discord Community](https://discord.gg/a9fBR6Bw)
