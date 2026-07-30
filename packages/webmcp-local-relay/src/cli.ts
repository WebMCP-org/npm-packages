#!/usr/bin/env node

import { parseCliOptions } from './cli-utils.js';
import { LocalRelayMcpServer } from './mcpRelayServer.js';

let options: ReturnType<typeof parseCliOptions>;
try {
  options = parseCliOptions(process.argv.slice(2));
} catch (err) {
  process.stderr.write(
    `[webmcp-local-relay] error: ${err instanceof Error ? err.message : String(err)}\n`
  );
  process.exit(1);
}

if (options.allowedOrigins.includes('*')) {
  process.stderr.write(
    '[webmcp-local-relay] WARNING: accepting connections from ALL host page origins. Use --widget-origin to restrict.\n'
  );
}

const bridgeOptions = {
  host: options.host,
  port: options.port,
  portExplicitlySet: options.portExplicitlySet,
  allowedOrigins: options.allowedOrigins,
  ...(options.label ? { label: options.label } : {}),
  ...(options.relayId ? { relayId: options.relayId } : {}),
  ...(options.workspace ? { workspace: options.workspace } : {}),
  ...(options.maxPayloadBytes ? { maxPayloadBytes: options.maxPayloadBytes } : {}),
};

const relay = new LocalRelayMcpServer({
  bridgeOptions,
});

try {
  await relay.start();
} catch (err) {
  const message = err instanceof Error ? err.message : String(err);
  if (message.includes('EACCES')) {
    process.stderr.write(
      `[webmcp-local-relay] error: insufficient permissions to bind to ${options.host}:${options.port}.\n`
    );
  } else {
    process.stderr.write(`[webmcp-local-relay] error: failed to start bridge server: ${message}\n`);
  }
  process.exit(1);
}

try {
  await relay.startStdio();
} catch (err) {
  const message = err instanceof Error ? err.message : String(err);
  process.stderr.write(`[webmcp-local-relay] error: failed to start stdio transport: ${message}\n`);
  process.exit(1);
}

// --- Auto-exit when the MCP client disconnects, preventing zombie processes ---

let parentCheckInterval: NodeJS.Timeout | undefined;
let shuttingDown = false;

/**
 * Gracefully shuts down bridge and MCP server for process termination signals.
 * Force-exits after 5 seconds if graceful shutdown does not complete, preventing hangs.
 */
const shutdown = async (signal: string) => {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;
  if (parentCheckInterval) {
    clearInterval(parentCheckInterval);
    parentCheckInterval = undefined;
  }

  // Safety net: force-exit if graceful shutdown hangs (e.g. SDK writing to a broken stdio pipe)
  const forceExitTimer = setTimeout(() => {
    process.stderr.write('[webmcp-local-relay] warn: graceful shutdown timed out, force exiting\n');
    process.exit(1);
  }, 5_000);

  process.stderr.write(`[webmcp-local-relay] received ${signal}, shutting down\n`);

  try {
    await relay.stop();
  } catch (err) {
    process.stderr.write(
      `[webmcp-local-relay] error during shutdown: ${err instanceof Error ? err.message : String(err)}\n`
    );
    clearTimeout(forceExitTimer);
    process.exit(1);
  }
  clearTimeout(forceExitTimer);
  process.exit(0);
};

process.stdin.on('end', () => {
  void shutdown('stdin-closed');
});
process.stdin.on('error', () => {
  void shutdown('stdin-error');
});
process.stdout.on('error', () => {
  void shutdown('stdout-error');
});

if (process.platform !== 'win32') {
  parentCheckInterval = setInterval(() => {
    if (process.ppid === 1) {
      clearInterval(parentCheckInterval);
      parentCheckInterval = undefined;
      void shutdown('parent-exited');
    }
  }, 30_000);
  parentCheckInterval.unref();
}

if (relay.bridge.mode === 'server') {
  process.stderr.write(
    `[webmcp-local-relay] server mode: listening on ws://${options.host}:${relay.bridge.port} (allowed origins: ${options.allowedOrigins.join(', ')})\n`
  );
} else {
  process.stderr.write(
    `[webmcp-local-relay] client mode: proxying through existing relay at ws://${options.host}:${relay.bridge.port}\n`
  );
}

process.on('uncaughtException', (err) => {
  process.stderr.write(
    `[webmcp-local-relay] error: uncaught exception: ${err.stack ?? err.message}\n`
  );
  void shutdown('uncaughtException');
});
process.on('unhandledRejection', (reason) => {
  const message = reason instanceof Error ? (reason.stack ?? reason.message) : String(reason);
  process.stderr.write(`[webmcp-local-relay] error: unhandled rejection: ${message}\n`);
  void shutdown('unhandledRejection');
});

process.on('SIGINT', () => {
  void shutdown('SIGINT');
});
process.on('SIGTERM', () => {
  void shutdown('SIGTERM');
});
