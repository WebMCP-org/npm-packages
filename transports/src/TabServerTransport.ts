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
  private _beforeUnloadHandler?: () => void;
  private _cleanupInterval?: number;
  private _pendingRequests = new Map<
    string | number,
    {
      request: JSONRPCMessage;
      receivedAt: number;
      interruptedSent: boolean;
    }
  >();
  private readonly REQUEST_TIMEOUT_MS = 300000; // 5 minutes

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

        // Track incoming requests (messages with method and id, but not notifications)
        if ('method' in message && message.id !== undefined) {
          this._pendingRequests.set(message.id, {
            request: message,
            receivedAt: Date.now(),
            interruptedSent: false,
          });
        }

        this.onmessage?.(message);
      } catch (error) {
        this.onerror?.(
          new Error(`Invalid message: ${error instanceof Error ? error.message : String(error)}`)
        );
      }
    };

    window.addEventListener('message', this._messageHandler);
    this._started = true;

    // Register beforeunload handler to send interrupted responses
    this._beforeUnloadHandler = () => {
      this._handleBeforeUnload();
    };
    window.addEventListener('beforeunload', this._beforeUnloadHandler);

    // Periodic cleanup of stale requests (every minute)
    this._cleanupInterval = setInterval(() => {
      this._cleanupStaleRequests();
    }, 60000) as unknown as number;

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

    // Check if we already sent an interrupted response for this request
    if (('result' in message || 'error' in message) && message.id !== undefined) {
      const info = this._pendingRequests.get(message.id);

      // Don't send if we already sent interrupted response (race condition prevention)
      if (info?.interruptedSent) {
        console.debug(
          `[TabServerTransport] Suppressing response for ${message.id} - interrupted response already sent`
        );
        this._pendingRequests.delete(message.id);
        return;
      }

      // Clear from pending when response sent normally
      this._pendingRequests.delete(message.id);
    }

    // If we have a known client origin, use it (for security)
    // Otherwise, use '*' for backwards compatibility with clients that don't do the handshake
    const targetOrigin = this._clientOrigin || '*';

    if (!this._clientOrigin) {
      console.debug(
        '[TabServerTransport] Sending to unknown client origin (backwards compatibility mode)'
      );
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

  /**
   * Handle page navigation by sending interrupted responses for all pending requests.
   * Called during beforeunload event.
   * @private
   */
  private _handleBeforeUnload(): void {
    // Process most recent requests first (LIFO order) in case we run out of time
    const entries = Array.from(this._pendingRequests.entries()).reverse();

    for (const [id, info] of entries) {
      // Mark as interrupted to prevent double-send if tool completes during unload
      info.interruptedSent = true;

      const toolName = 'method' in info.request ? info.request.method : 'unknown';

      const interruptedResponse: JSONRPCMessage = {
        jsonrpc: '2.0',
        id,
        result: {
          content: [
            {
              type: 'text',
              text: 'Tool execution interrupted by page navigation',
            },
          ],
          metadata: {
            navigationInterrupted: true,
            originalMethod: toolName,
            timestamp: Date.now(),
          },
        },
      };

      try {
        // Synchronous postMessage - should complete before unload
        window.postMessage(
          {
            channel: this._channelId,
            type: 'mcp',
            direction: 'server-to-client',
            payload: interruptedResponse,
          },
          this._clientOrigin || '*'
        );
      } catch (error) {
        // Best effort - may fail in rare cases
        console.error('[TabServerTransport] Failed to send beforeunload response:', error);
      }
    }

    this._pendingRequests.clear();
  }

  /**
   * Clean up stale requests that have been pending for too long.
   * Called periodically to prevent memory leaks.
   * @private
   */
  private _cleanupStaleRequests(): void {
    const now = Date.now();
    const staleIds: (string | number)[] = [];

    for (const [id, info] of this._pendingRequests) {
      if (now - info.receivedAt > this.REQUEST_TIMEOUT_MS) {
        staleIds.push(id);
      }
    }

    if (staleIds.length > 0) {
      console.warn(`[TabServerTransport] Cleaning up ${staleIds.length} stale requests`);
      for (const id of staleIds) {
        this._pendingRequests.delete(id);
      }
    }
  }

  async close(): Promise<void> {
    if (this._messageHandler) {
      window.removeEventListener('message', this._messageHandler);
    }

    if (this._beforeUnloadHandler) {
      window.removeEventListener('beforeunload', this._beforeUnloadHandler);
    }

    if (this._cleanupInterval !== undefined) {
      clearInterval(this._cleanupInterval);
    }

    this._pendingRequests.clear();
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
