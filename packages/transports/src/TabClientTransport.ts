import { type JSONRPCMessage, JSONRPCMessageSchema, type Transport } from '@mcp-b/webmcp-ts-sdk';

/**
 * Configuration options for TabClientTransport.
 *
 * @see {@link TabClientTransport}
 */
export interface TabClientTransportOptions {
  /**
   * Expected origin of the server window for security validation.
   *
   * **Security**: This origin is checked against `event.origin` for all incoming
   * messages to prevent cross-origin attacks. Only messages from this origin will
   * be processed.
   *
   * @example 'https://example.com'
   * @example 'http://localhost:3000'
   */
  targetOrigin: string;

  /**
   * Channel identifier for message routing.
   *
   * Multiple transports can coexist on the same page by using different channel IDs.
   * This allows for isolated communication channels between different MCP clients
   * and servers.
   *
   * @default 'mcp-default'
   */
  channelId?: string;

  /**
   * Request timeout in milliseconds.
   *
   * If a request doesn't receive a response within this time, a timeout error
   * is synthesized and delivered to the client. This prevents infinite hangs
   * when the server becomes unresponsive due to:
   * - Page navigation
   * - JavaScript errors
   * - Network issues
   * - Server crashes
   *
   * **Design rationale**: 10 seconds is appropriate for most tool operations.
   * For operations that may take longer (e.g., complex computations, slow network
   * requests), increase this value via the configuration option.
   *
   * @default 10000 (10 seconds)
   * @see {@link _handleRequestTimeout} for timeout implementation
   */
  requestTimeout?: number;
}

/**
 * Request tracking information for timeout management.
 *
 * @internal Used by TabClientTransport to track pending requests
 */
interface ActiveRequestInfo {
  /** Timeout ID returned by setTimeout() */
  timeoutId: number;
  /** Original request message for error reporting */
  request: JSONRPCMessage;
}

/**
 * Client-side transport for same-window MCP communication via postMessage.
 *
 * This transport connects an MCP client to a TabServerTransport running in the same
 * window. Communication occurs via the browser's `window.postMessage()` API, which
 * provides:
 * - Same-window message passing (no network overhead)
 * - Origin validation for security
 * - Asynchronous message delivery
 *
 * **Architecture**:
 * ```
 * ┌─────────────────┐                    ┌──────────────────┐
 * │  MCP Client     │  postMessage()     │  MCP Server      │
 * │  (This side)    │ ←─────────────────→│  (TabServerTransport)
 * └─────────────────┘                    └──────────────────┘
 * ```
 *
 * **Key features**:
 * - Request timeout to prevent infinite hangs (default 10s)
 * - Server ready detection via handshake
 * - Origin validation for security
 * - Channel-based message routing
 *
 * **Use cases**:
 * - MCP client running in content script connecting to page context
 * - MCP client in extension popup connecting to background page
 * - Testing and development scenarios
 *
 * @example Basic usage
 * ```typescript
 * const transport = new TabClientTransport({
 *   targetOrigin: 'https://example.com',
 *   channelId: 'my-mcp-channel',
 *   requestTimeout: 10000, // Optional (default)
 * });
 *
 * // Wait for server to be ready
 * await transport.start();
 * await transport.serverReadyPromise;
 *
 * // Now safe to send messages
 * await transport.send({
 *   jsonrpc: '2.0',
 *   id: 1,
 *   method: 'tools/call',
 *   params: { name: 'my_tool', arguments: {} }
 * });
 * ```
 *
 * @example With custom timeout
 * ```typescript
 * const transport = new TabClientTransport({
 *   targetOrigin: '*',
 *   requestTimeout: 60000, // 60 seconds for slow operations
 * });
 * ```
 *
 * @see {@link TabServerTransport} for the server-side implementation
 * @see {@link https://developer.mozilla.org/en-US/docs/Web/API/Window/postMessage} for postMessage API
 */
export class TabClientTransport implements Transport {
  /** Transport state flag */
  private _started = false;

  /** Expected origin for message validation */
  private readonly _targetOrigin: string;

  /** Channel ID for message routing */
  private readonly _channelId: string;

  /** Request timeout in milliseconds */
  private readonly _requestTimeout: number;

  /** Message event listener */
  private _messageHandler?: (event: MessageEvent) => void;

  /**
   * Promise that resolves when the server is ready to receive messages.
   *
   * **Usage**: Always `await` this promise after calling `start()` and before
   * sending messages. Sending messages before the server is ready may result
   * in lost messages.
   *
   * @example
   * ```typescript
   * await transport.start();
   * await transport.serverReadyPromise;
   * // Now safe to send messages
   * ```
   */
  public readonly serverReadyPromise: Promise<void>;

