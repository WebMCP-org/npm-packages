# Chrome DevTools MCP Transport - Design Document

> Enabling local MCP clients to connect to WebMCP tools running in browser tabs via Chrome DevTools Protocol.

## Table of Contents

1. [High-Level Design](#high-level-design)
2. [Low-Level Design](#low-level-design)
3. [Implementation Plan](#implementation-plan)

---

# High-Level Design

## 1. Problem Statement

Currently, there's a gap between:
- **Local MCP clients** (Claude Desktop, AI coding assistants) that use chrome-devtools-mcp for browser automation
- **WebMCP tools** registered on webpages via `@mcp-b/global` that are only accessible within the browser

Developers building web applications with WebMCP cannot easily test or use their tools from local AI assistants without manual bridging.

## 2. Proposed Solution

Create a **CDP-based bridge** that connects local MCP clients to WebMCP servers running in browser tabs. This leverages the existing `TabServerTransport` in WebMCP and adds a thin ferry layer over Chrome DevTools Protocol.

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         LOCAL PROCESS                                   │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │ Chrome DevTools MCP Server (forked)                              │   │
│  │  ├── Original 26 browser automation tools                       │   │
│  │  └── NEW: WebMCP integration tools                              │   │
│  │       ├── connect_webmcp                                        │   │
│  │       ├── list_webmcp_tools                                     │   │
│  │       ├── call_webmcp_tool                                      │   │
│  │       └── disconnect_webmcp                                     │   │
│  └─────────────────────────────┬───────────────────────────────────┘   │
│                                │                                        │
│  ┌─────────────────────────────▼───────────────────────────────────┐   │
│  │ WebMCPClientTransport (NEW)                                      │   │
│  │  ├── Injects bridge script into page via CDP                    │   │
│  │  ├── Sends messages via Runtime.evaluate                        │   │
│  │  └── Receives messages via Runtime.bindingCalled                │   │
│  └─────────────────────────────┬───────────────────────────────────┘   │
└────────────────────────────────┼────────────────────────────────────────┘
                                 │ CDP WebSocket
┌────────────────────────────────▼────────────────────────────────────────┐
│                         CHROME BROWSER                                  │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │ Injected Bridge Script (ferry only - no MCP logic)              │   │
│  │  ├── window.__mcpBridge.toServer(msg) ──► postMessage           │   │
│  │  └── postMessage ──► window.__mcpBridgeToClient(msg)            │   │
│  └─────────────────────────────┬───────────────────────────────────┘   │
│                                │ window.postMessage                     │
│  ┌─────────────────────────────▼───────────────────────────────────┐   │
│  │ @mcp-b/global (UNCHANGED)                                        │   │
│  │  └── TabServerTransport                                         │   │
│  │       └── McpServer                                             │   │
│  │            └── Tools registered via useWebMCP / registerTool    │   │
│  └─────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────┘
```

## 3. Key Design Decisions

### 3.1 Reuse Existing TabServerTransport

**Decision**: Don't create a new CDP-specific transport in `@mcp-b/global`. Instead, inject a bridge that acts as a TabClient.

**Rationale**:
- Zero changes to `@mcp-b/global` or `@mcp-b/transports`
- Leverages battle-tested postMessage protocol
- Server-ready handshake works naturally
- Reduces maintenance burden

### 3.2 Bridge is a Dumb Ferry

**Decision**: The injected bridge script has no MCP knowledge. It simply ferries JSON between CDP and postMessage.

**Rationale**:
- Minimal injected code footprint
- No version coupling between bridge and MCP protocol
- Easy to debug and maintain
- Works with any future MCP protocol changes automatically

### 3.3 Fork chrome-devtools-mcp as a Package

**Decision**: Maintain a fork of chrome-devtools-mcp within the npm-packages monorepo using git subtree.

**Rationale**:
- Can pull upstream changes easily
- Can add WebMCP-specific features
- Publishable to npm as a separate package
- Clear path to upstream contribution

### 3.4 Explicit Connection Model

**Decision**: Require explicit `connect_webmcp` before using website tools, rather than auto-connecting.

**Rationale**:
- User knows when CDP resources are being used
- Clear lifecycle (connect/use/disconnect)
- Avoids overhead on pages without WebMCP
- Matches chrome-devtools-mcp's explicit tool model

## 4. User Experience

### 4.1 For AI Agent Users (Claude Desktop, etc.)

```
User: "Connect to the tools on this page and add a todo item"

AI: I'll connect to the WebMCP tools on the current page.
    [calls connect_webmcp]

    Found 3 tools:
    • add_todo - Add a new todo item
    • list_todos - List all todo items
    • delete_todo - Delete a todo item

    Now I'll add the todo item.
    [calls call_webmcp_tool with name="add_todo", arguments={text: "..."}]

    Done! The todo has been added.
```

### 4.2 For Web Developers

1. Add `@mcp-b/global` to their page (already doing this)
2. Register tools with `useWebMCP` or `registerTool` (already doing this)
3. Run the forked chrome-devtools-mcp server
4. Tools are automatically available to AI assistants

No additional code changes required on the webpage.

## 5. Success Criteria

1. **Zero WebMCP changes**: No modifications to `@mcp-b/global` or `@mcp-b/transports`
2. **Full MCP compatibility**: All MCP features work (tools, resources, prompts, notifications)
3. **Upstream sync**: Can pull chrome-devtools-mcp updates without conflicts
4. **Contribution ready**: Code structured for potential upstream PR

---

# Low-Level Design

## 1. Package Structure

```
npm-packages/
├── packages/
│   └── chrome-devtools-mcp/          # Git subtree from upstream
│       ├── src/
│       │   ├── main.ts               # Entry point (minimal changes)
│       │   ├── McpContext.ts         # Add webMCPClient storage
│       │   ├── tools/
│       │   │   ├── tools.ts          # Register new webmcp tools
│       │   │   ├── webmcp.ts         # NEW: WebMCP tool definitions
│       │   │   └── ... (existing tools)
│       │   └── transports/
│       │       ├── WebMCPClientTransport.ts    # NEW: CDP transport
│       │       └── WebMCPBridgeScript.ts       # NEW: Injected bridge
│       ├── package.json              # Modified for @mcp-b scope
│       └── tsconfig.json
└── ... (existing packages)
```

## 2. Component Specifications

### 2.1 WebMCPBridgeScript

**Purpose**: Injected into page to ferry messages between CDP and TabServerTransport.

**Injected Globals**:
```typescript
window.__mcpBridge = {
  toServer(payloadJson: string): void;  // CDP calls this to send to TabServer
  isAvailable(): boolean;                // Check if bridge is ready
  checkReady(): void;                    // Initiate server-ready handshake
};

window.__mcpBridgeToClient: (payloadJson: string) => void;  // Set by CDP binding
```

**Message Flow**:
```
CDP → Page:
  Runtime.evaluate("__mcpBridge.toServer('{...}')")
    → window.postMessage({channel, type, direction: 'client-to-server', payload})
    → TabServerTransport.onmessage()

Page → CDP:
  TabServerTransport.send(message)
    → window.postMessage({channel, type, direction: 'server-to-client', payload})
    → Bridge listener catches it
    → window.__mcpBridgeToClient(JSON.stringify(payload))
    → CDP receives Runtime.bindingCalled event
```

**Protocol Compatibility**:
```typescript
// Message format (matches TabServerTransport exactly)
interface TabMessage {
  channel: 'mcp-default';
  type: 'mcp';
  direction: 'client-to-server' | 'server-to-client';
  payload: JSONRPCMessage | 'mcp-check-ready' | 'mcp-server-ready' | 'mcp-server-stopped';
}
```

### 2.2 WebMCPClientTransport

**Purpose**: MCP Transport implementation for use in chrome-devtools-mcp.

**Interface**:
```typescript
interface Transport {
  start(): Promise<void>;
  send(message: JSONRPCMessage): Promise<void>;
  close(): Promise<void>;

  onmessage?: (message: JSONRPCMessage) => void;
  onerror?: (error: Error) => void;
  onclose?: () => void;
}
```

**Lifecycle**:
```
1. start()
   ├── Create CDPSession via page.createCDPSession()
   ├── Runtime.enable()
   ├── Runtime.addBinding('__mcpBridgeToClient')
   ├── Listen for Runtime.bindingCalled events
   ├── Inject bridge script via page.evaluate()
   ├── Send mcp-check-ready via bridge
   └── Wait for mcp-server-ready (with timeout)

2. send(message)
   ├── Await server ready
   └── page.evaluate("__mcpBridge.toServer(msg)")

3. close()
   ├── Detach CDP session
   └── Fire onclose callback
```

**Error Handling**:
```typescript
// Timeout for server ready
readyTimeout: 10000  // 10 seconds default

// Retry logic for CDP operations
maxRetries: 3
retryDelay: 1000  // 1 second

// Graceful handling of page navigation
// (Re-inject bridge on navigation if needed)
```

### 2.3 WebMCP Tools

**connect_webmcp**:
```typescript
{
  name: 'connect_webmcp',
  description: 'Connect to MCP tools registered on the current webpage',
  schema: {},
  handler: async (request, response, context) => {
    // 1. Check if page has WebMCP (navigator.modelContext exists)
    // 2. Create WebMCPClientTransport
    // 3. Create MCP Client and connect
    // 4. Store client in context
    // 5. List and display available tools
  }
}
```

**list_webmcp_tools**:
```typescript
{
  name: 'list_webmcp_tools',
  description: 'List all MCP tools available on the connected webpage',
  schema: {},
  handler: async (request, response, context) => {
    // 1. Get stored client from context
    // 2. Call client.listTools()
    // 3. Format and display results
  }
}
```

**call_webmcp_tool**:
```typescript
{
  name: 'call_webmcp_tool',
  description: 'Call a tool registered on the webpage',
  schema: {
    name: zod.string(),
    arguments: zod.record(zod.any()).optional()
  },
  handler: async (request, response, context) => {
    // 1. Get stored client from context
    // 2. Call client.callTool({ name, arguments })
    // 3. Format and display result
  }
}
```

**disconnect_webmcp**:
```typescript
{
  name: 'disconnect_webmcp',
  description: 'Disconnect from the WebMCP server',
  schema: {},
  handler: async (request, response, context) => {
    // 1. Get stored client from context
    // 2. Close client and transport
    // 3. Clear from context
  }
}
```

### 2.4 McpContext Extensions

**New Fields**:
```typescript
// Added to McpContext class
private _webMCPClient: Client | null = null;
private _webMCPTransport: WebMCPClientTransport | null = null;

// Getter/setter methods
getWebMCPClient(): Client | null;
setWebMCPClient(client: Client, transport: WebMCPClientTransport): void;
clearWebMCPClient(): Promise<void>;
```

**Page Navigation Handling**:
```typescript
// When page navigates, the bridge is lost
// Listen for page navigation events and clear the client
page.on('framenavigated', async (frame) => {
  if (frame === page.mainFrame()) {
    await this.clearWebMCPClient();
  }
});
```

## 3. Security Considerations

### 3.1 Origin Validation

The TabServerTransport already validates origins. The bridge respects this:
```javascript
// Bridge only listens to same-origin messages
if (event.origin !== window.location.origin) return;
```

### 3.2 CDP Session Isolation

Each page gets its own CDP session and bridge instance:
- No cross-page message leakage
- Clean teardown on disconnect

### 3.3 Binding Namespace

Use unique binding names to avoid conflicts:
```typescript
const BINDING_NAME = '__mcpBridgeToClient';  // Prefixed with __
```

## 4. Testing Strategy

### 4.1 Unit Tests

- `WebMCPClientTransport`: Mock CDP session, test message flow
- `WebMCPBridgeScript`: Test in jsdom with mock postMessage
- Tool handlers: Mock context and client

### 4.2 Integration Tests

- Spawn real Chrome with Puppeteer
- Load test page with `@mcp-b/global`
- Connect via WebMCPClientTransport
- Execute tools and verify results

### 4.3 E2E Tests

- Full chrome-devtools-mcp server
- Claude Desktop or MCP inspector as client
- Real webpage with registered tools

---

# Implementation Plan

## Phase 0: Repository Setup

### Step 0.1: Add chrome-devtools-mcp as Git Subtree

```bash
# Add upstream as a remote
git remote add cdp-upstream https://github.com/anthropics/chrome-devtools-mcp.git

# Fetch upstream
git fetch cdp-upstream

# Add as subtree in packages directory
git subtree add --prefix=packages/chrome-devtools-mcp cdp-upstream main --squash
```

**Why Git Subtree?**
- Allows modifications within monorepo
- Easy to pull upstream changes: `git subtree pull --prefix=packages/chrome-devtools-mcp cdp-upstream main --squash`
- No submodule complexity
- Single repo, single clone

### Step 0.2: Adapt Package for Monorepo

1. Update `package.json`:
   ```json
   {
     "name": "@mcp-b/chrome-devtools-mcp",
     "version": "0.1.0",
     "dependencies": {
       // Use catalog: protocol for shared deps
     }
   }
   ```

2. Update `tsconfig.json` to extend monorepo base

3. Add to `pnpm-workspace.yaml`:
   ```yaml
   packages:
     - 'packages/chrome-devtools-mcp'
   ```

4. Test build: `pnpm build`

### Step 0.3: Create Branch Structure

```bash
# Main development branch
git checkout -b feature/webmcp-integration

# Keep a branch tracking pure upstream (no modifications)
git checkout -b upstream/chrome-devtools-mcp
```

## Phase 1: Core Transport Implementation

### Step 1.1: Create Bridge Script

**File**: `packages/chrome-devtools-mcp/src/transports/WebMCPBridgeScript.ts`

**Tasks**:
- [ ] Implement bridge IIFE as template string
- [ ] Handle all message directions
- [ ] Add error handling for missing bindings
- [ ] Add debug logging (conditional)

**Deliverable**: Exported `WEB_MCP_BRIDGE_SCRIPT` constant

### Step 1.2: Create WebMCPClientTransport

**File**: `packages/chrome-devtools-mcp/src/transports/WebMCPClientTransport.ts`

**Tasks**:
- [ ] Implement Transport interface
- [ ] CDP session management
- [ ] Binding setup and event handling
- [ ] Script injection
- [ ] Server-ready handshake with timeout
- [ ] Error handling and cleanup

**Deliverable**: Exported `WebMCPClientTransport` class

### Step 1.3: Unit Tests for Transport

**File**: `packages/chrome-devtools-mcp/src/transports/__tests__/WebMCPClientTransport.test.ts`

**Tasks**:
- [ ] Mock Puppeteer Page and CDPSession
- [ ] Test start() lifecycle
- [ ] Test send() message flow
- [ ] Test close() cleanup
- [ ] Test timeout handling

## Phase 2: Tool Implementation

### Step 2.1: Add WebMCP Category

**File**: `packages/chrome-devtools-mcp/src/tools/categories.ts`

**Tasks**:
- [ ] Add `WEBMCP = 'webmcp'` category
- [ ] Update category documentation

### Step 2.2: Extend McpContext

**File**: `packages/chrome-devtools-mcp/src/McpContext.ts`

**Tasks**:
- [ ] Add `_webMCPClient` and `_webMCPTransport` fields
- [ ] Add getter/setter/clear methods
- [ ] Handle page navigation cleanup

### Step 2.3: Implement WebMCP Tools

**File**: `packages/chrome-devtools-mcp/src/tools/webmcp.ts`

**Tasks**:
- [ ] Implement `connect_webmcp`
- [ ] Implement `list_webmcp_tools`
- [ ] Implement `call_webmcp_tool`
- [ ] Implement `disconnect_webmcp`

### Step 2.4: Register Tools

**File**: `packages/chrome-devtools-mcp/src/tools/tools.ts`

**Tasks**:
- [ ] Import webmcp tools
- [ ] Add to tools array
- [ ] Add category flag for enabling/disabling

## Phase 3: Integration & Testing

### Step 3.1: Integration Test Setup

**Tasks**:
- [ ] Create test page with `@mcp-b/global` and sample tools
- [ ] Set up Puppeteer test harness
- [ ] Create test fixtures for common scenarios

### Step 3.2: Integration Tests

**Tasks**:
- [ ] Test connect/disconnect lifecycle
- [ ] Test tool listing
- [ ] Test tool execution with various return types
- [ ] Test error handling (page without WebMCP, tool errors, etc.)
- [ ] Test page navigation handling

### Step 3.3: E2E Testing

**Tasks**:
- [ ] Manual testing with MCP Inspector
- [ ] Test with Claude Desktop (if available)
- [ ] Document any edge cases found

## Phase 4: Documentation & Release

### Step 4.1: Documentation

**Tasks**:
- [ ] Update package README
- [ ] Add usage examples
- [ ] Document configuration options
- [ ] Add troubleshooting guide

### Step 4.2: Changeset & Release

**Tasks**:
- [ ] Create changeset: `pnpm changeset`
- [ ] Update version
- [ ] Publish to npm

## Phase 5: Upstream Contribution (Future)

### Step 5.1: Prepare PR

**Tasks**:
- [ ] Extract WebMCP-specific changes as patches
- [ ] Create clean PR branch from upstream
- [ ] Apply changes
- [ ] Write PR description with rationale

### Step 5.2: Submit & Iterate

**Tasks**:
- [ ] Open PR on ChromeDevTools/chrome-devtools-mcp
- [ ] Address review feedback
- [ ] Update fork based on any required changes

---

## Appendix A: Git Subtree Commands Reference

```bash
# Initial add (already done in Step 0.1)
git subtree add --prefix=packages/chrome-devtools-mcp cdp-upstream main --squash

# Pull upstream changes
git fetch cdp-upstream
git subtree pull --prefix=packages/chrome-devtools-mcp cdp-upstream main --squash

# Push changes back to upstream (if you have access)
git subtree push --prefix=packages/chrome-devtools-mcp cdp-upstream feature-branch

# View subtree history
git log --oneline packages/chrome-devtools-mcp
```

## Appendix B: Message Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ REQUEST FLOW (Client → Server)                                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  MCP Client                                                                 │
│      │                                                                      │
│      │ client.callTool({ name: 'add_todo', arguments: { text: '...' } })   │
│      ▼                                                                      │
│  WebMCPClientTransport.send(jsonRpcRequest)                                │
│      │                                                                      │
│      │ page.evaluate("__mcpBridge.toServer('{...}')")                      │
│      ▼                                                                      │
│  ════════════════════════ CDP WebSocket ════════════════════════           │
│      ▼                                                                      │
│  Bridge Script: __mcpBridge.toServer(msg)                                  │
│      │                                                                      │
│      │ window.postMessage({ channel, type, direction, payload })           │
│      ▼                                                                      │
│  TabServerTransport (message event listener)                               │
│      │                                                                      │
│      │ this.onmessage?.(jsonRpcRequest)                                    │
│      ▼                                                                      │
│  McpServer.handleRequest()                                                 │
│      │                                                                      │
│      │ Execute tool handler                                                │
│      ▼                                                                      │
│  Tool: add_todo({ text: '...' })                                           │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│ RESPONSE FLOW (Server → Client)                                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Tool returns: { content: [{ type: 'text', text: 'Todo added!' }] }        │
│      │                                                                      │
│      ▼                                                                      │
│  McpServer sends response                                                  │
│      │                                                                      │
│      │ transport.send(jsonRpcResponse)                                     │
│      ▼                                                                      │
│  TabServerTransport.send(message)                                          │
│      │                                                                      │
│      │ window.postMessage({ channel, type, direction, payload })           │
│      ▼                                                                      │
│  Bridge Script: message event listener                                     │
│      │                                                                      │
│      │ window.__mcpBridgeToClient(JSON.stringify(payload))                 │
│      ▼                                                                      │
│  ════════════════════════ CDP WebSocket ════════════════════════           │
│      ▼                                                                      │
│  CDPSession: Runtime.bindingCalled event                                   │
│      │                                                                      │
│      │ this._handlePayload(JSON.parse(event.payload))                      │
│      ▼                                                                      │
│  WebMCPClientTransport.onmessage?.(jsonRpcResponse)                        │
│      │                                                                      │
│      ▼                                                                      │
│  MCP Client receives response                                              │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Appendix C: Error Scenarios

| Scenario | Detection | Handling |
|----------|-----------|----------|
| Page has no WebMCP | `navigator.modelContext` undefined | Return helpful error message |
| Server not ready (timeout) | Promise timeout after 10s | Clean up, throw error |
| Page navigates during use | `framenavigated` event | Clear client, notify via onclose |
| CDP session disconnected | CDP error events | Clean up, throw error |
| Tool execution fails | `isError: true` in response | Pass through to caller |
| Invalid JSON from bridge | JSON.parse throws | Fire onerror callback |
| Bridge script injection fails | page.evaluate throws | Clean up, throw error |
