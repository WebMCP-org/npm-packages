# CDP → Extension MCP Bridge Implementation Plan

## Overview

Connect chrome-devtools-mcp directly to the MCP-B Extension's McpHub via CDP, enabling:
- Local, low-latency tool access (~1-5ms vs ~50-200ms cloud)
- Offline operation (no CloudMirror dependency)
- Access to ALL extension tools (tabs, userscripts, DOM, screenshots + all website tools)
- Clean page automation (CDP only touches service worker, not pages)

## Architecture

```
┌──────────────────┐      CDP        ┌─────────────────────────┐
│  chrome-devtools │◄───────────────►│  Extension Service      │
│       -mcp       │                 │  Worker (background.js) │
└──────────────────┘                 └───────────┬─────────────┘
         │                                       │
         │ Runtime.evaluate                      │ McpHub
         │ Runtime.bindingCalled                 │
         └───────────────────────────────────────┘
                                                 │
                       chrome.runtime.Port       │
                                                 ▼
                    ┌────────────────────────────────────────┐
                    │  Content Scripts (in tabs)             │
                    │  - website_tool_github_com_123_*       │
                    │  - website_tool_webmcp_sh_456_*        │
                    └────────────────────────────────────────┘
```

**Key Insight:** CDP attaches ONLY to the service worker. Pages remain clean with no `navigator.webdriver` flag.

## MCP SDK Transport Deep Dive

Based on analysis of the official MCP TypeScript SDK (`@modelcontextprotocol/sdk`):

### Transport Interface Contract

From `@modelcontextprotocol/sdk/shared/transport.js`:

```typescript
interface Transport {
  // Lifecycle
  start(): Promise<void>;           // Initialize, take connection steps
  send(message: JSONRPCMessage, options?: TransportSendOptions): Promise<void>;
  close(): Promise<void>;

  // Callbacks (set by Client/Server before start())
  onclose?: () => void;             // Called when connection closes
  onerror?: (error: Error) => void; // Called on errors (not necessarily fatal)
  onmessage?: (message: JSONRPCMessage, extra?: MessageExtraInfo) => void;

  // Optional
  sessionId?: string;
  setProtocolVersion?: (version: string) => void;
}
```

### StdioClientTransport Pattern

The `StdioClientTransport` is the canonical example of a client transport that **spawns the server process**:

```typescript
// Usage - client STARTS the server
const transport = new StdioClientTransport({
  command: "node",
  args: ["server.js"],
  env: { ... },
  cwd: "/path/to/server"
});
await client.connect(transport); // calls transport.start() internally
```

**Key patterns from StdioClientTransport:**

1. **Process Lifecycle Management:**
   ```typescript
   async start() {
     this._process = spawn(command, args, { stdio: ['pipe', 'pipe', 'inherit'] });

     // Resolve when process spawns
     this._process.on('spawn', () => resolve());

     // Reject on spawn error
     this._process.on('error', (err) => reject(err));

     // Call onclose when process exits
     this._process.on('close', () => this.onclose?.());
   }
   ```

2. **Graceful Shutdown in close():**
   ```typescript
   async close() {
     // 1. End stdin gracefully
     this._process.stdin.end();
     await Promise.race([closePromise, timeout(2000)]);

     // 2. SIGTERM if still running
     if (this._process.exitCode === null) {
       this._process.kill('SIGTERM');
       await Promise.race([closePromise, timeout(2000)]);
     }

     // 3. SIGKILL as last resort
     if (this._process.exitCode === null) {
       this._process.kill('SIGKILL');
     }
   }
   ```

3. **Message Framing:** Uses newline-delimited JSON (`JSON.stringify(msg) + '\n'`)

4. **Backpressure Handling:** Returns Promise that resolves on 'drain' if write buffer is full

### Applying to CDPClientTransport

Like StdioClientTransport spawns a process, **CDPClientTransport should launch Chrome**:

```
StdioClientTransport                    CDPClientTransport
─────────────────────                   ─────────────────────
spawn(command, args)         →          launch(chrome, flags)
stdin/stdout                 →          CDP WebSocket
process.on('close')          →          browser.on('disconnected')
process.kill('SIGTERM')      →          browser.close()
```