  /** Internal resolver for serverReadyPromise */
  private readonly _serverReadyResolve: () => void;

  /** Internal rejector for serverReadyPromise */
  private readonly _serverReadyReject: (reason: unknown) => void;

  /** Tracks if serverReadyPromise has been settled */
  private _serverReadySettled = false;

  /**
   * Active request tracking for timeout management.
   *
   * **Key**: Request ID (from JSON-RPC message)
   * **Value**: Timeout ID and original request
   *
   * When a response is received, the entry is removed and timeout cleared.
   * If timeout expires first, an error response is synthesized.
   */
  private readonly _activeRequests = new Map<string | number, ActiveRequestInfo>();

  /** Callback invoked when transport closes */
  onclose?: () => void;

  /** Callback invoked on errors */
  onerror?: (error: Error) => void;

  /** Callback invoked when message received */
  onmessage?: (message: JSONRPCMessage) => void;

  /**
   * Creates a new TabClientTransport instance.
   *
   * **Note**: The transport is not started automatically. Call `start()` to begin
   * listening for messages.
   *
   * @param options - Configuration options
   * @throws {Error} If targetOrigin is not specified
   */
  constructor(options: TabClientTransportOptions) {
    if (!options.targetOrigin) {
      throw new Error('targetOrigin must be explicitly set for security');
    }

    this._targetOrigin = options.targetOrigin;
    this._channelId = options.channelId ?? 'mcp-default';
    this._requestTimeout = options.requestTimeout ?? 10000; // Default 10 seconds

    // Initialize server ready promise using Promise.withResolvers() pattern
    const { promise, resolve, reject } = Promise.withResolvers<void>();
    this.serverReadyPromise = promise;
    this._serverReadyResolve = resolve;
    this._serverReadyReject = reject;
  }

  /**
   * Starts the transport by registering message listeners.
   *
   * **Lifecycle**:
   * 1. Register `window.addEventListener('message', ...)` handler
   * 2. Send server ready check (in case server started first)
   * 3. Wait for server ready signal via `serverReadyPromise`
   *
   * **Note**: Always `await transport.serverReadyPromise` after calling this method
   * and before sending messages.
   *
   * @throws {Error} If transport is already started
   */
  async start(): Promise<void> {
    if (this._started) {
      throw new Error('Transport already started');
    }

    this._messageHandler = (event: MessageEvent) => {
      // Security: Validate message origin
      if (event.origin !== this._targetOrigin) {
        return;
      }

      // Validate message envelope
      if (event.data?.channel !== this._channelId || event.data?.type !== 'mcp') {
        return;
      }

      // Validate message direction
      if (event.data?.direction !== 'server-to-client') {
        return;
      }

      const payload = event.data.payload;

      // Handle server ready signal
      if (typeof payload === 'string' && payload === 'mcp-server-ready') {
        if (!this._serverReadySettled) {
          this._serverReadySettled = true;
          this._serverReadyResolve();
        }
        return;
      }

      // Handle server stopped signal
      if (typeof payload === 'string' && payload === 'mcp-server-stopped') {
        console.log('[TabClientTransport] Received mcp-server-stopped event, closing transport');
        this.close();
        return;
      }

      // Parse and validate JSON-RPC message
      try {
        const message = JSONRPCMessageSchema.parse(payload);

        // Server is ready if it's sending messages
        if (!this._serverReadySettled) {
          this._serverReadySettled = true;
          this._serverReadyResolve();
        }

        // Clear timeout for responses
        this._clearRequestTimeout(message);

        // Deliver message to client
        this.onmessage?.(message);
      } catch (error) {
        this.onerror?.(
          new Error(`Invalid message: ${error instanceof Error ? error.message : String(error)}`)
        );
      }
    };

    window.addEventListener('message', this._messageHandler);
    this._started = true;

    // Prompt server to send ready signal (in case server started first)
    this._sendCheckReady();
  }

  /**
   * Sends a JSON-RPC message to the server.
   *
   * **Request timeout**: If this is a request (has `method` and `id`), a timeout
   * is started. If the server doesn't respond within `requestTimeout` milliseconds,
   * an error response is synthesized.
   *
   * **Await server ready**: This method automatically awaits `serverReadyPromise`
   * before sending, ensuring messages aren't lost.
   *
   * @param message - JSON-RPC message to send
   * @throws {Error} If transport is not started
   */
  async send(message: JSONRPCMessage): Promise<void> {
    if (!this._started) {
      throw new Error('Transport not started');
    }

    // Wait for server to be ready before sending
    await this.serverReadyPromise;

    // Start timeout tracking for requests (not notifications)
    if ('method' in message && 'id' in message && message.id !== undefined) {
      this._startRequestTimeout(message);
    }

    // Send message via postMessage
    window.postMessage(
      {
        channel: this._channelId,
        type: 'mcp',
        direction: 'client-to-server',
        payload: message,
      },
      this._targetOrigin
    );
  }

