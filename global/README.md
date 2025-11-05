# @mcp-b/global

> Web Model Context API polyfill - Implement `window.navigator.modelContext` for AI-powered web applications

[![npm version](https://img.shields.io/npm/v/@mcp-b/global?style=flat-square)](https://www.npmjs.com/package/@mcp-b/global)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](https://opensource.org/licenses/MIT)

This package implements the [W3C Web Model Context API](https://github.com/webmachinelearning/webmcp) (`window.navigator.modelContext`) specification, bridging it to the Model Context Protocol (MCP) SDK. It allows web developers to expose JavaScript functions as "tools" that AI agents can discover and invoke.

## 🚀 Quick Start

### Via IIFE Script Tag (Easiest - No Build Required)

The **IIFE (Immediately Invoked Function Expression)** version bundles everything into a single file and auto-initializes when loaded. Perfect for simple HTML pages or prototyping.

Add the script to your HTML `<head>`:

```html
<!DOCTYPE html>
<html>
<head>
  <!-- IIFE version - bundles all dependencies, auto-initializes -->
  <script src="https://unpkg.com/@mcp-b/global@latest/dist/index.iife.js"></script>
</head>
<body>
  <h1>My AI-Powered App</h1>

  <script>
    // window.navigator.modelContext is already available!
    // Register tools with AI agents
    window.navigator.modelContext.provideContext({
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

**What you get:**
- ✅ **Self-contained** - All dependencies bundled (285KB minified)
- ✅ **Auto-initializes** - `window.navigator.modelContext` ready immediately
- ✅ **No build step** - Just drop it in your HTML
- ✅ **Works everywhere** - Compatible with all modern browsers
- ✅ **Global access** - Also exposes `window.WebMCP` for advanced usage

### Via ES Module Script Tag

If you prefer ES modules and have a build system, use the ESM version:

```html
<!DOCTYPE html>
<html>
<head>
  <!-- ESM version - smaller but requires module support -->
  <script type="module">
    import '@mcp-b/global';

    // window.navigator.modelContext is now available
    window.navigator.modelContext.provideContext({
      tools: [/* your tools */]
    });
  </script>
</head>
<body>
  <h1>My AI-Powered App</h1>
</body>
</html>
```

**Note:** The ESM version is smaller (~16KB) but doesn't bundle dependencies - it expects them to be available via your module system or CDN.

### Via NPM

For applications using a bundler (Vite, Webpack, etc.):

```bash
npm install @mcp-b/global
```

```javascript
import '@mcp-b/global';

// window.navigator.modelContext is now available
window.navigator.modelContext.provideContext({
  tools: [/* your tools */]
});
```

## ⚙️ Configuration

The polyfill exposes `initializeWebModelContext(options?: WebModelContextInitOptions)` to let you control transport behaviour. When you import `@mcp-b/global` as a module it auto-initializes by default, but you can customise or defer initialization:

- **Disable auto init**: Set `window.__webModelContextOptions = { autoInitialize: false }` before importing, then call `initializeWebModelContext()` manually.
- **Configure via script tag**: When using the IIFE build, pass options through data attributes:
  ```html
  <script
    src="https://unpkg.com/@mcp-b/global@latest/dist/index.iife.js"
    data-webmcp-auto-initialize="false"
    data-webmcp-allowed-origins="https://example.com,https://docs.example.com"
  ></script>
  <!-- Later in the page -->
  <script>
    window.navigator.modelContext.provideContext({ tools: [] });
  </script>
  ```
  Use `data-webmcp-options='{"transport":{"tabServer":{"allowedOrigins":["https://example.com"]}}}'` for advanced JSON configuration.
- **Supported data attributes**
  - `data-webmcp-auto-initialize="false"`: Skip automatic setup.
  - `data-webmcp-allowed-origins="https://a.com,https://b.com"`: Override `tabServer.allowedOrigins`.
  - `data-webmcp-channel-id="custom-channel"`: Set the Tab transport channel.

### Dual-Server Mode (Tab + Iframe)

By default, the global package runs **two MCP servers** that share the same tool registry:

1. **Tab Server** (`TabServerTransport`) - For same-window communication
2. **Iframe Server** (`IframeChildTransport`) - Auto-enabled when running in an iframe (when `window.parent !== window`)

Both servers expose the same tools (Bucket A + Bucket B), allowing your tools to be accessed from:
- Same-window clients (e.g., browser extension content scripts)
- Parent page (when running in an iframe)

**Example: Running in an Iframe**

When your app runs in an iframe, both servers are automatically enabled:

```ts
// In iframe: Auto-initializes with both servers
import '@mcp-b/global';

// Register tools - they're automatically available to:
// 1. Same-window clients (via TabServerTransport)
// 2. Parent page (via IframeChildTransport)
window.navigator.modelContext.provideContext({
  tools: [
    {
      name: "iframe-action",
      description: "Action from iframe",
      inputSchema: { type: "object", properties: {} },
      async execute() {
        return {
          content: [{ type: "text", text: "Hello from iframe!" }]
        };
      }
    }
  ]
});
```

**Configure Iframe Server**

You can customize or disable the iframe server:

```ts
import { initializeWebModelContext } from '@mcp-b/global';

// Customize iframe server
initializeWebModelContext({
  transport: {
    iframeServer: {
      allowedOrigins: ['https://parent-app.com'], // Only allow specific parent
      channelId: 'custom-iframe-channel',
    },
  },
});

// Disable iframe server (only Tab server runs)
initializeWebModelContext({
  transport: {
    iframeServer: false, // Disable iframe server
  },
});

// Disable tab server (only Iframe server runs)
initializeWebModelContext({
  transport: {
    tabServer: false, // Disable tab server
    iframeServer: {
      allowedOrigins: ['https://parent-app.com'],
    },
  },
});
```

**Custom Transport Factory**

Provide `transport.create` to supply any MCP `Transport` implementation instead of the built-in dual-server mode:

```ts
import { initializeWebModelContext } from '@mcp-b/global';
import { CustomTransport } from './my-transport';

initializeWebModelContext({
  transport: {
    create: () => new CustomTransport(),
  },
});
```

## 📖 API Reference

### Two-Bucket Tool Management System

This package uses a **two-bucket system** for tool management to support both app-level and component-level tools:

- **Bucket A (Base Tools)**: Registered via `provideContext()` - represents your app's core functionality
- **Bucket B (Dynamic Tools)**: Registered via `registerTool()` - component-scoped tools that persist across `provideContext()` calls

**Key behaviors:**
- ✅ `provideContext()` only clears Bucket A, leaving Bucket B intact
- ✅ `registerTool()` adds to Bucket B and persists across `provideContext()` calls
- ✅ Tool name collisions between buckets throw an error
- ✅ Cannot `unregister()` a tool that was registered via `provideContext()`

**Use case:** React components can use `registerTool()` in `useEffect()` to manage tool lifecycle independently of the app's base tools.

### `window.navigator.modelContext.provideContext(context)`

Register base/app-level tools (Bucket A). **This clears Bucket A only** and replaces with the provided array. Dynamic tools (Bucket B) registered via `registerTool()` are NOT affected.

**Parameters:**
- `context.tools` - Array of tool descriptors

**Example:**

```javascript
window.navigator.modelContext.provideContext({
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

### `window.navigator.modelContext.registerTool(tool)`

Register a single tool dynamically (Bucket B). Tools registered this way:
- ✅ Persist across `provideContext()` calls
- ✅ Perfect for component lifecycle management
- ✅ Can be unregistered via the returned `unregister()` function
- ❌ Cannot have the same name as a tool in Bucket A (provideContext)

**Parameters:**
- `tool` - A single tool descriptor

**Returns:**
- Object with `unregister()` function to remove the tool

**Example:**

```javascript
// Register a tool dynamically (Bucket B)
const registration = window.navigator.modelContext.registerTool({
  name: "get-timestamp",
  description: "Get the current timestamp",
  inputSchema: {
    type: "object",
    properties: {}
  },
  async execute() {
    return {
      content: [{
        type: "text",
        text: new Date().toISOString()
      }]
    };
  }
});

// Later, unregister the tool
registration.unregister();

// Note: You can call provideContext() and this tool will still be registered!
window.navigator.modelContext.provideContext({
  tools: [/* other tools */]
});
// "get-timestamp" is still available because it's in Bucket B
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

window.navigator.modelContext.provideContext({
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
window.navigator.modelContext.provideContext({
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

## 🔧 Dynamic Tool Registration (Component Lifecycle)

### React Component Example

Perfect for managing tools tied to component lifecycle:

```javascript
import { useEffect } from 'react';

function MyComponent() {
  useEffect(() => {
    // Register component-specific tool when component mounts (Bucket B)
    const registration = window.navigator.modelContext.registerTool({
      name: "component-action",
      description: "Action specific to this component",
      inputSchema: { type: "object", properties: {} },
      async execute() {
        // Access component state/methods here
        return {
          content: [{ type: "text", text: "Component action executed!" }]
        };
      }
    });

    // Cleanup: unregister when component unmounts
    return () => {
      registration.unregister();
    };
  }, []);

  return <div>My Component</div>;
}
```

### Persistence Across provideContext() Calls

```javascript
// Step 1: Register base tools (Bucket A)
window.navigator.modelContext.provideContext({
  tools: [
    { name: "base-tool-1", description: "Base tool", inputSchema: {}, async execute() {} }
  ]
});
// Tools: ["base-tool-1"]

// Step 2: Register dynamic tool (Bucket B)
const reg = window.navigator.modelContext.registerTool({
  name: "dynamic-tool",
  description: "Dynamic tool",
  inputSchema: { type: "object", properties: {} },
  async execute() {
    return { content: [{ type: "text", text: "Dynamic!" }] };
  }
});
// Tools: ["base-tool-1", "dynamic-tool"]

// Step 3: Update base tools via provideContext
window.navigator.modelContext.provideContext({
  tools: [
    { name: "base-tool-2", description: "New base tool", inputSchema: {}, async execute() {} }
  ]
});
// Tools: ["base-tool-2", "dynamic-tool"]
// ✅ "dynamic-tool" persists! Only "base-tool-1" was cleared

// Step 4: Clean up dynamic tool
reg.unregister();
// Tools: ["base-tool-2"]
```

### Name Collision Protection

```javascript
// Register a base tool
window.navigator.modelContext.provideContext({
  tools: [
    { name: "my-tool", description: "Base", inputSchema: {}, async execute() {} }
  ]
});

// This will throw an error!
try {
  window.navigator.modelContext.registerTool({
    name: "my-tool", // ❌ Name collision with Bucket A
    description: "Dynamic",
    inputSchema: {},
    async execute() {}
  });
} catch (error) {
  console.error(error.message);
  // Error: Tool name collision: "my-tool" is already registered via provideContext()
}

// Similarly, can't unregister a base tool
const baseToolList = window.navigator.modelContext.provideContext({
  tools: [{ name: "base", description: "Base", inputSchema: {}, async execute() {} }]
});

// This will also throw an error!
try {
  // Assuming we got a reference somehow
  // registration.unregister(); would fail for a base tool
} catch (error) {
  // Error: Cannot unregister tool "base": This tool was registered via provideContext()
}
```

## 🔧 Event-Based Tool Calls (Advanced)

For manifest-based or advanced scenarios, you can handle tool calls as events:

```javascript
window.navigator.modelContext.addEventListener('toolcall', async (event) => {
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
┌────────▼───────────────────┐
│ navigator.modelContext     │ ◄── Your app registers tools here
│        (This pkg)          │
└────────────────────────────┘
```

This package:
1. Exposes `window.navigator.modelContext` API (W3C Web Model Context standard)
2. Internally creates an MCP Server
3. Bridges tool calls between the two protocols
4. Uses TabServerTransport for browser communication

## 🔍 Feature Detection

Check if the API is available:

```javascript
if ("modelContext" in navigator) {
  // API is available
  navigator.modelContext.provideContext({ tools: [...] });
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

## 🧪 Testing API (`navigator.modelContextTesting`)

This package provides a **Model Context Testing API** at `window.navigator.modelContextTesting` for debugging and testing your tools during development.

### Native Support in Chromium

**IMPORTANT**: The `modelContextTesting` API is available natively in Chromium-based browsers when the experimental feature flag is enabled. This polyfill will detect and use the native implementation when available.

#### How to Enable Native API in Chromium:

**Option 1: Chrome Flags**
1. Navigate to `chrome://flags`
2. Search for "Experimental Web Platform Features"
3. Enable the flag
4. Restart your browser

**Option 2: Command Line**
```bash
# Launch Chrome/Edge with experimental features
chrome --enable-experimental-web-platform-features
```

**Detection**: When the native API is detected, you'll see this console message:
```
✅ [Model Context Testing] Native implementation detected (Chromium experimental feature)
   Using native window.navigator.modelContextTesting from browser
```

### Polyfill Fallback

If the native API is not available, this package automatically provides a polyfill implementation with the same interface:

```
[Model Context Testing] Native implementation not found, installing polyfill
   💡 To use the native implementation in Chromium:
      - Navigate to chrome://flags
      - Enable "Experimental Web Platform Features"
      - Or launch with: --enable-experimental-web-platform-features
✅ [Model Context Testing] Polyfill installed at window.navigator.modelContextTesting
```

### API Reference

#### `getToolCalls(): Array<ToolCall>`

Get a history of all tool calls made during the session.

```javascript
// Register and call some tools
window.navigator.modelContext.provideContext({
  tools: [{
    name: "greet",
    description: "Greet a user",
    inputSchema: {
      type: "object",
      properties: { name: { type: "string" } },
      required: ["name"]
    },
    async execute({ name }) {
      return { content: [{ type: "text", text: `Hello, ${name}!` }] };
    }
  }]
});

// Simulate a tool call
// (In practice, this would come from an AI agent)

// Later, inspect the tool call history
const calls = window.navigator.modelContextTesting.getToolCalls();
console.log(calls);
// [
//   {
//     toolName: "greet",
//     arguments: { name: "Alice" },
//     timestamp: 1699123456789
//   }
// ]
```

#### `clearToolCalls(): void`

Clear the tool call history.

```javascript
window.navigator.modelContextTesting.clearToolCalls();
console.log(window.navigator.modelContextTesting.getToolCalls()); // []
```

#### `setMockToolResponse(toolName: string, response: ToolResponse): void`

Set a mock response for a specific tool. When set, the tool's `execute()` function will be bypassed and the mock response will be returned instead.

```javascript
// Mock the "greet" tool to always return a specific response
window.navigator.modelContextTesting.setMockToolResponse("greet", {
  content: [{
    type: "text",
    text: "Mocked greeting!"
  }]
});

// Now when the tool is called, it returns the mock response
// (The execute function is never called)
```

#### `clearMockToolResponse(toolName: string): void`

Remove the mock response for a specific tool.

```javascript
window.navigator.modelContextTesting.clearMockToolResponse("greet");
// Tool will now use its actual execute function
```

#### `clearAllMockToolResponses(): void`

Remove all mock tool responses.

```javascript
window.navigator.modelContextTesting.clearAllMockToolResponses();
```

#### `getRegisteredTools(): Array<ToolDescriptor>`

Get the list of all currently registered tools (same as `modelContext.listTools()`).

```javascript
const tools = window.navigator.modelContextTesting.getRegisteredTools();
console.log(tools.map(t => t.name)); // ["greet", "add-todo", ...]
```

#### `reset(): void`

Reset the entire testing state (clears tool call history and all mock responses).

```javascript
window.navigator.modelContextTesting.reset();
```

### Testing Workflow Example

Here's a complete example of using the testing API:

```javascript
// 1. Register your tools
window.navigator.modelContext.provideContext({
  tools: [
    {
      name: "add-todo",
      description: "Add a todo item",
      inputSchema: {
        type: "object",
        properties: { text: { type: "string" } },
        required: ["text"]
      },
      async execute({ text }) {
        // This would normally add to your app state
        return { content: [{ type: "text", text: `Added: ${text}` }] };
      }
    }
  ]
});

// 2. Set up mocks for testing
window.navigator.modelContextTesting.setMockToolResponse("add-todo", {
  content: [{ type: "text", text: "Mock: Todo added successfully" }]
});

// 3. Simulate tool calls (or let AI agent call them)
// The tool will return the mock response instead of executing

// 4. Inspect tool call history
const calls = window.navigator.modelContextTesting.getToolCalls();
console.log(`${calls.length} tool calls made`);
calls.forEach(call => {
  console.log(`- ${call.toolName}`, call.arguments);
});

// 5. Clean up after testing
window.navigator.modelContextTesting.reset();
```

### Integration Testing Example

Perfect for automated testing with frameworks like Jest, Vitest, or Playwright:

```javascript
// test/model-context.test.js
import { test, expect } from 'vitest';

test('todo tool creates correct response', async () => {
  // Arrange
  const mockResponse = {
    content: [{ type: "text", text: "Test todo added" }]
  };

  window.navigator.modelContextTesting.setMockToolResponse(
    "add-todo",
    mockResponse
  );

  // Act
  // Trigger your AI agent or directly call the tool via MCP
  // ...

  // Assert
  const calls = window.navigator.modelContextTesting.getToolCalls();
  expect(calls).toHaveLength(1);
  expect(calls[0].toolName).toBe("add-todo");
  expect(calls[0].arguments).toEqual({ text: "Test item" });

  // Cleanup
  window.navigator.modelContextTesting.reset();
});
```

### Browser Compatibility

| Browser | Native Support | Polyfill |
|---------|---------------|----------|
| Chrome/Edge (with flag) | ✅ Yes | N/A |
| Chrome/Edge (default) | ❌ No | ✅ Yes |
| Firefox | ❌ No | ✅ Yes |
| Safari | ❌ No | ✅ Yes |
| Other browsers | ❌ No | ✅ Yes |

The polyfill automatically detects and defers to the native implementation when available, ensuring forward compatibility as browsers adopt this standard.

## 📦 What's Included

- **Web Model Context API** - Standard `window.navigator.modelContext` interface
- **Model Context Testing API** - `window.navigator.modelContextTesting` for debugging and testing (with native Chromium support detection)
- **Dynamic Tool Registration** - `registerTool()` with `unregister()` function
- **MCP Bridge** - Automatic bridging to Model Context Protocol
- **Tab Transport** - Communication layer for browser contexts
- **Event System** - Hybrid tool call handling
- **TypeScript Types** - Full type definitions included

## 🔒 Security Considerations

### Origin Restrictions

By default, the MCP transport allows connections from any origin (`*`). For production, you should configure allowed origins:

```javascript
// Future configuration API
window.navigator.modelContext.configure({
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
