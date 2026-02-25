import { describe, expect, it, vi } from 'vitest';
import { parseCliOptions } from './cli-utils.js';

describe('parseCliOptions', () => {
  it('returns defaults when no flags are provided', () => {
    const options = parseCliOptions([]);
    expect(options.host).toBe('127.0.0.1');
    expect(options.port).toBe(9333);
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
  });

  it('parses -p shorthand', () => {
    const options = parseCliOptions(['-p', '4000']);
    expect(options.port).toBe(4000);
  });

  it('warns and keeps default for invalid port', () => {
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const options = parseCliOptions(['--port', 'abc']);
    expect(options.port).toBe(9333);
    expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining('invalid port'));
    stderrSpy.mockRestore();
  });

  it('warns and keeps default for out-of-range port', () => {
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const options = parseCliOptions(['--port', '99999']);
    expect(options.port).toBe(9333);
    expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining('invalid port'));
    stderrSpy.mockRestore();
  });

  it('warns and keeps default for zero port', () => {
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const options = parseCliOptions(['--port', '0']);
    expect(options.port).toBe(9333);
    stderrSpy.mockRestore();
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
    expect(options.allowedOrigins).toEqual(['https://trusted.example.com']);
  });

  it('skips undefined tokens in argv', () => {
    const argv = ['--host', '0.0.0.0'];
    argv.length = 5;
    const options = parseCliOptions(argv);
    expect(options.host).toBe('0.0.0.0');
  });
});
