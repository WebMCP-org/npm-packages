# WebMCP extension template

This MV3 extension installs WebMCP in each matching top-level page and connects an official MCP client from an isolated content script.

```bash
pnpm install
pnpm build
```

Load `dist/` from `chrome://extensions` with **Developer mode** → **Load unpacked**.

- `src/main-world.ts` runs with the page and only installs `@mcp-b/global`.
- `src/content-script.ts` stays isolated, logs current tools, and follows later tool-list changes.
- `manifest.json` declares site access. Narrow its match patterns before publishing.

The client receives both JavaScript tools registered through
`document.modelContext` and declarative tools generated from annotated forms.
`@mcp-b/global` owns native or polyfilled form discovery; the isolated content
script uses the same `listTools()` and `callTool()` methods for both tool types.
Native Chrome also exposes both tool types from same-origin child documents.
The polyfilled fallback is scoped to the top document.

Call a page tool from `src/content-script.ts` with the returned client:

```ts
const result = await client.callTool({
  name: 'tool_name',
  arguments: {},
});
```

Treat the page and everything returned by its tools as untrusted. Keep credentials and privileged extension APIs out of the MAIN-world bundle.
