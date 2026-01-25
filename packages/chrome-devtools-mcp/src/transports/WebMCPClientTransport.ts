/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type {Transport} from '@modelcontextprotocol/sdk/shared/transport.js';
import type {JSONRPCMessage} from '@modelcontextprotocol/sdk/types.js';
import type {CDPSession, Page} from 'puppeteer-core';

import {WEB_MCP_BRIDGE_SCRIPT, CHECK_WEBMCP_AVAILABLE_SCRIPT} from './WebMCPBridgeScript.js';
import {CDP_BRIDGE_WINDOW_PROPERTY, CDP_BRIDGE_BINDING} from './bridgeConstants.js';

/**
 * WebMCP CDP Bridge interface injected into the page via window property.
 */
interface WebMCPCdpBridge {
  version: string;
  toServer(msg: string): boolean;
  checkReady(): void;
  dispose(): void;
}

/**
 * CDP Bridge binding function for receiving messages from the page.
 */
type McpBridgeToClientFn = (payload: string) => void;

/**
 * Window extensions added by the WebMCP CDP bridge.
 */
interface WindowWithMCPBridge extends Window {
  [CDP_BRIDGE_WINDOW_PROPERTY]?: WebMCPCdpBridge;
  [CDP_BRIDGE_BINDING]?: McpBridgeToClientFn;
}

/**
 * Options for creating a WebMCPClientTransport
 */
export interface WebMCPClientTransportOptions {
  /**
   * The Puppeteer page to connect to.
   * The page should have @mcp-b/global loaded with a TabServerTransport running.
   */
  page: Page;

  /**
   * Timeout in milliseconds for the server ready handshake.
   * @default 10000
   */
  readyTimeout?: number;

  /**
   * Whether to throw an error if WebMCP is not detected on the page.
   * If false, the transport will still try to connect.
   * @default true
   */
  requireWebMCP?: boolean;
}

/**
 * Result of checking for WebMCP availability
 */
export interface WebMCPCheckResult {
  available: boolean;
  type?: 'modelContext' | 'bridge';
  /** Set when an error occurred during check (e.g., page closed) */
  error?: string;
}

/**
 * Result of injecting the bridge script
 */
interface BridgeInjectionResult {
  success?: boolean;
  alreadyInjected?: boolean;
  version?: string;
}

/**
 * MCP Client Transport that connects to a WebMCP server running in a browser tab.
 *
 * This transport uses Chrome DevTools Protocol (CDP) to inject a bridge script
 * into the page, which then ferries MCP messages between this transport and
 * the page's TabServerTransport via window.postMessage.
 *
 * Architecture:
 * ```
 * WebMCPClientTransport (Node.js)
 *     │
 *     │ CDP (Runtime.evaluate / Runtime.bindingCalled)
 *     ▼
 * Bridge Script (injected into page)
 *     │
 *     │ window.postMessage
 *     ▼
 * TabServerTransport (@mcp-b/global)
 *     │
 *     ▼
 * MCP Server (tools, resources, prompts)
 * ```
 *
 * @example
 * ```typescript
 * import { Client } from '@modelcontextprotocol/sdk/client/index.js';
 * import { WebMCPClientTransport } from './transports/WebMCPClientTransport.js';
 *
 * const transport = new WebMCPClientTransport({ page });
 * const client = new Client({ name: 'my-client', version: '1.0.0' });
 *
 * await client.connect(transport);
 * const { tools } = await client.listTools();
 * ```
 */
export class WebMCPClientTransport implements Transport {
  private _page: Page;
  private _cdpSession: CDPSession | null = null;
  private _started = false;
  /** Guards against concurrent start() calls. */
  private _starting = false;
  private _closed = false;
  private _readyTimeout: number;
  private _requireWebMCP: boolean;

  private _serverReady = false;
  private _serverReadyPromise: Promise<void>;
  private _serverReadyResolve!: () => void;
  private _serverReadyReject!: (err: Error) => void;
  /** Tracks if promise was rejected to prevent double rejection. */
  private _serverReadyRejected = false;

  /** Bound handler for frame navigation events (stored for cleanup). */
  private _frameNavigatedHandler: ((frame: unknown) => void) | null = null;
  /** Bound handler for CDP binding calls (stored for cleanup). */
  private _bindingCalledHandler: ((event: {name: string; payload: string}) => void) | null = null;
  /** Guards against concurrent navigation handling. */
  private _navigationInProgress = false;

  /** Callback invoked when transport is closed. */
  onclose?: () => void;
  /** Callback invoked when an error occurs. */
  onerror?: (error: Error) => void;
  /** Callback invoked when a JSON-RPC message is received. */
  onmessage?: (message: JSONRPCMessage) => void;

