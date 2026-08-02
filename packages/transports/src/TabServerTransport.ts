import { JSONRPCMessageSchema } from '@modelcontextprotocol/core';
import type { JSONRPCMessage, Transport, TransportSendOptions } from '@modelcontextprotocol/server';
import { isMcpMessage, postMcpMessage } from './post-message.js';

export interface TabServerTransportOptions {
  /** Origins allowed to connect. Pass `['*']` only to disable origin validation deliberately. */
  allowedOrigins: readonly string[];
  /** Channel name (default: `mcp-default`). */
  channelId?: string;
}

export class TabServerTransport implements Transport {
  private _started = false;
  private _closed = false;
  private readonly _allowedOrigins: ReadonlySet<string>;
  private readonly _channelId: string;
  private _messageHandler: ((event: MessageEvent<unknown>) => void) | undefined;

  onclose?: () => void;
  onerror?: (error: Error) => void;
  onmessage?: Transport['onmessage'];

  constructor(options: TabServerTransportOptions) {
    if (!options.allowedOrigins?.length) {
      throw new Error('At least one allowed origin must be specified');
    }

    this._allowedOrigins = new Set(options.allowedOrigins);
    this._channelId = options.channelId ?? 'mcp-default';
  }

  async start(): Promise<void> {
    if (this._closed) {
      throw new Error('TabServerTransport cannot be restarted after it closes');
    }
    if (this._started) {
      throw new Error('Transport already started');
    }

    this._messageHandler = (event: MessageEvent<unknown>) => {
      if (
        event.source !== window ||
        (!this._allowedOrigins.has('*') && !this._allowedOrigins.has(event.origin)) ||
        !isMcpMessage(event.data, this._channelId, 'client-to-server')
      ) {
        return;
      }

      const { payload } = event.data;
      if (payload === 'mcp-check-ready') {
        postMcpMessage(window, '*', this._channelId, 'server-to-client', 'mcp-server-ready');
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
    postMcpMessage(window, '*', this._channelId, 'server-to-client', 'mcp-server-ready');
  }

  async send(message: JSONRPCMessage, _options?: TransportSendOptions): Promise<void> {
    if (this._closed) throw new Error('Transport is closed');
    if (!this._started) throw new Error('Transport not started');

    postMcpMessage(window, '*', this._channelId, 'server-to-client', message);
  }

  async close(): Promise<void> {
    if (this._closed) return;

    this._closed = true;
    if (this._messageHandler) {
      window.removeEventListener('message', this._messageHandler);
      this._messageHandler = undefined;
    }
    if (this._started) {
      postMcpMessage(window, '*', this._channelId, 'server-to-client', 'mcp-server-stopped');
    }
    this._started = false;
    this.onclose?.();
  }
}
