---
name: webmcp-setup
version: 1.0.0
description: Set up WebMCP - browser-native Model Context Protocol integration for web applications. Use when the user wants to add MCP tools to their website, enable browser automation capabilities, integrate with React hooks, or make their web app AI-accessible.
allowed-tools:
  - Read
  - Write
  - Bash
  - Glob
  - Grep
---

# WebMCP Setup Assistant

Guides you through integrating WebMCP (Model Context Protocol for Web) into web applications across different frameworks and setups.

## Quick Reference

| Task | Command/Action | Where |
|------|---------------|-------|
| **Add to vanilla HTML** | Ask: "Add WebMCP to my HTML page" | This skill adds IIFE script |
| **Add to React app** | Ask: "Set up WebMCP with React hooks" | This skill installs `@mcp-b/react-webmcp` |
| **Add to Vue app** | Ask: "Add WebMCP to my Vue app" | This skill installs `@mcp-b/webmcp-ts-sdk` |
| **Add to Next.js** | Ask: "Set up WebMCP in Next.js" | This skill configures SDK |
| **Verify setup** | Look for "MCP server ready" message | Browser console |
| **Test tools** | Use Chrome in Chrome MCP to call tools | Testing |

## Success Criteria

After setup, you should see:

✅ **WebMCP loads successfully**
- No console errors
- MCP server initializes

✅ **Tools are registered**
- Check available tools via MCP client
- Tools appear in Chrome DevTools MCP or other MCP clients

✅ **Tools respond correctly**
- Can call tools and get responses
- Tool schemas are properly defined

If any check fails, see [Troubleshooting](references/TROUBLESHOOTING.md).

## What is WebMCP?

**WebMCP** is a browser-native implementation of the Model Context Protocol that allows:
- **MCP Tools** - Expose web app functionality to AI agents
- **Browser Transport** - postMessage-based communication (no server needed)
- **React Integration** - `useWebMCP` hook for declarative tool registration
- **TypeScript SDK** - Full type safety and Zod validation

## Prerequisites

### Required
- Modern browser (Chrome 90+, Firefox 88+, Safari 14+)
- Node.js 16+ (for package installation)
- npm, yarn, or pnpm

### Framework-Specific
- **React**: React 17+ (React 19 recommended)
- **Vue**: Vue 3+
- **Next.js**: Next.js 13+ (App Router or Pages Router)
- **Vanilla**: No additional requirements

## Setup Workflow

**CRITICAL - Detect Framework First:**
Before starting, I'll analyze the project to determine which framework/setup to use.

### Step 1: Analyze Project Structure

I'll check for:
- `package.json` - Detect framework from dependencies
- Build config - Vite, Webpack, Next.js config
- File extensions - `.tsx`, `.jsx`, `.vue`
- Directory structure - `src/`, `app/`, `pages/`

### Step 2: Choose Integration Method

Based on the analysis, I'll use one of these approaches:

#### A. React + Hooks (`@mcp-b/react-webmcp`)

**When to use:**
- React 17, 18, or 19 project
- Want declarative hook API
- Need automatic tool re-registration with deps

**What I'll do:**
1. Install `@mcp-b/react-webmcp` and `@mcp-b/global`
2. Add `<script>` tag for `@mcp-b/global` IIFE in HTML
3. Show `useWebMCP` hook examples
4. Create demo component

**Example:**
```tsx
import { useWebMCP } from '@mcp-b/react-webmcp';

function MyComponent() {
  const [count, setCount] = useState(0);

  useWebMCP({
    name: 'get_count',
    description: `Get current count: ${count}`,
    handler: async () => ({ count })
  }, [count]);

  return <button onClick={() => setCount(c => c + 1)}>Count: {count}</button>;
}
```

#### B. TypeScript SDK (`@mcp-b/webmcp-ts-sdk`)

**When to use:**
- Vue, Svelte, Angular, or other framework
- TypeScript project
- Want imperative API with full control

**What I'll do:**
1. Install `@mcp-b/webmcp-ts-sdk` and `@mcp-b/global`
2. Add `<script>` tag for `@mcp-b/global` IIFE in HTML
3. Show SDK initialization and tool registration
4. Create demo service/composable

**Example:**
```typescript
import { createWebMCPClient } from '@mcp-b/webmcp-ts-sdk';

const client = await createWebMCPClient();

client.registerTool({
  name: 'get_status',
  description: 'Get application status',
  inputSchema: { type: 'object', properties: {} },
  handler: async () => {
    return { status: 'running', version: '1.0.0' };
  }
});
```

#### C. Vanilla HTML (IIFE only)

**When to use:**
- No build system
- Static HTML files
- Minimal dependencies

**What I'll do:**
1. Add `<script>` tag for `@mcp-b/global` IIFE from CDN
2. Show vanilla JavaScript tool registration
3. Create standalone demo HTML file

**Example:**
```html
<script src="https://unpkg.com/@mcp-b/global@latest/dist/index.global.js"></script>
<script>
  window.webMCP.registerTool({
    name: 'submit_form',
    description: 'Submit the contact form',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        email: { type: 'string' }
      },
      required: ['name', 'email']
    },
    handler: async (args) => {
      document.getElementById('name').value = args.name;
      document.getElementById('email').value = args.email;
      document.querySelector('form').submit();
      return { success: true };
    }
  });
</script>
```

### Step 3: Add Global Bridge Script

**All setups require this:**

Add the `@mcp-b/global` IIFE script to your HTML (usually in `index.html` or layout):

```html
<!-- Add before closing </body> tag -->
<script src="https://unpkg.com/@mcp-b/global@latest/dist/index.global.js"></script>
```