  /**
   * Check if the transport has been closed.
   * This is useful for clients to check if they need to reconnect
   * after a page navigation or reload.
   */
  isClosed(): boolean {
    return this._closed;
  }

  /**
   * Get the page this transport is connected to.
   * This allows callers to verify the transport is connected to the expected page,
   * which is important when browsers are closed and reopened.
   */
  getPage(): Page {
    return this._page;
  }

  constructor(options: WebMCPClientTransportOptions) {
    this._page = options.page;
    this._readyTimeout = options.readyTimeout ?? 10000;
    this._requireWebMCP = options.requireWebMCP ?? true;

    // Set up server ready promise with attached rejection handler
    // to prevent unhandled rejection if close() is called before start()
    this._serverReadyPromise = new Promise((resolve, reject) => {
      this._serverReadyResolve = resolve;
      this._serverReadyReject = (err: Error) => {
        this._serverReadyRejected = true;
        reject(err);
      };
    });

    // Attach a no-op catch to prevent unhandled rejection warnings
    // The actual error will be propagated when the promise is awaited
    this._serverReadyPromise.catch(() => {
      // Intentionally empty - errors are handled where the promise is awaited
    });
  }

  /**
   * Check if WebMCP is available on the page.
   *
   * Returns `available: false` with an `error` field if the check failed due to
   * page-level issues (closed, navigating, etc.) vs WebMCP simply not being present.
   */
  async checkWebMCPAvailable(): Promise<WebMCPCheckResult> {
    try {
      const result = await this._page.evaluate(CHECK_WEBMCP_AVAILABLE_SCRIPT) as WebMCPCheckResult;
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      // Distinguish between "page is broken" vs "WebMCP not present"
      const isPageError = message.includes('Execution context was destroyed') ||
                          message.includes('Target closed') ||
                          message.includes('Session closed') ||
                          message.includes('Protocol error');
      if (isPageError) {
        return {available: false, error: `Page error: ${message}`};
      }
      // Other errors (e.g., script threw) mean WebMCP is not available
      return {available: false};
    }
  }

  /**
   * Start the transport and establish connection to the WebMCP server.
   *
   * This method:
   * 1. Creates a CDP session
   * 2. Sets up the binding for receiving messages from the page
   * 3. Injects the bridge script
   * 4. Initiates the server-ready handshake
   * 5. Waits for the server to be ready (with timeout)
   */
  async start(): Promise<void> {
    if (this._started) {
      throw new Error('WebMCPClientTransport already started');
    }

    if (this._starting) {
      throw new Error('WebMCPClientTransport start already in progress');
    }

    if (this._closed) {
      throw new Error('WebMCPClientTransport has been closed');
    }

    this._starting = true;

    try {
      // Check if WebMCP is available
      if (this._requireWebMCP) {
        const check = await this.checkWebMCPAvailable();
        if (!check.available) {
          const errorDetail = check.error ? ` (${check.error})` : '';
          throw new Error(
            `WebMCP not detected on this page${errorDetail}. ` +
              'Ensure @mcp-b/global is loaded and initialized.'
          );
        }
      }

      // Create CDP session for this page
      this._cdpSession = await this._page.createCDPSession();

      // Enable Runtime domain for bindings and evaluation
      await this._cdpSession.send('Runtime.enable');

      // Set up binding for receiving messages from the bridge
      // When the bridge calls window.__mcpBridgeToClient(msg), we receive it here
      await this._cdpSession.send('Runtime.addBinding', {
        name: CDP_BRIDGE_BINDING,
      });

      // Create bound handlers so we can remove them later
      this._bindingCalledHandler = (event: {name: string; payload: string}) => {
        if (event.name !== CDP_BRIDGE_BINDING) return;
        // Guard against processing messages after close
        if (this._closed) return;

        let payload;
        try {
          payload = JSON.parse(event.payload);
        } catch (err) {
          this.onerror?.(
            new Error(
              `Failed to parse JSON message from bridge: ${err instanceof Error ? err.message : String(err)}. ` +
              `Raw payload: ${event.payload.substring(0, 200)}`
            )
          );
          return;
        }

        try {
          this._handlePayload(payload);
        } catch (err) {
          this.onerror?.(
            new Error(
              `Failed to handle message from bridge: ${err instanceof Error ? err.message : String(err)}`
            )
          );
        }
      };

      this._frameNavigatedHandler = (frame: unknown) => {
        if (frame === this._page.mainFrame()) {
          // Main frame navigated - check if bridge survived (SPA navigation)
          this._handleNavigation().catch((err) => {
            // Log navigation handling errors for debugging
            const message = err instanceof Error ? err.message : String(err);
            const logFn = console.debug || console.log;
            logFn('[WebMCPClientTransport] Navigation handling error:', message);
          });
        }
      };

      // Listen for binding calls (messages from bridge → this transport)
      this._cdpSession.on('Runtime.bindingCalled', this._bindingCalledHandler);

      // Listen for page navigation to detect when bridge is lost
      this._page.on('framenavigated', this._frameNavigatedHandler);

      // Inject the bridge script
      const result = await this._page.evaluate(WEB_MCP_BRIDGE_SCRIPT) as BridgeInjectionResult;

      if (!result.success && !result.alreadyInjected) {
        throw new Error('Failed to inject WebMCP bridge script');
      }

      this._started = true;

      // Initiate server-ready handshake
      await this._page.evaluate((bridgeProp: string) => {
        (window as WindowWithMCPBridge)[bridgeProp as typeof CDP_BRIDGE_WINDOW_PROPERTY]?.checkReady();
      }, CDP_BRIDGE_WINDOW_PROPERTY);

      // Wait for server ready with timeout
      const timeoutPromise = new Promise<never>((_, reject) => {
        const timer = setTimeout(() => {
          reject(
            new Error(
              `WebMCP server did not respond within ${this._readyTimeout}ms. ` +
                'Ensure TabServerTransport is running on the page.'
            )
          );
        }, this._readyTimeout);

        // Clear timeout if promise resolves
        this._serverReadyPromise.then(() => clearTimeout(timer)).catch(() => clearTimeout(timer));
      });

      try {
        await Promise.race([this._serverReadyPromise, timeoutPromise]);
      } catch (err) {
        await this.close();
        throw err;
      }
    } catch (err) {
      // Clean up on any error during start
      this._starting = false;
      if (!this._closed) {
        await this._cleanup();
      }
      throw err;
    } finally {
      this._starting = false;
    }
  }

