# Adding New Mini-Apps

This guide explains how to add a new mini-app to the MCP UI + WebMCP Starter platform.

## Overview

The platform uses a multi-entry Vite build system where each mini-app is:
- **Independent**: Has its own entry point and can be developed separately
- **Shareable**: Can import shared components from `@shared/`
- **Routable**: Accessible at a unique URL path (e.g., `/apps/calculator/`)
- **MCP-enabled**: Can register WebMCP tools for AI integration

## Quick Start

### 1. Create App Directory Structure

```bash
mkdir -p apps/your-app
cd apps/your-app
```

Your app needs at minimum:
- `index.html` - HTML entry point
- `main.tsx` - TypeScript/React entry point
- App components (e.g., `App.tsx`)

### 2. Use the Boilerplate Template

Copy from the template:

```bash
cp -r apps/_template/* apps/your-app/
```

Or create files manually (see File Templates section below).

### 3. Register App in Vite Config

Edit `vite.config.ts` and add your app to the `input` object:

```typescript
build: {
  rollupOptions: {
    input: {
      main: resolve(__dirname, 'apps/landing/index.html'),
      tictactoe: resolve(__dirname, 'apps/tictactoe/index.html'),
      youra pp: resolve(__dirname, 'apps/your-app/index.html'), // Add this
    },
  },
},
```

### 4. Build and Test

```bash
# Development mode (with HMR)
pnpm dev
# Visit: http://localhost:8888/apps/your-app/

# Production build
pnpm build
pnpm preview
```

### 5. Update Landing Page

Add a link to your app in `apps/landing/App.tsx`:

```tsx
<a href="/apps/your-app/" className="app-card">
  <div className="app-icon">🎯</div>
  <h3 className="app-name">Your App</h3>
  <p className="app-description">
    Description of what your app does.
  </p>
</a>
```

## File Templates

### `apps/your-app/index.html`

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Your App - MCP UI</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/apps/your-app/main.tsx"></script>
  </body>
</html>
```

**Important**: The script `src` path must match the app directory structure.

### `apps/your-app/main.tsx`

```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@shared/styles/index.css';
import { ErrorBoundary } from '@shared/components/ErrorBoundary';
import { App } from './App';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>
);
```

### `apps/your-app/App.tsx` (Basic)

```tsx
export function App() {
  return (
    <div style={{ padding: '2rem' }}>
      <h1>Your App</h1>
      <p>Welcome to your new mini-app!</p>
    </div>
  );
}
```

### `apps/your-app/App.tsx` (With WebMCP)

If your app needs to register tools for AI integration:

```tsx
import { initializeWebModelContext } from '@mcp-b/global';
import { useWebMCP } from '@mcp-b/react-webmcp';
import { z } from 'zod';

// Initialize WebMCP (only if using tools)
initializeWebModelContext({
  transport: {
    tabServer: {
      allowedOrigins: ['*'],
    },
  },
});

export function App() {
  // Register a tool
  useWebMCP({
    name: 'your_app_action',
    description: 'Performs an action in your app',
    inputSchema: {
      value: z.string().describe('Input value'),
    },
    handler: async ({ value }) => {
      // Handle tool execution
      return `Processed: ${value}`;
    },
  });

  return (
    <div style={{ padding: '2rem' }}>
      <h1>Your App with WebMCP</h1>
      <p>This app exposes AI tools!</p>
    </div>
  );
}
```

**Note**: Move `initializeWebModelContext` to `main.tsx` if you have multiple components using WebMCP.

## Using Shared Components

Import from the `@shared` alias:

```tsx
import { ErrorBoundary } from '@shared/components/ErrorBoundary';
import { TicTacToe } from '@shared/components/TicTacToe';
import '@shared/styles/index.css';
```

### Available Shared Components

- `@shared/components/ErrorBoundary` - Error boundary wrapper
- `@shared/components/TicTacToe` - Reusable TicTacToe game component
- `@shared/styles/index.css` - Base CSS reset and styles

### Adding New Shared Components

Create in `apps/shared/components/`:

```tsx
// apps/shared/components/Button.tsx
export function Button({ children, onClick }) {
  return <button onClick={onClick}>{children}</button>;
}
```

Use in your app:

```tsx
import { Button } from '@shared/components/Button';
```

## Routing

### Development URLs

When running `pnpm dev`:
- Landing: `http://localhost:8888/`
- Your app: `http://localhost:8888/apps/your-app/`

### Production URLs

After deployment:
- Landing: `https://your-worker.workers.dev/`
- Your app: `https://your-worker.workers.dev/apps/your-app/`

### How Routing Works

1. **Vite Build**: Creates separate bundles for each app
2. **Hono Router**: Routes requests to the correct static files
3. **Cloudflare Workers**: Serves files from `/dist/client/`

```
Request: /apps/your-app/
  ↓
Worker (Hono) → serveStatic
  ↓
Serves: dist/client/apps/your-app/index.html
  ↓
Browser loads: dist/client/apps/your-app/assets/*.js
```

