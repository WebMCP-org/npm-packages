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
| **Spec-Aware Compatibility** | `provideContext()` / `clearContext()` remain temporarily for compatibility, while `registerTool()` follows current Chromium and returns `undefined` |
| **Works with Any AI** | Claude, ChatGPT, Gemini, Cursor, Copilot, and any MCP client |

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
    navigator.modelContext.registerTool({
      name: "get-page-title",
      description: "Get the current page title",
      inputSchema: { type: "object", properties: {} },
      async execute() {
        return {
          content: [{ type: "text", text: document.title }]
        };
      }
    });
  </script>
</body>
</html>
```

- **Self-contained** - All dependencies bundled (285KB minified)
- **Auto-initializes** - `navigator.modelContext` ready immediately
- **No build step** - Just drop it in your HTML

### Via ES Module

```html
<script type="module">
  import '@mcp-b/global';
  navigator.modelContext.registerTool({ /* your tool */ });
</script>
```

The ESM version is smaller (~16KB) but doesn't bundle dependencies.

### Via NPM

```bash
npm install @mcp-b/global
```

```javascript
import '@mcp-b/global';

navigator.modelContext.registerTool({ /* your tool */ });
```

## API Reference

### Functions

#### `initializeWebModelContext(options?)`

Initializes the global adapter. Replaces `navigator.modelContext` with a `BrowserMcpServer` instance that bridges WebMCP tools to the MCP protocol layer.

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
- Preserves native `navigator.modelContext` by default (configurable)
- Auto-called on import unless `window.__webModelContextOptions.autoInitialize` is `false`

#### `cleanupWebModelContext()`

Tears down the adapter and restores `navigator.modelContext` to its original state. Allows re-initialization.

```typescript
import { cleanupWebModelContext, initializeWebModelContext } from '@mcp-b/global';

initializeWebModelContext();
// ... use tools ...
cleanupWebModelContext();

// Can re-initialize after cleanup
initializeWebModelContext();
```

### `navigator.modelContext` Methods

After initialization, `navigator.modelContext` exposes these methods:

#### `provideContext(options?)`

Deprecated compatibility API. The upstream WebMCP spec removed `provideContext()` on March 5, 2026. `@mcp-b/global` keeps it functional for now, but logs a deprecation warning and will remove it in the next major version.

Replaces all currently registered tools with a new set. This is an atomic replacement - all previous tools are removed first.

```typescript
navigator.modelContext.provideContext({
  tools: [
    {
      name: 'search-products',
      description: 'Search the product catalog by query',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search query' },
          limit: { type: 'integer', description: 'Max results' },
        },
        required: ['query'],
      },
      async execute(args) {
        const results = await searchProducts(args.query, args.limit ?? 10);
        return {
          content: [{ type: 'text', text: JSON.stringify(results) }],
        };
      },
    },
    {
      name: 'get-cart',
      description: 'Get the current shopping cart contents',
      inputSchema: { type: 'object', properties: {} },
      async execute() {
        return {
          content: [{ type: 'text', text: JSON.stringify(getCart()) }],
        };
      },
    },
  ],
});
```

#### `registerTool(tool)`

Registers a single tool. The tool name must be unique - throws if a tool with the same name already exists. Returns `undefined`, matching current Chromium.

```typescript
navigator.modelContext.registerTool({
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
});
```

#### `unregisterTool(nameOrTool)`

Removes a tool by name. Current Chrome Beta 147 and Chromium `main` expose string-name unregistration. MCP-B wrappers also accept the originally registered tool object as a temporary compatibility input.

```typescript
navigator.modelContext.unregisterTool('add-to-cart');
```

#### `clearContext()`

Deprecated compatibility API. The upstream WebMCP spec removed `clearContext()` on March 5, 2026. `@mcp-b/global` keeps it functional for now, but logs a deprecation warning and will remove it in the next major version.

Removes all registered tools.

```typescript
navigator.modelContext.clearContext();
```

#### `listTools()`

Returns metadata for all registered tools (without execute functions).

```typescript
const tools = navigator.modelContext.listTools();
// [{ name: 'search-products', description: '...', inputSchema: {...} }, ...]
```

#### `callTool(params)`

Executes a registered tool by name.

```typescript
const result = await navigator.modelContext.callTool({
  name: 'search-products',
  arguments: { query: 'laptop', limit: 5 },
});
// { content: [{ type: 'text', text: '...' }] }
```

### Tool Descriptor

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `name` | `string` | Yes | Unique identifier for the tool |
| `description` | `string` | Yes | Natural language description of what the tool does |
| `inputSchema` | `InputSchema` | No | JSON Schema describing accepted input. Defaults to `{ type: 'object', properties: {} }` |
| `outputSchema` | `InputSchema` | No | JSON Schema describing the output payload shape |
| `annotations` | `ToolAnnotations` | No | Hints about tool behavior for LLM planners |
| `execute` | `(args, client) => Promise<ToolResponse>` | Yes | Async function implementing the tool logic |

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

| Option | Default | Description |
|--------|---------|-------------|
| `transport` | Auto-detect | Transport layer configuration (tab server and/or iframe) |
| `autoInitialize` | `true` | Whether to auto-initialize on import |
| `nativeModelContextBehavior` | `'preserve'` | `'preserve'` keeps native implementation untouched. `'patch'` replaces it with a BrowserMcpServer that mirrors to the native object |
| `installTestingShim` | `'if-missing'` | Controls `navigator.modelContextTesting` installation. Only installs when not already present natively |

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
  navigator.modelContext.registerTool({ /* your tool */ });
}
```

