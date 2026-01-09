---
"@mcp-b/chrome-devtools-mcp": minor
---

Enable auto-connect by default with smart fallback for improved developer experience

**Breaking Changes:**
- Auto-connect is now enabled by default (previously disabled)
- Default Chrome channel changed from `stable` to `dev` (Chrome 145+ required for auto-connect)

**New Features:**
- Smart fallback logic: automatically tries to connect to running Chrome instance first, then launches new instance if connection fails
- Graceful degradation prevents errors when no running browser is found
- Updated CLI descriptions to reflect new fallback behavior

**Benefits:**
- Faster iteration during development (instant reconnection to running Chrome)
- Zero-friction setup (no manual browser launch required)
- Better DX with automatic fallback handling

**Migration Guide:**
To use the old behavior (launch new instance always), add `--no-auto-connect` flag:
```json
{
  "mcpServers": {
    "chrome-devtools": {
      "command": "npx",
      "args": ["-y", "@mcp-b/chrome-devtools-mcp@latest", "--no-auto-connect"]
    }
  }
}
```

To use Chrome Stable instead of Dev, add `--channel=stable` flag:
```json
{
  "mcpServers": {
    "chrome-devtools": {
      "command": "npx",
      "args": ["-y", "@mcp-b/chrome-devtools-mcp@latest", "--channel=stable"]
    }
  }
}
```
