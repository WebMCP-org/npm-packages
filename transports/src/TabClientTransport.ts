import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import { type JSONRPCMessage, JSONRPCMessageSchema } from '@modelcontextprotocol/sdk/types.js';

export interface TabClientTransportOptions {
  /** Origin expected from the server window (for security) */
  targetOrigin: string;
  /** Optional channel name (default: 'mcp-default') */
  channelId?: string;
}

export class TabClientTransport implements Transport {
  private _started = false;
  private _targetOrigin: string;
  private _channelId: string;
  private _messageHandler?: (event: MessageEvent) => void;

  onclose?: () => void;
  onerror?: (error: Error) => void;
  onmessage?: (message: JSONRPCMessage) => void;

  constructor(options: TabClientTransportOptions) {
    if (!options.targetOrigin) {
      throw new Error('targetOrigin must be explicitly set for security');
    }
    this._targetOrigin = options.targetOrigin;
    this._channelId = options.channelId || 'mcp-default';
  }

  async start(): Promise<void> {
    if (this._started) {
      throw new Error('Transport already started');
    }

    this._messageHandler = (event: MessageEvent) => {
      if (event.origin !== this._targetOrigin) {
        return;
      }

      if (event.data?.channel !== this._channelId || event.data?.type !== 'mcp') {
        return;
      }

      if (event.data?.direction !== 'server-to-client') {
        return;
      }

      const payload = event.data.payload;

      if (typeof payload === 'string' && payload === 'mcp-server-stopped') {
        console.log('[TabClientTransport] Received mcp-server-stopped event, closing transport');
        this.close();
        return;
      }

      try {
        const message = JSONRPCMessageSchema.parse(payload);
        this.onmessage?.(message);
      } catch (error) {
        this.onerror?.(
          new Error(`Invalid message: ${error instanceof Error ? error.message : String(error)}`)
        );
      }
    };

    window.addEventListener('message', this._messageHandler);
    this._started = true;
  }

  async send(message: JSONRPCMessage): Promise<void> {
    if (!this._started) {
      throw new Error('Transport not started');
    }

    window.postMessage(
      {
        channel: this._channelId,
        type: 'mcp',
        direction: 'client-to-server',
        payload: message,
      },
      this._targetOrigin
    );
  }

  async close(): Promise<void> {
    if (this._messageHandler) {
      window.removeEventListener('message', this._messageHandler);
    }

    this._started = false;
    this.onclose?.();
  }
}
