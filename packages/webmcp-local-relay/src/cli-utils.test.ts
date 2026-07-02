import { describe, expect, it, vi } from 'vitest';
import { parseCliOptions } from './cli-utils.js';

describe('parseCliOptions', () => {
  it('returns defaults when no flags are provided', () => {
    const options = parseCliOptions([]);
    expect(options.host).toBe('127.0.0.1');
    expect(options.port).toBe(9333);
    expect(options.portExplicitlySet).toBe(false);
    expect(options.allowedOrigins).toEqual(['*']);
  });

  it('parses --host flag', () => {
    const options = parseCliOptions(['--host', '0.0.0.0']);
    expect(options.host).toBe('0.0.0.0');
  });

  it('parses -H shorthand', () => {
    const options = parseCliOptions(['-H', '0.0.0.0']);
    expect(options.host).toBe('0.0.0.0');
  });

  it('parses --port flag', () => {
    const options = parseCliOptions(['--port', '8080']);
    expect(options.port).toBe(8080);
    expect(options.portExplicitlySet).toBe(true);
  });

  it('parses -p shorthand', () => {
    const options = parseCliOptions(['-p', '4000']);
    expect(options.port).toBe(4000);
    expect(options.portExplicitlySet).toBe(true);
  });

  it('throws for invalid port', () => {
    expect(() => parseCliOptions(['--port', 'abc'])).toThrow('Invalid port "abc"');
  });

  it('throws for out-of-range port', () => {
    expect(() => parseCliOptions(['--port', '99999'])).toThrow('Invalid port "99999"');
  });

  it('throws for zero port', () => {
    expect(() => parseCliOptions(['--port', '0'])).toThrow('Invalid port "0"');
  });

  it('throws when negative port value looks like a flag', () => {
    expect(() => parseCliOptions(['--port', '-1'])).toThrow('Missing value for --port');
  });

  it('parses --widget-origin flag', () => {
    const options = parseCliOptions(['--widget-origin', 'https://example.com']);
    expect(options.allowedOrigins).toEqual(['https://example.com']);
  });

  it('parses --allowed-origin alias', () => {
    const options = parseCliOptions(['--allowed-origin', 'https://example.com']);
    expect(options.allowedOrigins).toEqual(['https://example.com']);
  });

  it('parses --ws-origin alias', () => {
    const options = parseCliOptions(['--ws-origin', 'https://example.com']);
    expect(options.allowedOrigins).toEqual(['https://example.com']);
  });

  it('parses comma-separated origins', () => {
    const options = parseCliOptions([
      '--widget-origin',
      'https://a.example.com, https://b.example.com',
    ]);
    expect(options.allowedOrigins).toEqual(['https://a.example.com', 'https://b.example.com']);
  });

  it('ignores empty segments in comma-separated origins', () => {
    const options = parseCliOptions(['--widget-origin', 'https://a.example.com,,']);
    expect(options.allowedOrigins).toEqual(['https://a.example.com']);
  });

  it('parses relay identity flags', () => {
    const options = parseCliOptions([
      '--label',
      'Desktop Relay',
      '--workspace',
      'default',
      '--relay-id',
      'desktop-main',
    ]);

    expect(options.label).toBe('Desktop Relay');
    expect(options.workspace).toBe('default');
    expect(options.relayId).toBe('desktop-main');
  });

  it('throws when --host is missing a value', () => {
    expect(() => parseCliOptions(['--host'])).toThrow('Missing value for --host');
  });

  it('throws when --port is missing a value', () => {
    expect(() => parseCliOptions(['--port'])).toThrow('Missing value for --port');
  });

  it('throws when --widget-origin is missing a value', () => {
    expect(() => parseCliOptions(['--widget-origin'])).toThrow('Missing value for --widget-origin');
  });

  it('throws when flag value starts with a dash', () => {
    expect(() => parseCliOptions(['--host', '--port'])).toThrow('Missing value for --host');
  });

  it('warns on unrecognized flags', () => {
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const options = parseCliOptions(['--unknown-flag']);
    expect(options.host).toBe('127.0.0.1');
    expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining('unrecognized argument'));
    stderrSpy.mockRestore();
  });

  it('parses all flags together', () => {
    const options = parseCliOptions([
      '--host',
      '0.0.0.0',
      '--port',
      '5555',
      '--widget-origin',
      'https://trusted.example.com',
    ]);
    expect(options.host).toBe('0.0.0.0');
    expect(options.port).toBe(5555);
    expect(options.portExplicitlySet).toBe(true);
    expect(options.allowedOrigins).toEqual(['https://trusted.example.com']);
  });

  it('skips undefined tokens in argv', () => {
    const argv = ['--host', '0.0.0.0'];
    argv.length = 5;
    const options = parseCliOptions(argv);
    expect(options.host).toBe('0.0.0.0');
  });

  it('parses --max-payload flag', () => {
    const options = parseCliOptions(['--max-payload', '20000000']);
    expect(options.maxPayloadBytes).toBe(20000000);
  });

  it('throws for non-numeric --max-payload', () => {
    expect(() => parseCliOptions(['--max-payload', 'abc'])).toThrow('Invalid max-payload "abc"');
  });

  it('throws for decimal --max-payload', () => {
    expect(() => parseCliOptions(['--max-payload', '1.5'])).toThrow('Invalid max-payload "1.5"');
  });

  it('throws for suffixed --max-payload', () => {
    expect(() => parseCliOptions(['--max-payload', '10mb'])).toThrow('Invalid max-payload "10mb"');
  });

  it('throws for zero --max-payload', () => {
    expect(() => parseCliOptions(['--max-payload', '0'])).toThrow('Invalid max-payload "0"');
  });

  it('throws for negative --max-payload', () => {
    expect(() => parseCliOptions(['--max-payload', '-5'])).toThrow(
      'Missing value for --max-payload'
    );
  });

  it('returns undefined maxPayloadBytes when --max-payload is not provided', () => {
    const options = parseCliOptions([]);
    expect(options.maxPayloadBytes).toBeUndefined();
  });
});
