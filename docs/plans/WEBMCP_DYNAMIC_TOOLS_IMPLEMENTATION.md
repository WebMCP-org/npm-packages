# WebMCP Dynamic Tool Registration - Implementation Plan

> **Status:** Implemented
> **Implemented in:** `packages/chrome-devtools-mcp` (`WebMCPToolHub`, `McpContext`, `webmcp.ts`)
> **Chrome API:** WebMCP available behind flag in Chrome 146+. Dynamic tools work with both native and polyfill runtimes.

## Executive Summary

This document outlines the implementation of dynamic WebMCP tool registration in `chrome-devtools-mcp`. WebMCP tools will be exposed as first-class MCP tools, allowing Claude Code to call them directly without the two-step `list_webmcp_tools` → `call_webmcp_tool` process.

### Key Features
- WebMCP tools appear as native MCP tools: `webmcp_{domain}_page{idx}_{toolName}`
- Event-driven tool sync via `ToolListChangedNotificationSchema`
- Automatic cleanup on page navigation/close
- Backward-compatible with existing `list_webmcp_tools`/`call_webmcp_tool`
- CLI flag `--disable-webmcp-auto-register` for opt-out

---

## Architecture

### Data Flow Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                    WebMCP Server (in browser page)              │
│  (@mcp-b/global with TabServerTransport)                        │
│                                                                 │
│  • Registers tools via window.modelContext.tool()               │
│  • Sends notifications/tools/list_changed when tools change     │
└─────────────────────────────────────────────────────────────────┘
                               │
                               │ WebMCPClientTransport (CDP + postMessage)
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│                   chrome-devtools-mcp                           │
│                                                                 │
│  McpContext:                                                    │
│    • Maintains WebMCP Client per page (WeakMap<Page, ...>)      │
│    • Subscribes to ToolListChangedNotificationSchema            │
│    • Triggers initial sync + removes tools on transport close   │
│                                                                 │
│  WebMCPToolHub:                                                 │
│    • Syncs WebMCP tools → MCP Server registrations              │
│    • Uses server.registerTool() → { update(), remove() }        │
│    • Tracks tools by Page object (WeakMap for auto-cleanup)     │
│    • SDK auto-sends list_changed to Claude Code                 │
│                                                                 │
│  McpServer:                                                     │
│    • capabilities: { tools: { listChanged: true } }             │
│    • Exposes dynamically registered tools                       │
└─────────────────────────────────────────────────────────────────┘
                               │
                               │ StdioServerTransport (MCP protocol)
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│                        Claude Code / MCP Client                 │
│                                                                 │
│  • Receives notifications/tools/list_changed                    │
│  • Auto-refreshes tool list                                     │
│  • Can call webmcp_* tools directly                             │
└─────────────────────────────────────────────────────────────────┘
```

### Reference Implementation

The WebMCP extension's `McpHub` provides a proven pattern for dynamic tool registration:

**File:** `WebMCP/apps/extension/entrypoints/background/src/services/mcpHub.ts`

Key patterns to follow:
- Tool naming: `website_tool_{domain}_{tabId}_{toolName}` (lines 198-199)
- Handle storage: `private registeredTools = new Map<string, ReturnType<typeof this.server.registerTool>>()` (line 22)
- Tool update: `this.registeredTools.get(toolName)?.update(config)` (line 219)
- Tool removal: `this.registeredTools.get(toolName)?.remove()` (line 234)
- Domain extraction: `extractDomainFromUrl()` (lines 87-97)

**File:** `WebMCP/apps/extension/entrypoints/offscreen/lib/offscreen-tools.ts`

Key pattern for event subscription:
```typescript
import { ToolListChangedNotificationSchema } from '@modelcontextprotocol/sdk/types.js';

