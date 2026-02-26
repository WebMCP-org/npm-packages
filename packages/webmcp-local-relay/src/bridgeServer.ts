import { randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';
import type { IncomingMessage } from 'node:http';

import WebSocket, { WebSocketServer } from 'ws';
import {
  CallToolResultSchema,
  type RelayCallToolResult,
  type RelayInvokeArgs,
  type RelayTool,
} from './protocol.js';
import { type AggregatedTool, HelloRequiredError, RelayRegistry } from './registry.js';
import {
  BrowserToRelayMessageSchema,
  type RelayClientToServerMessage,
  RelayClientToServerMessageSchema,
  type RelayServerToClientMessage,
  RelayServerToClientMessageSchema,
  type RelayToBrowserMessage,
} from './schemas.js';

/**
 * In-flight relay invocation waiting for a browser `result` message.
 */
interface PendingInvocation {
  callId: string;
  connectionId: string;
  timeoutId: ReturnType<typeof setTimeout>;
  resolve: (result: RelayCallToolResult) => void;
  reject: (error: Error) => void;
}

/**
 * Runtime options for {@link RelayBridgeServer}.
 */
export interface RelayBridgeServerOptions {
  /**
   * Network interface used by the local WebSocket server.
   * @defaultValue `"127.0.0.1"`
   */
  host?: string;
  /**
   * Preferred WebSocket port for browser widget connections.
   * @defaultValue `9333`
   */
  port?: number;
  /**
   * Allowed `Origin` header values for incoming browser connections.
   * Use `["*"]` to allow all origins.
   *
   * Permissive by default for zero-config developer experience — any browser
   * page can connect and register tools without additional setup. For
   * production or shared machines, restrict to trusted origins via the
   * `--widget-origin` CLI flag or by passing explicit origins here.
   *
   * @defaultValue `["*"]`
   */
  allowedOrigins?: string[];
  /**
   * Maximum WebSocket payload size in bytes.
   * @defaultValue `1000000`
   */
  maxPayloadBytes?: number;
  /**
   * Timeout used for browser tool invocations.
   * @defaultValue `25000`
   */
  invokeTimeoutMs?: number;
}

/**
 * WebSocket relay between browser widget frames and MCP server calls.
 *
 * Operates in two modes:
 * - **server** (default): Runs a WebSocket server, accepts browser and relay
 *   client connections.
 * - **client** (fallback on EADDRINUSE): Connects as a WebSocket client to an
 *   existing server relay and proxies tool operations through it.
 */
export class RelayBridgeServer extends EventEmitter {
  /**
   * Registry for connected sources and aggregated tool definitions.
   * Only actively used in server mode; remains empty when operating as a client.
   */
  readonly registry: RelayRegistry;

  private readonly host: string;
  private desiredPort: number;
  private readonly allowedOrigins: string[];
  private readonly maxPayloadBytes: number;
  private readonly invokeTimeoutMs: number;

  private wss: WebSocketServer | null = null;
  private readonly socketByConnectionId = new Map<string, WebSocket>();
  private readonly pendingInvocations = new Map<string, PendingInvocation>();
  private readonly relayClientConnectionIds = new Set<string>();
  private readonly onStateChangedPushRelay = () => {
    this.pushToolsToRelayClients();
  };

  private _mode: 'server' | 'client' = 'server';
  private clientSocket: WebSocket | null = null;
  private clientReconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private clientReconnectDelay = 500;
  /**
   * Maximum delay for relay-to-relay reconnection backoff in client mode.
   */
  private readonly clientMaxReconnectDelay = 3_000;
  private readonly clientPendingInvocations = new Map<string, PendingInvocation>();
  private clientTools: RelayTool[] = [];
  private stopping = false;

  /**
   * Creates a relay bridge server instance.
   */
  constructor(options: RelayBridgeServerOptions = {}, registry?: RelayRegistry) {
    super();
    this.registry = registry ?? new RelayRegistry();

    this.host = options.host ?? '127.0.0.1';
    this.desiredPort = options.port ?? 9333;
    this.allowedOrigins = options.allowedOrigins ?? ['*'];
    this.maxPayloadBytes = options.maxPayloadBytes ?? 1_000_000;
    this.invokeTimeoutMs = options.invokeTimeoutMs ?? 25_000;
  }

  /**
   * Current operating mode.
   */
  get mode(): 'server' | 'client' {
    return this._mode;
  }

  /**
   * Resolved listening port. In client mode this is the port of the server
   * relay being proxied through.
   */
  get port(): number {
    return this.desiredPort;
  }

  /**
   * Tools received from the server relay (client mode only).
   * Returns an empty array in server mode.
   */
  listToolsFromRelay(): RelayTool[] {
    return this._mode === 'client' ? [...this.clientTools] : [];
  }

  /**
   * Starts the bridge. Attempts to bind a WebSocket server (server mode).
   * If the port is already in use, automatically falls back to client mode
   * and proxies through the existing relay.
   */
  async start(): Promise<void> {
    if (this.wss || this.clientSocket) {
      return;
    }

    this.stopping = false;

    try {
      await this.startAsServer();
    } catch (err) {
      const isAddrInUse =
        err instanceof Error &&
        ('code' in err
          ? (err as NodeJS.ErrnoException).code === 'EADDRINUSE'
          : err.message.includes('EADDRINUSE'));

      if (!isAddrInUse) {
        throw err;
      }

      this._mode = 'client';
      process.stderr.write(
        `[webmcp-local-relay] info: port ${this.desiredPort} in use, switching to client mode\n`
      );
      await this.startAsClient();
    }
  }

  /**
   * Stops all relay resources and rejects any pending invocations.
   */
  async stop(): Promise<void> {
    this.stopping = true;

    if (this.clientReconnectTimer) {
      clearTimeout(this.clientReconnectTimer);
      this.clientReconnectTimer = null;
    }

    if (this._mode === 'client') {
      for (const pending of this.clientPendingInvocations.values()) {
        clearTimeout(pending.timeoutId);
        pending.reject(new Error('Relay client stopped'));
      }
      this.clientPendingInvocations.clear();

      if (this.clientSocket) {
        try {
          this.clientSocket.close(1000, 'Relay client shutting down');
        } catch (err) {
          process.stderr.write(
            `[webmcp-local-relay] warn: error closing client socket during shutdown: ${err instanceof Error ? err.message : String(err)}\n`
          );
        }
        this.clientSocket = null;
      }
      return;
    }

    this.off('stateChanged', this.onStateChangedPushRelay);

    for (const socket of this.socketByConnectionId.values()) {
      try {
        socket.close(1001, 'Relay shutting down');
      } catch (err) {
        process.stderr.write(
          `[webmcp-local-relay] warn: error closing socket during shutdown: ${err instanceof Error ? err.message : String(err)}\n`
        );
      }
    }

    this.socketByConnectionId.clear();
    this.relayClientConnectionIds.clear();

    for (const pending of this.pendingInvocations.values()) {
      clearTimeout(pending.timeoutId);
      pending.reject(new Error('Relay server stopped before tool invocation completed'));
    }
    this.pendingInvocations.clear();

    const wss = this.wss;
    this.wss = null;

    if (!wss) {
      return;
    }

    await new Promise<void>((resolve) => {
      wss.close((err?: Error) => {
        if (err) {
          process.stderr.write(
            `[webmcp-local-relay] warn: WebSocket server close error: ${err.message}\n`
          );
        }
        resolve();
      });
    });
  }

  /**
   * Sends a reload message to a connected browser source.
   * Only supported in server mode.
   */
  reloadSource(connectionId: string): void {
    if (this._mode !== 'server') {
      throw new Error('reloadSource is only supported in server mode');
    }
    const socket = this.socketByConnectionId.get(connectionId);
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      throw new Error(`Source ${connectionId} is not connected`);
    }
    const message: RelayToBrowserMessage = { type: 'reload' };
    try {
      socket.send(JSON.stringify(message));
    } catch (err) {
      throw new Error(`Failed to send reload: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  /**
   * Invokes a tool either locally (server mode) or through the upstream relay
   * (client mode).
   */
  async invokeTool(
    toolName: string,
    args: RelayInvokeArgs,
    options: {
      sourceId?: string;
      requestTabId?: string;
    } = {}
  ): Promise<RelayCallToolResult> {
    if (this._mode === 'client') {
      return this.invokeToolViaRelay(toolName, args);
    }

    return this.invokeToolLocally(toolName, args, options);
  }

  private async startAsServer(): Promise<void> {
    const wss = await new Promise<WebSocketServer>((resolve, reject) => {
      const server = new WebSocketServer({
        host: this.host,
        port: this.desiredPort,
        maxPayload: this.maxPayloadBytes,
      });

      const onListening = () => {
        server.off('error', onError);
        resolve(server);
      };
      const onError = (err: Error) => {
        server.off('listening', onListening);
        reject(err);
      };

      server.once('listening', onListening);
      server.once('error', onError);
    });

    wss.on('connection', (socket: WebSocket, request: IncomingMessage) => {
      const origin = request.headers.origin;
      if (!this.isOriginAllowed(origin)) {
        socket.close(1008, 'Origin not allowed');
        return;
      }

      const connectionId = randomUUID();
      this.socketByConnectionId.set(connectionId, socket);

      socket.on('message', (raw: WebSocket.RawData) => {
        this.onSocketMessage(connectionId, raw);
      });

      socket.on('close', () => {
        this.onSocketClose(connectionId);
      });

      socket.on('error', (err: Error) => {
        process.stderr.write(
          `[webmcp-local-relay] warn: socket error for connection ${connectionId}: ${err.message}\n`
        );
        this.onSocketClose(connectionId);
      });
    });

    wss.on('error', (err: Error) => {
      process.stderr.write(`[webmcp-local-relay] error: WebSocket server error: ${err.message}\n`);
      this.emit('error', err);
    });

    this.wss = wss;
    this._mode = 'server';

    const address = wss.address();
    if (address && typeof address !== 'string') {
      this.desiredPort = address.port;
    }

    this.on('stateChanged', this.onStateChangedPushRelay);
  }

  private invokeToolLocally(
    toolName: string,
    args: RelayInvokeArgs,
    options: { sourceId?: string; requestTabId?: string }
  ): Promise<RelayCallToolResult> {
    const resolveOptions: { toolName: string; sourceId?: string; requestTabId?: string } = {
      toolName,
    };
    if (options.sourceId !== undefined) {
      resolveOptions.sourceId = options.sourceId;
    }
    if (options.requestTabId !== undefined) {
      resolveOptions.requestTabId = options.requestTabId;
    }

    const resolved = this.registry.resolveInvocation(resolveOptions);

    if (!resolved) {
      throw new Error(`No active browser source provides tool "${toolName}"`);
    }

    const socket = this.socketByConnectionId.get(resolved.connectionId);
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      throw new Error(
        `Tool source ${resolved.connectionId} disconnected before invocation of "${toolName}"`
      );
    }

    const callId = randomUUID();

    return new Promise<RelayCallToolResult>((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        this.pendingInvocations.delete(callId);
        reject(
          new Error(`Invocation for tool "${toolName}" timed out after ${this.invokeTimeoutMs}ms`)
        );
      }, this.invokeTimeoutMs);

      this.pendingInvocations.set(callId, {
        callId,
        connectionId: resolved.connectionId,
        timeoutId,
        resolve,
        reject,
      });

      const message: RelayToBrowserMessage = {
        type: 'invoke',
        callId,
        toolName: resolved.tool.name,
        args,
      };

      try {
        socket.send(JSON.stringify(message));
      } catch (err) {
        clearTimeout(timeoutId);
        this.pendingInvocations.delete(callId);
        reject(
          new Error(
            `Failed to send invocation for tool "${toolName}": ${err instanceof Error ? err.message : err}`
          )
        );
      }
    });
  }

  /**
   * Handles a raw WebSocket message from a connected source.
   *
   * Routes relay-protocol messages (`relay/*`) to the relay client handler
   * and browser-protocol messages to the existing browser handler.
   */
  private onSocketMessage(connectionId: string, raw: WebSocket.RawData): void {
    const text = this.rawDataToUtf8(raw);

    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(text);
    } catch {
      const preview = text.length > 200 ? `${text.slice(0, 200)}...` : text;
      process.stderr.write(
        `[webmcp-local-relay] warn: invalid JSON from connection ${connectionId}: ${preview}\n`
      );
      return;
    }

    const typeField =
      typeof parsedJson === 'object' && parsedJson !== null
        ? (parsedJson as Record<string, unknown>).type
        : undefined;

    if (typeof typeField === 'string' && typeField.startsWith('relay/')) {
      const relayMsg = RelayClientToServerMessageSchema.safeParse(parsedJson);
      if (relayMsg.success) {
        this.onRelayClientMessage(connectionId, relayMsg.data);
      } else {
        process.stderr.write(
          `[webmcp-local-relay] warn: invalid relay message from ${connectionId}: ${relayMsg.error.message}\n`
        );
      }
      return;
    }

    this.registry.touchConnection(connectionId);

    const parsedMessage = BrowserToRelayMessageSchema.safeParse(parsedJson);
    if (!parsedMessage.success) {
      process.stderr.write(
        `[webmcp-local-relay] warn: invalid message from connection ${connectionId} (type=${typeField}): ${parsedMessage.error.message}\n`
      );
      return;
    }

    const message = parsedMessage.data;

    switch (message.type) {
      case 'hello':
        this.registry.upsertSource(connectionId, message);
        this.emit('stateChanged');
        break;

      case 'tools/list':
      case 'tools/changed':
        try {
          this.registry.registerTools(connectionId, message.tools);
          this.emit('stateChanged');
        } catch (err) {
          if (err instanceof HelloRequiredError) {
            process.stderr.write(
              `[webmcp-local-relay] warn: connection ${connectionId} sent tools before hello, ignoring\n`
            );
          } else {
            process.stderr.write(
              `[webmcp-local-relay] error: failed to register tools for connection ${connectionId}: ${err instanceof Error ? (err.stack ?? err.message) : String(err)}\n`
            );
            const socket = this.socketByConnectionId.get(connectionId);
            socket?.close(1011, 'Failed to register tools');
          }
        }
        break;

      case 'result': {
        const pending = this.pendingInvocations.get(message.callId);
        if (!pending) {
          process.stderr.write(
            `[webmcp-local-relay] warn: received result for unknown callId ${message.callId}\n`
          );
          break;
        }

        clearTimeout(pending.timeoutId);
        this.pendingInvocations.delete(message.callId);
        pending.resolve(this.normalizeCallToolResult(message.result));
        break;
      }

      case 'pong':
        break;
    }
  }

  /**
   * Handles relay-protocol messages from relay client connections.
   */
  private onRelayClientMessage(connectionId: string, message: RelayClientToServerMessage): void {
    switch (message.type) {
      case 'relay/hello':
        this.relayClientConnectionIds.add(connectionId);
        break;

      case 'relay/list-tools': {
        const tools = this.registry.listTools();
        const response: RelayServerToClientMessage = {
          type: 'relay/tools',
          tools: this.toWireTools(tools),
        };
        const socket = this.socketByConnectionId.get(connectionId);
        if (socket?.readyState === WebSocket.OPEN) {
          try {
            socket.send(JSON.stringify(response));
          } catch (err) {
            process.stderr.write(
              `[webmcp-local-relay] warn: failed to send relay tools response to ${connectionId}: ${err instanceof Error ? err.message : String(err)}\n`
            );
          }
        }
        break;
      }

      case 'relay/invoke': {
        const { callId, toolName, args } = message;
        void (async () => {
          try {
            const result = await this.invokeToolLocally(toolName, args ?? {}, {});
            const response: RelayServerToClientMessage = {
              type: 'relay/result',
              callId,
              result,
            };
            const socket = this.socketByConnectionId.get(connectionId);
            if (socket?.readyState === WebSocket.OPEN) {
              try {
                socket.send(JSON.stringify(response));
              } catch (sendErr) {
                process.stderr.write(
                  `[webmcp-local-relay] warn: failed to send relay result to ${connectionId}: ${sendErr instanceof Error ? sendErr.message : String(sendErr)}\n`
                );
              }
            } else {
              process.stderr.write(
                `[webmcp-local-relay] warn: relay client ${connectionId} disconnected before result for callId ${callId} could be delivered\n`
              );
            }
          } catch (err) {
            const response: RelayServerToClientMessage = {
              type: 'relay/result',
              callId,
              result: {
                content: [
                  {
                    type: 'text',
                    text: `Relay invocation failed: ${err instanceof Error ? err.message : String(err)}`,
                  },
                ],
                isError: true,
              },
            };
            const socket = this.socketByConnectionId.get(connectionId);
            if (socket?.readyState === WebSocket.OPEN) {
              try {
                socket.send(JSON.stringify(response));
              } catch (sendErr) {
                process.stderr.write(
                  `[webmcp-local-relay] warn: failed to send relay error result to ${connectionId}: ${sendErr instanceof Error ? sendErr.message : String(sendErr)}\n`
                );
              }
            } else {
              process.stderr.write(
                `[webmcp-local-relay] warn: relay client ${connectionId} disconnected before error result for callId ${callId} could be delivered\n`
              );
            }
          }
        })();
        break;
      }
    }
  }

  /**
   * Pushes current tool state to all connected relay clients.
   */
  private pushToolsToRelayClients(): void {
    if (this.relayClientConnectionIds.size === 0) {
      return;
    }

    const tools = this.registry.listTools();
    const message: RelayServerToClientMessage = {
      type: 'relay/tools-changed',
      tools: this.toWireTools(tools),
    };
    const payload = JSON.stringify(message);

    for (const connectionId of this.relayClientConnectionIds) {
      const socket = this.socketByConnectionId.get(connectionId);
      if (socket?.readyState === WebSocket.OPEN) {
        try {
          socket.send(payload);
        } catch (err) {
          process.stderr.write(
            `[webmcp-local-relay] warn: failed to push tool update to relay client ${connectionId}: ${err instanceof Error ? err.message : String(err)}\n`
          );
        }
      }
    }
  }

  /**
   * Handles source disconnection and rejects in-flight calls owned by that source.
   */
  private onSocketClose(connectionId: string): void {
    this.relayClientConnectionIds.delete(connectionId);
    this.registry.removeConnection(connectionId);
    this.socketByConnectionId.delete(connectionId);
    this.emit('stateChanged');

    for (const [callId, pending] of this.pendingInvocations.entries()) {
      if (pending.connectionId !== connectionId) {
        continue;
      }

      clearTimeout(pending.timeoutId);
      this.pendingInvocations.delete(callId);
      pending.reject(new Error(`Tool source ${connectionId} disconnected during invocation`));
    }
  }

  private async startAsClient(): Promise<void> {
    this.stopping = false;

    return new Promise<void>((resolve, reject) => {
      const wsUrl = `ws://${this.host}:${this.desiredPort}`;
      const ws = new WebSocket(wsUrl);

      const onOpen = () => {
        ws.off('error', onFirstError);
        this.clientSocket = ws;
        this.clientReconnectDelay = 500;

        try {
          ws.send(JSON.stringify({ type: 'relay/hello' }));
          ws.send(JSON.stringify({ type: 'relay/list-tools' }));
        } catch (err) {
          process.stderr.write(
            `[webmcp-local-relay] error: failed to send handshake to relay server: ${err instanceof Error ? err.message : String(err)}\n`
          );
          this.clientSocket = null;
          ws.close();
          reject(new Error('Failed to send handshake to relay server'));
          return;
        }

        this.setupClientHandlers(ws);
        resolve();
      };

      const onFirstError = (err: Error) => {
        ws.off('open', onOpen);
        reject(
          new Error(
            `Failed to connect to relay server at ws://${this.host}:${this.desiredPort}: ${err.message}`
          )
        );
      };

      ws.once('open', onOpen);
      ws.once('error', onFirstError);
    });
  }

  private setupClientHandlers(ws: WebSocket): void {
    ws.on('message', (raw: WebSocket.RawData) => {
      const text = this.rawDataToUtf8(raw);
      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch {
        const preview = text.length > 200 ? `${text.slice(0, 200)}...` : text;
        process.stderr.write(
          `[webmcp-local-relay] warn: invalid JSON from relay server: ${preview}\n`
        );
        return;
      }

      const msg = RelayServerToClientMessageSchema.safeParse(parsed);
      if (!msg.success) {
        const typeField =
          typeof parsed === 'object' && parsed !== null
            ? (parsed as Record<string, unknown>).type
            : 'unknown';
        process.stderr.write(
          `[webmcp-local-relay] warn: invalid relay server message (type=${typeField}): ${msg.error.message}\n`
        );
        return;
      }

      switch (msg.data.type) {
        case 'relay/tools':
        case 'relay/tools-changed':
          this.clientTools = msg.data.tools;
          this.emit('stateChanged');
          break;

        case 'relay/result': {
          const pending = this.clientPendingInvocations.get(msg.data.callId);
          if (!pending) {
            process.stderr.write(
              `[webmcp-local-relay] warn: received relay result for unknown callId ${msg.data.callId}\n`
            );
            break;
          }
          clearTimeout(pending.timeoutId);
          this.clientPendingInvocations.delete(msg.data.callId);
          pending.resolve(msg.data.result);
          break;
        }
      }
    });

    ws.on('close', () => {
      this.clientSocket = null;

      for (const [callId, pending] of this.clientPendingInvocations) {
        clearTimeout(pending.timeoutId);
        this.clientPendingInvocations.delete(callId);
        pending.reject(new Error('Relay server connection lost during invocation'));
      }

      this.clientTools = [];
      this.emit('stateChanged');

      if (!this.stopping) {
        this.scheduleReconnect();
      }
    });

    ws.on('error', (err: Error) => {
      process.stderr.write(
        `[webmcp-local-relay] warn: relay client socket error: ${err.message}\n`
      );
    });
  }

  private scheduleReconnect(): void {
    if (this.clientReconnectTimer || this.stopping) {
      return;
    }

    const delay = this.clientReconnectDelay;
    this.clientReconnectDelay = Math.min(
      this.clientReconnectDelay * 1.5,
      this.clientMaxReconnectDelay
    );

    this.clientReconnectTimer = setTimeout(() => {
      this.clientReconnectTimer = null;
      if (this.stopping) {
        return;
      }

      void this.reconnectWithModePromotion();
    }, delay);
  }

  /**
   * Attempts to promote from client to server mode when reconnecting.
   * Tries to bind the port first; if EADDRINUSE, falls back to client mode.
   */
  private async reconnectWithModePromotion(): Promise<void> {
    try {
      await this.startAsServer();
      this._mode = 'server';
      this.clientReconnectDelay = 500;
      process.stderr.write('[webmcp-local-relay] info: promoted from client to server mode\n');
      this.emit('stateChanged');
    } catch (err) {
      const isAddrInUse =
        err instanceof Error &&
        ('code' in err
          ? (err as NodeJS.ErrnoException).code === 'EADDRINUSE'
          : err.message.includes('EADDRINUSE'));

      if (!isAddrInUse) {
        process.stderr.write(
          `[webmcp-local-relay] warn: server promotion failed: ${err instanceof Error ? err.message : String(err)}\n`
        );
        if (!this.stopping) {
          this.scheduleReconnect();
        }
        return;
      }

      this.reconnectAsClient();
    }
  }

  /**
   * Reconnects as a client to an existing relay server.
   */
  private reconnectAsClient(): void {
    const wsUrl = `ws://${this.host}:${this.desiredPort}`;
    const ws = new WebSocket(wsUrl);

    const onReconnectError = (err: Error) => {
      process.stderr.write(
        `[webmcp-local-relay] warn: relay client reconnection failed: ${err.message}\n`
      );
      if (!this.stopping) {
        this.scheduleReconnect();
      }
    };

    ws.once('open', () => {
      ws.off('error', onReconnectError);
      this.clientSocket = ws;
      this.clientReconnectDelay = 500;

      try {
        ws.send(JSON.stringify({ type: 'relay/hello' }));
        ws.send(JSON.stringify({ type: 'relay/list-tools' }));
      } catch (err) {
        process.stderr.write(
          `[webmcp-local-relay] error: failed to send handshake during reconnection: ${err instanceof Error ? err.message : String(err)}\n`
        );
        this.clientSocket = null;
        ws.close();
        this.scheduleReconnect();
        return;
      }

      this.setupClientHandlers(ws);
    });

    ws.once('error', onReconnectError);
  }

  private invokeToolViaRelay(
    toolName: string,
    args: RelayInvokeArgs
  ): Promise<RelayCallToolResult> {
    if (!this.clientSocket || this.clientSocket.readyState !== WebSocket.OPEN) {
      throw new Error('Not connected to relay server');
    }

    const callId = randomUUID();
    const socket = this.clientSocket;

    return new Promise<RelayCallToolResult>((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        this.clientPendingInvocations.delete(callId);
        reject(
          new Error(
            `Proxied invocation for tool "${toolName}" timed out after ${this.invokeTimeoutMs}ms`
          )
        );
      }, this.invokeTimeoutMs);

      this.clientPendingInvocations.set(callId, {
        callId,
        connectionId: 'relay-server',
        timeoutId,
        resolve,
        reject,
      });

      const message: RelayClientToServerMessage = {
        type: 'relay/invoke',
        callId,
        toolName,
        args,
      };

      try {
        socket.send(JSON.stringify(message));
      } catch (err) {
        clearTimeout(timeoutId);
        this.clientPendingInvocations.delete(callId);
        reject(
          new Error(`Failed to send relay invocation: ${err instanceof Error ? err.message : err}`)
        );
      }
    });
  }

  /**
   * Maps aggregated tools to the wire format used by the relay protocol.
   */
  private toWireTools(tools: AggregatedTool[]): RelayTool[] {
    return tools.map(({ originalName: _originalName, sources: _sources, ...tool }) => tool);
  }

  private isOriginAllowed(origin: string | undefined): boolean {
    if (this.allowedOrigins.includes('*')) {
      return true;
    }

    if (!origin) {
      return false;
    }

    return this.allowedOrigins.includes(origin);
  }

  /**
   * Validates browser tool results against CallToolResultSchema.
   * Non-conforming payloads are wrapped as error results with diagnostic text.
   */
  private normalizeCallToolResult(result: unknown): RelayCallToolResult {
    const parsed = CallToolResultSchema.safeParse(result);
    if (parsed.success) {
      return parsed.data;
    }

    const preview = JSON.stringify(result)?.slice(0, 500) ?? 'undefined';
    process.stderr.write(
      `[webmcp-local-relay] warn: tool returned invalid CallToolResult (${parsed.error.message}), wrapping as error: ${preview}\n`
    );

    return {
      content: [
        {
          type: 'text',
          text: `Tool returned an invalid result (expected {content: [...]}): ${preview}`,
        },
      ],
      isError: true,
    };
  }

  /**
   * Converts WebSocket raw data variants to a UTF-8 string payload.
   */
  private rawDataToUtf8(raw: WebSocket.RawData): string {
    if (typeof raw === 'string') {
      return raw;
    }

    if (Buffer.isBuffer(raw)) {
      return raw.toString('utf8');
    }

    if (raw instanceof ArrayBuffer) {
      return Buffer.from(raw).toString('utf8');
    }

    if (Array.isArray(raw)) {
      return Buffer.concat(raw).toString('utf8');
    }

    return String(raw);
  }
}
