# Architecture Documentation

This document provides a deep dive into the technical architecture of the MCP UI + WebMCP starter template.

## Table of Contents

- [Overview](#overview)
- [System Architecture](#system-architecture)
- [Component Details](#component-details)
- [Communication Protocols](#communication-protocols)
- [Build System](#build-system)
- [Runtime Behavior](#runtime-behavior)
- [Design Decisions](#design-decisions)

## Overview

This template combines three powerful technologies:

1. **MCP (Model Context Protocol)**: A standardized protocol for AI assistants to interact with external services
2. **MCP UI**: An extension to MCP that allows servers to return interactive UI components
3. **WebMCP**: A browser-based protocol that allows embedded web apps to register tools back to the MCP server

The result is a **bidirectional integration** where:
- AI assistants can display interactive web UIs
- Those UIs can dynamically register tools for the AI to use

## System Architecture

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         AI Assistant                             │
│  ┌───────────────────────────────────────────────────────┐     │
│  │  MCP Client                                            │     │
│  │  - Connects to MCP server via HTTP/SSE                │     │
│  │  - Calls tools (showTicTacToeGame)                    │     │
│  │  - Receives UI resources (iframe URL)                 │     │
│  │  - Dynamically receives new tools from WebMCP         │     │
│  └───────────────────────────────────────────────────────┘     │
│                                                                  │
│  ┌───────────────────────────────────────────────────────┐     │
│  │  UI Panel                                              │     │
│  │  - Renders iframe with TicTacToe mini-app             │     │
│  │  - Acts as WebMCP proxy (forwards tool calls)         │     │
│  └───────────────────────────────────────────────────────┘     │
└─────────────────────────────────────────────────────────────────┘
                              ↓ ↑
                              HTTP/SSE
                              ↓ ↑
┌─────────────────────────────────────────────────────────────────┐
│                    Cloudflare Worker                             │
│                                                                   │
│  ┌───────────────────────────────────────────────────────┐     │
│  │  Worker Entry Point (worker/index.ts)                 │     │
│  │  - Routes /mcp → MCP Durable Object                   │     │
│  │  - Routes /sse → SSE handler                          │     │
│  │  - Extracts origin for URL auto-detection            │     │
│  │  - Error handling and logging                         │     │
│  └───────────────────────────────────────────────────────┘     │
│                              ↓                                   │
│  ┌───────────────────────────────────────────────────────┐     │
│  │  MCP Server (worker/mcpServer.ts)                     │     │
│  │  - Extends McpAgent (Durable Object)                  │     │
│  │  - Registers MCP tools                                │     │
│  │  - Manages sessions across invocations               │     │
│  │  - Creates UI resources                               │     │
│  └───────────────────────────────────────────────────────┘     │
│                                                                   │
│  ┌───────────────────────────────────────────────────────┐     │
│  │  Static Assets (dist/client/)                         │     │
│  │  - Main app (optional landing page)                   │     │
│  │  - Mini-apps (TicTacToe, etc.)                        │     │
│  └───────────────────────────────────────────────────────┘     │
└─────────────────────────────────────────────────────────────────┘
                              ↓
                          Serves iframe
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│              TicTacToe Mini-App (iframe)                         │
│                                                                   │
│  ┌───────────────────────────────────────────────────────┐     │
│  │  React App (mini-apps/tictactoe/main.tsx)            │     │
│  │  - Initializes WebMCP transport                       │     │
│  │  - Renders TicTacToeWithWebMCP component             │     │
│  └───────────────────────────────────────────────────────┘     │
│                              ↓                                   │
│  ┌───────────────────────────────────────────────────────┐     │
│  │  WebMCP Integration (useWebMCP hook)                  │     │
│  │  - Registers tictactoe_get_state                      │     │
│  │  - Registers tictactoe_ai_move                        │     │
│  │  - Registers tictactoe_reset                          │     │
│  │  - Handles tool call requests from parent            │     │
│  │  - Returns results via postMessage                    │     │
│  └───────────────────────────────────────────────────────┘     │
│                              ↑ ↓                                 │
│                          postMessage                             │
│                              ↑ ↓                                 │
│  ┌───────────────────────────────────────────────────────┐     │
│  │  TabServer Transport (@mcp-b/transports)              │     │
│  │  - Sends messages to parent via postMessage           │     │
│  │  - Receives messages from parent                      │     │
│  │  - Protocol: navigator.modelContext                   │     │
│  └───────────────────────────────────────────────────────┘     │
└─────────────────────────────────────────────────────────────────┘
```

## Component Details

### 1. Worker Entry Point (worker/index.ts)

**Responsibilities:**
- Route incoming HTTP requests to appropriate handlers
- Extract the request origin for URL auto-detection
- Set `env.APP_URL` if not already configured
- Error handling and logging

**Key Code:**
```typescript
export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext) {
    const url = new URL(request.url);
    const origin = url.origin; // e.g., "https://my-worker.workers.dev"

    // Auto-detect deployment URL
    if (!env.APP_URL) {
      env.APP_URL = origin;
    }

    // Route to MCP server or SSE handler
    if (url.pathname === "/mcp") {
      return await MyMCP.serve("/mcp").fetch(request, env, ctx);
    }
    // ... other routes
  }
}
```

**Why Cloudflare Workers?**
- Edge deployment (low latency worldwide)
- Auto-scaling (handles any traffic level)
- Durable Objects for stateful sessions
- Zero server management

### 2. MCP Server (worker/mcpServer.ts)

**Responsibilities:**
- Implement the MCP protocol
- Register tools and prompts
- Create UI resources
- Manage session state via Durable Objects

**Base Class: McpAgent**
```typescript
export class MyMCP extends McpAgent {
  server = new McpServer({
    name: "mcp-ui-webmcp-cloudflare",
    version: "1.0.0",
  });

  async init() {
    // Register tools
    this.server.tool(...);
  }
}
```

The `McpAgent` class (from the `agents` library) handles:
- Durable Object lifecycle
- HTTP/SSE transport
- Session management
- Request routing

**Tool Registration Pattern:**
```typescript
this.server.tool(
  "toolName",           // Tool name (snake_case)
  "Description",        // Human-readable description
  { /* schema */ },     // Input parameters schema (optional)
  async (params) => {   // Handler function
    // Tool implementation
    return {
      content: [{ type: "text", text: "Result" }]
    };
  }
);
```

**URL Auto-Detection:**
```typescript
private getBaseUrl(): string {
  const env = (this as Record<string, any>).env as Env | undefined;
  return env?.APP_URL || "http://localhost:8787";
}
```

This method retrieves the auto-detected or configured base URL, ensuring iframe URLs work in all environments.

### 3. UI Resource Creation

**UI Resource Types:**

1. **External URL (iframe)**
   ```typescript
   createUIResource({
     uri: "ui://unique-id",
     content: {
       type: "externalUrl",
       iframeUrl: "https://example.com"
     },
     encoding: "text" | "blob"
   })
   ```

2. **Raw HTML**
   ```typescript
   createUIResource({
     uri: "ui://unique-id",
     content: {
       type: "rawHtml",
       htmlString: "<h1>Hello</h1>"
     },
     encoding: "text"
   })
   ```

3. **Remote DOM (JavaScript)**
   ```typescript
   createUIResource({
     uri: "ui://unique-id",
     content: {
       type: "remoteDom",
       script: "const p = document.createElement('p'); ...",
       framework: "react"
     },
     encoding: "text"
   })
   ```

**When to use each type:**
- **externalUrl**: For complex web apps (React, Vue, etc.) that need full control
- **rawHtml**: For simple static content
- **remoteDom**: For dynamic content that doesn't need a full framework

### 4. TicTacToe Mini-App

**Structure:**

```
mini-apps/tictactoe/
├── index.html         # Entry point
└── main.tsx           # React entry with WebMCP init
```

**Entry Point (main.tsx):**
```typescript
// 1. Initialize WebMCP BEFORE React renders
initializeWebModelContext({
  transport: {
    tabServer: {
      allowedOrigins: ['*'],
      postMessageTarget: window.parent,
    },
  },
});

// 2. Render React app
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <TicTacToeWithWebMCP />
    </ErrorBoundary>
  </StrictMode>,
)
```

**WebMCP Integration (useWebMCP hook):**
```typescript
import { useWebMCP } from '@mcp-b/react-webmcp';

export function TicTacToeWithWebMCP() {
  const [board, setBoard] = useState<GameState>([...]);

  // Register tool: tictactoe_get_state
  useWebMCP({
    name: "tictactoe_get_state",
    description: "Get current board state",
    schema: z.object({}),
    handler: async () => {
      return {
        content: [{
          type: "text",
          text: formatBoardState(board)
        }]
      };
    }
  });

  // More tools...

  return <TicTacToe board={board} onMove={handleMove} />;
}
```

**Why separate TicTacToe and TicTacToeWithWebMCP?**
- **TicTacToe.tsx**: Pure, reusable game component (no WebMCP dependency)
- **TicTacToeWithWebMCP.tsx**: WebMCP integration layer

This separation allows:
- Easier testing (pure component)
- Reusability (use TicTacToe without WebMCP)
- Clear separation of concerns

### 5. WebMCP Transport (TabServer)

**How it works:**

```
┌─────────────────────┐         postMessage         ┌──────────────────┐
│   Parent Window     │ ←──────────────────────────→ │  Iframe (child)  │
│  (AI Assistant)     │                               │  (TicTacToe)     │
│                     │                               │                  │
│  TabClient          │                               │  TabServer       │
│  - Receives tools   │                               │  - Sends tools   │
│  - Sends requests   │                               │  - Receives req  │
│  - Receives results │                               │  - Sends results │
└─────────────────────┘                               └──────────────────┘
```

**Message Format:**
```typescript
// Tool registration message (child → parent)
{
  type: "tool-register",
  toolName: "tictactoe_ai_move",
  toolDescription: "Make a move as player O",
  toolSchema: { /* zod schema */ }
}

// Tool call message (parent → child)
{
  type: "tool-call",
  toolName: "tictactoe_ai_move",
  params: { position: 4 }
}

// Tool result message (child → parent)
{
  type: "tool-result",
  result: {
    content: [{ type: "text", text: "Move made!" }]
  }
}
```

**Security:**
- `allowedOrigins: ['*']` allows any parent (suitable for iframes served from same origin)
- For cross-origin, specify exact origins: `['https://trusted-domain.com']`
- postMessage is same-origin by default (parent and child must share origin)

## Communication Protocols

### MCP Protocol (HTTP/SSE)

**Client → Server (POST /mcp):**
```json
{
  "jsonrpc": "2.0",
  "method": "tools/call",
  "params": {
    "name": "showTicTacToeGame",
    "arguments": {}
  },
  "id": 1
}
```

**Server → Client (SSE /sse):**
```json
{
  "jsonrpc": "2.0",
  "result": {
    "content": [
      {
        "type": "resource",
        "resource": {
          "uri": "ui://tictactoe-game",
          "mimeType": "application/vnd.mcp.ui+json",
          "blob": "..."
        }
      }
    ]
  },
  "id": 1
}
```

### WebMCP Protocol (postMessage)

**Lifecycle Messages:**

1. **iframe-ready** (child → parent)
   - Sent when mini-app finishes loading
   - Parent responds with tool capabilities

2. **parent-ready** (parent → child)
   - Sent when parent is ready to receive tools
   - Child starts registering tools

3. **tool-register** (child → parent)
   - Registers a new tool
   - Includes name, description, schema

4. **tool-call** (parent → child)
   - Invokes a registered tool
   - Includes tool name and parameters

5. **tool-result** (child → parent)
   - Returns tool execution result
   - Includes content array

**Parent Readiness Pattern:**

The TicTacToe app implements a "parent readiness" check:

```typescript
const [isParentReady, setIsParentReady] = useState(false);

useEffect(() => {
  const handleMessage = (event: MessageEvent) => {
    if (event.data.type === 'parent-ready' || ...) {
      setIsParentReady(true);
    }
  };
  window.addEventListener('message', handleMessage);
  return () => window.removeEventListener('message', handleMessage);
}, []);

// Block moves until parent is ready
const handleMove = (position: number) => {
  if (!isParentReady) {
    console.warn("Parent not ready yet");
    return;
  }
  // ... handle move
};
```

This prevents race conditions where the child tries to send messages before the parent is listening.

## Build System

### Multi-Entry Vite Configuration

```typescript
// vite.config.ts
export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        tictactoe: resolve(__dirname, 'mini-apps/tictactoe/index.html'),
      },
    },
  },
})
```

**Build Output:**
```
dist/
└── client/
    ├── index.html                      # Main app
    ├── assets/
    │   ├── index-xyz.js                # Main app bundle
    │   └── index-xyz.css               # Main app styles
    └── mini-apps/
        └── tictactoe/
            ├── index.html              # TicTacToe app
            └── assets/
                ├── index-abc.js        # TicTacToe bundle
                └── index-abc.css       # TicTacToe styles
