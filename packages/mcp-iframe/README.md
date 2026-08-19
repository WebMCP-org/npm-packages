# @mcp-b/mcp-iframe

> Custom element for exposing iframe MCP tools, resources, and prompts to the parent page

[![npm version](https://img.shields.io/npm/v/@mcp-b/mcp-iframe?style=flat-square)](https://www.npmjs.com/package/@mcp-b/mcp-iframe)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-blue?style=flat-square)](https://www.typescriptlang.org/)

**@mcp-b/mcp-iframe** provides `<mcp-iframe>`, a Web Component that wraps an iframe and automatically bridges its MCP tools, resources, and prompts to the parent page's `document.modelContext`. Tool and prompt names include the element's `id`. Resource URIs use an `mcp-iframe:` wrapper that records the element prefix and child URI.

## Installation

```bash
pnpm add @mcp-b/mcp-iframe
```

Both pages must expose `document.modelContext`. The parent needs the MCP-B
resource and prompt extensions from `@mcp-b/global` when the iframe exposes
those capabilities. The deprecated `navigator.modelContext` surface is used
only as a fallback for older runtimes.

## Use the default element

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

Importing the package root auto-registers `<mcp-iframe>`. Tools registered inside the iframe
(for example, `calculate`) appear on the parent as `my-app_calculate`.

To register a custom tag without registering the default tag, use the side-effect-free entry point:

```typescript
import { registerMCPIframeElement } from '@mcp-b/mcp-iframe/element';

registerMCPIframeElement('my-mcp-frame');
```

## Attributes

| Attribute          | Description                                                                                                |
| ------------------ | ---------------------------------------------------------------------------------------------------------- |
| `src`              | URL of the iframe page                                                                                     |
| `id`               | Used as the tool and prompt name prefix                                                                    |
| `target-origin`    | Override the inferred `postMessage` target origin. Opaque origins require `*`                              |
| `channel`          | Channel ID for transport (default: `mcp-iframe`)                                                           |
| `call-timeout`     | Timeout in ms for tool calls, resource reads, and prompt gets (default: `30000`; invalid values fall back) |
| `prefix-separator` | Separator between prefix and name (default: `_`; allows letters, numbers, `_`, `.`, and `-`)               |

Standard iframe attributes (`sandbox`, `allow`, `width`, `height`, etc.) are also mirrored.

## Scoping which tools the parent sees

A child decides what it advertises. Registering a tool with `exposedTo` narrows it to
named embedder origins, and the child only puts it on the wire once the connected parent
matches:

```js
await document.modelContext.registerTool(
  { name: 'checkout', description: 'Place the order', execute: placeOrder },
  { exposedTo: ['https://shop.example'] }
);
```

Embedded anywhere else, that tool never reaches the parent's `exposedTools` and cannot be
called through the element. Tools registered without `exposedTo` are unaffected and stay
visible to whichever parent the child's transport already allows.

Two limits are worth stating plainly:

- `exposedTo` can only **narrow** exposure. The child transport's `allowedOrigins` is still
  what decides who may connect at all, and no allowlist widens past it.
- Enforcement here is the child's own JavaScript, not the browser. That is weaker than
  native WebMCP, where the user agent enforces `exposedTo` and a compromised child cannot
  opt out. Treat it as scoping, not as a security boundary against the child itself.

## Events

| Event                      | Detail                                                                                    |
| -------------------------- | ----------------------------------------------------------------------------------------- |
| `mcp-iframe-ready`         | `{ tools, resources, prompts }` - Fired when connected                                    |
| `mcp-iframe-error`         | `{ error }` - Fired on connection or registration refresh failure                         |
| `mcp-iframe-items-changed` | `{ tools, resources, prompts }` - Fired after an advertised list change or manual refresh |

## Related Packages

- [`@mcp-b/global`](https://docs.mcp-b.ai/packages/global/reference) - Full MCP-B browser runtime; any compatible `document.modelContext` implementation works in the iframe
- [`@mcp-b/transports`](https://docs.mcp-b.ai/packages/transports/reference) - Transport layer used internally

## License

MIT - see [LICENSE](../../LICENSE) for details
