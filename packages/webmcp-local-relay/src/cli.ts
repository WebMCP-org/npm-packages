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
    '[webmcp-local-relay] WARNING: accepting connections from ALL origins. Use --widget-origin to restrict.\n'
  );
}

const relay = new LocalRelayMcpServer({
  bridgeOptions: {
    host: options.host,
    port: options.port,
    allowedOrigins: options.allowedOrigins,
  },
});

try {
  await relay.start();
} catch (err) {
  const message = err instanceof Error ? err.message : String(err);
  if (message.includes('EADDRINUSE')) {
    process.stderr.write(
      `[webmcp-local-relay] error: port ${options.port} is already in use. Use --port to specify a different port.\n`
    );
  } else if (message.includes('EACCES')) {
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

process.stderr.write(
  `[webmcp-local-relay] listening on ws://${options.host}:${relay.bridge.port} (allowed origins: ${options.allowedOrigins.join(', ')})\n`
);

/**
 * Gracefully shuts down bridge and MCP server for process termination signals.
 */
const shutdown = async (signal: string) => {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;
  process.stderr.write(`[webmcp-local-relay] received ${signal}, shutting down\n`);
  try {
    await relay.stop();
  } catch (err) {
    process.stderr.write(
      `[webmcp-local-relay] error during shutdown: ${err instanceof Error ? err.message : err}\n`
    );
  }
  process.exit(0);
};

let shuttingDown = false;

process.on('SIGINT', () => {
  void shutdown('SIGINT');
});
process.on('SIGTERM', () => {
  void shutdown('SIGTERM');
});
