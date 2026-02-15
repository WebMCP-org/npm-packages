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
| **Strict Core Semantics** | `provideContext()` replaces tool context and `registerTool()` is name-based |
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

- **Self-contained** - All dependencies bundled (285KB minified)
- **Auto-initializes** - `window.navigator.modelContext` ready immediately
- **No build step** - Just drop it in your HTML

### Via ES Module

```html
<script type="module">
  import '@mcp-b/global';
  window.navigator.modelContext.provideContext({ tools: [/* your tools */] });
</script>
```

The ESM version is smaller (~16KB) but doesn't bundle dependencies.

### Via NPM

```bash
npm install @mcp-b/global
```

```javascript
import '@mcp-b/global';

window.navigator.modelContext.provideContext({
  tools: [/* your tools */]
});
```

## API Overview

| Method | Description |
|--------|-------------|
| `provideContext(options?)` | Register context and replace current tool set |
| `registerTool(tool)` | Register a single tool (name must be unique) |
| `unregisterTool(name)` | Remove a registered tool |
| `clearContext()` | Clear all registered context |

### Tool Descriptor

| Property | Type | Description |
|----------|------|-------------|
| `name` | `string` | Unique identifier |
| `description` | `string` | Natural language description |
| `inputSchema` | `object` | JSON Schema or Zod schema for input parameters |
| `outputSchema` | `object` | Optional JSON Schema for structured output |
| `annotations` | `object` | Optional hints about tool behavior |
| `execute` | `function` | Async function that implements the tool logic |

### Tool Response Format

```typescript
{
  content: [{ type: "text", text: "Result..." }],
  isError?: boolean
}
```

## Feature Detection

```javascript
if ("modelContext" in navigator) {
  navigator.modelContext.provideContext({ tools: [...] });
}
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

## What's Included

- **Web Model Context API** - Standard `window.navigator.modelContext` interface
- **Model Context Testing API** - `window.navigator.modelContextTesting` for debugging
- **Dynamic Tool Registration** - `registerTool()` and `unregisterTool()`
- **MCP Bridge** - Automatic bridging to Model Context Protocol
- **Tab Transport** - Communication layer for browser contexts
- **Event System** - Hybrid tool call handling
- **TypeScript Types** - Full type definitions included

## Tool Routing Contract (Current)

- MCP `tools/list`, `tools/call`, and tool list update notifications are sourced from `navigator.modelContextTesting`.
- `@mcp-b/global` requires `navigator.modelContextTesting` to be available at initialization time.

## Documentation

For advanced usage, configuration, native Chromium integration, output schemas, testing API, and complete examples, see the [Global Package Guide](../../docs/global-guide.md).

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
