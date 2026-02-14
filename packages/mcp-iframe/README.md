# @mcp-b/mcp-iframe

> Custom element for exposing iframe MCP tools, resources, and prompts to the parent page

[![npm version](https://img.shields.io/npm/v/@mcp-b/mcp-iframe?style=flat-square)](https://www.npmjs.com/package/@mcp-b/mcp-iframe)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-blue?style=flat-square)](https://www.typescriptlang.org/)

**@mcp-b/mcp-iframe** provides `<mcp-iframe>`, a Web Component that wraps an iframe and automatically bridges its MCP tools, resources, and prompts to the parent page's `navigator.modelContext`. Items are namespaced with the element's `id` to avoid collisions.

## Installation

```bash
pnpm add @mcp-b/mcp-iframe @modelcontextprotocol/sdk
```

The iframe page must have `@mcp-b/global` (or any `navigator.modelContext` implementation) installed.

## Usage

```html
<mcp-iframe src="./child-app.html" id="my-app"></mcp-iframe>

<script type="module">
  import '@mcp-b/mcp-iframe';

  const el = document.querySelector('mcp-iframe');
  el.addEventListener('mcp-iframe-ready', (e) => {
    console.log('Exposed tools:', e.detail.tools);
    // e.g. ["my-app_calculate", "my-app_get_data"]
  });
</script>
```

Tools registered inside the iframe (e.g. `calculate`) appear on the parent as `my-app_calculate`.

## Attributes

| Attribute | Description |
|-----------|-------------|
| `src` | URL of the iframe page |
| `id` | Used as the tool name prefix |
| `target-origin` | Override the postMessage target origin |
| `channel` | Channel ID for transport (default: `mcp-iframe`) |
| `call-timeout` | Timeout in ms for tool calls (default: `30000`) |
| `prefix-separator` | Separator between prefix and name (default: `_`) |

Standard iframe attributes (`sandbox`, `allow`, `width`, `height`, etc.) are also mirrored.

## Events

| Event | Detail |
|-------|--------|
| `mcp-iframe-ready` | `{ tools, resources, prompts }` - Fired when connected |
| `mcp-iframe-error` | `{ error }` - Fired on connection failure |
| `mcp-iframe-tools-changed` | `{ tools, resources, prompts }` - Fired after `refresh()` |

## Related Packages

- [`@mcp-b/global`](https://docs.mcp-b.ai/packages/global) - W3C Web Model Context API polyfill (required in the iframe)
- [`@mcp-b/transports`](https://docs.mcp-b.ai/packages/transports) - Transport layer used internally

## License

MIT - see [LICENSE](../../LICENSE) for details
