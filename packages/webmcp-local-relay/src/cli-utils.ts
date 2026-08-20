import { parseArgs } from 'node:util';

import { DEFAULT_RELAY_PORT } from './portStrategy.js';

/**
 * Parsed CLI options for relay startup.
 */
export interface CliOptions {
  help: boolean;
  host: string;
  port: number;
  portExplicitlySet: boolean;
  allowedOrigins: string[];
  label?: string;
  workspace?: string;
  relayId?: string;
  maxPayloadBytes?: number;
  invokeTimeoutMs?: number;
}

function parsePositiveInteger(name: string, value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`Invalid ${name} "${value}". Must be a positive integer.`);
  }
  return parsed;
}

/**
 * Parses supported CLI flags for relay startup.
 */
export function parseCliOptions(argv: string[]): CliOptions {
  const { values } = parseArgs({
    args: argv,
    options: {
      help: { type: 'boolean', short: 'h' },
      host: { type: 'string', short: 'H' },
      'allowed-origin': { type: 'string' },
      'invoke-timeout': { type: 'string' },
      label: { type: 'string' },
      'max-payload': { type: 'string' },
      port: { type: 'string', short: 'p' },
      'relay-id': { type: 'string' },
      'widget-origin': { type: 'string' },
      workspace: { type: 'string' },
      'ws-origin': { type: 'string' },
    },
    strict: true,
  });

  const port = values.port === undefined ? DEFAULT_RELAY_PORT : Number(values.port);
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new Error(`Invalid port "${values.port}". Port must be an integer between 1 and 65535.`);
  }

  const invokeTimeoutMs = parsePositiveInteger('invoke-timeout', values['invoke-timeout']);
  const maxPayloadBytes = parsePositiveInteger('max-payload', values['max-payload']);

  const allowedOrigins = (
    values['widget-origin'] ??
    values['allowed-origin'] ??
    values['ws-origin']
  )
    ?.split(',')
    .map((origin) => origin.trim())
    .filter(Boolean) ?? ['*'];
  if (allowedOrigins.length === 0) {
    throw new Error('--widget-origin must include at least one origin.');
  }

  return {
    allowedOrigins,
    help: values.help ?? false,
    host: values.host ?? '127.0.0.1',
    port,
    portExplicitlySet: values.port !== undefined,
    ...(values.label === undefined ? {} : { label: values.label }),
    ...(invokeTimeoutMs === undefined ? {} : { invokeTimeoutMs }),
    ...(maxPayloadBytes === undefined ? {} : { maxPayloadBytes }),
    ...(values['relay-id'] === undefined ? {} : { relayId: values['relay-id'] }),
    ...(values.workspace === undefined ? {} : { workspace: values.workspace }),
  };
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
      '  webmcp-local-relay [--host 127.0.0.1] [--port 9333] [--widget-origin https://myapp.example.com]',
      '',
      'Options:',
      '  --host, -H               Bind host for local websocket relay (default: 127.0.0.1)',
      '  --port, -p               Preferred root port for the local relay cluster (default: 9333)',
      '  --widget-origin          Allowed host page origin(s), comma-separated (default: *)',
      '  --allowed-origin         Deprecated alias for --widget-origin',
      '  --ws-origin              Deprecated alias for --widget-origin',
      '  --label                  Human-readable relay label reported during discovery',
      '  --workspace              Optional workspace name reported during discovery',
      '  --relay-id               Stable relay identifier reported during discovery',
      '  --invoke-timeout         Browser tool invocation timeout in milliseconds (default: 65000)',
      '  --max-payload            Maximum WebSocket payload size in bytes (default: 10000000)',
      '  --help, -h               Show help',
      '',
    ].join('\n')
  );
}