This means the transport should:
1. Accept launch options (or an existing browser)
2. Launch Chrome with required flags in `start()`
3. Manage browser lifecycle
4. Clean up browser in `close()`

## The Transport Pair Approach

Instead of a custom bridge object, we use a proper MCP transport pair:

```
┌─────────────────────┐             ┌─────────────────────────┐
│  chrome-devtools-   │             │  Extension Service      │
│       mcp           │             │     Worker              │
│                     │             │                         │
│  ┌───────────────┐  │   CDP       │  ┌───────────────┐      │
│  │ MCP Client    │  │◄───────────►│  │ MCP Server    │      │
│  │               │  │             │  │ (McpHub)      │      │
│  └───────┬───────┘  │             │  └───────┬───────┘      │
│          │          │             │          │              │
│  ┌───────▼───────┐  │             │  ┌───────▼───────┐      │
│  │ CDPClient     │  │             │  │ CDPServer     │      │
│  │ Transport     │──┼─────────────┼──│ Transport     │      │
│  └───────────────┘  │             │  └───────────────┘      │
└─────────────────────┘             └─────────────────────────┘

CDPClientTransport.send() ──► Runtime.evaluate() ──► CDPServerTransport.onmessage
CDPServerTransport.send() ──► Runtime.bindingCalled ──► CDPClientTransport.onmessage
```

The transport is just a wire - it doesn't know about MCP semantics. A standard MCP Client connects through it to the extension's MCP Server.

## Implementation Steps

### Phase 1: Extension Side - CDPServerTransport

**File:** `WebMCP/apps/extension/entrypoints/background/cdpBridge.ts` (new)

Create a transport that the extension's McpHub can connect to:

```typescript
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import type { JSONRPCMessage } from '@modelcontextprotocol/sdk/types.js';

/**
 * Server-side transport for CDP bridge.
 *
 * This transport is exposed to CDP via globalThis.__mcpCDPTransport.
 * The chrome-devtools-mcp process sends messages via Runtime.evaluate,
 * and receives messages via Runtime.bindingCalled.
 *
 * IMPORTANT: Only expose this when Chrome is being debugged (CDP attached).
 * The extension should detect CDP attachment and only then create this transport.
 */
export class CDPServerTransport implements Transport {
  private _started = false;
  private _closed = false;

  onclose?: () => void;
  onerror?: (error: Error) => void;
  onmessage?: (message: JSONRPCMessage) => void;

  async start(): Promise<void> {
    if (this._started) return;
    this._started = true;

    // Expose the transport interface for CDP to call
    globalThis.__mcpCDPTransport = {
      isReady: true,
      version: '1.0.0',

      // CDP calls this via Runtime.evaluate to send messages TO the server
      receiveMessage: (jsonStr: string): void => {
        if (this._closed) return;
        try {
          const message = JSON.parse(jsonStr) as JSONRPCMessage;
          this.onmessage?.(message);
        } catch (err) {
          this.onerror?.(new Error(`Failed to parse message: ${err}`));
        }
      },

      // CDP sets this binding to receive messages FROM the server
      // The transport calls this when it has a message to send
      _sendBinding: null as ((jsonStr: string) => void) | null,
    };
  }

  async send(message: JSONRPCMessage): Promise<void> {
    if (this._closed) {
      throw new Error('Transport is closed');
    }

    const binding = globalThis.__mcpCDPTransport?._sendBinding;
    if (!binding) {
      throw new Error('CDP binding not connected');
    }

    binding(JSON.stringify(message));
  }

  async close(): Promise<void> {
    if (this._closed) return;
    this._closed = true;

    delete globalThis.__mcpCDPTransport;
    this.onclose?.();
  }
}

// Type declaration for the global
declare global {
  var __mcpCDPTransport: {
    isReady: boolean;
    version: string;
    receiveMessage: (jsonStr: string) => void;
    _sendBinding: ((jsonStr: string) => void) | null;
  } | undefined;
}
```