  /**
   * Handle a payload received from the bridge
   */
  private _handlePayload(payload: unknown): void {
    // Guard against processing messages after close
    if (this._closed) return;

    // Handle special string payloads (handshake signals)
    if (typeof payload === 'string') {
      if (payload === 'mcp-server-ready') {
        if (!this._serverReady) {
          this._serverReady = true;
          this._serverReadyResolve();
        }
        return;
      }

      if (payload === 'mcp-server-stopped') {
        this._handleServerStopped();
        return;
      }

      // Unknown string payload - might be an error
      this.onerror?.(new Error(`Unexpected string payload: ${payload}`));
      return;
    }

    // Handle JSON-RPC messages
    if (typeof payload === 'object' && payload !== null) {
      // Resolve server ready on first real message too
      if (!this._serverReady) {
        this._serverReady = true;
        this._serverReadyResolve();
      }

      this.onmessage?.(payload as JSONRPCMessage);
    }
  }

  /**
   * Handle page navigation - check if OUR BRIDGE survived (SPA navigation)
   *
   * The `framenavigated` event fires for BOTH:
   * 1. Full page navigations (where the bridge IS destroyed)
   * 2. Client-side SPA navigations via History API (where the bridge survives)
   *
   * For SPA navigations (React Router, TanStack Router, Next.js, etc.),
   * the page doesn't actually reload - only the URL changes.
   * The injected bridge script remains intact and functional.
   *
   * IMPORTANT: We check for OUR bridge (window.__mcpCdpBridge), not just the
   * page's WebMCP availability. A full navigation to another WebMCP page would
   * have a new TabServerTransport but our bridge would be destroyed.
   */
  private async _handleNavigation(): Promise<void> {
    // Guard against concurrent navigation handling
    if (this._closed || this._navigationInProgress) return;
    this._navigationInProgress = true;

    try {
      // Give the page a moment to settle after navigation
      // This helps with rapid SPA navigations
      await new Promise(resolve => setTimeout(resolve, 50));

      // Re-check closed state after the wait (could have been closed during delay)
      if (this._closed) return;

      // Check if OUR BRIDGE survived the navigation (not just the page's WebMCP)
      // This distinguishes SPA navigation from full navigation to another WebMCP page
      try {
        const bridgeAlive = await this._page.evaluate((bridgeProp: string) => {
          return !!(window as WindowWithMCPBridge)[bridgeProp as typeof CDP_BRIDGE_WINDOW_PROPERTY];
        }, CDP_BRIDGE_WINDOW_PROPERTY);

        if (bridgeAlive) {
          // Our bridge survived - this was an SPA navigation, don't close
          const logFn = console.debug || console.log;
          logFn('[WebMCPClientTransport] Bridge survived navigation (SPA), keeping connection open');
          return;
        }
      } catch {
        // Evaluation failed - page context is gone, proceed with close
      }

      // Re-check closed state (could have been closed during bridge check)
      if (this._closed) return;

      // Bridge is lost - full navigation occurred
      this._serverReady = false;
      this._closed = true;
      this._started = false;

      // Reject any pending server ready promise (safe - has attached catch handler)
      if (!this._serverReadyRejected) {
        this._serverReadyReject(new Error('Page navigated, connection lost'));
      }

      // Full teardown - detach CDP session and remove listeners
      this._cleanup().catch((err) => {
        // Cleanup errors during navigation are expected and non-critical
        const message = err instanceof Error ? err.message : String(err);
        const logFn = console.debug || console.log;
        logFn('[WebMCPClientTransport] Cleanup error during navigation (non-critical):', message);
      });

      // Signal clean disconnection (not an error)
      this.onclose?.();
    } finally {
      this._navigationInProgress = false;
    }
  }

