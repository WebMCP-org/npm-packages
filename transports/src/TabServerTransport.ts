import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import { type JSONRPCMessage, JSONRPCMessageSchema } from '@modelcontextprotocol/sdk/types.js';
import { tabServerLog as log } from './logger.js';

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

      if (typeof payload === 'string' && payload === 'mcp-check-ready') {
        // Respond with server ready
        window.postMessage(
          {
            channel: this._channelId,
            type: 'mcp',
            direction: 'server-to-client',
            payload: 'mcp-server-ready',
          },
          this._clientOrigin
        );
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

    // Broadcast server ready to all allowed origins
    window.postMessage(
      {
        channel: this._channelId,
        type: 'mcp',
        direction: 'server-to-client',
        payload: 'mcp-server-ready',
      },
      '*'
    );
  }

  async send(message: JSONRPCMessage): Promise<void> {
    if (!this._started) {
      throw new Error('Transport not started');
    }

    // If we have a known client origin, use it (for security)
    // Otherwise, use '*' for backwards compatibility with clients that don't do the handshake
    const targetOrigin = this._clientOrigin || '*';

    if (!this._clientOrigin) {
      log('Sending to unknown client origin (backwards compatibility mode)');
    }

    window.postMessage(
      {
        channel: this._channelId,
        type: 'mcp',
        direction: 'server-to-client',
        payload: message,
      },
      targetOrigin
    );
  }

  async close(): Promise<void> {
    if (this._messageHandler) {
      window.removeEventListener('message', this._messageHandler);
    }
    this._started = false;

    // Post message to notify content scripts that the MCP server has stopped
    window.postMessage(
      {
        channel: this._channelId,
        type: 'mcp',
        direction: 'server-to-client',
        payload: 'mcp-server-stopped',
      },
      '*'
    );

    this.onclose?.();
  }
}