**File:** `WebMCP/apps/extension/entrypoints/background/index.ts`

Conditionally initialize when CDP is detected:

```typescript
import { CDPServerTransport } from './cdpBridge';
import { mcpHub } from './src/services/mcpHub';

// Detect CDP attachment and expose transport
// Option 1: Check chrome.debugger API
// Option 2: Expose always, but it's only useful when CDP is connected
// Option 3: Use a message from CDP to trigger initialization

// For now, always expose - CDP connection is the trigger
const cdpTransport = new CDPServerTransport();
await cdpTransport.start();
await mcpHub.server.connect(cdpTransport);
```

---

### Phase 2: chrome-devtools-mcp - CDPClientTransport

**File:** `packages/chrome-devtools-mcp/src/transports/CDPClientTransport.ts` (new)

```typescript
/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type {Transport} from '@modelcontextprotocol/sdk/shared/transport.js';
import type {JSONRPCMessage} from '@modelcontextprotocol/sdk/types.js';
import type {Browser, CDPSession} from 'puppeteer-core';

/**
 * Target info from CDP Target.getTargets
 */
interface TargetInfo {
  targetId: string;
  type: string;
  url: string;
  title?: string;
}

/**
 * Options for CDPClientTransport
 *
 * Like StdioClientTransport, this transport can LAUNCH the browser.
 * Provide either `browser` (existing) or launch options.
 */
export interface CDPClientTransportOptions {
  /**
   * Existing browser instance to connect through.
   * If not provided, the transport will launch Chrome.
   */
  browser?: Browser;

  /**
   * Chrome executable path. Only used if browser is not provided.
   * @default auto-detected
   */
  executablePath?: string;

  /**
   * User data directory for Chrome profile.
   * Only used if browser is not provided.
   */
  userDataDir?: string;

  /**
   * Path to unpacked extension to load.
   * Only used if browser is not provided.
   */
  extensionPath?: string;

  /**
   * Run Chrome in headless mode.
   * Only used if browser is not provided.
   * @default false
   */
  headless?: boolean;

  /**
   * Optional: specific extension ID to connect to.
   * If not provided, connects to the first MCP-B extension found.
   */
  extensionId?: string;

  /**
   * Timeout for finding and connecting to the extension.
   * @default 10000
   */
  connectTimeout?: number;
}

/**
 * MCP Client Transport that connects to an extension's MCP server via CDP.
 *
 * This transport discovers the extension's service worker via CDP,
 * attaches to it, and establishes a bidirectional message channel.
 *
 * Architecture:
 * ```
 * CDPClientTransport (Node.js)
 *     │
 *     │ CDP (Runtime.evaluate / Runtime.bindingCalled)
 *     ▼
 * CDPServerTransport (Extension Service Worker)
 *     │
 *     ▼
 * McpHub (MCP Server)
 * ```
 */
export class CDPClientTransport implements Transport {
  // Launch options (used if browser not provided)
  #launchOptions: Omit<CDPClientTransportOptions, 'browser'>;
  #extensionId?: string;
  #connectTimeout: number;

  // Runtime state
  #browser: Browser | null = null;
  #ownsBrowser = false; // true if we launched it, false if passed in
  #browserCdp: CDPSession | null = null;
  #sessionId: string | null = null;
  #started = false;
  #closed = false;

  /** Bound handler for CDP binding calls */
  #bindingHandler: ((event: {name: string; payload: string}) => void) | null = null;
  /** Bound handler for browser disconnect */
  #disconnectHandler: (() => void) | null = null;

  onclose?: () => void;
  onerror?: (error: Error) => void;
  onmessage?: (message: JSONRPCMessage) => void;

  constructor(options: CDPClientTransportOptions) {
    if (options.browser) {
      this.#browser = options.browser;
      this.#ownsBrowser = false;
    } else {
      this.#ownsBrowser = true; // We'll launch it in start()
    }
    this.#launchOptions = options;
    this.#extensionId = options.extensionId;
    this.#connectTimeout = options.connectTimeout ?? 10000;
  }

  /**
   * Check if the transport has been closed.
   */
  isClosed(): boolean {
    return this.#closed;
  }

  /**
   * Start the transport and connect to the extension's MCP server.
   *
   * Like StdioClientTransport.start() spawns the server process,
   * this method launches Chrome if no browser was provided.
   */
  async start(): Promise<void> {
    if (this.#started) {
      throw new Error('CDPClientTransport already started! If using Client class, note that connect() calls start() automatically.');
    }
    if (this.#closed) {
      throw new Error('CDPClientTransport has been closed');
    }

    this.#started = true;

    try {
      // 1. Launch browser if not provided (like StdioClientTransport spawns process)
      if (!this.#browser) {
        this.#browser = await this.#launchBrowser();
      }

      // Set up browser disconnect handler (like process 'close' event)
      this.#disconnectHandler = () => {
        if (this.#closed) return;
        this.#browser = null;
        this.onclose?.();
      };
      this.#browser.on('disconnected', this.#disconnectHandler);

      // 2. Get browser-level CDP session
      const browserTarget = this.#browser.target();
      this.#browserCdp = await browserTarget.createCDPSession();

      // 2. Find extension service worker
      const swTarget = await this.#findExtensionServiceWorker();
      if (!swTarget) {
        throw new Error(
          this.#extensionId
            ? `Extension ${this.#extensionId} service worker not found`
            : 'No MCP-B extension service worker found. Is the extension installed?'
        );
      }

      // 3. Attach to the service worker target
      const {sessionId} = await this.#browserCdp.send('Target.attachToTarget', {
        targetId: swTarget.targetId,
        flatten: true,
      });
      this.#sessionId = sessionId;

      // 4. Enable Runtime domain in the service worker context
      await this.#browserCdp.send('Runtime.enable', {}, this.#sessionId);

      // 5. Add binding for receiving messages from the extension
      await this.#browserCdp.send(
        'Runtime.addBinding',
        {name: '__mcpCDPToClient'},
        this.#sessionId
      );

      // 6. Set up handler for binding calls
      this.#bindingHandler = (event: {name: string; payload: string}) => {
        if (event.name !== '__mcpCDPToClient') return;
        if (this.#closed) return;

        try {
          const message = JSON.parse(event.payload) as JSONRPCMessage;
          this.onmessage?.(message);
        } catch (err) {
          this.onerror?.(new Error(`Failed to parse message: ${err}`));
        }
      };
      this.#browserCdp.on('Runtime.bindingCalled', this.#bindingHandler);

      // 7. Verify the extension has the CDP transport ready
      const {result} = await this.#browserCdp.send(
        'Runtime.evaluate',
        {
          expression: 'globalThis.__mcpCDPTransport?.isReady === true',
        },
        this.#sessionId
      );

      if (!result.value) {
        throw new Error(
          'Extension CDP transport not found. ' +
            'Ensure the extension has CDP bridge enabled.'
        );
      }

      // 8. Connect our binding to the extension's transport
      await this.#browserCdp.send(
        'Runtime.evaluate',
        {
          expression: `
            globalThis.__mcpCDPTransport._sendBinding = (jsonStr) => {
              __mcpCDPToClient(jsonStr);
            };
          `,
        },
        this.#sessionId
      );
    } catch (err) {
      this.#started = false;
      await this.#cleanup();
      throw err;
    }
  }

  /**
   * Launch Chrome with extension bridge flags.
   * Similar to how StdioClientTransport spawns the server process.
   */
  async #launchBrowser(): Promise<Browser> {
    const puppeteer = await import('puppeteer-core');

    const args = [
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-background-timer-throttling',
      '--disable-backgrounding-occluded-windows',
      '--disable-renderer-backgrounding',
      // Required for extension debugging without popup
      '--silent-debugger-extension-api',
    ];

    // Load extension if path provided
    if (this.#launchOptions.extensionPath) {
      args.push(`--load-extension=${this.#launchOptions.extensionPath}`);
      args.push(`--disable-extensions-except=${this.#launchOptions.extensionPath}`);
    }

    return puppeteer.launch({
      executablePath: this.#launchOptions.executablePath,
      userDataDir: this.#launchOptions.userDataDir,
      headless: this.#launchOptions.headless ?? false,
      args,
    });
  }

  /**
   * Find the extension's service worker target.
   */
  async #findExtensionServiceWorker(): Promise<TargetInfo | null> {
    if (!this.#browserCdp) return null;

    const {targetInfos} = (await this.#browserCdp.send('Target.getTargets')) as {
      targetInfos: TargetInfo[];
    };

    return targetInfos.find((t) => {
      if (t.type !== 'service_worker') return false;
      if (!t.url.startsWith('chrome-extension://')) return false;
      if (this.#extensionId && !t.url.includes(this.#extensionId)) return false;
      return true;
    }) ?? null;
  }

  /**
   * Send a JSON-RPC message to the extension's MCP server.
   */
  async send(message: JSONRPCMessage): Promise<void> {
    if (!this.#started) {
      throw new Error('CDPClientTransport not started');
    }
    if (this.#closed) {
      throw new Error('CDPClientTransport has been closed');
    }
    if (!this.#browserCdp || !this.#sessionId) {
      throw new Error('CDP session not available');
    }

    const jsonStr = JSON.stringify(message);

    try {
      await this.#browserCdp.send(
        'Runtime.evaluate',
        {
          expression: `globalThis.__mcpCDPTransport.receiveMessage(${JSON.stringify(jsonStr)})`,
        },
        this.#sessionId
      );
    } catch (err) {
      const error = new Error(`Failed to send message: ${err}`);
      this.onerror?.(error);
      throw error;
    }
  }

  /**
   * Clean up CDP resources.
   */
  async #cleanup(): Promise<void> {
    // Remove binding handler
    if (this.#browserCdp && this.#bindingHandler) {
      this.#browserCdp.off('Runtime.bindingCalled', this.#bindingHandler);
      this.#bindingHandler = null;
    }

    // Detach from service worker
    if (this.#browserCdp && this.#sessionId) {
      try {
        await this.#browserCdp.send('Target.detachFromTarget', {
          sessionId: this.#sessionId,
        });
      } catch {
        // Ignore detach errors
      }
      this.#sessionId = null;
    }

    // Detach browser CDP session
    if (this.#browserCdp) {
      try {
        await this.#browserCdp.detach();
      } catch {
        // Ignore detach errors
      }
      this.#browserCdp = null;
    }
  }

  /**
   * Close the transport and clean up resources.
   *
   * Like StdioClientTransport.close() which gracefully terminates the process,
   * this method closes the browser if we own it.
   */
  async close(): Promise<void> {
    if (this.#closed) return;

    this.#closed = true;
    this.#started = false;

    await this.#cleanup();

    // Close browser if we launched it (like killing the spawned process)
    if (this.#ownsBrowser && this.#browser) {
      try {
        // Remove disconnect handler before closing to avoid double onclose
        if (this.#disconnectHandler) {
          this.#browser.off('disconnected', this.#disconnectHandler);
          this.#disconnectHandler = null;
        }

        // Graceful close with timeout (like StdioClientTransport's SIGTERM → SIGKILL)
        const closePromise = this.#browser.close();
        await Promise.race([
          closePromise,
          new Promise(resolve => setTimeout(resolve, 5000))
        ]);
      } catch {
        // Ignore close errors
      }
      this.#browser = null;
    }

    this.onclose?.();
  }
}
```

---

### Phase 3: CLI Integration

**File:** `packages/chrome-devtools-mcp/src/cli.ts`

Add new options:
```typescript
.option('--extension-bridge', 'Connect to MCP-B extension instead of pages', {
  default: false
})
.option('--extension-id <id>', 'Specific extension ID to connect to')
```

**File:** `packages/chrome-devtools-mcp/src/main.ts`

Add extension bridge mode:
```typescript
if (args.extensionBridge) {
  // Launch with --silent-debugger-extension-api
  browser = await ensureBrowserLaunched({
    ...options,
    extraArgs: ['--silent-debugger-extension-api']
  });

  // Create extension transport
  const transport = new CDPClientTransport({
    browser,
    extensionId: args.extensionId
  });
  await transport.start();

  // Connect MCP client to extension's MCP server
  const client = new Client({ name: 'extension-bridge', version: '1.0.0' });
  await client.connect(transport);

  // Sync extension tools to our tool hub
  await toolHub.syncToolsFromExtension(client);
}
```

---

### Phase 4: browser.ts Changes

**File:** `packages/chrome-devtools-mcp/src/browser.ts`

Add `--silent-debugger-extension-api` flag when extension bridge is enabled:

```typescript
export interface LaunchOptions {
  // ... existing options
  extensionBridge?: boolean;
}