Or use a specific version:
```html
<script src="https://unpkg.com/@mcp-b/global@1.2.0/dist/index.global.js"></script>
```

**What it does:**
- Sets up postMessage bridge between page and MCP clients
- Exposes `window.webMCP` global
- Enables Chrome DevTools MCP and other MCP clients to connect

### Step 4: Register Tools

I'll help you create tools based on your app's functionality:

**Common tool patterns:**
- **UI Actions** - Click buttons, fill forms, navigate
- **Data Access** - Read app state, query data
- **Mutations** - Update state, trigger actions
- **Queries** - Search, filter, aggregate

See [Tool Patterns](references/TOOL_PATTERNS.md) for detailed examples.

### Step 5: Verify Setup

**Testing approaches:**

1. **Browser Console**
   - Check for initialization messages
   - Verify no errors

2. **Chrome DevTools MCP** (Recommended)
   - Connect to page
   - List available tools
   - Call tools and verify responses

3. **Manual Testing**
   - Use MCP inspector tool
   - Test each tool individually

## Framework-Specific Guides

- [React Setup](references/REACT_SETUP.md) - Detailed React + hooks guide
- [Vue Setup](references/VUE_SETUP.md) - Vue 3 + Composition API
- [Next.js Setup](references/NEXTJS_SETUP.md) - App Router and Pages Router
- [Vanilla Setup](references/VANILLA_SETUP.md) - Plain HTML/JavaScript
- [Angular Setup](references/ANGULAR_SETUP.md) - Angular service integration
- [Svelte Setup](references/SVELTE_SETUP.md) - Svelte stores + actions

## WebMCP Packages Overview

| Package | Purpose | When to Use |
|---------|---------|-------------|
| `@mcp-b/global` | Global bridge (IIFE) | **Always required** - Add script tag to HTML |
| `@mcp-b/react-webmcp` | React hooks | React apps wanting declarative API |
| `@mcp-b/webmcp-ts-sdk` | TypeScript SDK | Non-React frameworks or imperative control |
| `@mcp-b/transports` | Low-level transports | Building custom integrations (advanced) |

## Tool Registration Best Practices

### 1. Use Descriptive Names
```typescript
// Good
name: 'user_profile_update'

// Bad
name: 'update'
```

### 2. Include Current State in Descriptions
```typescript
// Good - helps AI understand current state
description: `Update user profile. Current name: ${user.name}`

// Bad - static description
description: 'Update user profile'
```

### 3. Use Zod Schemas for Type Safety (React)
```typescript
const outputSchema = useMemo(() => ({
  success: z.boolean(),
  user: z.object({
    id: z.string(),
    name: z.string(),
    email: z.string().email()
  })
}), []);

useWebMCP({
  name: 'get_user',
  outputSchema,
  handler: async () => ({ success: true, user: currentUser })
});
```

### 4. Handle Errors Gracefully
```typescript
handler: async (args) => {
  try {
    const result = await updateUser(args);
    return { success: true, data: result };
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
}
```

### 5. Use Deps Array (React)
```typescript
// Re-register when count changes
useWebMCP({
  name: 'get_count',
  description: `Current count: ${count}`,
  handler: async () => ({ count })
}, [count]); // <-- deps array
```

## Troubleshooting

See [TROUBLESHOOTING.md](references/TROUBLESHOOTING.md) for:
- Common setup issues
- Browser compatibility
- CORS and security
- Performance optimization
- Debugging tools

## Advanced Topics

- [Custom Transports](references/CUSTOM_TRANSPORTS.md) - Build your own transport
- [Security Best Practices](references/SECURITY.md) - Secure tool registration
- [Performance Optimization](references/PERFORMANCE.md) - Minimize re-renders
- [Testing WebMCP Tools](references/TESTING.md) - Unit and integration tests
- [Production Deployment](references/PRODUCTION.md) - Deploy considerations

## Examples

### Minimal React Example

```tsx
import { useWebMCP } from '@mcp-b/react-webmcp';
import { useState } from 'react';

function App() {
  const [message, setMessage] = useState('Hello');

  useWebMCP({
    name: 'set_message',
    description: 'Set the displayed message',
    inputSchema: useMemo(() => ({
      message: z.string().min(1).describe('New message to display')
    }), []),
    handler: async ({ message }) => {
      setMessage(message);
      return { success: true };
    }
  });

  return <h1>{message}</h1>;
}
```

### Minimal Vanilla Example

```html
<!DOCTYPE html>
<html>
<head>
  <title>WebMCP Demo</title>
</head>
<body>
  <h1 id="message">Hello</h1>

  <script src="https://unpkg.com/@mcp-b/global@latest/dist/index.global.js"></script>
  <script>
    window.webMCP.registerTool({
      name: 'set_message',
      description: 'Set the displayed message',
      inputSchema: {
        type: 'object',
        properties: {
          message: { type: 'string', description: 'New message' }
        },
        required: ['message']
      },
      handler: async (args) => {
        document.getElementById('message').textContent = args.message;
        return { success: true };
      }
    });
  </script>
</body>
</html>
```

## Next Steps

After setup is complete:
1. Test your tools with Chrome DevTools MCP
2. Add more tools for your app's functionality
3. Review [Tool Patterns](references/TOOL_PATTERNS.md) for ideas
4. Consider security implications in [SECURITY.md](references/SECURITY.md)

## Links

- **WebMCP Documentation**: https://docs.mcp-b.ai
- **NPM Packages**: https://www.npmjs.com/org/mcp-b
- **GitHub**: https://github.com/WebMCP-org/npm-packages
- **Model Context Protocol**: https://modelcontextprotocol.io
