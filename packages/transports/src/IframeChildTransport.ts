import { type JSONRPCMessage, JSONRPCMessageSchema, type Transport } from '@mcp-b/webmcp-ts-sdk';

export interface IframeChildTransportOptions {
  /** Whitelist of parent origins allowed to connect (for security) */
  allowedOrigins: string[];
  /** Optional channel name (default: 'mcp-iframe') */
  channelId?: string;
  /** Retry interval for broadcasting ready signal in milliseconds (default: 250) */
  serverReadyRetryMs?: number;
}

/**
 * IframeChildTransport - Server transport for iframe
 *
 * Use this transport when an iframe wants to expose an MCP server to its parent page.
 * Supports cross-origin communication.
 *
 * @example
 * ```typescript
 * const transport = new IframeChildTransport({
 *   allowedOrigins: ['https://parent-app.com'],
 * });
 *
 * const server = new Server({ name: 'IframeApp', version: '1.0.0' });
 * await server.connect(transport);
 * ```
 */
export class IframeChildTransport implements Transport {
  private _started = false;
  private _allowedOrigins: string[];
  private _channelId: string;
  private _messageHandler?: (event: MessageEvent) => void;
  private _clientOrigin?: string;
  private _serverReadyTimeout: ReturnType<typeof setTimeout> | undefined;
  private readonly _serverReadyRetryMs: number;

  onclose?: () => void;
  onerror?: (error: Error) => void;
  onmessage?: (message: JSONRPCMessage) => void;

  constructor(options: IframeChildTransportOptions) {
    if (!options.allowedOrigins || options.allowedOrigins.length === 0) {
      throw new Error('At least one allowed origin must be specified');
    }

    this._allowedOrigins = options.allowedOrigins;
    this._channelId = options.channelId || 'mcp-iframe';
    this._serverReadyRetryMs = options.serverReadyRetryMs ?? 250;
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
        this.broadcastServerReady();
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

    this.broadcastServerReady();
  }

  private broadcastServerReady() {
    if (window.parent && window.parent !== window) {
      window.parent.postMessage(
        {
          channel: this._channelId,
          type: 'mcp',
          direction: 'server-to-client',
          payload: 'mcp-server-ready',
        },
        '*'
      );

      this.clearServerReadyRetry();
    } else {
      this.scheduleServerReadyRetry();
    }
  }

  private scheduleServerReadyRetry() {
    if (this._serverReadyTimeout) {
      return;
    }

    this._serverReadyTimeout = setTimeout(() => {
      this._serverReadyTimeout = undefined;
      if (this._started) {
        this.broadcastServerReady();
      }
    }, this._serverReadyRetryMs);
  }

  private clearServerReadyRetry() {
    if (this._serverReadyTimeout) {
      clearTimeout(this._serverReadyTimeout);
      this._serverReadyTimeout = undefined;
    }
  }

  async send(message: JSONRPCMessage): Promise<void> {
    if (!this._started) {
      throw new Error('Transport not started');
    }

    if (!this._clientOrigin) {
      console.warn('[IframeChildTransport] No client connected, message not sent');
      return;
    }

    if (window.parent && window.parent !== window) {
      window.parent.postMessage(
        {
          channel: this._channelId,
          type: 'mcp',
          direction: 'server-to-client',
          payload: message,
        },
        this._clientOrigin
      );
    } else {
      console.warn('[IframeChildTransport] Not running in an iframe, message not sent');
    }
  }

  async close(): Promise<void> {
    if (this._messageHandler) {
      window.removeEventListener('message', this._messageHandler);
    }
    this._started = false;

    if (this._clientOrigin && window.parent && window.parent !== window) {
      window.parent.postMessage(
        {
          channel: this._channelId,
          type: 'mcp',
          direction: 'server-to-client',
          payload: 'mcp-server-stopped',
        },
        '*'
      );
    }

    this.clearServerReadyRetry();

    this.onclose?.();
  }
}
