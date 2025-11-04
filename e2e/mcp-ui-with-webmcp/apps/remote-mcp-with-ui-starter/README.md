# MCP UI + WebMCP Starter Template

A production-ready template for building **MCP (Model Context Protocol) servers with embedded web UIs** that can dynamically register tools back to the server using **WebMCP**.

This template demonstrates the powerful combination of:
- **MCP UI**: Serving interactive web applications as UI resources within AI assistants
- **WebMCP**: Embedded apps dynamically registering tools that AI can use
- **Cloudflare Workers**: Zero-config deployment with automatic scaling

## 🎯 What Makes This Special?

This is a **dual-direction integration**:

1. **MCP Server → UI**: The AI assistant can invoke tools that display interactive web applications
2. **UI → MCP Server**: The embedded web applications can register their own tools for the AI to use

### Example: Tic-Tac-Toe Game

When the AI calls `showTicTacToeGame`:
- The game UI appears in the AI assistant's side panel
- The game automatically registers 3 new tools: `tictactoe_get_state`, `tictactoe_ai_move`, `tictactoe_reset`
- The AI can now play the game by calling these dynamically registered tools
- All communication happens seamlessly through iframe postMessage

## 🚀 Quick Start

### Prerequisites

- **Node.js 22.12+**
- **pnpm** (or npm/yarn)
- **Cloudflare account** (for deployment)

### Installation

```bash
# Clone this template
cd remote-mcp-with-ui-starter

# Install dependencies
pnpm install
```

### Development

```bash
# Start local development server
pnpm dev
```

This starts:
- **Main app**: http://localhost:8888
- **MCP endpoint**: http://localhost:8888/mcp
- **SSE endpoint**: http://localhost:8888/sse
- **TicTacToe mini-app**: http://localhost:8888/mini-apps/tictactoe/

### Building

```bash
# Build for production (includes TypeScript compilation and Vite build)
pnpm build
```

This builds:
- The TicTacToe mini-app → `dist/client/mini-apps/tictactoe/`
- The main app → `dist/client/`
- The worker code → compiled TypeScript

### Deployment

```bash
# Deploy to Cloudflare Workers (production environment)
pnpm deploy
```

The deploy script automatically:
1. Builds the project
2. Loads variables from `.prod.vars`
3. Deploys to Cloudflare Workers

Your MCP server will be live at: `https://your-worker.workers.dev/mcp`

**⚠️ Remember**: Update the `APP_URL` in `.prod.vars` before your first deployment!

## 📦 What's Included

### 4 Example MCP Tools

1. **showExternalUrl** - Display any external website in an iframe
2. **showRawHtml** - Render raw HTML content directly
3. **showRemoteDom** - Execute JavaScript to build dynamic UIs
4. **showTicTacToeGame** - Interactive game with WebMCP integration ⭐

### 1 Example Prompt

- **PlayTicTacToe** - Pre-configured prompt to start a game

### Complete Mini-App Example

The TicTacToe game demonstrates:
- React component architecture
- WebMCP tool registration with `useWebMCP` hook
- Parent-child iframe communication
- State management and game logic
- Error boundaries and TypeScript types

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    AI Assistant                          │
│  ┌────────────────────────────────────────────────┐    │
│  │  MCP Client                                     │    │
│  │  - Calls: showTicTacToeGame                    │    │
│  │  - Receives: tictactoe_get_state,              │    │
│  │              tictactoe_ai_move, etc.           │    │
│  └────────────────────────────────────────────────┘    │
└──────────────────┬──────────────────┬───────────────────┘
                   │                  │
                   ↓ HTTP             ↓ UI Display
         ┌─────────────────────────────────────────┐
         │   Cloudflare Worker                     │
         │  ┌──────────────────────────────────┐   │
         │  │  MCP Server (Durable Object)     │   │
         │  │  - Tool: showExternalUrl         │   │
         │  │  - Tool: showRawHtml             │   │
         │  │  - Tool: showRemoteDom           │   │
         │  │  - Tool: showTicTacToeGame       │   │
         │  └──────────────────────────────────┘   │
         │                                          │
         │  ┌──────────────────────────────────┐   │
         │  │  Static Assets                   │   │
         │  │  /mini-apps/tictactoe/           │   │
         │  └──────────────────────────────────┘   │
         └────────────┬─────────────────────────────┘
                      │
                      ↓ Serves iframe
              ┌───────────────────────────┐
              │  TicTacToe Mini-App       │
              │  ┌─────────────────────┐  │
              │  │  WebMCP Client      │  │
              │  │  - Registers:       │  │
              │  │    tictactoe_*      │  │
              │  │    tools            │  │
              │  └─────────────────────┘  │
              └───────────────────────────┘
