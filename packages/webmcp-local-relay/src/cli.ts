#!/usr/bin/env node

import { LocalRelayMcpServer } from './mcpRelayServer.js';

interface CliOptions {
  host: string;
  port: number;
  allowedOrigins: string[];
}

function parseCliOptions(argv: string[]): CliOptions {
  const options: CliOptions = {
    host: '127.0.0.1',
    port: 9333,
    allowedOrigins: ['*'],
  };

  const readFlagValue = (flag: string, index: number): string => {
    const next = argv[index + 1];
    if (!next || next.startsWith('-')) {
      throw new Error(`Missing value for ${flag}`);
    }
    return next;
  };

  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (!token) continue;

    if (token === '--host' || token === '-H') {
      options.host = readFlagValue(token, i);
      i += 1;
      continue;
    }

    if (token === '--port' || token === '-p') {
      const raw = readFlagValue(token, i);
      i += 1;
      const value = Number.parseInt(raw, 10);
      if (Number.isFinite(value) && value > 0 && value <= 65535) {
        options.port = value;
      } else {
        process.stderr.write(
          `[webmcp-local-relay] warn: invalid port "${raw}", using default ${options.port}\n`
        );
      }
      continue;
    }

    if (token === '--widget-origin' || token === '--allowed-origin') {
      const raw = readFlagValue(token, i);
      i += 1;
      const split = raw
        .split(',')
        .map((part) => part.trim())
        .filter(Boolean);

      if (split.length > 0) {
        options.allowedOrigins = split;
      }
      continue;
    }

    if (token === '--help' || token === '-h') {
      printHelp();
      process.exit(0);
    }

    if (token.startsWith('-')) {
      process.stderr.write(`[webmcp-local-relay] warn: unrecognized argument "${token}"\n`);
    }
  }

  return options;
}

function printHelp(): void {
  process.stderr.write(
    [
      'webmcp-local-relay',
      '',
      'Usage:',
      '  webmcp-local-relay [--host 127.0.0.1] [--port 9333] [--widget-origin https://yourdomain.com]',
      '',
      'Options:',
      '  --host, -H               Bind host for local websocket relay (default: 127.0.0.1)',
      '  --port, -p               Bind port for local websocket relay (default: 9333)',
      '  --widget-origin          Allowed browser origin(s), comma-separated (default: *)',
      '  --allowed-origin         Alias for --widget-origin',
      '  --help, -h               Show help',
      '',
    ].join('\n')
  );
}

let options: CliOptions;
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