```

**Why separate builds?**
- Each mini-app is self-contained
- Can be developed/tested independently
- No shared state between apps
- Smaller bundle sizes

### TypeScript Project References

```
tsconfig.json              # Root (references only)
├── tsconfig.app.json      # React app (includes src/ and mini-apps/)
├── tsconfig.node.json     # Vite config
└── tsconfig.worker.json   # Cloudflare Worker
```

**Benefits:**
- Faster incremental builds
- Better IDE performance
- Strict boundaries between environments

## Runtime Behavior

### Deployment Scenarios

**Development (localhost:8787):**
1. Vite dev server runs
2. Worker serves from http://localhost:8787
3. Auto-detection sets `APP_URL = http://localhost:8787`
4. Iframe URL: `http://localhost:8787/mini-apps/tictactoe/`

**Production (Cloudflare Workers):**
1. `pnpm build` creates dist/
2. `wrangler deploy` uploads to Cloudflare
3. Worker serves from https://my-worker.workers.dev
4. Auto-detection sets `APP_URL = https://my-worker.workers.dev`
5. Iframe URL: `https://my-worker.workers.dev/mini-apps/tictactoe/`

**Custom Domain:**
1. Configure domain in Cloudflare
2. Worker serves from https://my-domain.com
3. Auto-detection sets `APP_URL = https://my-domain.com`
4. Iframe URL: `https://my-domain.com/mini-apps/tictactoe/`

