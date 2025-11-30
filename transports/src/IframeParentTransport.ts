import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import { type JSONRPCMessage, JSONRPCMessageSchema } from '@modelcontextprotocol/sdk/types.js';
import { iframeParentLog as log } from './logger.js';

export interface IframeParentTransportOptions {
  /** Reference to the iframe element */
  iframe: HTMLIFrameElement;
  /** Expected origin of the iframe (for security) */
  targetOrigin: string;
  /** Optional channel name (default: 'mcp-iframe') */
  channelId?: string;
  /** Retry interval for ready handshake in milliseconds (default: 250) */
  checkReadyRetryMs?: number;
}

/**
 * IframeParentTransport - Client transport for parent page
 *
 * Use this transport when the parent page wants to connect to an MCP server
 * running inside an iframe. Supports cross-origin communication.
 *
 * @example
 * ```typescript
 * const iframe = document.querySelector('iframe');
 * const transport = new IframeParentTransport({
 *   iframe,
 *   targetOrigin: 'https://iframe-app.com',
 * });
 *
 * const client = new Client({ name: 'Parent', version: '1.0.0' });
 * await client.connect(transport);
 * ```
 */
export class IframeParentTransport implements Transport {
  private _started = false;
  private _iframe: HTMLIFrameElement;
  private _targetOrigin: string;
  private _channelId: string;
  private _messageHandler?: (event: MessageEvent) => void;
  private _checkReadyTimeout: ReturnType<typeof setTimeout> | undefined;
  private readonly _checkReadyRetryMs: number;
  public readonly serverReadyPromise: Promise<void>;
  private _serverReadyResolve: () => void;
  private _serverReadyReject: (reason: any) => void;

  onclose?: () => void;
  onerror?: (error: Error) => void;
  onmessage?: (message: JSONRPCMessage) => void;

  constructor(options: IframeParentTransportOptions) {
    if (!options.iframe) {
      throw new Error('iframe element is required');
    }
    if (!options.targetOrigin) {
      throw new Error('targetOrigin must be explicitly set for security');
    }

    this._iframe = options.iframe;
    this._targetOrigin = options.targetOrigin;
    this._channelId = options.channelId || 'mcp-iframe';
    this._checkReadyRetryMs = options.checkReadyRetryMs ?? 250;

    const { promise, resolve, reject } = Promise.withResolvers<void>();
    this.serverReadyPromise = promise;
    this._serverReadyResolve = resolve;
    this._serverReadyReject = reject;
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

      if (typeof payload === 'string' && payload === 'mcp-server-ready') {
        this._serverReadyResolve();
        this.clearCheckReadyRetry();
        return;
      }

      if (typeof payload === 'string' && payload === 'mcp-server-stopped') {
        log('Received mcp-server-stopped event, closing transport');
        this.close();
        return;
      }

      try {
        const message = JSONRPCMessageSchema.parse(payload);
        this._serverReadyResolve();
        this.onmessage?.(message);
      } catch (error) {
        this.onerror?.(
          new Error(`Invalid message: ${error instanceof Error ? error.message : String(error)}`)
        );
      }
    };

    window.addEventListener('message', this._messageHandler);
    this._started = true;

    this.sendCheckReady();
  }

  private sendCheckReady() {
    const contentWindow = this._iframe.contentWindow;

    if (!contentWindow) {
      log.warn('iframe.contentWindow not available, will retry');
      this.scheduleCheckReadyRetry();
      return;
    }

    contentWindow.postMessage(
      {
        channel: this._channelId,
        type: 'mcp',
        direction: 'client-to-server',
        payload: 'mcp-check-ready',
      },
      this._targetOrigin
    );
  }

  private scheduleCheckReadyRetry() {
    if (this._checkReadyTimeout) {
      return;
    }

    this._checkReadyTimeout = setTimeout(() => {
      this._checkReadyTimeout = undefined;
      if (this._started) {
        this.sendCheckReady();
      }
    }, this._checkReadyRetryMs);
  }

  private clearCheckReadyRetry() {
    if (this._checkReadyTimeout) {
      clearTimeout(this._checkReadyTimeout);
      this._checkReadyTimeout = undefined;
    }
  }

  async send(message: JSONRPCMessage): Promise<void> {
    if (!this._started) {
      throw new Error('Transport not started');
    }

    await this.serverReadyPromise;

    const contentWindow = this._iframe.contentWindow;

    if (!contentWindow) {
      throw new Error('iframe.contentWindow not available');
    }

    contentWindow.postMessage(
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

    this._serverReadyReject(new Error('Transport closed before server ready'));

    this.clearCheckReadyRetry();

    this._started = false;
    this.onclose?.();
  }
}
