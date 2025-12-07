/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type {Transport} from '@modelcontextprotocol/sdk/shared/transport.js';
import type {JSONRPCMessage} from '@modelcontextprotocol/sdk/types.js';
import type {CDPSession, Page} from 'puppeteer-core';

import {WEB_MCP_BRIDGE_SCRIPT, CHECK_WEBMCP_AVAILABLE_SCRIPT} from './WebMCPBridgeScript.js';

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
interface WebMCPCheckResult {
  available: boolean;
  type?: 'modelContext' | 'bridge';
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
  private _closed = false;
  private _readyTimeout: number;
  private _requireWebMCP: boolean;

  private _serverReady = false;
  private _serverReadyPromise: Promise<void>;
  private _serverReadyResolve!: () => void;
  private _serverReadyReject!: (err: Error) => void;

  // Transport callbacks
  onclose?: () => void;
  onerror?: (error: Error) => void;
  onmessage?: (message: JSONRPCMessage) => void;

  constructor(options: WebMCPClientTransportOptions) {
    this._page = options.page;
    this._readyTimeout = options.readyTimeout ?? 10000;
    this._requireWebMCP = options.requireWebMCP ?? true;

    // Set up server ready promise
    this._serverReadyPromise = new Promise((resolve, reject) => {
      this._serverReadyResolve = resolve;
      this._serverReadyReject = reject;
    });
  }

  /**
   * Check if WebMCP is available on the page
   */
  async checkWebMCPAvailable(): Promise<WebMCPCheckResult> {
    try {
      const result = await this._page.evaluate(CHECK_WEBMCP_AVAILABLE_SCRIPT) as WebMCPCheckResult;
      return result;
    } catch {
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

    if (this._closed) {
      throw new Error('WebMCPClientTransport has been closed');
    }

    // Check if WebMCP is available
    if (this._requireWebMCP) {
      const check = await this.checkWebMCPAvailable();
      if (!check.available) {
        throw new Error(
          'WebMCP not detected on this page. ' +
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
      name: '__mcpBridgeToClient',
    });

    // Listen for binding calls (messages from bridge → this transport)
    this._cdpSession.on('Runtime.bindingCalled', event => {
      if (event.name !== '__mcpBridgeToClient') return;

      try {
        const payload = JSON.parse(event.payload);
        this._handlePayload(payload);
      } catch (err) {
        this.onerror?.(
          new Error(`Failed to parse message from bridge: ${err}`)
        );
      }
    });

    // Listen for page navigation to detect when bridge is lost
    this._page.on('framenavigated', frame => {
      if (frame === this._page.mainFrame()) {
        // Main frame navigated, bridge is gone
        this._handleNavigation();
      }
    });

    // Inject the bridge script
    const result = await this._page.evaluate(WEB_MCP_BRIDGE_SCRIPT) as BridgeInjectionResult;

    if (!result.success && !result.alreadyInjected) {
      throw new Error('Failed to inject WebMCP bridge script');
    }

    this._started = true;

    // Initiate server-ready handshake
    await this._page.evaluate(() => {
      (window as unknown as {__mcpBridge: {checkReady: () => void}}).__mcpBridge?.checkReady();
    });

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
  }

  /**
   * Handle a payload received from the bridge
   */
  private _handlePayload(payload: unknown): void {
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
   * Handle page navigation - bridge is lost
   *
   * Navigation is a normal lifecycle event in browsers, not a fatal error.
   * We close the connection gracefully and allow the client to reconnect if needed.
   */
  private _handleNavigation(): void {
    if (this._closed) return;

    this._serverReady = false;

    // Mark as closed to prevent further operations
    this._closed = true;
    this._started = false;

    // Reject any pending server ready promise
    this._serverReadyReject(new Error('Page navigated, connection lost'));

    // Signal clean disconnection (not an error)
    // The client can reconnect by creating a new transport instance
    this.onclose?.();
  }

  /**
   * Handle server stopped signal
   */
  private _handleServerStopped(): void {
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
    const messageJson = JSON.stringify(message);

    try {
      await this._page.evaluate(
        (msg: string) => {
          const bridge = (window as unknown as {__mcpBridge?: {toServer: (msg: string) => boolean}}).__mcpBridge;
          if (!bridge) {
            throw new Error('WebMCP bridge not found');
          }
          const sent = bridge.toServer(msg);
          if (!sent) {
            throw new Error('Bridge failed to send message');
          }
        },
        messageJson
      );
    } catch (err) {
      const error = new Error(`Failed to send message: ${err}`);
      this.onerror?.(error);
      throw error;
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

    // Dispose the bridge script if possible
    try {
      await this._page.evaluate(() => {
        (window as unknown as {__mcpBridge?: {dispose: () => void}}).__mcpBridge?.dispose();
      });
    } catch {
      // Ignore errors during cleanup
    }

    // Detach CDP session
    if (this._cdpSession) {
      try {
        await this._cdpSession.detach();
      } catch {
        // Ignore detach errors
      }
      this._cdpSession = null;
    }

    // Reject any pending server ready promise
    this._serverReadyReject(new Error('Transport closed'));

    this.onclose?.();
  }
}
