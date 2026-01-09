# MCP Configuration Guide

This guide shows how to configure the Chrome DevTools MCP server in your MCP client.

## Basic Configuration (Recommended for WebMCP)

The simplest configuration that works out of the box:

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

### What This Does

With the default configuration above:

1. **Auto-connects to Chrome Dev** (if running with remote debugging enabled)
2. **Falls back to launching Chrome Dev** (if not running)
3. **Uses Chrome Dev v145+** (supports latest features including auto-connect)
4. **Includes WebMCP tools** for connecting to website MCP tools

### Default Behavior

```
┌─────────────────────────────────────────────────────────────┐
│  MCP Client starts Chrome DevTools MCP Server                │
└─────────────────┬───────────────────────────────────────────┘
                  │
                  ▼
    ┌─────────────────────────────┐
    │ Is Chrome Dev running with  │
    │ remote debugging enabled?   │
    └────────┬───────────┬────────┘
             │           │
         YES │           │ NO
             ▼           ▼
    ┌────────────┐   ┌──────────────────┐
    │  Connect   │   │  Launch new      │
    │  to it     │   │  Chrome Dev      │
    └────────────┘   └──────────────────┘
             │               │
             └───────┬───────┘
                     ▼
         ┌────────────────────────┐
         │  Browser ready to use  │
         └────────────────────────┘
```

---

## MCP Client Examples

### Claude Desktop

**Location:** `~/Library/Application Support/Claude/claude_desktop_config.json`

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

### Cursor

**Location:** Settings → MCP → New MCP Server

```json
{
  "command": "npx",
  "args": ["-y", "@mcp-b/chrome-devtools-mcp@latest"]
}
```

### VS Code Copilot

**Via CLI:**
```bash
code --add-mcp '{"name":"chrome-devtools","command":"npx","args":["-y","@mcp-b/chrome-devtools-mcp@latest"],"env":{}}'
```

---

## Advanced Configurations

### Disable Auto-Connect (Always Launch New Instance)

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

### Use Chrome Stable (v143, no auto-connect support)

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

### Connect to Specific Running Chrome Instance

If you manually start Chrome with remote debugging:
```bash
/Applications/Google\ Chrome\ Dev.app/Contents/MacOS/Google\ Chrome\ Dev \
  --remote-debugging-port=9222 \
  --user-data-dir=/tmp/chrome-debug
```

Then configure:
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

### Headless Mode with Isolated Profile

Great for CI/CD or automated testing:
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

### Custom Viewport Size

```json
{
  "mcpServers": {
    "chrome-devtools": {
      "command": "npx",
      "args": [
        "-y",
        "@mcp-b/chrome-devtools-mcp@latest",
        "--viewport=1920x1080"
      ]
    }
  }
}
```

---

## Comparison: Fork vs Upstream

| Configuration | Upstream Default | Fork Default |
|---------------|-----------------|--------------|
| Channel | `stable` (v143) | `dev` (v145) |
| Auto-connect | `false` | `true` |
| Fallback on fail | N/A | Launches new instance |
| WebMCP tools | No | Yes |

### Upstream Configuration (For Reference)

If you want the original upstream behavior:

```json
{
  "mcpServers": {
    "chrome-devtools": {
      "command": "npx",
      "args": [
        "-y",
        "chrome-devtools-mcp@latest",
        "--channel=stable",
        "--no-auto-connect"
      ]
    }
  }
}
```

---

## Troubleshooting

### Chrome Dev Not Found

**Error:** `Could not find Google Chrome executable for channel 'dev'`

**Solution:** Install Chrome Dev or use a different channel:
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

### Browser Already Running Error

**Error:** `The browser is already running for /Users/.../chrome-profile`

**Solution 1 - Use auto-connect (default):**
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

**Solution 2 - Use isolated profile:**
```json
{
  "mcpServers": {
    "chrome-devtools": {
      "command": "npx",
      "args": [
        "-y",
        "@mcp-b/chrome-devtools-mcp@latest",
        "--isolated"
      ]
    }
  }
}
```

### Auto-Connect Failing

**Error:** Auto-connect attempts but fails to connect

**Cause:** Chrome 145+ not installed or remote debugging not enabled

**Solution:** Fallback will automatically launch a new instance (default behavior)

---

## Environment Variables

Enable debug logging:
```json
{
  "mcpServers": {
    "chrome-devtools": {
      "command": "npx",
      "args": ["-y", "@mcp-b/chrome-devtools-mcp@latest"],
      "env": {
        "DEBUG": "mcp:*"
      }
    }
  }
}
```

---

## Quick Start for WebMCP Development

1. **Install the config** (Claude Desktop example):
   ```bash
   cat > ~/Library/Application\ Support/Claude/claude_desktop_config.json << 'JSON'
   {
     "mcpServers": {
       "chrome-devtools": {
         "command": "npx",
         "args": ["-y", "@mcp-b/chrome-devtools-mcp@latest"]
       }
     }
   }
   JSON
   ```

2. **Restart your MCP client** (e.g., Claude Desktop)

3. **Test it:**
   - Say: "Navigate to https://example.com"
   - Say: "Take a screenshot"
   - Say: "What tools are available on this website?" (WebMCP)

That's it! The server will automatically manage Chrome for you.
