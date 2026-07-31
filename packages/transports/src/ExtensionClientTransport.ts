import {
  type JSONRPCMessage,
  type Transport,
  type TransportSendOptions,
} from '@modelcontextprotocol/server';
import { JSONRPCMessageSchema } from '@modelcontextprotocol/core';

/**
 * Configuration options for ExtensionClientTransport
 */
export interface ExtensionClientTransportOptions {
  /**
   * The extension ID to connect to (optional for same-extension connections)
   */
  extensionId?: string;

  /**
   * Port name for the connection
   * Default: 'mcp'
   */
  portName?: string;
}

/**
 * Client transport for Chrome extensions using Port-based messaging.
 * This transport can be used in content scripts, popup scripts, or sidepanel scripts
 * to connect to a server running in the background service worker.
 */
export class ExtensionClientTransport implements Transport {
  private _port: chrome.runtime.Port | undefined;
  private _extensionId: string | undefined;
  private _portName: string;
  private _messageHandler: ((message: unknown) => void) | undefined;
  private _disconnectHandler: (() => void) | undefined;
  private _isStarted = false;
  private _isClosed = false;

  onclose?: () => void;
  onerror?: (error: Error) => void;
  onmessage?: (message: JSONRPCMessage) => void;

  constructor(options: ExtensionClientTransportOptions = {}) {
    this._extensionId = options.extensionId;
    this._portName = options.portName || 'mcp';
  }

  /**
   * Starts the transport by connecting to the extension port
   */
  async start(): Promise<void> {
    if (this._isClosed) {
      throw new Error('ExtensionClientTransport cannot be restarted after it closes');
    }
    if (this._isStarted && this._port) {
      console.warn(
        'ExtensionClientTransport already started! If using Client class, note that connect() calls start() automatically.'
      );
      return;
    }

    this._isStarted = true;

    await this._connect();
  }

  /**
   * Connects to the extension port
   */
  private async _connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!chrome?.runtime?.connect) {
        reject(
          new Error(
            'Chrome runtime API not available. This transport must be used in a Chrome extension context.'
          )
        );
        return;
      }

      try {
        // Connect to the extension
        if (this._extensionId) {
          this._port = chrome.runtime.connect(this._extensionId, {
            name: this._portName,
          });
        } else {
          this._port = chrome.runtime.connect({ name: this._portName });
        }

        // Set up message handler
        this._messageHandler = (message: unknown) => {
          try {
            // Handle keep-alive messages
            if (
              typeof message === 'object' &&
              message !== null &&
              'type' in message &&
              message.type === 'keep-alive'
            ) {
              // Just acknowledge receipt, no need to propagate
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
          if (this._isClosed) return;
          this._isStarted = false;
          this._isClosed = true;
          this._cleanup();
          this.onclose?.();
        };

        this._port.onMessage.addListener(this._messageHandler);
        this._port.onDisconnect.addListener(this._disconnectHandler);

        // Check for immediate connection errors
        const error = chrome.runtime.lastError;
        if (error) {
          this._cleanup();
          reject(new Error(`Connection failed: ${error.message}`));
          return;
        }

        resolve();
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Sends a message to the server
   */
  async send(message: JSONRPCMessage, _options?: TransportSendOptions): Promise<void> {
    if (this._isClosed) {
      throw new Error('Transport is closed');
    }

    if (!this._isStarted) {
      throw new Error('Transport not started');
    }

    if (!this._port) {
      throw new Error('Not connected');
    }

    try {
      this._port.postMessage(message);
    } catch (error) {
      throw new Error(`Failed to send message: ${error}`);
    }
  }

  /**
   * Closes the transport
   */
  async close(): Promise<void> {
    if (this._isClosed) return;

    this._isClosed = true;
    this._isStarted = false;

    if (this._port) {
      try {
        this._port.disconnect();
      } catch {
        // Port might already be disconnected
      }
    }

    this._cleanup();
    this.onclose?.();
  }

  /**
   * Cleans up event listeners and references
   */
  private _cleanup(): void {
    if (this._port) {
      if (this._messageHandler) {
        this._port.onMessage.removeListener(this._messageHandler);
      }
      if (this._disconnectHandler) {
        this._port.onDisconnect.removeListener(this._disconnectHandler);
      }
    }
    this._port = undefined;
  }
}
