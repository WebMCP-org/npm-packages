import { randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';
import type { IncomingMessage } from 'node:http';

import { type CallToolResult, CallToolResultSchema } from '@modelcontextprotocol/sdk/types.js';
import WebSocket, { WebSocketServer } from 'ws';
import { HelloRequiredError, RelayRegistry } from './registry.js';
import { BrowserToRelayMessageSchema, type RelayToBrowserMessage } from './schemas.js';

interface PendingInvocation {
  callId: string;
  connectionId: string;
  timeoutId: ReturnType<typeof setTimeout>;
  resolve: (result: CallToolResult) => void;
  reject: (error: Error) => void;
}

export interface RelayBridgeServerOptions {
  host?: string;
  port?: number;
  allowedOrigins?: string[];
  maxPayloadBytes?: number;
  invokeTimeoutMs?: number;
}

export class RelayBridgeServer extends EventEmitter {
  readonly registry: RelayRegistry;

  private readonly host: string;
  private desiredPort: number;
  private readonly allowedOrigins: string[];
  private readonly maxPayloadBytes: number;
  private readonly invokeTimeoutMs: number;

  private wss: WebSocketServer | null = null;
  private readonly socketByConnectionId = new Map<string, WebSocket>();
  private readonly connectionIdBySocket = new WeakMap<WebSocket, string>();
  private readonly pendingInvocations = new Map<string, PendingInvocation>();

  constructor(options: RelayBridgeServerOptions = {}, registry?: RelayRegistry) {
    super();
    this.registry = registry ?? new RelayRegistry();

    this.host = options.host ?? '127.0.0.1';
    this.desiredPort = options.port ?? 9333;
    this.allowedOrigins = options.allowedOrigins ?? ['*'];
    this.maxPayloadBytes = options.maxPayloadBytes ?? 1_000_000;
    this.invokeTimeoutMs = options.invokeTimeoutMs ?? 25_000;
  }

  get port(): number {
    return this.desiredPort;
  }

  async start(): Promise<void> {
    if (this.wss) {
      return;
    }

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
      this.connectionIdBySocket.set(socket, connectionId);

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

    const address = wss.address();
    if (address && typeof address !== 'string') {
      this.desiredPort = address.port;
    }
  }

  async stop(): Promise<void> {
    for (const socket of this.socketByConnectionId.values()) {
      try {
        socket.close(1001, 'Relay shutting down');
      } catch {
        // ignore close errors during shutdown
      }
    }

    this.socketByConnectionId.clear();

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
      wss.close(() => resolve());
    });
  }

  async invokeTool(
    toolName: string,
    args: Record<string, unknown>,
    options: {
      sourceId?: string;
      requestTabId?: string;
    } = {}
  ): Promise<CallToolResult> {
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

    const result = await new Promise<CallToolResult>((resolve, reject) => {
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

    return result;
  }

  private onSocketMessage(connectionId: string, raw: WebSocket.RawData): void {
    this.registry.touchConnection(connectionId);

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

    const parsedMessage = BrowserToRelayMessageSchema.safeParse(parsedJson);
    if (!parsedMessage.success) {
      const typeField =
        typeof parsedJson === 'object' && parsedJson !== null
          ? (parsedJson as Record<string, unknown>).type
          : undefined;
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

  private onSocketClose(connectionId: string): void {
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

  private isOriginAllowed(origin: string | undefined): boolean {
    if (this.allowedOrigins.includes('*')) {
      return true;
    }

    if (!origin) {
      return false;
    }

    return this.allowedOrigins.includes(origin);
  }

  private normalizeCallToolResult(result: unknown): CallToolResult {
    const parsed = CallToolResultSchema.safeParse(result);
    if (parsed.success) {
      return parsed.data;
    }

    const preview = JSON.stringify(result)?.slice(0, 500) ?? 'undefined';
    process.stderr.write(
      `[webmcp-local-relay] warn: tool returned invalid CallToolResult, wrapping as error: ${preview}\n`
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