### Session Management (Durable Objects)

**How Durable Objects work:**

```
Request 1 → Worker → DO Instance (ID: session-123)
                    │ State: { session: {...} }
                    │ Lives in memory
                    └─→ Response 1

Request 2 → Worker → Same DO Instance (ID: session-123)
                    │ State: { session: {...} }  ← Persisted
                    └─→ Response 2
```

**Session Lifecycle:**
1. Client sends `mcp-session-id` header (or server generates one)
2. Worker routes to Durable Object with that ID
3. MCP server initializes (only once per session)
4. Subsequent requests reuse the same DO instance
5. State persists across requests
6. DO hibernates after inactivity
7. DO is destroyed on explicit close or timeout

**Why Durable Objects for MCP?**
- Session state (tools, resources, conversation history)
- Exactly-once semantics (no duplicate processing)
- Strong consistency (no race conditions)
- Automatic lifecycle management

## Design Decisions

### Why McpAgent (agents library)?

**Alternative:** Custom Durable Object implementation

**Chosen:** McpAgent from `agents` library

**Rationale:**
- **Less boilerplate**: McpAgent handles routing, session management, etc.
- **Best practices**: Implements MCP protocol correctly
- **Cloudflare optimized**: Designed for Durable Objects
- **Maintained**: Active development by Cloudflare

