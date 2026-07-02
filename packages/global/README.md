# @mcp-b/global

> WebMCP runtime - Let Claude, ChatGPT, Gemini, and other AI agents interact with your website

[![npm version](https://img.shields.io/npm/v/@mcp-b/global?style=flat-square)](https://www.npmjs.com/package/@mcp-b/global)
[![npm downloads](https://img.shields.io/npm/dm/@mcp-b/global?style=flat-square)](https://www.npmjs.com/package/@mcp-b/global)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](https://opensource.org/licenses/MIT)
[![Bundle Size](https://img.shields.io/badge/IIFE-285KB-blue?style=flat-square)](https://bundlephobia.com/package/@mcp-b/global)
[![W3C](https://img.shields.io/badge/W3C-Web_Model_Context-005A9C?style=flat-square)](https://webmachinelearning.github.io/webmcp/)

**[Reference](https://docs.mcp-b.ai/packages/global/reference)** | **[First Tool Tutorial](https://docs.mcp-b.ai/tutorials/first-tool)** | **[Add Tools to an App](https://docs.mcp-b.ai/how-to/add-tools-to-an-existing-app)**

**@mcp-b/global** implements the [WebMCP API](https://webmachinelearning.github.io/webmcp/) (`document.modelContext`) specification, allowing AI agents like Claude, ChatGPT, Gemini, Cursor, and Copilot to discover and call functions on your website.

## Why Use @mcp-b/global?

| Feature                      | Benefit                                                                                                                                                                                                                                                     |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **W3C Standard**             | Implements the emerging WebMCP API specification                                                                                                                                                                                                            |
| **Drop-in IIFE**             | Add AI capabilities with a single `<script>` tag - no build step                                                                                                                                                                                            |
| **Native Chromium Support**  | Auto-detects and uses native browser implementation when available                                                                                                                                                                                          |
| **Dual Transport**           | Works with both same-window clients AND parent pages (iframe support)                                                                                                                                                                                       |
| **Spec-Aware Compatibility** | Tracks the current WebMCP draft (`document.modelContext`, `registerTool(tool, { signal })`, `getTools()`, and `executeTool(...)`). Deprecated `unregisterTool(name)` remains for existing MCP-B integrations and will be removed in the next major version. |
| **Works with Any AI**        | Claude, ChatGPT, Gemini, Cursor, Copilot, and any MCP client                                                                                                                                                                                                |

## Package Selection

- Use `@mcp-b/webmcp-types` when you only need strict WebMCP type definitions.
- Use `@mcp-b/webmcp-polyfill` when you only need strict WebMCP runtime polyfill behavior.
- Use `@mcp-b/global` when you want MCPB integration features (bridge transport, prompts/resources, testing helpers, extension APIs).

## Quick Start

### Via IIFE Script Tag (No Build Required)

```html
<!DOCTYPE html>
<html>
  <head>
    <script src="https://unpkg.com/@mcp-b/global@latest/dist/index.iife.js"></script>
  </head>
  <body>
    <h1>My AI-Powered App</h1>

    <script>
      document.modelContext.registerTool({
        name: 'get-page-title',
        description: 'Get the current page title',
        inputSchema: { type: 'object', properties: {} },
        async execute() {
          return {
            content: [{ type: 'text', text: document.title }],
          };
        },
      });
    </script>
  </body>
</html>
```

- **Self-contained** - All dependencies bundled (285KB minified)
- **Auto-initializes** - `document.modelContext` ready immediately
- **No build step** - Just drop it in your HTML

### Via ES Module

```html
<script type="module">
  import '@mcp-b/global';
  document.modelContext.registerTool({
    /* your tool */
  });
</script>
```

The ESM version is smaller (~16KB) but doesn't bundle dependencies.

### Via NPM

```bash
npm install @mcp-b/global
```

```javascript
import '@mcp-b/global';

document.modelContext.registerTool({
  /* your tool */
});
```

## API Reference

### Functions

#### `initializeWebModelContext(options?)`

Initializes the global adapter. Replaces `document.modelContext` with a `BrowserMcpServer` instance that bridges WebMCP tools to the MCP protocol layer.

```typescript
import { initializeWebModelContext } from '@mcp-b/global';

initializeWebModelContext({
  transport: {
    tabServer: { allowedOrigins: ['https://example.com'] },
  },
  nativeModelContextBehavior: 'preserve',
});
```

**Behavior:**

- Only operates in browser environments
- Idempotent - calling multiple times is a no-op after first initialization
- Preserves native `document.modelContext` by default (configurable)
- Auto-called on import unless `window.__webModelContextOptions.autoInitialize` is `false`

#### `cleanupWebModelContext()`

Tears down the adapter and restores `document.modelContext` to its original state. Allows re-initialization.

```typescript
import { cleanupWebModelContext, initializeWebModelContext } from '@mcp-b/global';

initializeWebModelContext();
// ... use tools ...
cleanupWebModelContext();

// Can re-initialize after cleanup
initializeWebModelContext();
```

### `document.modelContext` Methods

After initialization, `document.modelContext` exposes these methods:

#### `registerTool(tool, options?)`

Registers a single tool. The tool name must be unique, otherwise throws if a tool with the same name already exists. The recommended unregistration path is `options.signal` (`AbortSignal`):

```typescript
const ac = new AbortController();
document.modelContext.registerTool(
  {
    name: 'add-to-cart',
    description: 'Add a product to the shopping cart',
    inputSchema: {
      type: 'object',
      properties: {
        productId: { type: 'string' },
        quantity: { type: 'integer' },
      },
      required: ['productId'],
    },
    async execute(args) {
      const item = await addToCart(args.productId, args.quantity ?? 1);
      return {
        content: [{ type: 'text', text: `Added ${item.name} to cart` }],
      };
    },
  },
  { signal: ac.signal }
);

// Later - clean up:
ac.abort();
```

`registerTool` resolves `undefined`, matching current Chromium and the WebMCP spec. Use `AbortSignal` cleanup for dynamic tools.

#### `unregisterTool(nameOrTool)` (deprecated)

Removes a tool by name. The April 23, 2026 WebMCP draft removed `unregisterTool` from the spec in favor of `AbortSignal` on `registerTool`. `@mcp-b/global` keeps `unregisterTool` functional for compatibility with older native previews and existing MCP-B integrations, and emits a one-time deprecation warning when called. It will be removed in the next major version.

```typescript
document.modelContext.unregisterTool('add-to-cart');
```

#### `getTools()`

Returns WebMCP tool descriptors for all registered tools.

```typescript
const tools = await document.modelContext.getTools();
// [{ name: 'search-products', inputSchema: '{"type":"object",...}', ... }, ...]
```

#### `executeTool(tool, inputArgsJson)`

Executes a tool descriptor returned from `getTools()`.

```typescript
const tools = await document.modelContext.getTools();
const searchTool = tools.find((tool) => tool.name === 'search-products');
if (!searchTool) throw new Error('search-products is not available');

const resultJson = await document.modelContext.executeTool(
  searchTool,
  JSON.stringify({ query: 'laptop', limit: 5 })
);
const result = resultJson === null ? null : JSON.parse(resultJson);
// { content: [{ type: 'text', text: '...' }] }
```

#### `listTools()` and `callTool(params)` (deprecated)

These MCP-B compatibility helpers remain available for older integrations. Prefer `getTools()` and `executeTool(tool, inputArgsJson)` for in-page WebMCP consumers.

### Tool Descriptor

| Property       | Type                                      | Required | Description                                                                             |
| -------------- | ----------------------------------------- | -------- | --------------------------------------------------------------------------------------- |
| `name`         | `string`                                  | Yes      | Unique identifier for the tool                                                          |
| `description`  | `string`                                  | Yes      | Natural language description of what the tool does                                      |
| `inputSchema`  | `InputSchema`                             | No       | JSON Schema describing accepted input. Defaults to `{ type: 'object', properties: {} }` |
| `outputSchema` | `InputSchema`                             | No       | MCP-B helper metadata for output typing and structured MCP responses                    |
| `annotations`  | `ToolAnnotations`                         | No       | Hints about tool behavior for LLM planners                                              |
| `execute`      | `(args, client) => Promise<ToolResponse>` | Yes      | Async function implementing the tool logic                                              |

### Tool Response Format

Tools return a `ToolResponse` object:

```typescript
// Success
{
  content: [{ type: 'text', text: 'Result here' }]
}

// Error
{
  content: [{ type: 'text', text: 'Something went wrong' }],
  isError: true
}
```

## Configuration

### `WebModelContextInitOptions`

```typescript
interface WebModelContextInitOptions {
  transport?: TransportConfiguration;
  autoInitialize?: boolean;
  nativeModelContextBehavior?: 'preserve' | 'patch';
  installTestingShim?: boolean | 'always' | 'if-missing';
}
```

| Option                       | Default        | Description                                                                                                                         |
| ---------------------------- | -------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `transport`                  | Auto-detect    | Transport layer configuration (tab server and/or iframe)                                                                            |
| `autoInitialize`             | `true`         | Whether to auto-initialize on import                                                                                                |
| `nativeModelContextBehavior` | `'preserve'`   | `'preserve'` keeps native implementation untouched. `'patch'` replaces it with a BrowserMcpServer that mirrors to the native object |
| `installTestingShim`         | `'if-missing'` | Controls `navigator.modelContextTesting` installation. Only installs when not already present natively                              |

### Transport Configuration

The transport is auto-selected based on context:

```typescript
interface TransportConfiguration {
  tabServer?: Partial<TabServerTransportOptions> | false;
  iframeServer?: Partial<IframeChildTransportOptions> | false;
}
```

- **In an iframe**: Uses `IframeChildTransport` to communicate with the parent page
- **In the main window**: Uses `TabServerTransport` for cross-tab communication
- Set either to `false` to disable it

```typescript
// Restrict to specific origins
initializeWebModelContext({
  transport: {
    tabServer: { allowedOrigins: ['https://myapp.com'] },
  },
});

// Disable tab transport (iframe only)
initializeWebModelContext({
  transport: {
    tabServer: false,
  },
});
```

### Auto-Initialization

The package auto-initializes on import in browser environments. To customize before initialization:

```html
<script>
  window.__webModelContextOptions = {
    autoInitialize: true,
    transport: {
      tabServer: { allowedOrigins: ['https://myapp.com'] },
    },
  };
</script>
<script src="https://unpkg.com/@mcp-b/global@latest/dist/index.iife.js"></script>
```

To prevent auto-initialization:

```html
<script>
  window.__webModelContextOptions = { autoInitialize: false };
</script>
<script src="https://unpkg.com/@mcp-b/global@latest/dist/index.iife.js"></script>
<script>
  // Initialize manually later
  MCPB.initializeWebModelContext();
</script>
```

## Testing

`navigator.modelContextTesting` provides a testing shim that stays in sync with registered tools:

```typescript
// List registered tools
const tools = navigator.modelContextTesting?.listTools();
// [{ name: 'search-products', description: '...', inputSchema: '...' }]

// Execute a tool (input args as JSON string)
const result = await navigator.modelContextTesting?.executeTool(
  'search-products',
  '{"query": "laptop"}'
);
```

## Feature Detection

```javascript
if ('modelContext' in navigator) {
  document.modelContext.registerTool({
    /* your tool */
  });
}
```

## Examples

### E-commerce: Product Search and Cart

```typescript
import '@mcp-b/global';

document.modelContext.registerTool({
  name: 'search-products',
  description: 'Search products by keyword, category, or price range',
  inputSchema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Search terms' },
      category: { type: 'string', description: 'Product category' },
      maxPrice: { type: 'number', description: 'Maximum price filter' },
    },
    required: ['query'],
  },
  async execute(args) {
    const results = await fetch(
      `/api/products?q=${args.query}&cat=${args.category ?? ''}&max=${args.maxPrice ?? ''}`
    );
    return { content: [{ type: 'text', text: await results.text() }] };
  },
});

document.modelContext.registerTool({
  name: 'add-to-cart',
  description: 'Add a product to the shopping cart',
  inputSchema: {
    type: 'object',
    properties: {
      productId: { type: 'string' },
      quantity: { type: 'integer' },
    },
    required: ['productId'],
  },
  async execute(args) {
    await fetch('/api/cart', {
      method: 'POST',
      body: JSON.stringify({ productId: args.productId, quantity: args.quantity ?? 1 }),
    });
    return { content: [{ type: 'text', text: `Added to cart` }] };
  },
});
```

### Dynamic Tool Registration

```typescript
import '@mcp-b/global';

// Start with base tools
const userToolController = new AbortController();
document.modelContext.registerTool(
  {
    name: 'get-user',
    description: 'Get current user info',
    inputSchema: { type: 'object', properties: {} },
    async execute() {
      return { content: [{ type: 'text', text: JSON.stringify(currentUser) }] };
    },
  },
  { signal: userToolController.signal }
);

let adminToolController: AbortController | undefined;

function registerAdminTool() {
  adminToolController?.abort();
  adminToolController = new AbortController();

  document.modelContext.registerTool(
    {
      name: 'delete-user',
      description: 'Delete a user account (admin only)',
      inputSchema: {
        type: 'object',
        properties: { userId: { type: 'string' } },
        required: ['userId'],
      },
      async execute(args) {
        await fetch(`/api/users/${args.userId}`, { method: 'DELETE' });
        return { content: [{ type: 'text', text: 'User deleted' }] };
      },
    },
    { signal: adminToolController.signal }
  );
}

function unregisterAdminTool() {
  adminToolController?.abort();
  adminToolController = undefined;
}

// Add tools dynamically based on user role
if (currentUser.isAdmin) {
  registerAdminTool();
}

// Remove tools when permissions change
function onLogout() {
  userToolController.abort();
  unregisterAdminTool();
}
```

### Form Interaction

```typescript
import '@mcp-b/global';

document.modelContext.registerTool({
  name: 'fill-contact-form',
  description: 'Fill the contact form with provided details',
  inputSchema: {
    type: 'object',
    properties: {
      name: { type: 'string' },
      email: { type: 'string' },
      message: { type: 'string' },
    },
    required: ['name', 'email', 'message'],
  },
  async execute(args) {
    document.querySelector('#name').value = args.name;
    document.querySelector('#email').value = args.email;
    document.querySelector('#message').value = args.message;
    return { content: [{ type: 'text', text: 'Form filled' }] };
  },
});

document.modelContext.registerTool({
  name: 'submit-form',
  description: 'Submit the contact form',
  inputSchema: { type: 'object', properties: {} },
  async execute() {
    document.querySelector('#contact-form').submit();
    return { content: [{ type: 'text', text: 'Form submitted' }] };
  },
});
```

## Browser Compatibility

| Browser                 | Native Support | Polyfill |
| ----------------------- | -------------- | -------- |
| Chrome/Edge (with flag) | Yes            | N/A      |
| Chrome/Edge (default)   | No             | Yes      |
| Firefox                 | No             | Yes      |
| Safari                  | No             | Yes      |

## Zod Version Compatibility

This package supports **Zod `^3.25 || ^4.0`** where Zod is used by higher-level helpers. Plain JSON Schema is also supported.

## Type Exports

All types are re-exported for TypeScript consumers:

```typescript
import type {
  CallToolResult,
  InputSchema,
  ModelContext,
  ModelContextCore,
  NativeModelContextBehavior,
  ToolAnnotations,
  ToolDescriptor,
  ToolListItem,
  ToolResponse,
  TransportConfiguration,
  WebModelContextInitOptions,
} from '@mcp-b/global';
```

## Tool Routing Contract

- MCP `tools/list`, `tools/call`, and tool list update notifications are sourced from the `BrowserMcpServer` registry.
- Native and polyfill tool backfill use `getTools()` plus `executeTool()` when present, with `navigator.modelContextTesting` kept for preview/testing compatibility.

## Related Packages

- [`@mcp-b/transports`](https://docs.mcp-b.ai/packages/transports/reference) - MCP transport implementations
- [`@mcp-b/react-webmcp`](https://docs.mcp-b.ai/packages/react-webmcp/reference) - React hooks for MCP
- [`@mcp-b/extension-tools`](https://docs.mcp-b.ai/packages/extension-tools/reference) - Chrome Extension API tools
- [`@mcp-b/chrome-devtools-mcp`](https://docs.mcp-b.ai/packages/chrome-devtools-mcp/reference) - Connect desktop AI agents to browser tools

## Resources

- [WebMCP Documentation](https://docs.mcp-b.ai)
- [WebMCP specification](https://webmachinelearning.github.io/webmcp/)
- [Model Context Protocol Spec](https://modelcontextprotocol.io/)

## License

MIT - see [LICENSE](../../LICENSE) for details
