# Chrome flags for the native WebMCP showcase

The showcase requires Chrome 152 or newer with the experimental WebMCP feature
enabled. Chrome's preview can change between releases. Check the
[WebMCP early preview post](https://developer.chrome.com/blog/webmcp-epp) and
[WebMCP specification](https://webmachinelearning.github.io/webmcp/) when the
browser surface changes.

Use the
[Model Context Tool Inspector](https://chromewebstore.google.com/detail/model-context-tool-inspec/gbpdfapgefenggkahomfgkhfehlcenpd)
to inspect the tools exposed by a page.

## Flags used by this repository

The Playwright native configurations launch Chrome with:

```text
--enable-experimental-web-platform-features
--enable-features=WebMCPTesting,DevToolsWebMCPSupport
```

`WebMCPTesting` is the current Chromium feature-flag name used by this test
environment. It does not make `navigator.modelContextTesting` part of the
current WebMCP contract. Native assertions use `document.modelContext`,
`getTools()`, and the feature-detectable descriptor-based `executeTool()`
extension.

## Launch Chrome manually

Start the showcase first:

```bash
pnpm --dir e2e/web-standards-showcase dev
```

Then launch Chrome with an isolated profile.

### macOS

```bash
"/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary" \
  --enable-experimental-web-platform-features \
  --enable-features=WebMCPTesting,DevToolsWebMCPSupport \
  --user-data-dir=/tmp/webmcp-native-showcase \
  http://localhost:5174
```

### Linux

```bash
google-chrome-unstable \
  --enable-experimental-web-platform-features \
  --enable-features=WebMCPTesting,DevToolsWebMCPSupport \
  --user-data-dir=/tmp/webmcp-native-showcase \
  http://localhost:5174
```

### Windows PowerShell

```powershell
& "$env:LOCALAPPDATA\Google\Chrome SxS\Application\chrome.exe" `
  --enable-experimental-web-platform-features `
  --enable-features=WebMCPTesting,DevToolsWebMCPSupport `
  --user-data-dir="$env:TEMP\webmcp-native-showcase" `
  http://localhost:5174
```

Use a test profile rather than your everyday Chrome profile. Do not add
`--no-sandbox` for local browsing.

## Run the Playwright lane

From `e2e/`:

```bash
pnpm test:native-showcase
```

The configuration searches these channels in order:

1. `PLAYWRIGHT_NATIVE_SHOWCASE_EXECUTABLE_PATH`
2. `CHROME_BIN`
3. Chrome Canary
4. Chrome Dev
5. Chrome Beta
6. Stable Chrome

It rejects binaries older than Chrome 152.

To choose a binary explicitly:

```bash
CHROME_BIN="/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary" \
  pnpm test:native-showcase
```

## Verify the active surface

Run this in the page console:

```javascript
const context = document.modelContext;

console.log({
  available: Boolean(context),
  registerTool: typeof context?.registerTool,
  getTools: typeof context?.getTools,
  toolchange: typeof context?.addEventListener,
  chromeExecuteToolExtension: typeof context?.executeTool,
  deprecatedNavigatorAlias: typeof navigator.modelContext,
  deprecatedTestingShim: typeof navigator.modelContextTesting,
});
```

For the current native lane:

- `document.modelContext` exists.
- `registerTool`, `getTools`, and `addEventListener` are functions.
- `executeTool` may be a function. Feature-detect it.
- Current Chrome does not expose the deprecated navigator alias.
- Native tests do not require `navigator.modelContextTesting`.

To inspect descriptors:

```javascript
const tools = await document.modelContext.getTools();
console.table(
  tools.map(({ name, description, origin, inputSchema }) => ({
    name,
    description,
    origin,
    inputSchema,
  }))
);
```

## Troubleshooting

### `document.modelContext` is missing

1. Check `chrome://version` and confirm Chrome is version 152 or newer.
2. Confirm both configured flags appear in the command line.
3. Close every process using the selected test profile, then relaunch Chrome.
4. Confirm the page does not import `@mcp-b/global` or another polyfill.

### The showcase reports a polyfill

The showcase treats `__isWebMCPPolyfill === true` as a polyfill marker. Remove
polyfill imports and retry with a clean profile.

```javascript
console.log(document.modelContext?.__isWebMCPPolyfill);
```

### `executeTool` is missing

`executeTool()` is an optional Chromium preview extension, not strict WebMCP
core. Registration and `getTools()` discovery should still work. The Playwright
execution assertion skips when the method is absent.

Do not fall back to `navigator.modelContextTesting.executeTool()` in native
coverage. That would test a removed compatibility surface.

### A tool cannot be removed by name

Current WebMCP has no `unregisterTool(name)` or `clearContext()` method. Retain
the `AbortController` passed during registration and abort it:

```javascript
const controller = new AbortController();
await document.modelContext.registerTool(tool, {
  signal: controller.signal,
});

controller.abort();
```

You can remove only registrations whose controllers you retained. No current
standard API clears arbitrary registrations owned by other code.

## Security

- Use an isolated profile for experimental testing.
- Keep Chrome's sandbox enabled.
- Do not use the experimental profile for regular browsing.
- Remove temporary profiles when testing finishes.
