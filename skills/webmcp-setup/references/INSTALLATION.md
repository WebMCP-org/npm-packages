# WebMCP Installation & Setup

**Note**: This guide provides basic setup instructions. For detailed API syntax and troubleshooting, always use: `mcp__docs__SearchWebMcpDocumentation("your specific question")`

## React Apps

### 1. Install Packages

```bash
pnpm add @mcp-b/react-webmcp @mcp-b/global zod
```

**What each package does**:
- `@mcp-b/react-webmcp`: React hooks for tool registration (`useWebMCP`)
- `@mcp-b/global`: Browser polyfill for `navigator.modelContext` API
- `zod`: Schema validation library for type-safe inputs

### 2. Add Global Bridge

Add this script tag to your `index.html` (in `public/` folder):

```html
<script src="https://unpkg.com/@mcp-b/global@latest/dist/index.global.js"></script>
```

**Or** install via npm and import at the top of your entry file:

```tsx
// src/main.tsx or src/index.tsx
import '@mcp-b/global';  // MUST be first import
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

ReactDOM.createRoot(document.getElementById('root')!).render(<App />);
```

### 3. Use the Hook

```tsx
'use client';  // For Next.js App Router

import { useWebMCP } from '@mcp-b/react-webmcp';
import { z } from 'zod';

function MyComponent() {
  useWebMCP({
    name: 'my_tool',
    description: 'Does something useful',
    inputSchema: {
      query: z.string().min(1)
    },
    handler: async ({ query }) => {
      const result = await doSomething(query);
      return { success: true, result };
    }
  });

  return <div>My Component</div>;
}
```

### Next.js Specific Notes

**App Router (Next.js 13+)**:
- All components with `useWebMCP` must have `'use client'` at the top
- Import `@mcp-b/global` in the client component (not in server components)

**Pages Router (Next.js 12)**:
- Works the same as regular React
- No special configuration needed

**For details**: `mcp__docs__SearchWebMcpDocumentation("Next.js setup")`

## Vue Apps

### 1. Install Packages

```bash
pnpm add @mcp-b/webmcp-ts-sdk @mcp-b/global zod
```

### 2. Add Global Bridge

In your `index.html`:

```html
<script src="https://unpkg.com/@mcp-b/global@latest/dist/index.global.js"></script>
```

### 3. Create a Composable

```typescript
// composables/useWebMCPTool.ts
import { onMounted, onUnmounted } from 'vue';

export function useWebMCPTool(config) {
  let registration = null;

  onMounted(() => {
    registration = navigator.modelContext.registerTool({
      name: config.name,
      description: config.description,
      inputSchema: config.inputSchema,
      async execute(args) {
        const result = await config.handler(args);
        return {
          content: [{ type: 'text', text: JSON.stringify(result) }]
        };
      }
    });
  });

  onUnmounted(() => {
    registration?.unregister();
  });
}
```

**For details**: `mcp__docs__SearchWebMcpDocumentation("Vue setup")`

## Vanilla JavaScript

### 1. Add Script Tag

No npm install needed! Just add this to your HTML:

```html
<!DOCTYPE html>
<html>
<head>
  <script src="https://unpkg.com/@mcp-b/global@latest/dist/index.global.js"></script>
</head>
<body>
  <div id="app">
    <h1>My App</h1>
    <button id="myButton">Click me</button>
  </div>

  <script>
    // Register a tool
    navigator.modelContext.registerTool({
      name: 'button_click',
      description: 'Click the button',
      inputSchema: {
        type: 'object',
        properties: {}
      },
      async execute() {
        document.getElementById('myButton').click();
        return {
          content: [{ type: 'text', text: 'Button clicked!' }]
        };
      }
    });

    // Your app logic
    document.getElementById('myButton').addEventListener('click', () => {
      console.log('Button was clicked');
    });
  </script>
</body>
</html>
```

**For details**: `mcp__docs__SearchWebMcpDocumentation("vanilla JavaScript setup")`

## Other Frameworks

### Angular

```bash
pnpm add @mcp-b/webmcp-ts-sdk @mcp-b/global zod
```

**For details**: `mcp__docs__SearchWebMcpDocumentation("Angular setup")`

### Svelte

```bash
pnpm add @mcp-b/webmcp-ts-sdk @mcp-b/global zod
```

**For details**: `mcp__docs__SearchWebMcpDocumentation("Svelte setup")`

### Backend Frameworks (Rails, Phoenix, Django, Laravel)

WebMCP works with any framework that generates HTML!

1. Add the `@mcp-b/global` script tag to your layout template
2. Register tools in your JavaScript files
3. Tools have access to your existing auth/session

**For details**:
- `mcp__docs__SearchWebMcpDocumentation("Rails setup")`
- `mcp__docs__SearchWebMcpDocumentation("Phoenix setup")`
- `mcp__docs__SearchWebMcpDocumentation("Django setup")`

## Verification

After installation, verify everything works:

### 1. Start Your Dev Server

```bash
npm run dev
# or
pnpm dev
```

### 2. Open Browser Console

Press F12 and type:

```javascript
navigator.modelContext
```

You should see the WebMCP API object (not `undefined`).

### 3. Check Registered Tools

If you've registered any tools, you can check:

```javascript
// This only works in development with debug mode enabled
console.log(window.__mcpBridge?.tools);
```

### 4. Use Chrome DevTools MCP

The real test - connect Chrome DevTools MCP and call your tools!

```bash
# From Chrome DevTools MCP:
1. Navigate to your app (http://localhost:3000)
2. Call: mcp__chrome-devtools__list_webmcp_tools
3. You should see your registered tools
4. Call one: mcp__chrome-devtools__call_webmcp_tool("your_tool_name", {})
```

## Common Issues

### "navigator.modelContext is undefined"

**Cause**: `@mcp-b/global` not loaded yet

**Fix**:
1. Ensure script tag is in `<head>` (loads first)
2. Or import `@mcp-b/global` at top of entry file
3. Wait for DOMContentLoaded before registering tools

### "useWebMCP is not a function"

**Cause**: Package not installed

**Fix**: `pnpm add @mcp-b/react-webmcp`

### Tools not appearing in Chrome DevTools MCP

**Causes**:
- Component with `useWebMCP` not mounted
- Tool registration failed (check console for errors)
- Extension not connected

**Fix**:
1. Check browser console for errors
2. Verify component is rendered
3. Check Chrome DevTools MCP connection status

### React "Cannot read properties of undefined (reading 'registerTool')"

**Cause**: Import order wrong

**Fix**: Import `@mcp-b/global` FIRST:

```tsx
// ✅ Correct
import '@mcp-b/global';
import { useWebMCP } from '@mcp-b/react-webmcp';

// ❌ Wrong
import { useWebMCP } from '@mcp-b/react-webmcp';
import '@mcp-b/global';
```

## Next Steps

After installation:

1. **Learn the patterns**: See [examples/COMMON_APPS.md](../examples/COMMON_APPS.md)
2. **Read advanced details**: See [references/ADVANCED_PATTERNS.md](ADVANCED_PATTERNS.md)
3. **Start building**: Begin with Phase 1 read-only tools
4. **Test everything**: Use Chrome DevTools MCP to dogfood each tool

## Getting Help

- **API questions**: `mcp__docs__SearchWebMcpDocumentation("your question")`
- **Installation issues**: `mcp__docs__SearchWebMcpDocumentation("troubleshooting setup")`
- **Framework-specific**: `mcp__docs__SearchWebMcpDocumentation("[framework] integration")`