// In buildLaunchArgs():
if (options.extensionBridge) {
  args.push('--silent-debugger-extension-api');
}
```

---

## Files to Modify/Create

### This Repo (chrome-devtools-mcp) - Runs Locally

| File | Action | Purpose |
|------|--------|---------|
| `src/transports/CDPClientTransport.ts` | Create | New CDP→Extension transport |
| `src/transports/index.ts` | Modify | Export CDPClientTransport |
| `src/cli.ts` | Modify | Add --extension-bridge flag |
| `src/main.ts` | Modify | Handle extension bridge mode |
| `src/browser.ts` | Modify | Add --silent-debugger-extension-api |
| `src/tools/WebMCPToolHub.ts` | Modify | Add syncToolsFromExtension() |

### WebMCP Repo (Extension) - Runs in Browser

| File | Action | Purpose |
|------|--------|---------|
| `apps/extension/.../background/cdpBridge.ts` | Create | CDPServerTransport class |
| `apps/extension/.../background/index.ts` | Modify | Conditionally initialize CDP bridge |

---

## Extension Side Notes

**When to expose the CDP bridge:**

The extension should ideally only expose `__mcpCDPTransport` when it detects it's being debugged. Options:

1. **Always expose** (simplest) - The transport does nothing unless CDP connects
2. **Detect CDP attachment** - Use `chrome.debugger` API or other signals
3. **Lazy initialization** - CDP sends an "init" message that triggers transport creation

For initial implementation, option 1 (always expose) is recommended. The transport is inert without a CDP connection.

**Service Worker lifecycle:**

Chrome may suspend the service worker after 30 seconds of inactivity. The transport should:
- Implement keep-alive pings if needed
- Handle reconnection gracefully if the worker restarts

---

## Verification Plan

### Manual Testing

1. **Extension Side:**
   ```bash
   cd WebMCP && pnpm build
   # Load unpacked extension in Chrome
   ```

2. **chrome-devtools-mcp Side:**
   ```bash
   cd packages/chrome-devtools-mcp
   pnpm build

   # Test extension bridge mode
   node ./dist/cli.js --extension-bridge
   ```

3. **Verify:**
   - Call `tools/list` - should see extension tools
   - Call `tabs_list` - should return open tabs
   - Call `website_tool_*` - should execute on pages
   - Pages should have no `navigator.webdriver` flag

### Unit Tests

**File:** `chrome-devtools-mcp/tests/transports/CDPClientTransport.test.ts`

```typescript
describe('CDPClientTransport', () => {
  it('connects to extension service worker');
  it('throws if no extension found');
  it('sends and receives JSON-RPC messages');
  it('handles disconnection gracefully');
});
```

---

## Decisions Made

1. **Mode:** Separate `--extension-bridge` flag (explicit, predictable)
2. **Code Location:**
   - Local transport code → this repo (chrome-devtools-mcp)
   - Extension bridge code → WebMCP repo (in extension)
3. **Transport Pattern:** Proper Transport interface with send/onmessage (not request/response)

## Open Questions

1. **Extension Installation:** Manual installation first (auto-install as future enhancement)
2. **Multiple Extensions:** Use `--extension-id` flag, default to first found
3. **Tool Naming:** Keep `website_tool_*` prefix for CloudMirror consistency
4. **Keep-alive:** May need ping mechanism to prevent service worker suspension
