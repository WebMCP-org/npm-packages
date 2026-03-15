import { describe, expect, it } from 'vitest';
import { normalizeCode } from '../normalize';

describe('normalizeCode', () => {
  it('returns a default async arrow for empty input', () => {
    expect(normalizeCode('')).toBe('async () => {}');
    expect(normalizeCode('   \n\t  ')).toBe('async () => {}');
  });

  it('passes through arrow functions', () => {
    expect(normalizeCode('async () => { return 1; }')).toBe('async () => { return 1; }');
    expect(normalizeCode('() => 42')).toBe('() => 42');
    expect(normalizeCode('async () => { return 1; };')).toBe('async () => { return 1; };');
  });

  it('unwraps export default before normalizing', () => {
    expect(normalizeCode('export default async () => { return 1; }')).toBe(
      'async () => { return 1; }'
    );
    expect(normalizeCode('export default 42')).toBe('async () => {\nreturn (42)\n}');
  });

  it('wraps and calls named function declarations', () => {
    expect(normalizeCode('async function run() { return 42; }')).toBe(
      'async () => {\nasync function run() { return 42; }\nreturn run();\n}'
    );
  });

  it('returns simple expressions', () => {
    expect(normalizeCode('1 + 2')).toBe('async () => {\nreturn (1 + 2)\n}');
    expect(normalizeCode('console.log("hello")')).toBe(
      'async () => {\nreturn (console.log("hello"))\n}'
    );
    expect(normalizeCode("await fetch('http://example.com')")).toBe(
      "async () => {\nreturn (await fetch('http://example.com'))\n}"
    );
  });

  it('falls back to plain wrapping for statements and invalid code', () => {
    expect(normalizeCode('const x = 42')).toBe('async () => {\nconst x = 42\n}');
    expect(normalizeCode('const x = 10;\nx * 2')).toBe('async () => {\nconst x = 10;\nx * 2\n}');
    expect(normalizeCode('const = oops {{{')).toBe('async () => {\nconst = oops {{{\n}');
  });

  it('strips markdown code fences', () => {
    expect(normalizeCode('```js\nasync () => { return 1; }\n```')).toBe(
      'async () => { return 1; }'
    );
    expect(normalizeCode('```typescript\n() => 42\n```')).toBe('() => 42');
  });
});