```

### Key Components

**worker/index.ts** - Entry point with routing and URL auto-detection
**worker/mcpServer.ts** - MCP server using `agents` library (McpAgent)
**src/** - Main React app (if you want a landing page)
**mini-apps/tictactoe/** - Self-contained mini-app with WebMCP integration

### How URL Configuration Works

The worker uses the `APP_URL` environment variable to construct iframe URLs:
- In development: `http://localhost:8888` (from `.dev.vars`)
- In production: `https://your-worker.workers.dev` (from `.prod.vars`)
- Custom domains: `https://your-domain.com` (configured in `.prod.vars`)

The deployment script (`deploy.sh`) automatically loads variables from `.prod.vars` and passes them to wrangler.

## 🛠️ Project Structure

```
remote-mcp-with-ui-starter/
├── src/                              # Main React app (optional landing page)
│   ├── TicTacToe.tsx                 # Pure TicTacToe component (reusable)
│   ├── TicTacToeWithWebMCP.tsx       # WebMCP integration wrapper
│   ├── ErrorBoundary.tsx             # Error handling
│   ├── main.tsx                      # Main app entry point
│   └── index.css                     # Global styles
│
├── mini-apps/                        # Self-contained mini-apps
│   └── tictactoe/
│       ├── index.html                # Mini-app HTML entry
│       └── main.tsx                  # Mini-app entry (imports from src/)
│
├── worker/                           # Cloudflare Worker code
│   ├── index.ts                      # Worker entry & routing
│   └── mcpServer.ts                  # MCP server implementation
│
├── public/                           # Static assets (gitignored after build)
│
├── dist/                             # Build output (gitignored)
│   └── client/                       # Client-side builds
│       ├── index.html                # Main app
│       └── mini-apps/tictactoe/      # TicTacToe build
│
├── .dev.vars                         # Development environment variables
├── .prod.vars                        # Production environment variables
├── deploy.sh                         # Deployment script
├── vite.config.ts                    # Multi-entry Vite config
├── wrangler.jsonc                    # Cloudflare Workers config
├── tsconfig.json                     # TypeScript project references
├── tsconfig.app.json                 # App TypeScript config
├── tsconfig.worker.json              # Worker TypeScript config
├── package.json                      # Dependencies & scripts
└── README.md                         # This file
```

## 🧩 Customization Guide

### Adding a New MCP Tool

Edit `worker/mcpServer.ts`:

```typescript
async init() {
  // ... existing tools ...

  this.server.tool(
    "myCustomTool",
    "Description of what this tool does",
    {
      // Optional: Define input schema using Zod or JSON Schema
      someParam: { type: "string" }
    },
    async (params) => {
      // Your tool logic here
      return {
        content: [{
          type: "text",
          text: "Tool executed successfully!"
        }]
      };
    }
  );
}
```

### Creating a New Mini-App with WebMCP

1. **Create a new mini-app directory**:
   ```bash
   mkdir -p mini-apps/my-app
   ```

2. **Add an entry point** (`mini-apps/my-app/main.tsx`):
   ```tsx
   import { StrictMode } from 'react'
   import { createRoot } from 'react-dom/client'
   import { initializeWebModelContext } from '@mcp-b/global';
   import { MyAppWithWebMCP } from './MyApp'

   // Initialize WebMCP transport
   initializeWebModelContext({
     transport: {
       tabServer: {
         allowedOrigins: ['*'],
         postMessageTarget: window.parent,
       },
     },
   });

   createRoot(document.getElementById('root')!).render(
     <StrictMode>
       <MyAppWithWebMCP />
     </StrictMode>,
   )
   ```

3. **Create your component with WebMCP**:
   ```tsx
   import { useWebMCP } from '@mcp-b/react-webmcp';

   export function MyAppWithWebMCP() {
     useWebMCP({
       name: "my_custom_tool",
       description: "Does something useful",
       schema: z.object({
         param: z.string()
       }),
       handler: async (params) => {
         // Your tool logic
         return {
           content: [{
             type: "text",
             text: `Processed: ${params.param}`
           }]
         };
       }
     });

     return <div>My App UI</div>;
   }
   ```

4. **Update vite.config.ts**:
   ```typescript
   build: {
     rollupOptions: {
       input: {
         main: resolve(__dirname, 'index.html'),
         tictactoe: resolve(__dirname, 'mini-apps/tictactoe/index.html'),
         myapp: resolve(__dirname, 'mini-apps/my-app/index.html'), // Add this
       },
     },
   },
   ```

5. **Add an MCP tool to display it** (`worker/mcpServer.ts`):
   ```typescript
   this.server.tool(
     "showMyApp",
     "Displays my custom app",
     {},
     async () => {
       const baseUrl = this.getBaseUrl();
       const iframeUrl = `${baseUrl}/mini-apps/my-app/`;

       const uiResource = createUIResource({
         uri: "ui://my-app",
         content: {
           type: "externalUrl",
           iframeUrl: iframeUrl,
         },
         encoding: "blob",
       });

       return {
         content: [uiResource],
       };
     }
   );
   ```