**Trade-off:** Less control over low-level details

### Why Vite multi-entry?

**Alternative:** Separate build processes for each mini-app

**Chosen:** Single Vite config with multiple entry points

**Rationale:**
- **Shared config**: All apps use same build settings
- **Shared dependencies**: Single node_modules
- **Faster builds**: Vite's parallel builds
- **Simpler setup**: One `pnpm build` command

**Trade-off:** All mini-apps must be compatible with same build tools

### Why TabServer transport?

**Alternative:** WebSocket, HTTP polling, etc.

**Chosen:** postMessage via TabServer transport

**Rationale:**
- **Same-origin friendly**: Works with iframes from same domain
- **Low latency**: Direct browser messaging (no network)
- **Standard API**: Built-in browser postMessage
- **Secure**: Same-origin policy enforced

**Trade-off:** Requires same origin (or CORS for cross-origin)

### Why separate TicTacToe components?

**Alternative:** Single component with WebMCP baked in

**Chosen:** TicTacToe (pure) + TicTacToeWithWebMCP (integration)

**Rationale:**
- **Testability**: Can test game logic without WebMCP
- **Reusability**: Can use TicTacToe elsewhere
- **Separation of concerns**: Game logic separate from integration
- **Easier to understand**: Clear boundaries

**Trade-off:** Slight increase in code complexity

