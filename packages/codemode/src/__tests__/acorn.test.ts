import { describe, expect, it } from 'vitest';
import { normalizeCodeWithAcorn } from '../acorn';

describe('normalizeCodeWithAcorn', () => {
  it('returns the last expression from a multi-statement program', () => {
    const result = normalizeCodeWithAcorn('const x = 10;\nx * 2');
    expect(result).toContain('const x = 10;');
    expect(result).toContain('return (x * 2)');
  });

  it('supports export default anonymous functions', () => {
    const result = normalizeCodeWithAcorn('export default function() { return 42; }');
    expect(result).toBe('async () => {\nreturn (function() { return 42; })();\n}');
  });

  it('supports await expressions as return values', () => {
    const result = normalizeCodeWithAcorn("await fetch('http://example.com')");
    expect(result).toContain("return (await fetch('http://example.com'))");
  });
});
