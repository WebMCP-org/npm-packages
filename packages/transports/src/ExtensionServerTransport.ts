import { JSONRPCMessageSchema } from '@modelcontextprotocol/core';
import type { JSONRPCMessage, Transport, TransportSendOptions } from '@modelcontextprotocol/server';

/** The runtime Port methods used by this transport, independent of Chrome ambient types. */
export interface ExtensionPort {
  postMessage(message: unknown): void;
  disconnect(): void;
  onMessage: {
    addListener(callback: (message: unknown) => void): void;
    removeListener(callback: (message: unknown) => void): void;
  };
  onDisconnect: {
    addListener(callback: () => void): void;
    removeListener(callback: () => void): void;
  };
}

export interface ExtensionServerTransportOptions {
  /** Send keep-alive messages (default: true). */
  keepAlive?: boolean;
  /** Keep-alive interval in milliseconds (default: 25,000). */
  keepAliveInterval?: number;
}

/** Server transport for one Chrome extension Port connection. */
export class ExtensionServerTransport implements Transport {
  private _port: ExtensionPort | undefined;
  private _started = false;
  private _closed = false;
  private _messageHandler: ((message: unknown) => void) | undefined;
  private _disconnectHandler: (() => void) | undefined;
  private _keepAliveTimer: ReturnType<typeof setInterval> | undefined;
  private readonly _keepAliveInterval: number | undefined;
  private readonly _connectionInfo = {
    connectedAt: Date.now(),
    lastMessageAt: Date.now(),
    messageCount: 0,
  };

  onclose?: () => void;
  onerror?: (error: Error) => void;
  onmessage?: Transport['onmessage'];

  constructor(port: ExtensionPort, options: ExtensionServerTransportOptions = {}) {
    this._port = port;
    this._keepAliveInterval =
      options.keepAlive === false ? undefined : (options.keepAliveInterval ?? 25_000);
  }

  async start(): Promise<void> {
    if (this._closed) {
      throw new Error('ExtensionServerTransport cannot be restarted after it closes');
    }
    if (this._started) {
      throw new Error(
        'ExtensionServerTransport already started! If using Server class, note that connect() calls start() automatically.'
      );
    }

    const port = this._port;
    if (!port) throw new Error('Port not available');

    this._messageHandler = (message: unknown) => {
      this._connectionInfo.lastMessageAt = Date.now();
      this._connectionInfo.messageCount++;
      try {
        const mcpMessage = JSONRPCMessageSchema.parse(message);
        this.onmessage?.(mcpMessage);
      } catch (error) {
        this.onerror?.(
          new Error(
            `Failed to parse message: ${error instanceof Error ? error.message : String(error)}`
          )
        );
      }
    };
    this._disconnectHandler = () => this._finishClose(false);
    port.onMessage.addListener(this._messageHandler);
    port.onDisconnect.addListener(this._disconnectHandler);
    this._started = true;

    if (this._keepAliveInterval !== undefined) {
      this._keepAliveTimer = setInterval(() => {
        try {
          port.postMessage({ type: 'keep-alive', timestamp: Date.now() });
        } catch (error) {
          this.onerror?.(
            new Error(
              `Keep-alive failed: ${error instanceof Error ? error.message : String(error)}`
            )
          );
          this._finishClose(true);
        }
      }, this._keepAliveInterval);
    }
  }

  async send(message: JSONRPCMessage, _options?: TransportSendOptions): Promise<void> {
    if (this._closed) throw new Error('Transport is closed');
    if (!this._started) throw new Error('Transport not started');

    const port = this._port;
    if (!port) throw new Error('Not connected to client');

    try {
      port.postMessage(message);
    } catch (error) {
      this._finishClose(true);
      throw new Error(`Client disconnected: ${error}`);
    }
  }

  async close(): Promise<void> {
    this._finishClose(true);
  }

  getConnectionInfo() {
    return {
      ...this._connectionInfo,
      uptime: Date.now() - this._connectionInfo.connectedAt,
      isConnected: this._port !== undefined && this._started && !this._closed,
    };
  }

  private _finishClose(disconnectPort: boolean): void {
    if (this._closed) return;

    const port = this._port;
    this._closed = true;
    this._started = false;
    this._cleanup();

    if (disconnectPort && port) {
      try {
        port.disconnect();
      } catch {
        // The remote endpoint may already have disconnected.
      }
    }
    this.onclose?.();
  }

  private _cleanup(): void {
    if (this._keepAliveTimer !== undefined) {
      clearInterval(this._keepAliveTimer);
      this._keepAliveTimer = undefined;
    }
    if (this._port && this._messageHandler) {
      this._port.onMessage.removeListener(this._messageHandler);
    }
    if (this._port && this._disconnectHandler) {
      this._port.onDisconnect.removeListener(this._disconnectHandler);
    }
    this._port = undefined;
    this._messageHandler = undefined;
    this._disconnectHandler = undefined;
  }
}