### Why auto-detect URLs?

**Alternative:** Hardcode URLs or require configuration

**Chosen:** Auto-detect from request origin

**Rationale:**
- **Zero config**: Works everywhere without setup
- **Developer friendly**: No environment-specific config files
- **Deployment agnostic**: Same code works in dev/prod/custom domains
- **Fewer bugs**: No outdated hardcoded URLs

**Trade-off:** Can be overridden if needed via `APP_URL` env var

## Performance Considerations

### Bundle Sizes

**TicTacToe mini-app:**
- React: ~130 KB (gzipped)
- WebMCP libraries: ~20 KB (gzipped)
- Game code: ~5 KB (gzipped)
- Total: ~155 KB (gzipped)

**Optimization strategies:**
- Code splitting (Vite automatic)
- Tree shaking (remove unused code)
- Asset compression (Cloudflare automatic)

### Latency

**Tool call flow:**
1. AI → MCP server (HTTP): 50-100ms
2. MCP server → AI (SSE): <10ms
3. AI → iframe (postMessage): <1ms
4. iframe → AI (postMessage): <1ms

**Total latency:** ~60-110ms per tool call

### Scaling

**Cloudflare Workers:**
- Auto-scales to millions of requests
- Edge deployment (low latency worldwide)
- No cold starts (Durable Objects warm in memory)

**Durable Objects:**
- Each session = 1 DO instance
- 1000s of concurrent sessions supported
- State persists automatically

## Security

### Threat Model

**Threats:**
1. Malicious iframes injecting code into parent
2. XSS attacks via tool parameters
3. CSRF attacks on MCP endpoints
4. Unauthorized tool calls

**Mitigations:**
1. **Same-origin iframes**: All mini-apps served from same origin
2. **Input validation**: Zod schemas validate all tool parameters
3. **CORS**: Cloudflare Workers enforce CORS
4. **Authentication**: Can add auth headers to MCP requests

### Content Security Policy

For production, consider adding CSP headers:

```typescript
headers: {
  "Content-Security-Policy":
    "default-src 'self'; " +
    "script-src 'self' 'unsafe-inline'; " +
    "style-src 'self' 'unsafe-inline'; " +
    "frame-ancestors 'none';"
}
```

## Debugging

### Worker Logs

```bash
# Stream live logs
wrangler tail

# Filter by status code
wrangler tail --status error
```

### Browser Console

The TicTacToe app logs all WebMCP messages:

```javascript
console.log("[WebMCP] Tool registered:", toolName);
console.log("[WebMCP] Tool call received:", params);
console.log("[WebMCP] Sending result:", result);
```

### TypeScript Type Checking

```bash
# Check all projects
pnpm exec tsc -b

# Check specific project
pnpm exec tsc -p tsconfig.worker.json --noEmit
```

## Future Enhancements

### Potential Improvements

1. **WebSocket transport**: For cross-origin WebMCP
2. **Authentication**: OAuth, API keys, etc.
3. **Rate limiting**: Prevent abuse
4. **Metrics/analytics**: Usage tracking
5. **Error recovery**: Retry logic for failed tool calls
6. **State persistence**: Save game state to Durable Object storage
7. **Multiple mini-apps**: Gallery of mini-apps to choose from

---

This architecture provides a solid foundation for building sophisticated MCP UI + WebMCP applications. The modular design makes it easy to extend and customize for your specific use case.
