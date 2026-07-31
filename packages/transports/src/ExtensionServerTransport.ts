import {
  type JSONRPCMessage,
  type Transport,
  type TransportSendOptions,
} from '@modelcontextprotocol/server';
import { JSONRPCMessageSchema } from '@modelcontextprotocol/core';

/**
 * Configuration options for ExtensionServerTransport
 */
export type ExtensionServerTransportOptions = {
  /**
   * Enable keep-alive mechanism to prevent service worker shutdown
   * Default: true
   */
  keepAlive?: boolean;

  /**
   * Keep-alive interval in milliseconds
   * Default: 25000 (25 seconds, less than Chrome's 30-second timeout)
   */
  keepAliveInterval?: number;
};

/**
 * Server transport for Chrome extensions using Port-based messaging.
 * This transport handles a single client connection through Chrome's port messaging API.
 * It should be used in the extension's background service worker.
 *
 * Features:
 * - Keep-alive mechanism to prevent service worker shutdown
 * - Graceful connection state management
 */
export class ExtensionServerTransport implements Transport {
  private _port: chrome.runtime.Port | undefined;
  private _started = false;
  private _closed = false;
  private _messageHandler: ((message: unknown, port: chrome.runtime.Port) => void) | undefined;
  private _disconnectHandler: ((port: chrome.runtime.Port) => void) | undefined;
  private _keepAliveTimer: ReturnType<typeof setInterval> | undefined;
  private _options: Required<ExtensionServerTransportOptions>;
  private _connectionInfo: {
    connectedAt: number;
    lastMessageAt: number;
    messageCount: number;
  };

  onclose?: () => void;
  onerror?: (error: Error) => void;
  onmessage?: (message: JSONRPCMessage) => void;

  constructor(port: chrome.runtime.Port, options: ExtensionServerTransportOptions = {}) {
    this._port = port;
    this._options = {
      keepAlive: options.keepAlive ?? true,
      keepAliveInterval: options.keepAliveInterval ?? 1000,
    };
    this._connectionInfo = {
      connectedAt: Date.now(),
      lastMessageAt: Date.now(),
      messageCount: 0,
    };
  }

  /**
   * Starts the transport and begins handling messages
   */
  async start(): Promise<void> {
    if (this._closed) {
      throw new Error('ExtensionServerTransport cannot be restarted after it closes');
    }
    if (this._started) {
      throw new Error(
        'ExtensionServerTransport already started! If using Server class, note that connect() calls start() automatically.'
      );
    }

    if (!this._port) {
      throw new Error('Port not available');
    }

    this._started = true;

    // Set up message handler
    const port = this._port;
    this._messageHandler = (message: unknown) => {
      try {
        // Update connection info
        this._connectionInfo.lastMessageAt = Date.now();
        this._connectionInfo.messageCount++;

        // Handle ping messages for keep-alive
        if (
          typeof message === 'object' &&
          message !== null &&
          'type' in message &&
          message.type === 'ping'
        ) {
          port.postMessage({ type: 'pong' });
          return;
        }

        const mcpMessage = JSONRPCMessageSchema.parse(message);
        this.onmessage?.(mcpMessage);
      } catch (error) {
        this.onerror?.(new Error(`Failed to parse message: ${error}`));
      }
    };

    // Set up disconnect handler
    this._disconnectHandler = () => {
      if (this._closed) return;
      console.debug(
        `[ExtensionServerTransport] Client disconnected after ${Date.now() - this._connectionInfo.connectedAt}ms, processed ${this._connectionInfo.messageCount} messages`
      );
      this._finishClose(false);
    };

    port.onMessage.addListener(this._messageHandler);
    port.onDisconnect.addListener(this._disconnectHandler);

    // Start keep-alive mechanism if enabled
    if (this._options.keepAlive) {
      this._startKeepAlive();
    }

    console.debug(
      `[ExtensionServerTransport] Started with client: ${port.sender?.id || 'unknown'}`
    );
  }

  /**
   * Sends a message to the client
   */
  async send(message: JSONRPCMessage, _options?: TransportSendOptions): Promise<void> {
    if (this._closed) {
      throw new Error('Transport is closed');
    }
    if (!this._started) {
      throw new Error('Transport not started');
    }

    const port = this._port;
    if (!port) {
      throw new Error('Not connected to client');
    }

    try {
      port.postMessage(message);
    } catch (error) {
      this._finishClose(true);
      throw new Error(`Client disconnected: ${error}`);
    }
  }

  /**
   * Closes the transport
   */
  async close(): Promise<void> {
    this._finishClose(true);
  }

  private _finishClose(disconnectPort: boolean): void {
    if (this._closed) return;

    const port = this._port;
    this._closed = true;
    this._started = false;
    this._cleanup();
    this._port = undefined;

    if (disconnectPort && port) {
      try {
        port.disconnect();
      } catch {
        // Port might already be disconnected
      }
    }

    this.onclose?.();
  }

  /**
   * Cleans up event listeners and references
   */
  private _cleanup(): void {
    // Stop keep-alive timer
    if (this._keepAliveTimer !== undefined) {
      clearInterval(this._keepAliveTimer);
      this._keepAliveTimer = undefined;
    }

    if (this._port) {
      if (this._messageHandler) {
        this._port.onMessage.removeListener(this._messageHandler);
      }
      if (this._disconnectHandler) {
        this._port.onDisconnect.removeListener(this._disconnectHandler);
      }
    }
    this._messageHandler = undefined;
    this._disconnectHandler = undefined;
  }

  /**
   * Starts the keep-alive mechanism
   */
  private _startKeepAlive(): void {
    if (this._keepAliveTimer) {
      return;
    }

    console.debug(
      `[ExtensionServerTransport] Starting keep-alive with ${this._options.keepAliveInterval}ms interval`
    );

    this._keepAliveTimer = setInterval(() => {
      const port = this._port;
      if (!this._started || !port) {
        this._stopKeepAlive();
        return;
      }

      try {
        // Send a keep-alive ping
        port.postMessage({ type: 'keep-alive', timestamp: Date.now() });
      } catch (error) {
        console.error('[ExtensionServerTransport] Keep-alive failed:', error);
        this._finishClose(true);
      }
    }, this._options.keepAliveInterval);
  }

  /**
   * Stops the keep-alive mechanism
   */
  private _stopKeepAlive(): void {
    if (this._keepAliveTimer !== undefined) {
      clearInterval(this._keepAliveTimer);
      this._keepAliveTimer = undefined;
    }
  }

  /**
   * Gets connection information
   */
  getConnectionInfo() {
    return {
      ...this._connectionInfo,
      uptime: Date.now() - this._connectionInfo.connectedAt,
      isConnected: this._port !== undefined && this._started && !this._closed,
    };
  }
}