## WebMCP Integration

### When to Use WebMCP

Use WebMCP if your app needs to:
- Expose tools that AI assistants can call
- Communicate with parent windows (iframe embedding)
- Register dynamic capabilities at runtime

### Tool Registration Pattern

```tsx
import { useWebMCP } from '@mcp-b/react-webmcp';
import { z } from 'zod';

function YourComponent() {
  useWebMCP({
    name: 'tool_name',
    description: 'What this tool does',
    inputSchema: {
      param: z.string().describe('Parameter description'),
    },
    annotations: {
      readOnlyHint: true,      // Tool doesn't modify state
      idempotentHint: true,    // Same input = same output
      destructiveHint: false,  // Doesn't delete data
    },
    handler: async ({ param }) => {
      // Tool logic here
      return 'Result as markdown string';
    },
  });

  return <div>Your UI</div>;
}
```

### Parent-Child Communication

For apps embedded in iframes:

```tsx
useEffect(() => {
  // Send message to parent
  window.parent.postMessage({
    type: 'notify',
    payload: { message: 'Hello from iframe!' }
  }, '*');

  // Listen for parent messages
  const handleMessage = (event: MessageEvent) => {
    if (event.data.type === 'parent-ready') {
      console.log('Parent is ready!');
    }
  };

  window.addEventListener('message', handleMessage);
  return () => window.removeEventListener('message', handleMessage);
}, []);
```

## Build Output Structure

After `pnpm build`, your app will be in:

```
dist/client/
├── index.html                    # Landing page
├── assets/
│   ├── main-[hash].js           # Landing bundle
│   └── chunks/
│       └── vendor-react-[hash].js  # Shared React
└── apps/
    └── your-app/
        ├── index.html           # Your app entry
        └── assets/
            └── your-app-[hash].js  # Your app bundle
```

### Code Splitting

Vite automatically:
- **Splits vendor code**: React, ReactDOM → shared `vendor-*.js`
- **Splits shared imports**: Shared components → separate chunks
- **Hash filenames**: For cache busting

## Testing Checklist

Before deploying your new app:

- [ ] App loads at `/apps/your-app/` in dev mode
- [ ] No TypeScript errors (`pnpm typecheck`)
- [ ] Build succeeds (`pnpm build`)
- [ ] Production build works (`pnpm preview`)
- [ ] WebMCP tools register correctly (if applicable)
- [ ] Shared components work
- [ ] Error boundary catches errors
- [ ] Mobile responsive

## Common Issues

### Issue: Import path not found

**Error**: `Cannot find module '@shared/components/Button'`

**Solution**: Check `tsconfig.app.json` has paths configured:

```json
{
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "@shared/*": ["apps/shared/*"]
    }
  }
}
```

### Issue: App not accessible in production

**Error**: 404 when visiting `/apps/your-app/`

**Solution**: Ensure Hono routing includes your app path in `worker/index.ts`.

### Issue: HMR not working

**Error**: Changes don't reload

**Solution**: Restart dev server (`pnpm dev`). Check Vite config includes your app.

### Issue: Build fails with "Input not found"

**Error**: `Could not resolve './apps/your-app/index.html'`

**Solution**: Verify path in `vite.config.ts` uses `resolve(__dirname, '...')`.

## Example Apps

Study these examples:

- **apps/landing/** - Simple React app without WebMCP
- **apps/tictactoe/** - Complex app with WebMCP, state management, and iframe communication
- **apps/_template/** - Boilerplate to copy from

## Advanced: Custom Build Configuration

### Per-App Vite Config

For advanced cases, you can customize build options per app:

```typescript
// vite.config.ts
build: {
  rollupOptions: {
    input: {
      main: resolve(__dirname, 'apps/landing/index.html'),
      yourapp: resolve(__dirname, 'apps/your-app/index.html'),
    },
    output: {
      // Custom chunk naming
      chunkFileNames: (chunkInfo) => {
        if (chunkInfo.name.includes('your-app')) {
          return 'apps/your-app/chunks/[name]-[hash].js';
        }
        return 'assets/chunks/[name]-[hash].js';
      },
    },
  },
},
```

### Environment Variables

Access Cloudflare env vars:

```tsx
// In your app
const apiKey = import.meta.env.VITE_API_KEY;
```

Set in `.env`:

```
VITE_API_KEY=your-key-here
```

## Deployment

Deploy all apps together:

```bash
# Build all apps
pnpm build

# Deploy to Cloudflare
pnpm deploy
```

Your apps will be available at:
- `https://your-worker.workers.dev/`
- `https://your-worker.workers.dev/apps/your-app/`

## Next Steps

- Read [ARCHITECTURE.md](./ARCHITECTURE.md) for technical details
- Check [README.md](./README.md) for deployment instructions
- Study [apps/tictactoe/](./apps/tictactoe/) for WebMCP patterns

## Support

If you encounter issues:
1. Check this guide
2. Review example apps
3. Check TypeScript/Vite errors
4. Verify file paths match conventions
