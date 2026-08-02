import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseCliOptions } from './cli-utils.js';

const manifest = JSON.parse(readFileSync(new URL('../manifest.json', import.meta.url), 'utf8')) as {
  server: { mcp_config: { args: string[] } };
  user_config?: unknown;
};

describe('MCPB manifest', () => {
  it('preserves single-click zero-configuration startup', () => {
    expect(manifest.server.mcp_config.args).toEqual(['${__dirname}/server/cli.mjs']);
    expect(manifest).not.toHaveProperty('user_config');
  });
});

describe('parseCliOptions', () => {
  it('returns development defaults', () => {
    expect(parseCliOptions([])).toEqual({
      allowedOrigins: ['*'],
      help: false,
      host: '127.0.0.1',
      port: 9333,
      portExplicitlySet: false,
    });
  });

  it.each([
    [['--host', '0.0.0.0'], { host: '0.0.0.0' }],
    [['-H', '::1'], { host: '::1' }],
    [['--port', '8080'], { port: 8080, portExplicitlySet: true }],
    [['-p', '4000'], { port: 4000, portExplicitlySet: true }],
    [['--help'], { help: true }],
    [['-h'], { help: true }],
  ])('parses %j', (argv, expected) => {
    expect(parseCliOptions(argv)).toMatchObject(expected);
  });

  it('parses origins and relay identity', () => {
    expect(
      parseCliOptions([
        '--widget-origin',
        'https://a.example.com, https://b.example.com,,',
        '--label',
        'Desktop Relay',
        '--workspace',
        'default',
        '--relay-id',
        'desktop-main',
        '--invoke-timeout',
        '125000',
        '--max-payload',
        '20000000',
      ])
    ).toMatchObject({
      allowedOrigins: ['https://a.example.com', 'https://b.example.com'],
      invokeTimeoutMs: 125_000,
      label: 'Desktop Relay',
      maxPayloadBytes: 20_000_000,
      relayId: 'desktop-main',
      workspace: 'default',
    });
  });

  it.each(['--allowed-origin', '--ws-origin'])('accepts the legacy %s alias', (flag) => {
    expect(parseCliOptions([flag, 'https://legacy.example.com']).allowedOrigins).toEqual([
      'https://legacy.example.com',
    ]);
  });

  it.each(['abc', '99999', '0', '-1', '1.5', '123junk'])('rejects invalid port %s', (value) => {
    expect(() => parseCliOptions(['--port', value])).toThrow();
  });

  it.each(['abc', '0', '-5', '1.5', '10mb'])('rejects invalid size or timeout %s', (value) => {
    for (const flag of ['--invoke-timeout', '--max-payload']) {
      expect(() => parseCliOptions([flag, value])).toThrow();
    }
  });

  it.each([
    [['--host'], /argument missing/i],
    [['--widget-origin', ',,'], /at least one origin/i],
    [['--unknown-flag'], /unknown option/i],
    [['positional'], /unexpected argument/i],
  ])('rejects malformed argv %j', (argv, error) => {
    expect(() => parseCliOptions(argv)).toThrow(error);
  });
});
