import { JSONRPCMessageSchema } from '@modelcontextprotocol/core';
import type { JSONRPCMessage, Transport, TransportSendOptions } from '@modelcontextprotocol/server';
import { DEFAULT_IFRAME_CHANNEL_ID, isMcpMessage, postMcpMessage } from './post-message.js';

export interface IframeParentTransportOptions {
  iframe: HTMLIFrameElement;
  /** Expected iframe origin. Pass `'*'` only to disable origin validation deliberately. */
  targetOrigin: string;
  /** Channel name (default: `mcp-iframe`). */
  channelId?: string;
  /** Retry interval while `iframe.contentWindow` is unavailable (default: 250ms). */
  checkReadyRetryMs?: number;
}

/** Client transport for an MCP server running inside an iframe. */
export class IframeParentTransport implements Transport {
  private _started = false;
  private _closed = false;
  private readonly _iframe: HTMLIFrameElement;
  private readonly _targetOrigin: string;
  private readonly _channelId: string;
  private readonly _checkReadyRetryMs: number;
  private _messageHandler: ((event: MessageEvent<unknown>) => void) | undefined;
  private _checkReadyTimeout: ReturnType<typeof setTimeout> | undefined;
  private _serverReadyResolve!: () => void;
  private _serverReadyReject!: (reason: unknown) => void;
  private _serverReadySettled = false;

  readonly serverReadyPromise: Promise<void>;

  onclose?: () => void;
  onerror?: (error: Error) => void;
  onmessage?: Transport['onmessage'];

  constructor(options: IframeParentTransportOptions) {
    if (!options.iframe) throw new Error('iframe element is required');
    if (!options.targetOrigin) {
      throw new Error('targetOrigin must be explicitly set for security');
    }

    this._iframe = options.iframe;
    this._targetOrigin = options.targetOrigin;
    this._channelId = options.channelId ?? DEFAULT_IFRAME_CHANNEL_ID;
    this._checkReadyRetryMs = options.checkReadyRetryMs ?? 250;
    this.serverReadyPromise = new Promise<void>((resolve, reject) => {
      this._serverReadyResolve = resolve;
      this._serverReadyReject = reject;
    });
  }

  async start(): Promise<void> {
    if (this._closed) {
      throw new Error('IframeParentTransport cannot be restarted after it closes');
    }
    if (this._started) throw new Error('Transport already started');

    this._messageHandler = (event: MessageEvent<unknown>) => {
      if (
        event.source !== this._iframe.contentWindow ||
        (this._targetOrigin !== '*' && event.origin !== this._targetOrigin) ||
        !isMcpMessage(event.data, this._channelId, 'server-to-client')
      ) {
        return;
      }

      const { payload } = event.data;
      if (payload === 'mcp-server-ready') {
        this._resolveServerReady();
        this._clearCheckReadyRetry();
        return;
      }
      if (payload === 'mcp-server-stopped') {
        void this.close();
        return;
      }

      try {
        const message = JSONRPCMessageSchema.parse(payload);
        this._resolveServerReady();
        this.onmessage?.(message);
      } catch (error) {
        this.onerror?.(
          new Error(`Invalid message: ${error instanceof Error ? error.message : String(error)}`)
        );
      }
    };

    window.addEventListener('message', this._messageHandler);
    this._started = true;
    this._sendCheckReady();
  }

  async send(message: JSONRPCMessage, _options?: TransportSendOptions): Promise<void> {
    if (this._closed) throw new Error('Transport is closed');
    if (!this._started) throw new Error('Transport not started');

    await this.serverReadyPromise;
    if (this._closed) throw new Error('Transport is closed');

    const contentWindow = this._iframe.contentWindow;
    if (!contentWindow) throw new Error('iframe.contentWindow not available');
    postMcpMessage(contentWindow, this._targetOrigin, this._channelId, 'client-to-server', message);
  }

  async close(): Promise<void> {
    if (this._closed) return;

    this._closed = true;
    this._started = false;
    if (this._messageHandler) {
      window.removeEventListener('message', this._messageHandler);
      this._messageHandler = undefined;
    }
    this._clearCheckReadyRetry();
    if (!this._serverReadySettled) {
      this._serverReadySettled = true;
      this._serverReadyReject(new Error('Transport closed before server ready'));
    }
    this.onclose?.();
  }

  private _sendCheckReady(): void {
    const contentWindow = this._iframe.contentWindow;
    if (contentWindow) {
      postMcpMessage(
        contentWindow,
        this._targetOrigin,
        this._channelId,
        'client-to-server',
        'mcp-check-ready'
      );
      return;
    }

    this._checkReadyTimeout ??= setTimeout(() => {
      this._checkReadyTimeout = undefined;
      if (this._started) this._sendCheckReady();
    }, this._checkReadyRetryMs);
  }

  private _clearCheckReadyRetry(): void {
    if (this._checkReadyTimeout === undefined) return;
    clearTimeout(this._checkReadyTimeout);
    this._checkReadyTimeout = undefined;
  }

  private _resolveServerReady(): void {
    if (this._serverReadySettled) return;
    this._serverReadySettled = true;
    this._serverReadyResolve();
  }
}
