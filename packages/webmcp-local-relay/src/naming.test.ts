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
  it('produces a deterministic namespaced tool name', () => {
    const result = buildPublicToolName({
      domain: 'example_com',
      tabId: 'tab_1',
      originalToolName: 'get_users',
    });
    expect(result).toBe('webmcp_example_com_tabtab_1_get_users');
  });

  it('sanitizes all components', () => {
    const result = buildPublicToolName({
      domain: 'my-domain.com',
      tabId: 'tab-abc',
      originalToolName: 'get-user.profile',
    });
    expect(result).toBe('webmcp_my_domain_com_tabtab_abc_get_user_profile');
  });

  it('stays within 128 character limit for normal-length names', () => {
    const result = buildPublicToolName({
      domain: 'example_com',
      tabId: 'tab123',
      originalToolName: 'search',
    });
    expect(result.length).toBeLessThanOrEqual(128);
    expect(result).toMatch(/^webmcp_/);
  });

  it('truncates with hash suffix when name exceeds 128 characters', () => {
    const result = buildPublicToolName({
      domain: 'a'.repeat(60),
      tabId: 'b'.repeat(30),
      originalToolName: 'c'.repeat(40),
    });
    expect(result.length).toBeLessThanOrEqual(128);
    expect(result).toMatch(/^webmcp_/);
    // Hash suffix is _<10 hex chars>
    expect(result).toMatch(/_[a-f0-9]{10}$/);
  });

  it('produces deterministic output for the same input', () => {
    const opts = {
      domain: 'a'.repeat(60),
      tabId: 'b'.repeat(30),
      originalToolName: 'c'.repeat(40),
    };
    expect(buildPublicToolName(opts)).toBe(buildPublicToolName(opts));
  });
});