client.setNotificationHandler(ToolListChangedNotificationSchema, async () => {
  const { tools } = await client.listTools();
  // sync tools...
});
```

---

## Implementation Details

### 1. Tool Naming Convention

```
webmcp_{sanitizedDomain}_page{pageIdx}_{sanitizedToolName}
```

Examples:
- `webmcp_localhost_3000_page0_getTodos`
- `webmcp_github_com_page1_searchRepos`
- `webmcp_example_com_page0_submitForm`

### 2. Tool Description Format

```
[WebMCP • {displayDomain} • Page {idx}] {original description}
```

Example:
```
[WebMCP • localhost:3000 • Page 0] Fetch all todo items from the database
```

### 3. Name Sanitization

```typescript
function sanitizeName(name: string): string {
  return name.replace(/[^a-zA-Z0-9_]/g, '_');
}
```

### 4. Domain Extraction

```typescript
function extractDomain(url: string): string {
  try {
    const urlObj = new URL(url);
    const hostname = urlObj.hostname;
    const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]';
    const domain = isLocalhost ? `localhost_${urlObj.port || '80'}` : hostname;
    return sanitizeName(domain);
  } catch {
    return 'unknown';
  }
}
```

### 5. Display Domain (reverse sanitization)

```typescript
function getDisplayDomain(sanitizedDomain: string): string {
  // IMPORTANT: Handle localhost FIRST before general underscore replacement
  return sanitizedDomain
    .replace(/^localhost_(\d+)$/, 'localhost:$1')
    .replace(/_/g, '.');
}
```

---

## Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `src/tools/WebMCPToolHub.ts` | **Create** | Main tool hub class |
| `src/third_party/index.ts` | **Modify** | Export `ToolListChangedNotificationSchema` |
| `src/main.ts` | **Modify** | Add `tools: { listChanged: true }`, init hub |
| `src/cli.ts` | **Modify** | Add `--disable-webmcp-auto-register` flag |
| `src/McpContext.ts` | **Modify** | Add `setToolHub()`, wire up sync + events |
| `tests/tools/WebMCPToolHub.test.ts` | **Create** | Unit + integration tests |

---

## TDD Test Plan

### Test Infrastructure

Tests use the existing infrastructure:
- `serverHooks()` - HTTP server for serving test pages
- `withBrowser()` - Puppeteer browser for page interactions
- `withMcpContext()` - Full McpContext with McpResponse
- Mock WebMCP pages with customizable tool sets

### Mock WebMCP Page Builder

```typescript
interface MockWebMCPOptions {
  tools?: Tool[];
  domain?: string;
  includeModelContext?: boolean;
  respondReady?: boolean;
  supportListChanged?: boolean;
  sendToolListChangedAfterMs?: number;
  updatedTools?: Tool[];  // Tools to send after list_changed
}

