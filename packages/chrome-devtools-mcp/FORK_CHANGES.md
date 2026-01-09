# Fork Changes from Upstream

This document summarizes the changes made to the Chrome DevTools MCP fork for WebMCP dogfooding.

## Changes from Upstream (ChromeDevTools/chrome-devtools-mcp)

### 1. Default Channel: Chrome Dev (v145+)

**File:** `src/cli.ts` (line 196)

**Before (Upstream):**
```typescript
args.channel = 'stable';
```

**After (Fork):**
```typescript
args.channel = 'dev';
```

**Reason:** Chrome 145+ is required for auto-connect feature. Dev channel has v145 available now, while Stable is still on v143.

---

### 2. Auto-Connect Enabled by Default

**File:** `src/cli.ts` (lines 11-23)

**Before (Upstream):**
```typescript
autoConnect: {
  type: 'boolean',
  description: '...',
  default: false,  // ← Disabled by default
  // ...
}
```

**After (Fork):**
```typescript
autoConnect: {
  type: 'boolean',
  description: 'Falls back to launching a new instance if no running browser is found.',
  default: true,   // ← Enabled by default
  coerce: (value: boolean | undefined) => {
    if (value === false) {
      return false;
    }
    return true;
  },
}
```

**Reason:** Better DX for dogfooding - automatically connects to running Chrome Dev instance for faster iteration.

---

### 3. Smart Fallback Logic

**File:** `src/main.ts` (lines 60-132)

**Before (Upstream):**
```typescript
const browser =
  args.browserUrl || args.wsEndpoint || args.autoConnect
    ? await ensureBrowserConnected({...})
    : await ensureBrowserLaunched({...});
```

**After (Fork):**
```typescript
let browser: Awaited<ReturnType<typeof ensureBrowserConnected>>;

// If explicit browserUrl or wsEndpoint, connect without fallback
if (args.browserUrl || args.wsEndpoint) {
  browser = await ensureBrowserConnected({...});
}
// If autoConnect is true, try connecting first, then fall back to launching
else if (args.autoConnect) {
  try {
    logger('Attempting to connect to running browser instance...');
    browser = await ensureBrowserConnected({...});
    logger('Successfully connected to running browser instance');
  } catch (err) {
    logger('Failed to connect to running browser, launching new instance...', err);
    browser = await ensureBrowserLaunched({...});
  }
}
// Otherwise, just launch a new browser
else {
  browser = await ensureBrowserLaunched({...});
}
```

**Reason:** Graceful degradation - if no Chrome Dev running, automatically launches one instead of failing.

---

## MCP Client Configuration

### Default Configuration (Optimized for WebMCP Dogfooding)

```json
{
  "mcpServers": {
    "chrome-devtools": {
      "command": "npx",
      "args": ["-y", "@mcp-b/chrome-devtools-mcp@latest"]
    }
  }
}
```

**Default Behavior:**
- ✅ Auto-connects to running Chrome Dev (v145+)
- ✅ Falls back to launching new Chrome Dev if not running
- ✅ Uses Chrome Dev channel by default
- ✅ Includes WebMCP tools (`list_webmcp_tools`, `call_webmcp_tool`)

---

### Advanced Configuration Examples

#### 1. Force Launch New Instance (Disable Auto-Connect)
```json
{
  "mcpServers": {
    "chrome-devtools": {
      "command": "npx",
      "args": [
        "-y",
        "@mcp-b/chrome-devtools-mcp@latest",
        "--no-auto-connect"
      ]
    }
  }
}
```

#### 2. Use Chrome Stable Instead of Dev
```json
{
  "mcpServers": {
    "chrome-devtools": {
      "command": "npx",
      "args": [
        "-y",
        "@mcp-b/chrome-devtools-mcp@latest",
        "--channel=stable"
      ]
    }
  }
}
```

#### 3. Use Chrome Canary
```json
{
  "mcpServers": {
    "chrome-devtools": {
      "command": "npx",
      "args": [
        "-y",
        "@mcp-b/chrome-devtools-mcp@latest",
        "--channel=canary"
      ]
    }
  }
}
```

#### 4. Connect to Specific Browser URL
```json
{
  "mcpServers": {
    "chrome-devtools": {
      "command": "npx",
      "args": [
        "-y",
        "@mcp-b/chrome-devtools-mcp@latest",
        "--browserUrl=http://127.0.0.1:9222"
      ]
    }
  }
}
```

#### 5. Headless Mode with Isolated Profile
```json
{
  "mcpServers": {
    "chrome-devtools": {
      "command": "npx",
      "args": [
        "-y",
        "@mcp-b/chrome-devtools-mcp@latest",
        "--headless",
        "--isolated"
      ]
    }
  }
}
```

---

## Chrome Version Requirements

| Feature | Chrome Version Required | Status |
|---------|------------------------|--------|
| Basic browser automation | Any version | ✅ Available |
| Auto-connect feature | Chrome 145+ | ✅ Available in Dev |
| WebMCP integration | Any version | ✅ Available |

**Current Chrome Versions (as of Jan 2026):**
- Stable: v143 (❌ No auto-connect)
- Beta: v144 (❌ No auto-connect)
- Dev: v145 (✅ Auto-connect supported)
- Canary: v146+ (✅ Auto-connect supported)

---

## Testing

Run the test client:
```bash
cd packages/chrome-devtools-mcp
npx tsx test-client.ts
```

Test with different channels:
```bash
TEST_CHANNEL=stable npx tsx test-client.ts
TEST_CHANNEL=dev npx tsx test-client.ts
TEST_CHANNEL=canary npx tsx test-client.ts
```

---

## Feature Comparison: Fork vs Upstream

| Feature | Upstream | Fork (WebMCP) | Notes |
|---------|----------|---------------|-------|
| Default channel | `stable` | `dev` | Dev has Chrome 145+ |
| Auto-connect default | `false` | `true` | Faster iteration |
| Fallback on connect fail | ❌ No | ✅ Yes | Graceful degradation |
| WebMCP tools | ❌ No | ✅ Yes | `list_webmcp_tools`, `call_webmcp_tool` |
| Prompts | ❌ No | ✅ Yes | `webmcp-dev-workflow`, etc. |

---

## Benefits for WebMCP Dogfooding

1. **Fast Iteration:** Auto-connect to running Chrome Dev means instant reconnection
2. **No Manual Setup:** Fallback automatically launches Chrome if not running
3. **Latest Features:** Chrome Dev 145+ has newest DevTools Protocol features
4. **WebMCP Integration:** Native support for website MCP tools
5. **Developer Experience:** One-line config, zero friction
