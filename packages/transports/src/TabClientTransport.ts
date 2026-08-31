import { JSONRPCMessageSchema } from '@modelcontextprotocol/core';
import type { JSONRPCMessage, Transport, TransportSendOptions } from '@modelcontextprotocol/server';
import { DEFAULT_TAB_CHANNEL_ID, isMcpMessage, postMcpMessage } from './post-message.js';

export interface TabClientTransportOptions {
  /** Expected server origin. Pass `'*'` only to disable origin validation deliberately. */
  targetOrigin: string;
  /** Channel name (default: `mcp-default`). */
  channelId?: string;
}

/** Client transport for an MCP server running in the same window. */
export class TabClientTransport implements Transport {
  private _started = false;
  private _closed = false;
  private readonly _targetOrigin: string;
  private readonly _channelId: string;
  private _messageHandler: ((event: MessageEvent<unknown>) => void) | undefined;
  private _serverReadyResolve!: () => void;
  private _serverReadyReject!: (reason: unknown) => void;
  private _serverReadySettled = false;

  /** Resolves when the server signals readiness. `send()` awaits it automatically. */
  readonly serverReadyPromise: Promise<void>;

  onclose?: () => void;
  onerror?: (error: Error) => void;
  onmessage?: Transport['onmessage'];

  constructor(options: TabClientTransportOptions) {
    if (!options.targetOrigin) {
      throw new Error('targetOrigin must be explicitly set for security');
    }

    this._targetOrigin = options.targetOrigin;
    this._channelId = options.channelId ?? DEFAULT_TAB_CHANNEL_ID;
    this.serverReadyPromise = new Promise<void>((resolve, reject) => {
      this._serverReadyResolve = resolve;
      this._serverReadyReject = reject;
    });
    // Closing an unused transport is valid; late consumers still observe the rejection.
    void this.serverReadyPromise.catch(() => {});
  }

  async start(): Promise<void> {
    if (this._closed) {
      throw new Error('TabClientTransport cannot be restarted after it closes');
    }
    if (this._started) {
      throw new Error('Transport already started');
    }

    this._messageHandler = (event: MessageEvent<unknown>) => {
      if (
        event.source !== window ||
        (this._targetOrigin !== '*' && event.origin !== this._targetOrigin) ||
        !isMcpMessage(event.data, this._channelId, 'server-to-client')
      ) {
        return;
      }

      const { payload } = event.data;
      if (payload === 'mcp-server-ready') {
        this._resolveServerReady();
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
    postMcpMessage(
      window,
      this._targetOrigin,
      this._channelId,
      'client-to-server',
      'mcp-check-ready'
    );
  }

  async send(message: JSONRPCMessage, _options?: TransportSendOptions): Promise<void> {
    if (this._closed) throw new Error('Transport is closed');
    if (!this._started) throw new Error('Transport not started');

    await this.serverReadyPromise;
    if (this._closed) throw new Error('Transport is closed');

    postMcpMessage(window, this._targetOrigin, this._channelId, 'client-to-server', message);
  }

  async close(): Promise<void> {
    if (this._closed) return;

    this._closed = true;
    this._started = false;
    if (this._messageHandler) {
      window.removeEventListener('message', this._messageHandler);
      this._messageHandler = undefined;
    }
    if (!this._serverReadySettled) {
      this._serverReadySettled = true;
      this._serverReadyReject(new Error('Transport closed before server ready'));
    }
    this.onclose?.();
  }

  private _resolveServerReady(): void {
    if (this._serverReadySettled) return;
    this._serverReadySettled = true;
    this._serverReadyResolve();
  }
}