### Environment Configuration

This template uses `.dev.vars` and `.prod.vars` files for environment-specific configuration:

- **`.dev.vars`**: Development environment (loaded automatically by `wrangler dev`)
- **`.prod.vars`**: Production environment (loaded by deploy script)

Both files are committed to git since they don't contain secrets - just public URLs.

**⚠️ IMPORTANT: If you fork this template**, update the production URL in `.prod.vars`:

```env
# .prod.vars
APP_URL=https://your-worker-name.your-username.workers.dev
```

Replace with your actual Cloudflare Workers URL.

**Local Overrides**: You can create `.dev.vars.local` or `.prod.vars.local` for personal overrides (gitignored):
```env
APP_URL=http://localhost:3000
```

## 🔍 How It Works

### MCP UI Resources

MCP UI extends the Model Context Protocol to allow servers to return interactive UI components. There are three types:

1. **externalUrl**: Embeds an iframe with a URL (used for mini-apps)
2. **rawHtml**: Renders sanitized HTML directly
3. **remoteDom**: Executes JavaScript to build DOM elements

### WebMCP Dynamic Tool Registration

WebMCP allows iframes to register tools back to the MCP server:

```typescript
// In your mini-app component
const { registerTool } = useWebMCP();

registerTool({
  name: "my_tool",
  description: "What this tool does",
  schema: z.object({ /* params */ }),
  handler: async (params) => {
    // Tool implementation
    return { content: [{ type: "text", text: "Result" }] };
  }
});
```

The AI assistant can now call `my_tool` as if it were a regular MCP tool!

### Communication Flow

1. AI calls `showTicTacToeGame` → MCP server returns UI resource
2. AI assistant displays iframe with TicTacToe app
3. TicTacToe app initializes WebMCP transport (TabServer)
4. TicTacToe app registers tools via `useWebMCP`
5. AI receives tool registrations via postMessage
6. AI can now call `tictactoe_ai_move` etc.
7. Tool calls are routed to iframe via postMessage
8. Results are returned to AI

## 📚 Additional Documentation

- **[ARCHITECTURE.md](./ARCHITECTURE.md)** - Detailed architecture and design decisions
- **[Inline code comments](./worker/mcpServer.ts)** - Every file is thoroughly documented

## 🐛 Troubleshooting

### TypeScript Errors

```bash
# Run type checking across all configs
pnpm exec tsc -b
```

### Build Failures

```bash
# Clean build and rebuild
rm -rf dist/ node_modules/.vite/
pnpm build
```

### Mini-Apps Not Loading

1. Check build output: `ls -la dist/client/mini-apps/tictactoe/`
2. Verify vite.config.ts has correct input paths
3. Check browser console for CORS errors
4. Ensure iframe URL matches the build output path

### Tools Not Registering (WebMCP)

1. Check that `initializeWebModelContext` is called before React renders
2. Verify `postMessageTarget` is `window.parent`
3. Check browser console for WebMCP errors
4. Ensure the parent window is ready (handle `parent-ready` message)

### URL Issues (Development vs Production)

The template auto-detects URLs based on the request origin. If you're having issues:

1. Check the worker logs: `wrangler tail`
2. Verify `env.APP_URL` is set correctly
3. Override with environment variable if needed

### Durable Objects Errors

```bash
# Regenerate types
pnpm cf-typegen

# Check wrangler configuration
cat wrangler.jsonc
```

## 📖 Learn More

### MCP Resources
- [Model Context Protocol](https://modelcontextprotocol.io/)
- [MCP Specification](https://spec.modelcontextprotocol.io/)
- [MCP UI Extensions](https://github.com/mcp-ui)

### WebMCP Resources
- [@mcp-b/global](../../global/README.md) - WebMCP polyfill
- [@mcp-b/react-webmcp](../../react-webmcp/README.md) - React hooks
- [@mcp-b/transports](../../transports/README.md) - Transport implementations

### Cloudflare Resources
- [Cloudflare Workers](https://developers.cloudflare.com/workers/)
- [Durable Objects](https://developers.cloudflare.com/durable-objects/)
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/)

### Libraries Used
- [agents](https://github.com/cloudflare/mcp-server-cloudflare/) - McpAgent base class
- [Vite](https://vitejs.dev/) - Build tool
- [React](https://react.dev/) - UI framework

## 🤝 Contributing

This template is part of the [WebMCP-org monorepo](https://github.com/WebMCP-org/npm-packages).

## 📄 License

MIT - See the repository root for license information.

---

**Ready to build your own MCP UI + WebMCP application?** Start customizing this template! 🚀