function buildMockWebMCPPage(options: MockWebMCPOptions): string {
  // Returns HTML with mock WebMCP server
}
```

### Test File: `tests/tools/WebMCPToolHub.test.ts`

#### A. Golden Path Tests

```typescript
describe('WebMCPToolHub', () => {
  describe('Golden Paths', () => {
    it('registers tools when page with WebMCP connects');
    it('generates correct tool IDs with naming convention');
    it('generates correct tool descriptions with context');
    it('executes registered tools and returns results');
    it('updates tools when WebMCP sends list_changed notification');
    it('removes tools when page navigates away');
    it('removes tools when page closes');
    it('handles multiple pages with different tools');
    it('reconnects and re-registers tools after page reload');
  });
});
```

#### B. Tool Naming Tests

```typescript
describe('Tool Naming', () => {
  it('sanitizes domain: localhost:3000 → localhost_3000');
  it('sanitizes domain: github.com → github_com');
  it('sanitizes domain with subdomains: api.github.com → api_github_com');
  it('sanitizes tool names with special chars: get-todos → get_todos');
  it('generates unique IDs for same tool on different pages');
  it('regenerates IDs correctly when page indexes shift');
});
```

#### C. Tool Description Tests

```typescript
describe('Tool Description', () => {
  it('formats: [WebMCP • localhost:3000 • Page 0] description');
  it('reverses localhost sanitization correctly');
  it('reverses domain sanitization correctly');
  it('handles missing description gracefully');
});
```

#### D. Tool Lifecycle Tests

```typescript
describe('Tool Lifecycle', () => {
  // Registration
  it('registers new tools on initial connection');
  it('updates existing tools instead of re-registering');
  it('removes tools that no longer exist in list');

  // Navigation
  it('removes all page tools on navigation');
  it('removes tools on transport close callback');
  it('does NOT remove tools from other pages');

  // Page close
  it('removes all page tools when page closes');
  it('handles page close during sync gracefully');

  // Reconnection
  it('re-registers tools after page reload');
  it('registers tools for new page opened');
});
```

#### E. Event-Driven Sync Tests

```typescript
describe('Event-Driven Sync', () => {
  it('subscribes to ToolListChangedNotificationSchema on connect');
  it('re-syncs tools when notification received');
  it('adds new tools from updated list');
  it('removes deleted tools from updated list');
  it('updates modified tool schemas');
  it('handles rapid successive notifications');
});
```

#### F. Edge Cases and Error Handling

```typescript
describe('Edge Cases', () => {
  // Race conditions
  it('handles navigation during tool sync');
  it('handles page close during tool sync');
  it('handles concurrent syncs for same page');

  // Connection issues
  it('handles WebMCP connection failure gracefully');
  it('handles tool execution when connection lost');
  it('returns error result when page navigated during call');

  // Multi-page scenarios
  it('tracks tools correctly across multiple pages');
  it('handles same domain on multiple tabs');
  it('updates page index in tool names when pages close');

  // Disabled state
  it('does not register tools when disabled');
  it('removes all tools when disabled');
  it('re-registers tools when re-enabled');
});
```

#### G. Integration Tests with Real MCP Client

```typescript
describe('Integration (E2E)', () => {
  // Uses StdioClientTransport to test full flow

  it('tools appear in client.listTools() after WebMCP connect');
  it('client receives list_changed notification when tools change');
  it('client can call dynamically registered tools');
  it('tools disappear from list after page navigation');
  it('legacy list_webmcp_tools still works alongside dynamic tools');
});
```

### Test Utilities

```typescript
// Helper to wait for tool registration
async function waitForToolsRegistered(
  client: Client,
  expectedToolPrefix: string,
  count: number,
  timeoutMs = 5000
): Promise<Tool[]> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const { tools } = await client.listTools();
    const matching = tools.filter(t => t.name.startsWith(expectedToolPrefix));
    if (matching.length >= count) return matching;
    await new Promise(r => setTimeout(r, 100));
  }
  throw new Error(`Timeout waiting for ${count} tools with prefix ${expectedToolPrefix}`);
}

// Helper to wait for tools to be removed
async function waitForToolsRemoved(
  client: Client,
  toolPrefix: string,
  timeoutMs = 5000
): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const { tools } = await client.listTools();
    const matching = tools.filter(t => t.name.startsWith(toolPrefix));
    if (matching.length === 0) return;
    await new Promise(r => setTimeout(r, 100));
  }
  throw new Error(`Timeout waiting for tools with prefix ${toolPrefix} to be removed`);
}
```

---

## Implementation Checklist

### Phase 1: Foundation
- [ ] Export `ToolListChangedNotificationSchema` from `third_party/index.ts`
- [ ] Add `tools: { listChanged: true }` to server capabilities in `main.ts`
- [ ] Add `--disable-webmcp-auto-register` CLI flag in `cli.ts`

### Phase 2: Core Implementation
- [ ] Create `WebMCPToolHub` class in `src/tools/WebMCPToolHub.ts`
  - [ ] `sanitizeName()` helper
  - [ ] `extractDomain()` helper
  - [ ] `getDisplayDomain()` helper
  - [ ] `generateToolId()` method
  - [ ] `generateDescription()` method
  - [ ] `syncToolsForPage(page, client)` method
  - [ ] `removeToolsForPage(page)` method
  - [ ] `executeTool()` method with dynamic page lookup

### Phase 3: Integration
- [ ] Add `#toolHub` to `McpContext`
- [ ] Add `setToolHub(hub)` method to `McpContext`
- [ ] Subscribe to `ToolListChangedNotificationSchema` in `getWebMCPClient()`
- [ ] Call initial sync after client connects
- [ ] Call `removeToolsForPage()` in transport `onclose` handler
- [ ] Wire up hub initialization in `main.ts`

