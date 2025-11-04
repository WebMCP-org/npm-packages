# Route Map

This document shows all available routes in the MCP UI + WebMCP multi-app platform.

## 🌐 Application Routes

### Landing Page
- **URL**: `/`
- **Description**: Main landing page listing all available mini-apps
- **Source**: `apps/landing/`
- **Type**: React SPA (no WebMCP)

### TicTacToe Game
- **URL**: `/apps/tictactoe/`
- **Description**: Interactive Tic-Tac-Toe game with WebMCP tool registration
- **Source**: `apps/tictactoe/`
- **Type**: React SPA with WebMCP integration
- **Registered Tools**:
  - `tictactoe_get_state` - Get current board state
  - `tictactoe_ai_move` - Make a move as AI player
  - `tictactoe_reset` - Reset the game

### Add Your App Here
- **URL**: `/apps/your-app/`
- **Description**: Copy `apps/_template/` to create new apps
- **Source**: `apps/your-app/`
- **Type**: React SPA (with optional WebMCP)

---

## 🔌 API Routes

### MCP Protocol Endpoint
- **URL**: `/mcp`
- **Method**: POST
- **Description**: Model Context Protocol endpoint for AI assistant integration
- **Handler**: Durable Object (`worker/mcpServer.ts`)
- **Features**:
  - Tool registration
  - Prompt definitions
  - UI resource creation

### Server-Sent Events
- **URL**: `/sse/*`
- **Methods**: GET, POST, OPTIONS
- **Description**: Real-time event streaming for MCP protocol
- **Handler**: SSE transport in Durable Object

---

## 🛠️ MCP Tools (Available after connecting to `/mcp`)

### Built-in Tools

#### `showExternalUrl`
- **Description**: Display an external URL in iframe (example: example.com)
- **Returns**: UI resource with external website

#### `showRawHtml`
- **Description**: Render raw HTML content directly
- **Returns**: UI resource with HTML string

#### `showRemoteDom`
- **Description**: Execute JavaScript that builds DOM dynamically
- **Returns**: UI resource with remote DOM script

#### `showTicTacToeGame`
- **Description**: Launch the TicTacToe game UI
- **Returns**: UI resource pointing to `/apps/tictactoe/`
- **Side Effects**: Registers 3 additional WebMCP tools from the game

### Dynamic Tools (WebMCP - registered after game loads)

#### `tictactoe_get_state`
- **Description**: Get current Tic-Tac-Toe state
- **Parameters**: None
- **Returns**: Markdown with board state, player roles, available moves

#### `tictactoe_ai_move`
- **Description**: Make a move as the AI player (O)
- **Parameters**:
  - `position` (0-8): Cell position to place move
- **Returns**: Markdown with move result and updated board

#### `tictactoe_reset`
- **Description**: Reset the board and start a new game
- **Parameters**: None
- **Returns**: Markdown confirming reset

---

## 📁 File Structure → URL Mapping

```
apps/
├── landing/          → /
│   └── index.html
├── tictactoe/        → /apps/tictactoe/
│   └── index.html
└── your-app/         → /apps/your-app/
    └── index.html
```

---

## 🚀 Route Examples

### Development URLs (local)
```
http://localhost:8888/                    # Landing page
http://localhost:8888/apps/tictactoe/     # TicTacToe game
http://localhost:8888/mcp                 # MCP protocol
http://localhost:8888/sse                 # SSE endpoint
```

### Production URLs (deployed)
```
https://your-worker.workers.dev/                    # Landing page
https://your-worker.workers.dev/apps/tictactoe/     # TicTacToe game
https://your-worker.workers.dev/mcp                 # MCP protocol
https://your-worker.workers.dev/sse                 # SSE endpoint
```

---

## ➕ Adding New Routes

To add a new app at `/apps/myapp/`:

1. **Create app directory**:
   ```bash
   cp -r apps/_template apps/myapp
   ```

2. **Update Vite config** (`vite.config.ts`):
   ```typescript
   input: {
     main: resolve(__dirname, 'apps/landing/index.html'),
     tictactoe: resolve(__dirname, 'apps/tictactoe/index.html'),
     myapp: resolve(__dirname, 'apps/myapp/index.html'), // Add this
   }
   ```

3. **Update landing page** (`apps/landing/App.tsx`):
   ```tsx
   <a href="/apps/myapp/" className="app-card">
     <h3>My App</h3>
     <p>Description</p>
   </a>
   ```

4. **Build and test**:
   ```bash
   pnpm dev
   # Visit: http://localhost:8888/apps/myapp/
   ```

---

## 🎯 Route Priority (Hono Middleware Order)

1. **POST `/mcp`** → MCP protocol handler
2. **ALL `/sse/*`** → SSE handler
3. **GET `*`** → Static files (Vite dev server in dev, Cloudflare Assets in prod)

In development, the `@cloudflare/vite-plugin` intercepts all static requests and serves them from Vite's dev server with HMR support.

---

## 🔍 Debugging Routes

### Check what routes are registered:
```bash
# In development
pnpm dev
# Server starts on http://localhost:8888

# Test routes:
curl http://localhost:8888/                    # Should return landing page HTML
curl http://localhost:8888/apps/tictactoe/     # Should return TicTacToe HTML
curl -X POST http://localhost:8888/mcp         # Should return MCP response
```

### View Worker logs:
```bash
wrangler tail
```

---

## 📊 Route Performance

| Route | Type | Load Time | Cache |
|-------|------|-----------|-------|
| `/` | Static HTML | ~50ms | Yes |
| `/apps/tictactoe/` | Static HTML | ~50ms | Yes |
| `/mcp` | Durable Object | ~100ms | No |
| `/sse` | SSE Stream | ~10ms | No |

All static assets are cached by Cloudflare's CDN for optimal performance.
