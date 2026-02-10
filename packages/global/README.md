# @mcp-b/global

> W3C Web Model Context API polyfill - Let Claude, ChatGPT, Gemini, and other AI agents interact with your website

[![npm version](https://img.shields.io/npm/v/@mcp-b/global?style=flat-square)](https://www.npmjs.com/package/@mcp-b/global)
[![npm downloads](https://img.shields.io/npm/dm/@mcp-b/global?style=flat-square)](https://www.npmjs.com/package/@mcp-b/global)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](https://opensource.org/licenses/MIT)
[![Bundle Size](https://img.shields.io/badge/IIFE-285KB-blue?style=flat-square)](https://bundlephobia.com/package/@mcp-b/global)
[![W3C](https://img.shields.io/badge/W3C-Web_Model_Context-005A9C?style=flat-square)](https://github.com/nicolo-ribaudo/model-context-protocol-api)

**[Full Documentation](https://docs.mcp-b.ai/packages/global)** | **[Quick Start](https://docs.mcp-b.ai/quickstart)** | **[Tool Registration](https://docs.mcp-b.ai/concepts/tool-registration)**

**@mcp-b/global** implements the [W3C Web Model Context API](https://github.com/nicolo-ribaudo/model-context-protocol-api) (`navigator.modelContext`) specification, allowing AI agents like Claude, ChatGPT, Gemini, Cursor, and Copilot to discover and call functions on your website.

## Why Use @mcp-b/global?

| Feature | Benefit |
|---------|---------|
| **W3C Standard** | Implements the emerging Web Model Context API specification |
| **Drop-in IIFE** | Add AI capabilities with a single `<script>` tag - no build step |
| **Native Chromium Support** | Auto-detects and uses native browser implementation when available |
| **Dual Transport** | Works with both same-window clients AND parent pages (iframe support) |
| **Two-Bucket System** | Manage app-level and component-level tools separately |
| **Works with Any AI** | Claude, ChatGPT, Gemini, Cursor, Copilot, and any MCP client |

## Use Cases

- **AI-Powered Websites**: Let AI agents search, filter, and interact with your web app
- **E-commerce Integration**: AI can search products, add to cart, checkout
- **SaaS Applications**: Expose your app's functionality to AI assistants
- **Content Management**: Let AI edit, publish, and organize content
- **Embedded Widgets**: AI tools accessible from parent pages via iframes

## Quick Start

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
- **Self-contained** - All dependencies bundled (285KB minified)
- **Auto-initializes** - `window.navigator.modelContext` ready immediately
- **No build step** - Just drop it in your HTML
- **Works everywhere** - Compatible with all modern browsers
- **Global access** - Also exposes `window.WebMCP` for advanced usage

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

## Traditional Web Standard Usage

The Web Model Context API follows the same patterns as other browser APIs. Here's how to use it as a traditional web standard:

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
// Feature detection
if ('modelContext' in navigator) {
  // Register a single tool (returns an object with unregister method)
  const registration = navigator.modelContext.registerTool({
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

  // Later, unregister if needed (e.g., when component unmounts)
  // registration.unregister();
}
```

### Event-Driven Pattern

Similar to other DOM events, you can listen for tool calls:

```javascript
if ('modelContext' in navigator) {
  // Listen for tool calls (like 'message' or 'click' events)
  navigator.modelContext.addEventListener('toolcall', (event) => {
    console.log(`Tool "${event.name}" called with:`, event.arguments);

    // Optionally intercept and provide custom response
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
    // Application state
    const notes = [];

    // DOM elements
    const noteInput = document.getElementById('noteInput');
    const addNoteBtn = document.getElementById('addNote');
    const notesList = document.getElementById('notesList');
    const logEl = document.getElementById('log');

    // UI functions
    function renderNotes() {
      notesList.innerHTML = notes.map((note, i) =>
        `<li>${note} <button onclick="deleteNote(${i})">×</button></li>`
      ).join('');
    }

    function log(message) {
      const time = new Date().toLocaleTimeString();
      logEl.innerHTML = `[${time}] ${message}\n` + logEl.innerHTML;
    }

    // User interactions
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

    // Web Model Context API - Register tools for AI agents
    if ('modelContext' in navigator) {
      navigator.modelContext.provideContext({
        tools: [
          {
            name: 'notes_list',
            description: 'Get all notes',
            inputSchema: { type: 'object', properties: {} },
            execute: async () => {
              log(' notes_list called');
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
              properties: {
                text: { type: 'string', description: 'The note text' }
              },
              required: ['text']
            },
            execute: async ({ text }) => {
              log(` notes_add called: "${text}"`);
              notes.push(text);
              renderNotes();
              return {
                content: [{ type: 'text', text: `Added note: "${text}"` }]
              };
            }
          },
          {
            name: 'notes_delete',
            description: 'Delete a note by index (1-based)',
            inputSchema: {
              type: 'object',
              properties: {
                index: { type: 'number', description: 'Note index (1-based)' }
              },
              required: ['index']
            },
            execute: async ({ index }) => {
              log(` notes_delete called: index ${index}`);
              if (index < 1 || index > notes.length) {
                return { content: [{ type: 'text', text: 'Invalid index' }], isError: true };
              }
              const deleted = notes.splice(index - 1, 1)[0];
              renderNotes();
              return {
                content: [{ type: 'text', text: `Deleted: "${deleted}"` }]
              };
            }
          },
          {
            name: 'notes_clear',
            description: 'Delete all notes',
            inputSchema: { type: 'object', properties: {} },
            execute: async () => {
              log(' notes_clear called');
              const count = notes.length;
              notes.length = 0;
              renderNotes();
              return {
                content: [{ type: 'text', text: `Cleared ${count} notes` }]
              };
            }
          }
        ]
      });

      log(' Web Model Context API initialized');
      log(' Tools: notes_list, notes_add, notes_delete, notes_clear');
    } else {
      log(' Web Model Context API not available');
    }
  </script>
</body>
</html>
```

This example demonstrates:
- **Feature detection** using `'modelContext' in navigator`
- **Tool registration** via `navigator.modelContext.provideContext()`
- **Standard input schemas** following JSON Schema specification
- **Async execute functions** returning MCP-compatible responses
- **Real-time UI updates** when AI agents call tools

## Configuration

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

## Native Chromium API Support

This package **automatically detects and integrates** with Chromium's native Web Model Context API when available. No configuration needed - it just works!

For standards/source tracking and future conformance planning, see `./WEBMCP-CONFORMANCE-REFERENCES.md`.

### Automatic Detection & Integration

When you call `initializeWebModelContext()` (or when auto-initialization runs):

1. **Native API detected** (both `navigator.modelContext` and `navigator.modelContextTesting` present):
   - Uses native Chromium implementation
   - Creates MCP bridge and syncs tools automatically
   - Registers callback to listen for native tool changes
   - MCP clients stay synchronized with native tool registry

2. **No native API detected**:
   - Installs full polyfill implementation
   - Provides identical API surface

**Zero configuration required** - the package automatically adapts to your environment!

### Native API Features

When the native Chromium API is available, you get:

- **Automatic tool synchronization** - Tools registered in native API are synced to MCP bridge via `registerToolsChangedCallback()`
- **Iframe tool collection** - Native API automatically collects tools from embedded iframes (no manual transport setup needed)
- **MCP compatibility** - Your MCP clients (extensions, apps) continue to work seamlessly
- **Tool change notifications** - MCP servers receive `tools/list_changed` notifications automatically
- **Consistent API** - Same code works with both native and polyfill implementations

### How Tool Synchronization Works

The polyfill automatically registers a callback with the native API:

```typescript
// Happens automatically when native API is detected
navigator.modelContextTesting.registerToolsChangedCallback(() => {
  // Syncs native tools → MCP bridge
  // MCP clients receive tools/list_changed notification
});
```

This callback fires when:
- `navigator.modelContext.registerTool()` is called
- `navigator.modelContext.unregisterTool()` is called
- `navigator.modelContext.provideContext()` is called
- `navigator.modelContext.clearContext()` is called
- Tools are added from embedded iframes (native feature)

### Enabling Native API in Chromium

```bash
# Method 1: Launch with flag
chromium --enable-experimental-web-platform-features

# Method 2: Enable in chrome://flags
# Search for: "Experimental Web Platform Features"
# Set to: Enabled
# Restart browser
```

### Example: Using Native API

```typescript
import '@mcp-b/global';

// If native API is present, this delegates to navigator.modelContext:
window.navigator.modelContext.registerTool({
  name: 'myTool',
  description: 'My tool',
  inputSchema: { type: 'object', properties: {} },
  async execute() {
    return { content: [{ type: 'text', text: 'Hello!' }] };
  }
});

// Behind the scenes:
// 1. Tool registered in native Chromium registry
// 2. Callback fires (registerToolsChangedCallback)
// 3. Tool synced to MCP bridge
// 4. MCP clients notified (tools/list_changed)
```

### Iframe Tool Collection (Native Only)

When the native API is active, tools from embedded iframes are **automatically collected**:

```html
<!-- parent.html -->
<script type="module">
  import '@mcp-b/global';

  // Native API will collect tools from this page AND all iframes
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

  // This tool is automatically visible in parent's registry (native feature)
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

With native API, `navigator.modelContextTesting.listTools()` in the parent will show **both** tools! The MCP bridge stays in sync automatically.

### Detection in Console

When you initialize the package, check the console logs:

```
 [Web Model Context] Native Chromium API detected
   Using native implementation with MCP bridge synchronization
   Native API will automatically collect tools from embedded iframes
 [Web Model Context] MCP bridge synced with native API
   MCP clients will receive automatic tool updates from native registry
```

Or if polyfill is used:

```
[Web Model Context] Native API not detected, installing polyfill
 [Web Model Context] window.navigator.modelContext initialized successfully
[Model Context Testing] Installing polyfill
 [Model Context Testing] Polyfill installed at window.navigator.modelContextTesting
```

## API Reference

### Two-Bucket Tool Management System

This package uses a **two-bucket system** for tool management to support both app-level and component-level tools:

- **Bucket A (Base Tools)**: Registered via `provideContext()` - represents your app's core functionality
- **Bucket B (Dynamic Tools)**: Registered via `registerTool()` - component-scoped tools that persist across `provideContext()` calls

**Key behaviors:**
- `provideContext()` only clears Bucket A, leaving Bucket B intact
- `registerTool()` adds to Bucket B and persists across `provideContext()` calls
- Tool name collisions between buckets throw an error
- Cannot `unregister()` a tool that was registered via `provideContext()`

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
- Persist across `provideContext()` calls
- Perfect for component lifecycle management
- Can be unregistered via the returned `unregister()` function
- Cannot have the same name as a tool in Bucket A (provideContext)

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
| `outputSchema` | `object` | Optional JSON Schema defining structured output |
| `annotations` | `object` | Optional hints about tool behavior |
| `execute` | `function` | Async function that implements the tool logic |

### Output Schemas (Structured Output)

**Output schemas are essential for modern AI integrations.** Many AI providers compile tool definitions into TypeScript definitions, enabling the AI to generate type-safe responses. Without an output schema, AI agents can only return unstructured text.

**Benefits of output schemas:**
- **Type-safe responses** - AI generates structured JSON matching your schema
- **Better AI reasoning** - AI understands the expected output format
- **Client validation** - Responses are validated against the schema
- **IDE support** - TypeScript types inferred from schemas

#### Basic Output Schema Example

```javascript
window.navigator.modelContext.provideContext({
  tools: [
    {
      name: "get-user-profile",
      description: "Fetch a user's profile information",
      inputSchema: {
        type: "object",
        properties: {
          userId: { type: "string", description: "The user ID" }
        },
        required: ["userId"]
      },
      // Define the structured output format
      outputSchema: {
        type: "object",
        properties: {
          id: { type: "string", description: "User ID" },
          name: { type: "string", description: "Display name" },
          email: { type: "string", description: "Email address" },
          createdAt: { type: "string", description: "ISO date string" }
        },
        required: ["id", "name", "email"]
      },
      async execute({ userId }) {
        const user = await fetchUser(userId);
        return {
          content: [{ type: "text", text: `Found user: ${user.name}` }],
          // Structured content matching the outputSchema
          structuredContent: {
            id: user.id,
            name: user.name,
            email: user.email,
            createdAt: user.createdAt.toISOString()
          }
        };
      }
    }
  ]
});
```

#### Using Zod for Type-Safe Schemas

For TypeScript projects, you can use Zod schemas for both input and output validation. Zod schemas are automatically converted to JSON Schema:

```typescript
import { z } from 'zod';

window.navigator.modelContext.provideContext({
  tools: [
    {
      name: "search-products",
      description: "Search the product catalog",
      inputSchema: {
        query: z.string().describe("Search query"),
        limit: z.number().min(1).max(100).default(10).describe("Max results"),
        category: z.enum(["electronics", "clothing", "books"]).optional()
      },
      // Zod schema for output - provides TypeScript types
      outputSchema: {
        products: z.array(z.object({
          id: z.string(),
          name: z.string(),
          price: z.number(),
          inStock: z.boolean()
        })),
        total: z.number().describe("Total matching products"),
        hasMore: z.boolean().describe("Whether more results exist")
      },
      async execute({ query, limit, category }) {
        const results = await searchProducts({ query, limit, category });
        return {
          content: [{ type: "text", text: `Found ${results.total} products` }],
          structuredContent: {
            products: results.items,
            total: results.total,
            hasMore: results.total > limit
          }
        };
      }
    }
  ]
});
```

#### Complex Output Schema Example

For tools that return rich data structures:

```javascript
window.navigator.modelContext.provideContext({
  tools: [
    {
      name: "analyze-code",
      description: "Analyze code for issues and suggestions",
      inputSchema: {
        type: "object",
        properties: {
          code: { type: "string", description: "Source code to analyze" },
          language: { type: "string", enum: ["javascript", "typescript", "python"] }
        },
        required: ["code", "language"]
      },
      outputSchema: {
        type: "object",
        properties: {
          summary: {
            type: "object",
            properties: {
              linesOfCode: { type: "number" },
              complexity: { type: "string", enum: ["low", "medium", "high"] }
            }
          },
          issues: {
            type: "array",
            items: {
              type: "object",
              properties: {
                severity: { type: "string", enum: ["error", "warning", "info"] },
                line: { type: "number" },
                message: { type: "string" },
                suggestion: { type: "string" }
              },
              required: ["severity", "line", "message"]
            }
          },
          score: {
            type: "number",
            minimum: 0,
            maximum: 100,
            description: "Code quality score"
          }
        },
        required: ["summary", "issues", "score"]
      },
      async execute({ code, language }) {
        const analysis = await analyzeCode(code, language);
        return {
          content: [{ type: "text", text: `Quality score: ${analysis.score}/100` }],
          structuredContent: analysis
        };
      }
    }
  ]
});
```

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
          `${t.done ? '' : '○'} ${t.text}`
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
    todos.map(t => `<li>${t.done ? '' : ''} ${t.text}</li>`).join('');
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

## Dynamic Tool Registration (Component Lifecycle)

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
//  "dynamic-tool" persists! Only "base-tool-1" was cleared

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
    name: "my-tool", //  Name collision with Bucket A
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

## Event-Based Tool Calls (Advanced)

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

## Architecture

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

## Feature Detection

Check if the API is available:

```javascript
if ("modelContext" in navigator) {
  // API is available
  navigator.modelContext.provideContext({ tools: [...] });
} else {
  console.warn("Web Model Context API not available");
}
```

## Debugging

### Enable Debug Logging

The @mcp-b/global library includes a lightweight logging system that can be enabled in the browser console. By default, the console is kept clean (only errors and warnings are shown). You can enable detailed debug logging when troubleshooting:

```javascript
// Enable all debug logging
localStorage.setItem('WEBMCP_DEBUG', '*');

// Enable specific namespaces
localStorage.setItem('WEBMCP_DEBUG', 'WebModelContext');
localStorage.setItem('WEBMCP_DEBUG', 'NativeAdapter,MCPBridge');

// Refresh the page to apply changes
location.reload();
```

To disable debug logging:

```javascript
localStorage.removeItem('WEBMCP_DEBUG');
location.reload();
```

**Available Namespaces:**
- `WebModelContext` - Main polyfill implementation
- `NativeAdapter` - Native Chromium API adapter
- `MCPBridge` - MCP server and transport setup
- `ModelContextTesting` - Testing API operations

**Log Levels:**
- **Error** (always shown): Critical failures and exceptions
- **Warn** (always shown): Compatibility warnings and potential issues
- **Info** (debug mode only): Initialization and setup progress
- **Debug** (debug mode only): Detailed operation traces

### Access Internal Bridge

In development mode, access the internal bridge:

```javascript
if (window.__mcpBridge) {
  console.log("MCP Server:", window.__mcpBridge.server);
  console.log("Registered tools:", window.__mcpBridge.tools);
}
```

## Testing API (`navigator.modelContextTesting`)

This package provides a **Model Context Testing API** at `window.navigator.modelContextTesting` for debugging and testing your tools during development.

> [!WARNING]
> `navigator.modelContextTesting` is deprecated and kept for compatibility.
> For in-page consumers, use `navigator.modelContext.callTool({ name, arguments })` and
> `navigator.modelContext.addEventListener("toolschanged", ...)`.

### Unified Consumer API (Recommended)

```javascript
// Execute tools with object args (no JSON stringification)
const result = await navigator.modelContext.callTool({
  name: "greet",
  arguments: { name: "Alice" }
});

// React to tool list changes
navigator.modelContext.addEventListener("toolschanged", () => {
  console.log("Tools changed:", navigator.modelContext.listTools());
});
```

### Testing Helpers Module

Use `@mcp-b/global/testing` to avoid depending on global-only testing extensions directly:

```javascript
import { createTestHelper } from "@mcp-b/global/testing";

const testing = createTestHelper();
await testing.executeTool("greet", { name: "Alice" });
```

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
 [Model Context Testing] Native implementation detected (Chromium experimental feature)
   Using native window.navigator.modelContextTesting from browser
```

### Polyfill Fallback

If the native API is not available, this package automatically provides a polyfill implementation with the same interface:

```
[Model Context Testing] Native implementation not found, installing polyfill
    To use the native implementation in Chromium:
      - Navigate to chrome://flags
      - Enable "Experimental Web Platform Features"
      - Or launch with: --enable-experimental-web-platform-features
 [Model Context Testing] Polyfill installed at window.navigator.modelContextTesting
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
| Chrome/Edge (with flag) |  Yes | N/A |
| Chrome/Edge (default) |  No |  Yes |
| Firefox |  No |  Yes |
| Safari |  No |  Yes |
| Other browsers |  No |  Yes |

The polyfill automatically detects and defers to the native implementation when available, ensuring forward compatibility as browsers adopt this standard.

## Zod Version Compatibility

This package supports **Zod 3.25+** and **Zod 4.x**. Simply use the standard import:

```typescript
import { z } from 'zod';

window.navigator.modelContext.provideContext({
  tools: [{
    name: "my-tool",
    inputSchema: {
      name: z.string().describe('User name'),
      age: z.number().min(0)
    },
    async execute({ name, age }) {
      return { content: [{ type: "text", text: `Hello, ${name}!` }] };
    }
  }]
});
```

### JSON Schema Alternative

JSON Schema is also supported if you prefer not to use Zod:

```javascript
window.navigator.modelContext.provideContext({
  tools: [{
    name: "my-tool",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string" }
      },
      required: ["name"]
    },
    async execute({ name }) {
      return { content: [{ type: "text", text: `Hello, ${name}!` }] };
    }
  }]
});
```

## What's Included

- **Web Model Context API** - Standard `window.navigator.modelContext` interface
- **Model Context Testing API** - `window.navigator.modelContextTesting` for debugging and testing (with native Chromium support detection)
- **Dynamic Tool Registration** - `registerTool()` with `unregister()` function
- **MCP Bridge** - Automatic bridging to Model Context Protocol
- **Tab Transport** - Communication layer for browser contexts
- **Event System** - Hybrid tool call handling
- **TypeScript Types** - Full type definitions included

## Security Considerations

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

## Frequently Asked Questions

### How do AI agents connect to my website?

AI agents connect through browser extensions or the `@mcp-b/chrome-devtools-mcp` server, which bridges desktop AI clients to browser-based tools.

### Do I need a build step?

No! Use the IIFE version with a single `<script>` tag. For bundler users, the ESM version is also available.

### Is this production-ready?

Yes! The polyfill handles tool registration, lifecycle management, and automatically uses native Chromium implementation when available.

### What about browser support?

Works in all modern browsers. Native API support is available in Chromium with experimental flags enabled.

## Related Packages

- [`@mcp-b/transports`](https://docs.mcp-b.ai/packages/transports) - MCP transport implementations
- [`@mcp-b/react-webmcp`](https://docs.mcp-b.ai/packages/react-webmcp) - React hooks for MCP
- [`@mcp-b/extension-tools`](https://docs.mcp-b.ai/packages/extension-tools) - Chrome Extension API tools
- [`@mcp-b/chrome-devtools-mcp`](https://docs.mcp-b.ai/packages/chrome-devtools-mcp) - Connect desktop AI agents to browser tools
- [`@modelcontextprotocol/sdk`](https://www.npmjs.com/package/@modelcontextprotocol/sdk) - Official MCP SDK

## Resources

- [WebMCP Documentation](https://docs.mcp-b.ai)
- [Web Model Context API Explainer](https://github.com/nicolo-ribaudo/model-context-protocol-api)
- [Model Context Protocol Spec](https://modelcontextprotocol.io/)
- [MCP GitHub Repository](https://github.com/modelcontextprotocol)

## License

MIT - see [LICENSE](../../LICENSE) for details

## Support

- [GitHub Issues](https://github.com/WebMCP-org/npm-packages/issues)
- [Documentation](https://docs.mcp-b.ai)
- [Discord Community](https://discord.gg/a9fBR6Bw)