### Phase 4: Testing (TDD)
- [ ] Write test file structure with all test cases
- [ ] Implement mock WebMCP page builder with list_changed support
- [ ] Implement test utilities (waitForToolsRegistered, etc.)
- [ ] Run tests red → implement → green

---

## WebMCPToolHub Class Design

```typescript
import type { McpServer } from './third_party/index.js';
import type { Tool, CallToolResult } from './third_party/index.js';
import type { Client } from '@modelcontextprotocol/sdk/client/index.js';
import type { Page } from './third_party/index.js';
import type { McpContext } from './McpContext.js';

interface RegisteredTool {
  handle: ReturnType<typeof McpServer.prototype.registerTool>;
  page: Page;
  originalName: string;
  domain: string;
  toolId: string;
}

export class WebMCPToolHub {
  private server: McpServer;
  private context: McpContext;
  private registeredTools = new Map<string, RegisteredTool>();
  private pageTools = new WeakMap<Page, Set<string>>();
  private syncInProgress = new WeakSet<Page>();
  private enabled = true;

  constructor(server: McpServer, context: McpContext, enabled = true) {
    this.server = server;
    this.context = context;
    this.enabled = enabled;
  }

  disable(): void { this.enabled = false; }
  enable(): void { this.enabled = true; }

  /**
   * Sync tools for a page. Called on:
   * 1. Initial WebMCP connection
   * 2. ToolListChangedNotificationSchema notification
   *
   * @param page - The browser page
   * @param client - The MCP client (passed to avoid infinite loop)
   */
  async syncToolsForPage(
    page: Page,
    client: Client
  ): Promise<{ synced: number; removed: number; updated: number }> {
    if (!this.enabled) return { synced: 0, removed: 0, updated: 0 };
    if (this.syncInProgress.has(page)) return { synced: 0, removed: 0, updated: 0 };

    this.syncInProgress.add(page);
    const urlAtStart = page.url();

    try {
      const { tools } = await client.listTools();

      // Guard: page navigated during async operation
      if (page.url() !== urlAtStart) {
        this.context.logger('Page navigated during sync, aborting');
        return { synced: 0, removed: 0, updated: 0 };
      }

      return this.applyToolChanges(page, tools);
    } catch (err) {
      this.context.logger('Failed to sync WebMCP tools:', err);
      return { synced: 0, removed: 0, updated: 0 };
    } finally {
      this.syncInProgress.delete(page);
    }
  }

  /**
   * Remove all tools for a page. Called on:
   * 1. Transport close (navigation/page close)
   * 2. Manual removal
   */
  removeToolsForPage(page: Page): number {
    const toolIds = this.pageTools.get(page);
    if (!toolIds) return 0;

    let removed = 0;
    for (const toolId of toolIds) {
      const registered = this.registeredTools.get(toolId);
      if (registered) {
        registered.handle.remove();
        this.registeredTools.delete(toolId);
        removed++;
      }
    }

    this.pageTools.delete(page);
    return removed;
  }

  private applyToolChanges(
    page: Page,
    tools: Tool[]
  ): { synced: number; removed: number; updated: number } {
    const domain = extractDomain(page.url());
    const pageIdx = this.context.getPages().indexOf(page);
    const newToolIds = new Set<string>();

    let synced = 0;
    let updated = 0;

    for (const tool of tools) {
      const toolId = this.generateToolId(domain, pageIdx, tool.name);
      newToolIds.add(toolId);

      const existing = this.registeredTools.get(toolId);
      if (existing) {
        // Update existing tool
        existing.handle.update({
          description: this.generateDescription(domain, pageIdx, tool.description),
          inputSchema: tool.inputSchema || { type: 'object', properties: {} },
        });
        updated++;
      } else {
        // Register new tool
        this.registerTool(page, domain, pageIdx, tool);
        synced++;
      }
    }

    // Remove tools that no longer exist
    const existingToolIds = this.pageTools.get(page) || new Set();
    let removed = 0;
    for (const toolId of existingToolIds) {
      if (!newToolIds.has(toolId)) {
        const registered = this.registeredTools.get(toolId);
        if (registered) {
          registered.handle.remove();
          this.registeredTools.delete(toolId);
          removed++;
        }
      }
    }

    this.pageTools.set(page, newToolIds);
    return { synced, removed, updated };
  }

  private registerTool(page: Page, domain: string, pageIdx: number, tool: Tool): void {
    const toolId = this.generateToolId(domain, pageIdx, tool.name);
    const description = this.generateDescription(domain, pageIdx, tool.description);

    const handle = this.server.registerTool(
      toolId,
      {
        description,
        inputSchema: tool.inputSchema || { type: 'object', properties: {} },
      },
      async (params): Promise<CallToolResult> => {
        // IMPORTANT: Look up page dynamically to handle navigation
        const currentPage = this.getPageForTool(toolId);
        if (!currentPage) {
          return {
            content: [{ type: 'text', text: 'Tool no longer available - page may have closed or navigated' }],
            isError: true,
          };
        }
        return this.executeTool(currentPage, tool.name, params);
      }
    );

    this.registeredTools.set(toolId, {
      handle,
      page,
      originalName: tool.name,
      domain,
      toolId,
    });

    // Track tool for this page
    const pageToolSet = this.pageTools.get(page) || new Set();
    pageToolSet.add(toolId);
    this.pageTools.set(page, pageToolSet);
  }

  private async executeTool(
    page: Page,
    toolName: string,
    args: Record<string, unknown>
  ): Promise<CallToolResult> {
    try {
      const result = await this.context.getWebMCPClient(page);
      if (!result.connected) {
        return {
          content: [{ type: 'text', text: 'WebMCP connection lost' }],
          isError: true,
        };
      }

      return await result.client.callTool({ name: toolName, arguments: args });
    } catch (err) {
      return {
        content: [{ type: 'text', text: `Tool error: ${err instanceof Error ? err.message : String(err)}` }],
        isError: true,
      };
    }
  }

  private getPageForTool(toolId: string): Page | undefined {
    const registered = this.registeredTools.get(toolId);
    return registered?.page;
  }

  private generateToolId(domain: string, pageIdx: number, toolName: string): string {
    return `webmcp_${domain}_page${pageIdx}_${sanitizeName(toolName)}`;
  }

  private generateDescription(domain: string, pageIdx: number, originalDescription?: string): string {
    const displayDomain = getDisplayDomain(domain);
    return `[WebMCP • ${displayDomain} • Page ${pageIdx}] ${originalDescription || 'No description'}`;
  }

  getToolCount(): number {
    return this.registeredTools.size;
  }

  getRegisteredToolIds(): string[] {
    return Array.from(this.registeredTools.keys());
  }
}

// Helper functions (exported for testing)
export function sanitizeName(name: string): string {
  return name.replace(/[^a-zA-Z0-9_]/g, '_');
}

export function extractDomain(url: string): string {
  try {
    const urlObj = new URL(url);
    const hostname = urlObj.hostname;
    const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]';
    const domain = isLocalhost ? `localhost_${urlObj.port || '80'}` : hostname;
    return sanitizeName(domain);
  } catch {
    return 'unknown';
  }
}

export function getDisplayDomain(sanitizedDomain: string): string {
  return sanitizedDomain
    .replace(/^localhost_(\d+)$/, 'localhost:$1')
    .replace(/_/g, '.');
}
```