  /**
   * Handle server stopped signal
   */
  private _handleServerStopped(): void {
    if (this._closed) return;
    this._serverReady = false;
    this.onerror?.(new Error('WebMCP server stopped'));
  }

  /**
   * Send a JSON-RPC message to the WebMCP server
   */
  async send(message: JSONRPCMessage): Promise<void> {
    if (!this._started) {
      throw new Error('WebMCPClientTransport not started');
    }

    if (this._closed) {
      throw new Error('WebMCPClientTransport has been closed');
    }

    // Wait for server to be ready before sending
    await this._serverReadyPromise;

    // Send via CDP → bridge → postMessage → TabServer
    try {
      // JSON.stringify inside try block to catch non-serializable messages
      const messageJson = JSON.stringify(message);

      await this._page.evaluate(
        (msg: string, bridgeProp: string) => {
          const bridge = (window as WindowWithMCPBridge)[bridgeProp as typeof CDP_BRIDGE_WINDOW_PROPERTY];
          if (!bridge) {
            throw new Error('WebMCP bridge not found');
          }
          const sent = bridge.toServer(msg);
          if (!sent) {
            throw new Error('Bridge failed to send message');
          }
        },
        messageJson,
        CDP_BRIDGE_WINDOW_PROPERTY
      );
    } catch (err) {
      const error = new Error(`Failed to send message: ${err}`);
      this.onerror?.(error);
      throw error;
    }
  }

  /**
   * Internal cleanup method - removes listeners and detaches CDP session.
   * Does not set _closed flag or call onclose (caller handles those).
   */
  private async _cleanup(): Promise<void> {
    // Remove page event listener
    if (this._frameNavigatedHandler) {
      this._page.off('framenavigated', this._frameNavigatedHandler);
      this._frameNavigatedHandler = null;
    }

    // Remove CDP event listener
    if (this._cdpSession && this._bindingCalledHandler) {
      this._cdpSession.off('Runtime.bindingCalled', this._bindingCalledHandler);
      this._bindingCalledHandler = null;
    }

    // Dispose the bridge script if possible
    try {
      await this._page.evaluate((bridgeProp: string) => {
        (window as WindowWithMCPBridge)[bridgeProp as typeof CDP_BRIDGE_WINDOW_PROPERTY]?.dispose();
      }, CDP_BRIDGE_WINDOW_PROPERTY);
    } catch (err) {
      // Cleanup errors during navigation are expected and non-critical
      const message = err instanceof Error ? err.message : String(err);
      const logFn = console.debug || console.log;
      logFn('[WebMCPClientTransport] Bridge dispose skipped:', message);
    }

    // Detach CDP session
    if (this._cdpSession) {
      try {
        await this._cdpSession.detach();
      } catch (err) {
        // Expected when session already detached - log for debugging only
        const message = err instanceof Error ? err.message : String(err);
        const logFn = console.debug || console.log;
        logFn('[WebMCPClientTransport] CDP detach skipped:', message);
      }
      this._cdpSession = null;
    }
  }

  /**
   * Close the transport and clean up resources
   */
  async close(): Promise<void> {
    if (this._closed) return;

    this._closed = true;
    this._started = false;
    this._serverReady = false;

    // Full cleanup
    await this._cleanup();

    // Reject any pending server ready promise (safe - has attached catch handler)
    if (!this._serverReadyRejected) {
      this._serverReadyReject(new Error('Transport closed'));
    }

    this.onclose?.();
  }
}
