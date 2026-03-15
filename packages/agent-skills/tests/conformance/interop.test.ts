/**
 * Interop tests — non-strict producer content
 *
 * Verifies that real-world SKILL.md variations (e.g., extra fields from
 * other producers) are parseable but rejected by validation.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vite-plus/test';
import { parseFrontmatter } from '../../src/parser';
import { validateSkillContent } from '../../src/validator';

const fixture = (name: string): string =>
  readFileSync(resolve(__dirname, 'fixtures', name), 'utf-8');

describe('Interop conformance', () => {
  it('extra version field: parser succeeds (ignores unknown fields)', () => {
    const content = fixture('interop-extra-version-field.md');
    const { metadata } = parseFrontmatter(content);
    expect(metadata.name).toBe('my-skill');
    expect(metadata.description).toBe(
      'A real-world producer variation with a non-spec version field'
    );
  });

  it('extra version field: validator rejects (unknown fields flagged)', () => {
    const content = fixture('interop-extra-version-field.md');
    const errors = validateSkillContent(content);
    expect(errors.some((e) => e.includes('Unexpected fields'))).toBe(true);
    expect(errors.some((e) => e.includes('version'))).toBe(true);
  });
});
