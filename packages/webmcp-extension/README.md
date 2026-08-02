# `@mcp-b/webmcp-extension`

Install WebMCP from a Chromium extension, then discover and call the page's tools from an isolated content script.

The page API stays native-shaped: websites register tools with `document.modelContext`. The extension-side helper returns the official MCP `Client`, with its normal `listTools()`, `callTool()`, and `close()` methods.

## Install

```bash
pnpm add @mcp-b/global @mcp-b/webmcp-extension
```

## Set up the extension

Declare the runtime and client as static `document_start` content scripts: install WebMCP in the page's `MAIN` world, then connect from the default isolated world. `world: "MAIN"` requires Chrome 111 or newer. See Chrome's [content-script guide](https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts) and [`content_scripts` manifest reference](https://developer.chrome.com/docs/extensions/reference/manifest/content-scripts).

```json
{
  "manifest_version": 3,
  "name": "My WebMCP Extension",
  "version": "1.0.0",
  "minimum_chrome_version": "111",
  "content_scripts": [
    {
      "matches": ["https://*/*", "http://localhost/*", "http://127.0.0.1/*"],
      "js": ["main-world.iife.js"],
      "run_at": "document_start",
      "world": "MAIN"
    },
    {
      "matches": ["https://*/*", "http://localhost/*", "http://127.0.0.1/*"],
      "js": ["content-script.iife.js"],
      "run_at": "document_start"
    }
  ]
}
```

The MAIN-world entry only installs the runtime:

```ts
// main-world.ts
import '@mcp-b/global';
```

Page code continues to use `document.modelContext` directly:

```ts
await document.modelContext.registerTool({
  name: 'get_cart',
  description: 'Read the current shopping cart.',
  execute: () => ({
    content: [{ type: 'text', text: JSON.stringify(readCart()) }],
  }),
});
```

Connect from the isolated content script and use the standard client API:

```ts
// content-script.ts
import { connectWebMCPClient } from '@mcp-b/webmcp-extension/content-script';

const client = await connectWebMCPClient({
  name: 'my-extension',
  version: '1.0.0',
});

const { tools } = await client.listTools();
const result = await client.callTool({
  name: 'get_cart',
  arguments: {},
});

await client.close();
```

Pass the official MCP `ClientOptions` as the second argument when you need list-change handlers, validation, caching, or input-required behavior. The template uses `listChanged.tools` so tools registered after page hydration appear automatically.

Bundle each entry as a self-contained classic script. Extension content scripts cannot load bare npm imports at runtime.

## Start from the template

The published package includes a minimal buildable extension in [`template`](./template):

```bash
cp -R node_modules/@mcp-b/webmcp-extension/template my-webmcp-extension
cd my-webmcp-extension
pnpm install
pnpm build
```

Load `dist/` as an unpacked extension from `chrome://extensions`.

## Security and scope

- MAIN-world code shares the website's JavaScript environment. Keep extension secrets, credentials, and privileged Chrome API calls out of `main-world.ts`.
- The client transport pins messages to `window.location.origin`; it does not use a wildcard origin. This is routing, not authentication: same-page code can observe or forge the channel. Treat page tool metadata, arguments, and results as untrusted, and never authorize privileged extension actions from them alone.
- The template needs no extension API permissions, background worker, or `web_accessible_resources` declaration. Its match patterns declare the page access it needs.
- Narrow the manifest match patterns to the sites your extension actually supports before publishing it.
- Add icons and the remaining Chrome Web Store listing metadata before publishing; the included manifest is a runnable development baseline.
- The template intentionally targets top-level pages. It does not inject into child frames.

## Test

```bash
pnpm --filter @mcp-b/webmcp-extension test:e2e
```

The test smoke-builds the copyable template with its own config, then loads its manifest and runtime as a real unpacked MV3 extension in Playwright's bundled Chromium. It covers document-start injection, strict page CSP, isolated-world discovery and calls, list-change handling, tool errors, dynamic registration and removal, top-frame scoping, navigation, and BFCache restoration. See Playwright's [Chrome extension testing guide](https://playwright.dev/docs/chrome-extensions).
