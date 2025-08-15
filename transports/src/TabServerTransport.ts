// TabServerTransport.ts

import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import { type JSONRPCMessage, JSONRPCMessageSchema } from '@modelcontextprotocol/sdk/types.js';

export interface TabServerTransportOptions {
  allowedOrigins: string[]; // Required for security
  channelId?: string; // Optional channel name
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
      // Security: validate origin
      if (!this._allowedOrigins.includes(event.origin) && !this._allowedOrigins.includes('*')) {
        return;
      }

      // Validate message structure
      if (event.data?.channel !== this._channelId || event.data?.type !== 'mcp') {
        return;
      }

      // Only process client-to-server messages to avoid processing own messages
      if (event.data?.direction !== 'client-to-server') {
        return;
      }

      // Store client origin for responses
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

    if (!this._clientOrigin) {
      throw new Error('No client connected');
    }

    window.postMessage(
      {
        channel: this._channelId,
        type: 'mcp',
        direction: 'server-to-client', // Mark as server-to-client message
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