---

## McpContext Integration

```typescript
// In McpContext.ts

import { ToolListChangedNotificationSchema } from './third_party/index.js';
import type { WebMCPToolHub } from './tools/WebMCPToolHub.js';

export class McpContext {
  // ... existing code ...

  #toolHub?: WebMCPToolHub;

  setToolHub(hub: WebMCPToolHub): void {
    this.#toolHub = hub;
  }

  async getWebMCPClient(page?: Page): Promise<WebMCPClientResult> {
    const targetPage = page ?? this.getSelectedPage();

    // ... existing connection check/cleanup code ...

    // Connect
    try {
      const transport = new WebMCPClientTransport({
        page: targetPage,
        readyTimeout: 10000,
        requireWebMCP: false,
      });

      const client = new Client(
        { name: 'chrome-devtools-mcp', version: '1.0.0' },
        { capabilities: {} }
      );

      // Set up onclose handler
      transport.onclose = () => {
        const currentConn = this.#webMCPConnections.get(targetPage);
        if (currentConn?.client === client) {
          this.#webMCPConnections.delete(targetPage);
        }

        // Remove tools for this page on transport close
        this.#toolHub?.removeToolsForPage(targetPage);
      };

      await client.connect(transport);

      // Store connection
      this.#webMCPConnections.set(targetPage, { client, transport, page: targetPage });

      // Subscribe to tool list changes
      const serverCapabilities = client.getServerCapabilities();
      if (serverCapabilities?.tools?.listChanged && this.#toolHub) {
        client.setNotificationHandler(ToolListChangedNotificationSchema, async () => {
          this.logger('WebMCP tools changed, re-syncing...');
          await this.#toolHub?.syncToolsForPage(targetPage, client);
        });
      }

      // Initial tool sync
      if (this.#toolHub) {
        await this.#toolHub.syncToolsForPage(targetPage, client);
      }

      return { connected: true, client };
    } catch (err) {
      return {
        connected: false,
        error: `Failed to connect: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }
}
```

---

## CLI Changes

```typescript
// In cli.ts, add to cliOptions:

