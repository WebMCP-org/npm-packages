import { describe, expect, it } from 'vitest';
import { buildPublicToolName, extractSanitizedDomain, sanitizeName } from './naming.js';

describe('sanitizeName', () => {
  it('replaces non-alphanumeric characters with underscores', () => {
    expect(sanitizeName('hello-world.test')).toBe('hello_world_test');
  });

  it('preserves alphanumeric characters and underscores', () => {
    expect(sanitizeName('my_tool_123')).toBe('my_tool_123');
  });

  it('returns empty string for empty input', () => {
    expect(sanitizeName('')).toBe('');
  });

  it('handles all-special-character input', () => {
    expect(sanitizeName('---')).toBe('___');
  });

  it('handles unicode characters', () => {
    expect(sanitizeName('café')).toBe('caf_');
  });
});

describe('extractSanitizedDomain', () => {
  it('returns "unknown" for undefined input', () => {
    expect(extractSanitizedDomain(undefined)).toBe('unknown');
  });

  it('returns "unknown" for empty string input', () => {
    expect(extractSanitizedDomain('')).toBe('unknown');
  });

  it('returns "unknown" for non-URL input', () => {
    expect(extractSanitizedDomain('not-a-url')).toBe('unknown');
  });

  it('extracts and sanitizes a regular domain', () => {
    expect(extractSanitizedDomain('https://my-app.example.com')).toBe('my_app_example_com');
  });

  it('handles localhost with port', () => {
    expect(extractSanitizedDomain('http://localhost:3000')).toBe('localhost_3000');
  });

  it('handles 127.0.0.1 with port', () => {
    expect(extractSanitizedDomain('http://127.0.0.1:8080')).toBe('localhost_8080');
  });

  it('handles [::1] with port', () => {
    expect(extractSanitizedDomain('http://[::1]:9333')).toBe('localhost_9333');
  });

  it('defaults localhost without port to 80', () => {
    expect(extractSanitizedDomain('http://localhost')).toBe('localhost_80');
  });

  it('extracts domain from full URL with path', () => {
    expect(extractSanitizedDomain('https://docs.example.com/some/path?q=1')).toBe(
      'docs_example_com'
    );
  });
});

describe('buildPublicToolName', () => {
  it('returns just the sanitized tool name by default', () => {
    const result = buildPublicToolName({ originalToolName: 'get_users' });
    expect(result).toBe('get_users');
  });

  it('sanitizes the tool name', () => {
    const result = buildPublicToolName({ originalToolName: 'get-user.profile' });
    expect(result).toBe('get_user_profile');
  });

  it('returns just the tool name when disambiguate is false', () => {
    const result = buildPublicToolName({
      originalToolName: 'search',
      tabId: 'ed935ee3-2432-497a-9087-4e856ddcbd6a',
      disambiguate: false,
    });
    expect(result).toBe('search');
  });

  it('appends first 4 chars of tabId when disambiguating', () => {
    const result = buildPublicToolName({
      originalToolName: 'search',
      tabId: 'ed935ee3-2432-497a-9087-4e856ddcbd6a',
      disambiguate: true,
    });
    expect(result).toBe('search_ed93');
  });

  it('sanitizes the tabId segment', () => {
    const result = buildPublicToolName({
      originalToolName: 'search',
      tabId: 'ab-cd-ef',
      disambiguate: true,
    });
    expect(result).toBe('search_ab_c');
  });

  it('stays within 128 character limit', () => {
    const result = buildPublicToolName({
      originalToolName: 'a'.repeat(200),
      tabId: 'tab123',
      disambiguate: true,
    });
    expect(result.length).toBeLessThanOrEqual(128);
    expect(result).toMatch(/_tab1$/);
  });

  it('stays within 128 character limit without disambiguation', () => {
    const result = buildPublicToolName({
      originalToolName: 'a'.repeat(200),
    });
    expect(result.length).toBeLessThanOrEqual(128);
  });

  it('produces deterministic output for the same input', () => {
    const opts = {
      originalToolName: 'my_tool',
      tabId: 'some-tab-id',
      disambiguate: true,
    };
    expect(buildPublicToolName(opts)).toBe(buildPublicToolName(opts));
  });
});
