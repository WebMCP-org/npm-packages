import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import { type JSONRPCMessage, JSONRPCMessageSchema } from '@modelcontextprotocol/sdk/types.js';

export interface TabServerTransportOptions {
  /** Whitelist of origins allowed to connect (for security) */
  allowedOrigins: string[];
  /** Optional channel name (default: 'mcp-default') */
  channelId?: string;
}

export class TabServerTransport implements Transport {
  private _started = false;
  private _allowedOrigins: string[];
  private _channelId: string;
  private _messageHandler?: (event: MessageEvent) => void;
  private _clientOrigin?: string;

  onclose?: () => void;
  onerror?: (error: Error) => void;
  onmessage?: (message: JSONRPCMessage) => void;

  constructor(options: TabServerTransportOptions) {
    if (!options.allowedOrigins || options.allowedOrigins.length === 0) {
      throw new Error('At least one allowed origin must be specified');
    }

    this._allowedOrigins = options.allowedOrigins;
    this._channelId = options.channelId || 'mcp-default';
  }

  async start(): Promise<void> {
    if (this._started) {
      throw new Error('Transport already started');
    }

    this._messageHandler = (event: MessageEvent) => {
      if (!this._allowedOrigins.includes(event.origin) && !this._allowedOrigins.includes('*')) {
        return;
      }

      if (event.data?.channel !== this._channelId || event.data?.type !== 'mcp') {
        return;
      }

      if (event.data?.direction !== 'client-to-server') {
        return;
      }

      this._clientOrigin = event.origin;

      const payload = event.data.payload;

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

    if (!this._clientOrigin) {
      console.warn('[TabServerTransport] No client connected, message not sent');
      return;
    }

    window.postMessage(
      {
        channel: this._channelId,
        type: 'mcp',
        direction: 'server-to-client',
        payload: message,
      },
      this._clientOrigin
    );
  }

  async close(): Promise<void> {
    if (this._messageHandler) {
      window.removeEventListener('message', this._messageHandler);
    }
    this._started = false;

    if (this._clientOrigin) {
      window.postMessage(
        {
          channel: this._channelId,
          type: 'mcp',
          direction: 'server-to-client',
          payload: 'mcp-server-stopped',
        },
        '*'
      );
    }

    this.onclose?.();
  }
}