  /**
   * Closes the transport and cleans up resources.
   *
   * **Cleanup performed**:
   * - Removes message event listener
   * - Clears all active request timeouts
   * - Rejects server ready promise if still pending
   * - Invokes `onclose` callback
   *
   * **Note**: After calling this method, the transport cannot be reused.
   * Create a new instance if needed.
   */
  async close(): Promise<void> {
    if (this._messageHandler) {
      window.removeEventListener('message', this._messageHandler);
    }

    // Clear all active request timeouts
    for (const [_id, info] of this._activeRequests) {
      clearTimeout(info.timeoutId);
    }
    this._activeRequests.clear();

    // Reject server ready promise if still pending
    if (!this._serverReadySettled) {
      this._serverReadySettled = true;
      this._serverReadyReject(new Error('Transport closed before server ready'));
    }

    this._started = false;
    this.onclose?.();
  }

  // ============================================================================
  // Private helper methods
  // ============================================================================

  /**
   * Sends a server ready check message.
   *
   * This prompts the server to respond with 'mcp-server-ready' signal,
   * resolving the `serverReadyPromise`. Useful when the server may have
   * started before the client.
   *
   * @private
   */
  private _sendCheckReady(): void {
    window.postMessage(
      {
        channel: this._channelId,
        type: 'mcp',
        direction: 'client-to-server',
        payload: 'mcp-check-ready',
      },
      this._targetOrigin
    );
  }

  /**
   * Starts timeout tracking for a request.
   *
   * **Behavior**: After `requestTimeout` milliseconds, if no response is received,
   * `_handleRequestTimeout` is called to synthesize an error response.
   *
   * **Note**: Only requests (messages with `method` and `id`) are tracked.
   * Notifications (no `id`) and responses are not tracked.
   *
   * @param message - JSON-RPC request message
   * @private
   */
  private _startRequestTimeout(message: JSONRPCMessage): void {
    if (!('id' in message) || message.id === undefined) {
      return;
    }

    const timeoutId = setTimeout(() => {
      this._handleRequestTimeout(message.id!);
    }, this._requestTimeout) as unknown as number;

    this._activeRequests.set(message.id, {
      timeoutId,
      request: message,
    });
  }

  /**
   * Clears timeout tracking for a response.
   *
   * Called when a response (with `result` or `error`) is received.
   * Clears the timeout and removes the tracking entry.
   *
   * @param message - JSON-RPC response message
   * @private
   */
  private _clearRequestTimeout(message: JSONRPCMessage): void {
    if (('result' in message || 'error' in message) && message.id !== undefined) {
      const info = this._activeRequests.get(message.id);
      if (info) {
        clearTimeout(info.timeoutId);
        this._activeRequests.delete(message.id);
      }
    }
  }

  /**
   * Handles request timeout by synthesizing an error response.
   *
   * **Error response format** (JSON-RPC 2.0):
   * ```json
   * {
   *   "jsonrpc": "2.0",
   *   "id": "<request-id>",
   *   "error": {
   *     "code": -32000,
   *     "message": "Request timeout - server may have navigated or become unresponsive",
   *     "data": {
   *       "timeoutMs": 10000,
   *       "originalMethod": "tools/call"
   *     }
   *   }
   * }
   * ```
   *
   * **Error code**: `-32000` (Server error) per JSON-RPC 2.0 specification.
   *
   * @param requestId - ID of the timed-out request
   * @private
   */
  private _handleRequestTimeout(requestId: string | number): void {
    const info = this._activeRequests.get(requestId);
    if (!info) {
      return; // Already handled or cleared
    }

    this._activeRequests.delete(requestId);

    // Synthesize timeout error response per JSON-RPC 2.0 spec
    const errorResponse: JSONRPCMessage = {
      jsonrpc: '2.0',
      id: requestId,
      error: {
        code: -32000, // Server error (JSON-RPC 2.0)
        message: 'Request timeout - server may have navigated or become unresponsive',
        data: {
          timeoutMs: this._requestTimeout,
          originalMethod: 'method' in info.request ? info.request.method : undefined,
        },
      },
    };

    // Deliver synthesized error as if server responded
    this.onmessage?.(errorResponse);
  }
}
