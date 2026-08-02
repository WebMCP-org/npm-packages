import { JSONRPCMessageSchema } from '@modelcontextprotocol/core';
import type { JSONRPCMessage, Transport, TransportSendOptions } from '@modelcontextprotocol/server';
import { isMcpMessage, postMcpMessage } from './post-message.js';

export interface IframeChildTransportOptions {
  /** Parent origins allowed to connect. Pass `['*']` only to disable validation deliberately. */
  allowedOrigins: readonly string[];
  /** Channel name (default: `mcp-iframe`). */
  channelId?: string;
}

/** Server transport for an MCP server running inside an iframe. */
export class IframeChildTransport implements Transport {
  private _started = false;
  private _closed = false;
  private readonly _allowedOrigins: ReadonlySet<string>;
  private readonly _channelId: string;
  private _messageHandler: ((event: MessageEvent<unknown>) => void) | undefined;
  private _clientOrigin?: string;

  onclose?: () => void;
  onerror?: (error: Error) => void;
  onmessage?: Transport['onmessage'];

  constructor(options: IframeChildTransportOptions) {
    if (!options.allowedOrigins?.length) {
      throw new Error('At least one allowed origin must be specified');
    }

    this._allowedOrigins = new Set(options.allowedOrigins);
    this._channelId = options.channelId ?? 'mcp-iframe';
  }

  async start(): Promise<void> {
    if (this._closed) {
      throw new Error('IframeChildTransport cannot be restarted after it closes');
    }
    if (this._started) throw new Error('Transport already started');

    this._messageHandler = (event: MessageEvent<unknown>) => {
      if (
        event.source !== window.parent ||
        (!this._allowedOrigins.has('*') && !this._allowedOrigins.has(event.origin)) ||
        !isMcpMessage(event.data, this._channelId, 'client-to-server')
      ) {
        return;
      }

      this._clientOrigin = event.origin;
      const { payload } = event.data;
      if (payload === 'mcp-check-ready') {
        this._broadcastServerReady();
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
    this._broadcastServerReady();
  }

  async send(message: JSONRPCMessage, _options?: TransportSendOptions): Promise<void> {
    if (this._closed) throw new Error('Transport is closed');
    if (!this._started) throw new Error('Transport not started');
    if (!this._clientOrigin) {
      console.debug('[IframeChildTransport] No client connected, message not sent');
      return;
    }
    if (window.parent === window) {
      console.debug('[IframeChildTransport] Not running in an iframe, message not sent');
      return;
    }

    postMcpMessage(window.parent, this._clientOrigin, this._channelId, 'server-to-client', message);
  }

  async close(): Promise<void> {
    if (this._closed) return;

    this._closed = true;
    this._started = false;
    if (this._messageHandler) {
      window.removeEventListener('message', this._messageHandler);
      this._messageHandler = undefined;
    }
    if (this._clientOrigin && window.parent !== window) {
      postMcpMessage(
        window.parent,
        this._clientOrigin,
        this._channelId,
        'server-to-client',
        'mcp-server-stopped'
      );
    }
    this.onclose?.();
  }

  private _broadcastServerReady(): void {
    if (window.parent !== window) {
      postMcpMessage(window.parent, '*', this._channelId, 'server-to-client', 'mcp-server-ready');
    }
  }
}