## Examples

### E-commerce: Product Search and Cart

```typescript
import '@mcp-b/global';

navigator.modelContext.registerTool({
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
    const results = await fetch(`/api/products?q=${args.query}&cat=${args.category ?? ''}&max=${args.maxPrice ?? ''}`);
    return { content: [{ type: 'text', text: await results.text() }] };
  },
});

navigator.modelContext.registerTool({
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
navigator.modelContext.registerTool({
  name: 'get-user',
  description: 'Get current user info',
  inputSchema: { type: 'object', properties: {} },
  async execute() {
    return { content: [{ type: 'text', text: JSON.stringify(currentUser) }] };
  },
});

// Add tools dynamically based on user role
if (currentUser.isAdmin) {
  navigator.modelContext.registerTool({
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
  });
}

// Remove tools when permissions change
function onLogout() {
  navigator.modelContext.unregisterTool('get-user');
}
```

### Form Interaction

```typescript
import '@mcp-b/global';

navigator.modelContext.registerTool({
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

navigator.modelContext.registerTool({
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

| Browser | Native Support | Polyfill |
|---------|---------------|----------|
| Chrome/Edge (with flag) | Yes | N/A |
| Chrome/Edge (default) | No | Yes |
| Firefox | No | Yes |
| Safari | No | Yes |

## Zod Version Compatibility

This package supports **Zod 3.25.76+** (3.x only). JSON Schema is also supported if you prefer not to use Zod.

## Type Exports

All types are re-exported for TypeScript consumers:

```typescript
import type {
  CallToolResult,
  InputSchema,
  ModelContext,
  ModelContextCore,
  ModelContextOptions,
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

- MCP `tools/list`, `tools/call`, and tool list update notifications are sourced from `navigator.modelContextTesting`.
- `@mcp-b/global` requires `navigator.modelContextTesting` to be available at initialization time.

## Related Packages

- [`@mcp-b/transports`](https://docs.mcp-b.ai/packages/transports) - MCP transport implementations
- [`@mcp-b/react-webmcp`](https://docs.mcp-b.ai/packages/react-webmcp) - React hooks for MCP
- [`@mcp-b/extension-tools`](https://docs.mcp-b.ai/packages/extension-tools) - Chrome Extension API tools
- [`@mcp-b/chrome-devtools-mcp`](https://docs.mcp-b.ai/packages/chrome-devtools-mcp) - Connect desktop AI agents to browser tools

## Resources

- [WebMCP Documentation](https://docs.mcp-b.ai)
- [Web Model Context API Explainer](https://github.com/nicolo-ribaudo/model-context-protocol-api)
- [Model Context Protocol Spec](https://modelcontextprotocol.io/)

## License

MIT - see [LICENSE](../../LICENSE) for details
