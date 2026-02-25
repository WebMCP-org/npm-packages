/**
 * Parsed CLI options for relay startup.
 */
export interface CliOptions {
  host: string;
  port: number;
  allowedOrigins: string[];
}

/**
 * Parses supported CLI flags for relay startup.
 */
export function parseCliOptions(argv: string[]): CliOptions {
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
    if (!token) {
      continue;
    }

    if (token === '--host' || token === '-H') {
      options.host = readFlagValue(token, i);
      i += 1;
      continue;
    }

    if (token === '--port' || token === '-p') {
      const raw = readFlagValue(token, i);
      i += 1;
      const value = Number.parseInt(raw, 10);
      if (!Number.isFinite(value) || value <= 0 || value > 65535) {
        throw new Error(`Invalid port "${raw}". Port must be a number between 1 and 65535.`);
      }
      options.port = value;
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

/**
 * Prints CLI usage to stderr.
 */
export function printHelp(): void {
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
