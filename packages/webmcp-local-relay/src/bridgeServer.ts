import { randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';

import WebSocket, { WebSocketServer } from 'ws';
import {
  buildPortCandidates,
  DEFAULT_RELAY_PORT,
  DEFAULT_RELAY_PORT_RANGE_END,
  defaultRelayPortPersistPath,
  persistPort,
} from './portStrategy.js';
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
  type RelaySourceInfo,
  type RelayToBrowserMessage,
  type ServerHelloMessage,
} from './schemas.js';

const RELAY_BROWSER_PROTOCOL = 'webmcp.v1';
const RELAY_DISCOVERY_PROTOCOL = 'webmcp-discovery.v1';
const RELAY_INTERNAL_PROTOCOL = 'webmcp-relay.v1';
const RELAY_SERVER_MESSAGE_TIMEOUT_MS = 750;
const HEARTBEAT_INTERVAL_MS = 15_000;
const HEARTBEAT_DEAD_THRESHOLD_MS = 25_000;
const SUPPORTED_SUBPROTOCOLS = new Set([
  RELAY_BROWSER_PROTOCOL,
  RELAY_DISCOVERY_PROTOCOL,
  RELAY_INTERNAL_PROTOCOL,
]);
const MAX_JSON_DEPTH = 64;

function exceedsMaxDepth(value: unknown, maxDepth: number, current = 0): boolean {
  if (current > maxDepth) return true;
  if (typeof value !== 'object' || value === null) return false;
  if (Array.isArray(value)) {
    for (const item of value) {
      if (exceedsMaxDepth(item, maxDepth, current + 1)) return true;
    }
  } else {
    for (const v of Object.values(value)) {
      if (exceedsMaxDepth(v, maxDepth, current + 1)) return true;
    }
  }
  return false;
}

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
   * Whether the preferred port came from an explicit CLI/API override.
   * Explicit ports fail if occupied by a non-relay process.
   * @defaultValue `false`
   */
  portExplicitlySet?: boolean;
  /**
   * Inclusive upper bound for automatic port discovery.
   * @defaultValue `9348`
   */
  portRangeEnd?: number;
  /**
   * File path used to cache the last successful relay port.
   * @defaultValue `~/.webmcp/relay-port.json`
   */
  persistPath?: string;
  /**
   * Allowed host page origins reported by browser `hello` messages.
   * Use `["*"]` to allow all origins.
   *
   * Permissive by default for zero-config developer experience — any browser
   * page can connect and register tools without additional setup. For production
   * or shared machines, restrict to trusted host origins via the
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
  /**
   * Human-readable relay label reported in discovery handshakes.
   */
  label?: string;
  /**
   * Optional workspace name reported in discovery handshakes.
   */
  workspace?: string;
  /**
   * Stable relay identifier used to select between multiple relays.
   */
  relayId?: string;
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
  private readonly preferredPort: number;
  private desiredPort: number;
  private readonly portExplicitlySet: boolean;
  private readonly portRangeEnd: number;
  private readonly persistPath: string;
  private readonly allowedOrigins: string[];
  private readonly maxPayloadBytes: number;
  private readonly invokeTimeoutMs: number;
  private readonly label: string | undefined;
  private readonly workspace: string | undefined;
  private readonly relayId: string | undefined;
  private readonly instanceId: string;

  private wss: WebSocketServer | null = null;
  private readonly socketByConnectionId = new Map<string, WebSocket>();
  private readonly pendingInvocations = new Map<string, PendingInvocation>();
  private readonly relayClientConnectionIds = new Set<string>();
  private readonly heartbeatIntervalByConnectionId = new Map<
    string,
    ReturnType<typeof setInterval>
  >();
  private readonly lastPongByConnectionId = new Map<string, number>();
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
  private readonly clientMaxReconnectAttempts = 100;
  private clientReconnectAttempts = 0;
  private readonly clientPendingInvocations = new Map<string, PendingInvocation>();
  private clientTools: RelayTool[] = [];
  private clientSources: RelaySourceInfo[] = [];
  private clientToolSourceMap: Record<string, string[]> = {};
  private stopping = false;

  /**
   * Creates a relay bridge server instance.
   */
  constructor(options: RelayBridgeServerOptions = {}, registry?: RelayRegistry) {
    super();
    this.registry = registry ?? new RelayRegistry();

    this.host = options.host ?? '127.0.0.1';
    this.preferredPort = options.port ?? DEFAULT_RELAY_PORT;
    this.desiredPort = this.preferredPort;
    this.portExplicitlySet = options.portExplicitlySet ?? false;
    this.portRangeEnd =
      options.portRangeEnd ?? Math.max(DEFAULT_RELAY_PORT_RANGE_END, this.preferredPort);
    this.persistPath = options.persistPath ?? defaultRelayPortPersistPath();
    this.allowedOrigins = options.allowedOrigins ?? ['*'];
    this.maxPayloadBytes = options.maxPayloadBytes ?? 1_000_000;
    this.invokeTimeoutMs = options.invokeTimeoutMs ?? 25_000;
    this.label = options.label;
    this.workspace = options.workspace;
    this.relayId = options.relayId;
    this.instanceId = randomUUID();

    if (this.preferredPort !== 0 && (this.preferredPort < 1 || this.preferredPort > 65535)) {
      throw new Error(
        `Invalid port ${this.preferredPort}. Port must be 0 (auto-assign) or between 1 and 65535.`
      );
    }
    if (this.portRangeEnd < this.preferredPort && this.preferredPort !== 0) {
      throw new Error(
        `Invalid port range ${this.preferredPort}-${this.portRangeEnd}. rangeEnd must be greater than or equal to the preferred port.`
      );
    }
    if (this.maxPayloadBytes <= 0) {
      throw new Error(`Invalid maxPayloadBytes ${this.maxPayloadBytes}. Must be greater than 0.`);
    }
    if (this.invokeTimeoutMs <= 0) {
      throw new Error(`Invalid invokeTimeoutMs ${this.invokeTimeoutMs}. Must be greater than 0.`);
    }
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
   * Source metadata received from the server relay (client mode only).
   * Returns an empty array in server mode.
   */
  listSourcesFromRelay(): RelaySourceInfo[] {
    return this._mode === 'client' ? [...this.clientSources] : [];
  }

  /**
   * Tool-to-source mapping received from the server relay (client mode only).
   * Maps public tool names to arrays of source IDs.
   * Returns an empty record in server mode.
   */
  getToolSourceMapFromRelay(): Record<string, string[]> {
    return this._mode === 'client' ? { ...this.clientToolSourceMap } : {};
  }

  /**
   * Starts the bridge. Attempts to bind a WebSocket server (server mode).
   * If a compatible relay already owns a candidate port, joins it in client mode.
   * If a non-relay process owns the port, continues searching the reserved range.
   */
  async start(): Promise<void> {
    if (this.wss || this.clientSocket) {
      return;
    }

    this.stopping = false;
    await this.startUsingPortStrategy();
  }

  private async startUsingPortStrategy(): Promise<void> {
    if (this.preferredPort === 0) {
      await this.startAsServer(0);
      return;
    }

    const candidates = await buildPortCandidates({
      defaultPort: this.preferredPort,
      ...(this.portExplicitlySet ? { fixedPort: this.preferredPort } : {}),
      host: this.host,
      persistPath: this.persistPath,
      rangeEnd: this.portRangeEnd,
    });

    for (const candidate of candidates) {
      try {
        await this.startAsServer(candidate.port);
        await persistPort(this.port, this.persistPath, this.host);
        return;
      } catch (err) {
        if (!this.isAddressInUseError(err)) {
          throw err;
        }

        const attached = await this.tryAttachToExistingRelay(candidate.port);
        if (attached) {
          await persistPort(this.port, this.persistPath, this.host);
          return;
        }

        if (candidate.wasFixed) {
          throw new Error(
            `Port ${candidate.port} is already in use by a non-WebMCP service and cannot be shared.`
          );
        }

        process.stderr.write(
          `[webmcp-local-relay] info: port ${candidate.port} is occupied by a non-relay service, trying next port\n`
        );
      }
    }

    throw new Error(
      `No compatible relay port was available in the range ${this.preferredPort}-${this.portRangeEnd}.`
    );
  }

  private isAddressInUseError(error: unknown): boolean {
    return (
      error instanceof Error &&
      ('code' in error
        ? (error as NodeJS.ErrnoException).code === 'EADDRINUSE'
        : error.message.includes('EADDRINUSE'))
    );
  }

  private async tryAttachToExistingRelay(port: number): Promise<boolean> {
    try {
      await this.startAsClient(port);
      process.stderr.write(
        `[webmcp-local-relay] info: discovered compatible relay on port ${port}, switching to client mode\n`
      );
      return true;
    } catch {
      return false;
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
      this.clientTools = [];
      this.clientSources = [];
      this.clientToolSourceMap = {};

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

    for (const intervalId of this.heartbeatIntervalByConnectionId.values()) {
      clearInterval(intervalId);
    }
    this.heartbeatIntervalByConnectionId.clear();
    this.lastPongByConnectionId.clear();

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

  private async startAsServer(port = this.desiredPort): Promise<void> {
    const wss = await new Promise<WebSocketServer>((resolve, reject) => {
      const server = new WebSocketServer({
        handleProtocols: (protocols) => {
          for (const protocol of protocols) {
            if (SUPPORTED_SUBPROTOCOLS.has(protocol)) {
              return protocol;
            }
          }
          return false;
        },
        host: this.host,
        port,
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

    wss.on('connection', (socket: WebSocket) => {
      const connectionId = randomUUID();
      this.socketByConnectionId.set(connectionId, socket);

      try {
        socket.send(JSON.stringify(this.buildServerHello()));
      } catch (err) {
        process.stderr.write(
          `[webmcp-local-relay] warn: failed to send server hello to connection ${connectionId}: ${err instanceof Error ? err.message : String(err)}\n`
        );
        socket.close(1011, 'Failed to send server hello');
        return;
      }

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

      this.startHeartbeat(connectionId);
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

  private buildServerHello(): ServerHelloMessage {
    return {
      type: 'server-hello',
      service: 'webmcp-local-relay',
      version: 1,
      host: this.host,
      instanceId: this.instanceId,
      label: this.label,
      port: this.desiredPort,
      relayId: this.relayId ?? this.instanceId,
      workspace: this.workspace,
    };
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
    } catch (err) {
      const preview = text.length > 200 ? `${text.slice(0, 200)}...` : text;
      process.stderr.write(
        `[webmcp-local-relay] warn: invalid JSON from connection ${connectionId} (${err instanceof Error ? err.message : 'parse error'}): ${preview}\n`
      );
      return;
    }

    if (exceedsMaxDepth(parsedJson, MAX_JSON_DEPTH)) {
      process.stderr.write(
        `[webmcp-local-relay] warn: rejecting deeply nested JSON (>${MAX_JSON_DEPTH} levels) from connection ${connectionId}\n`
      );
      const msg = parsedJson as Record<string, unknown> | null;
      if (msg && typeof msg === 'object' && 'id' in msg) {
        const socket = this.socketByConnectionId.get(connectionId);
        if (socket) {
          socket.send(
            JSON.stringify({
              jsonrpc: '2.0',
              id: msg.id,
              error: { code: -32600, message: 'Message exceeds maximum nesting depth' },
            })
          );
        }
      }
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
        try {
          if (!this.isHostOriginAllowed(message.origin)) {
            process.stderr.write(
              `[webmcp-local-relay] warn: rejecting source ${connectionId} with disallowed host origin: ${message.origin ?? 'missing'}\n`
            );
            const socket = this.socketByConnectionId.get(connectionId);
            socket?.close(1008, 'Host origin not allowed');
            break;
          }
          this.registry.upsertSource(connectionId, message);
          this.emit('stateChanged');
        } catch (err) {
          process.stderr.write(
            `[webmcp-local-relay] error: failed to process hello from connection ${connectionId}: ${err instanceof Error ? (err.stack ?? err.message) : String(err)}\n`
          );
        }
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
        this.lastPongByConnectionId.set(connectionId, Date.now());
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
        const response = this.buildRelayToolsPayload('relay/tools');
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

    const message = this.buildRelayToolsPayload('relay/tools-changed');
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
    this.stopHeartbeat(connectionId);
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

  private startHeartbeat(connectionId: string): void {
    this.lastPongByConnectionId.set(connectionId, Date.now());

    const intervalId = setInterval(() => {
      const socket = this.socketByConnectionId.get(connectionId);
      if (!socket || socket.readyState !== WebSocket.OPEN) {
        this.stopHeartbeat(connectionId);
        return;
      }

      // Skip heartbeat for relay client connections — they have their own reconnect logic.
      if (this.relayClientConnectionIds.has(connectionId)) {
        return;
      }

      const lastPong = this.lastPongByConnectionId.get(connectionId) ?? 0;
      if (Date.now() - lastPong > HEARTBEAT_DEAD_THRESHOLD_MS) {
        process.stderr.write(
          `[webmcp-local-relay] warn: connection ${connectionId} missed heartbeat, closing\n`
        );
        this.stopHeartbeat(connectionId);
        socket.close(1001, 'Heartbeat timeout');
        return;
      }

      try {
        socket.send(JSON.stringify({ type: 'ping' }));
      } catch (err) {
        process.stderr.write(
          `[webmcp-local-relay] warn: failed to send heartbeat ping to ${connectionId}: ${err instanceof Error ? err.message : String(err)}\n`
        );
      }
    }, HEARTBEAT_INTERVAL_MS);

    this.heartbeatIntervalByConnectionId.set(connectionId, intervalId);
  }

  private stopHeartbeat(connectionId: string): void {
    const intervalId = this.heartbeatIntervalByConnectionId.get(connectionId);
    if (intervalId !== undefined) {
      clearInterval(intervalId);
      this.heartbeatIntervalByConnectionId.delete(connectionId);
    }
    this.lastPongByConnectionId.delete(connectionId);
  }

  private async startAsClient(port = this.desiredPort): Promise<void> {
    this.stopping = false;

    const previousMode = this._mode;
    const previousPort = this.desiredPort;
    this._mode = 'client';
    this.desiredPort = port;

    try {
      const { bufferedMessages, socket } = await this.connectToRelayServer(port);
      this.clientSocket = socket;
      this.clientReconnectDelay = 500;
      this.clientReconnectAttempts = 0;
      this.setupClientHandlers(socket, bufferedMessages);
    } catch (error) {
      this._mode = previousMode;
      this.desiredPort = previousPort;
      throw error;
    }
  }

  private async connectToRelayServer(
    port: number
  ): Promise<{ bufferedMessages: RelayServerToClientMessage[]; socket: WebSocket }> {
    this.stopping = false;

    return new Promise((resolve, reject) => {
      const wsUrl = `ws://${this.host}:${port}`;
      const ws = new WebSocket(wsUrl, [RELAY_INTERNAL_PROTOCOL, RELAY_BROWSER_PROTOCOL]);
      const bufferedMessages: RelayServerToClientMessage[] = [];

      const cleanup = () => {
        clearTimeout(timeoutId);
        ws.off('close', onCloseBeforeReady);
        ws.off('error', onErrorBeforeReady);
        ws.off('message', onMessageBeforeReady);
        ws.off('open', onOpen);
      };

      const rejectWith = (error: Error) => {
        ws.once('error', () => {
          // Ignore late socket errors from ports that failed relay verification.
        });
        cleanup();
        reject(error);
      };

      const finish = () => {
        cleanup();
        resolve({ bufferedMessages, socket: ws });
      };

      const onOpen = () => {
        try {
          this.sendRelayClientHandshake(ws);
        } catch (err) {
          rejectWith(
            new Error(
              `Failed to send handshake to relay server at ${wsUrl}: ${err instanceof Error ? err.message : String(err)}`
            )
          );
        }
      };

      const onErrorBeforeReady = (err: Error) => {
        rejectWith(new Error(`Failed to connect to relay server at ${wsUrl}: ${err.message}`));
      };

      const onCloseBeforeReady = () => {
        rejectWith(new Error(`Connection to ${wsUrl} closed before relay verification completed`));
      };

      const onMessageBeforeReady = (raw: WebSocket.RawData) => {
        const message = this.parseRelayServerMessage(raw);
        if (!message) {
          rejectWith(new Error(`Received a non-relay response while probing ${wsUrl}`));
          return;
        }

        bufferedMessages.push(message);

        if (message.type === 'server-hello') {
          if (message.service !== 'webmcp-local-relay') {
            rejectWith(new Error(`Unexpected relay service "${message.service}" at ${wsUrl}`));
            return;
          }
          finish();
          return;
        }

        if (message.type === 'relay/tools' || message.type === 'relay/tools-changed') {
          finish();
        }
      };

      const timeoutId = setTimeout(() => {
        rejectWith(new Error(`Timed out waiting for relay hello from ${wsUrl}`));
      }, RELAY_SERVER_MESSAGE_TIMEOUT_MS);

      ws.once('open', onOpen);
      ws.once('error', onErrorBeforeReady);
      ws.once('close', onCloseBeforeReady);
      ws.on('message', onMessageBeforeReady);
    });
  }

  private setupClientHandlers(
    ws: WebSocket,
    bufferedMessages: RelayServerToClientMessage[] = []
  ): void {
    for (const message of bufferedMessages) {
      this.processRelayServerMessage(message);
    }

    ws.on('message', (raw: WebSocket.RawData) => {
      const message = this.parseRelayServerMessage(raw);
      if (!message) {
        return;
      }

      this.processRelayServerMessage(message);
    });

    ws.on('close', () => {
      this.clientSocket = null;
      for (const [callId, pending] of this.clientPendingInvocations) {
        clearTimeout(pending.timeoutId);
        this.clientPendingInvocations.delete(callId);
        pending.reject(new Error('Relay server connection lost during invocation'));
      }

      this.clientTools = [];
      this.clientSources = [];
      this.clientToolSourceMap = {};
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

  private sendRelayClientHandshake(ws: WebSocket): void {
    ws.send(JSON.stringify({ type: 'relay/hello' }));
    ws.send(JSON.stringify({ type: 'relay/list-tools' }));
  }

  private parseRelayServerMessage(raw: WebSocket.RawData): RelayServerToClientMessage | null {
    const text = this.rawDataToUtf8(raw);
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch (err) {
      const preview = text.length > 200 ? `${text.slice(0, 200)}...` : text;
      process.stderr.write(
        `[webmcp-local-relay] warn: invalid JSON from relay server (${err instanceof Error ? err.message : 'parse error'}): ${preview}\n`
      );
      return null;
    }

    const message = RelayServerToClientMessageSchema.safeParse(parsed);
    if (!message.success) {
      const typeField =
        typeof parsed === 'object' && parsed !== null
          ? (parsed as Record<string, unknown>).type
          : 'unknown';
      process.stderr.write(
        `[webmcp-local-relay] warn: invalid relay server message (type=${typeField}): ${message.error.message}\n`
      );
      return null;
    }

    return message.data;
  }

  private processRelayServerMessage(message: RelayServerToClientMessage): void {
    switch (message.type) {
      case 'server-hello':
        break;

      case 'relay/tools':
      case 'relay/tools-changed':
        this.clientTools = message.tools;
        this.clientSources = message.sources;
        this.clientToolSourceMap = message.toolSourceMap;
        this.emit('stateChanged');
        break;

      case 'relay/result': {
        const pending = this.clientPendingInvocations.get(message.callId);
        if (!pending) {
          process.stderr.write(
            `[webmcp-local-relay] warn: received relay result for unknown callId ${message.callId}\n`
          );
          break;
        }
        clearTimeout(pending.timeoutId);
        this.clientPendingInvocations.delete(message.callId);
        pending.resolve(message.result);
        break;
      }
    }
  }

  private scheduleReconnect(): void {
    if (this.clientReconnectTimer || this.stopping) {
      return;
    }

    this.clientReconnectAttempts++;
    if (this.clientReconnectAttempts >= this.clientMaxReconnectAttempts) {
      process.stderr.write(
        `[webmcp-local-relay] error: giving up reconnection after ${this.clientReconnectAttempts} attempts\n`
      );
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

      void this.reconnectWithModePromotion().catch((err) => {
        process.stderr.write(
          `[webmcp-local-relay] error: unexpected failure during reconnection: ${err instanceof Error ? (err.stack ?? err.message) : String(err)}\n`
        );
        if (!this.stopping) {
          this.scheduleReconnect();
        }
      });
    }, delay);
  }

  /**
   * Attempts to promote from client to server mode when reconnecting.
   * Re-runs the same attach-or-bind strategy used during startup.
   */
  private async reconnectWithModePromotion(): Promise<void> {
    try {
      await this.startUsingPortStrategy();
      this.clientReconnectDelay = 500;
      this.clientReconnectAttempts = 0;
      if (this._mode === 'server') {
        process.stderr.write('[webmcp-local-relay] info: promoted from client to server mode\n');
        this.emit('stateChanged');
      }
    } catch (err) {
      process.stderr.write(
        `[webmcp-local-relay] warn: reconnection failed: ${err instanceof Error ? err.message : String(err)}\n`
      );
      if (!this.stopping) {
        this.scheduleReconnect();
      }
    }
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
   * Builds the complete relay response payload including tools and source metadata.
   */
  private buildRelayToolsPayload(
    type: 'relay/tools' | 'relay/tools-changed'
  ): RelayServerToClientMessage {
    const tools = this.registry.listTools();
    const sources = this.registry.listSources();
    const toolSourceMap: Record<string, string[]> = {};

    for (const tool of tools) {
      toolSourceMap[tool.name] = tool.sources.map((s) => s.sourceId);
    }

    return {
      type,
      tools: this.toWireTools(tools),
      sources,
      toolSourceMap,
    };
  }

  /**
   * Maps aggregated tools to the wire format used by the relay protocol.
   */
  private toWireTools(tools: AggregatedTool[]): RelayTool[] {
    return tools.map(({ originalName: _originalName, sources: _sources, ...tool }) => tool);
  }

  private isHostOriginAllowed(origin: string | undefined): boolean {
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
