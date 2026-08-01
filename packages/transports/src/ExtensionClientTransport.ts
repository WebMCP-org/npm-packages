import { JSONRPCMessageSchema } from '@modelcontextprotocol/core';
import type { JSONRPCMessage, Transport, TransportSendOptions } from '@modelcontextprotocol/server';

export interface ExtensionClientTransportOptions {
  /** Extension ID to connect to. Omit for the current extension. */
  extensionId?: string;
  /** Port name (default: `mcp`). */
  portName?: string;
}

/** Client transport for Chrome extension Port messaging. */
export class ExtensionClientTransport implements Transport {
  private _port: chrome.runtime.Port | undefined;
  private readonly _extensionId: string | undefined;
  private readonly _portName: string;
  private _messageHandler: ((message: unknown) => void) | undefined;
  private _disconnectHandler: (() => void) | undefined;
  private _started = false;
  private _closed = false;

  onclose?: () => void;
  onerror?: (error: Error) => void;
  onmessage?: Transport['onmessage'];

  constructor(options: ExtensionClientTransportOptions = {}) {
    this._extensionId = options.extensionId;
    this._portName = options.portName ?? 'mcp';
  }

  async start(): Promise<void> {
    if (this._closed) {
      throw new Error('ExtensionClientTransport cannot be restarted after it closes');
    }
    if (this._started) {
      throw new Error('Transport already started');
    }

    const runtime = globalThis.chrome?.runtime;
    if (!runtime?.connect) {
      throw new Error(
        'Chrome runtime API not available. This transport must be used in a Chrome extension context.'
      );
    }

    try {
      const port = this._extensionId
        ? runtime.connect(this._extensionId, { name: this._portName })
        : runtime.connect({ name: this._portName });
      this._port = port;
      this._messageHandler = (message: unknown) => {
        if (
          typeof message === 'object' &&
          message !== null &&
          Reflect.get(message, 'type') === 'keep-alive'
        ) {
          return;
        }

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
    } catch (error) {
      this._cleanup();
      throw error;
    }
  }

  async send(message: JSONRPCMessage, _options?: TransportSendOptions): Promise<void> {
    if (this._closed) throw new Error('Transport is closed');
    if (!this._started) throw new Error('Transport not started');

    const port = this._port;
    if (!port) throw new Error('Not connected');

    try {
      port.postMessage(message);
    } catch (error) {
      this._finishClose(true);
      throw new Error(`Failed to send message: ${error}`);
    }
  }

  async close(): Promise<void> {
    this._finishClose(true);
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