disableWebmcpAutoRegister: {
  type: 'boolean',
  default: false,
  description: 'Disable automatic registration of WebMCP tools as native MCP tools. ' +
    'When disabled, use list_webmcp_tools and call_webmcp_tool instead.',
},
```

---

## main.ts Changes

```typescript
// Update server capabilities
const server = new McpServer(
  {
    name: 'chrome_devtools',
    title: 'Chrome DevTools MCP server',
    version: VERSION,
  },
  {
    capabilities: {
      logging: {},
      prompts: {},
      tools: { listChanged: true },  // <-- ADD THIS
    },
  }
);

// After context creation
import { WebMCPToolHub } from './tools/WebMCPToolHub.js';

// In getContext()
if (context?.browser !== browser) {
  context = await McpContext.from(browser, logger, { ... });

  // Initialize tool hub
  if (!args.disableWebmcpAutoRegister) {
    const toolHub = new WebMCPToolHub(server, context);
    context.setToolHub(toolHub);
  }
}
```

---

## Backward Compatibility

### Legacy Tools Remain Available

The existing `list_webmcp_tools` and `call_webmcp_tool` will continue to work for:
- Clients that don't support `list_changed`
- Debugging/inspection purposes
- Explicit control over which page to query

### Opt-Out Flag

```bash
# Disable dynamic registration
chrome-devtools-mcp --disable-webmcp-auto-register
```

---

## Open Questions (Resolved)

1. **Track by Page object or pageIdx?**
   - **Decision:** Track by `Page` object using `WeakMap` for auto-cleanup

2. **Should tools persist across navigation?**
   - **Decision:** Remove immediately on navigation (transport `onclose`)

3. **Tool naming when page index changes?**
   - **Decision:** Tool IDs are generated dynamically using current page index

4. **Same domain on multiple tabs?**
   - **Behavior:** Tools have different page indexes, e.g., `webmcp_github_com_page0_*` and `webmcp_github_com_page1_*`

---

## Success Criteria

- [ ] WebMCP tools appear as native MCP tools in `client.listTools()`
- [ ] Tool naming follows convention: `webmcp_{domain}_page{idx}_{name}`
- [ ] Tools are automatically registered on WebMCP connection
- [ ] Tools are automatically removed on page navigation/close
- [ ] Tools are updated when WebMCP sends `list_changed` notification
- [ ] `list_changed` notifications work with Claude Code
- [ ] Legacy `list_webmcp_tools`/`call_webmcp_tool` still work
- [ ] CLI flag allows disabling auto-registration
- [ ] All TDD tests pass
- [ ] No regressions in existing functionality
