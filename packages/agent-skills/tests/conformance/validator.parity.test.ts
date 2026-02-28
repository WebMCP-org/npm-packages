/**
 * Validator conformance tests — parity with skills-ref (commit fbb6c82)
 *
 * Tests validateSkillProperties, validateSkillContent, validateSkillEntries
 * against fixture files to pin expected behavior.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  validateSkillContent,
  validateSkillEntries,
  validateSkillProperties,
} from '../../src/validator';

const fixture = (name: string): string =>
  readFileSync(resolve(__dirname, 'fixtures', name), 'utf-8');

describe('Validator conformance', () => {
  describe('validateSkillContent — valid fixtures produce no errors', () => {
    it('valid-minimal.md', () => {
      expect(validateSkillContent(fixture('valid-minimal.md'))).toEqual([]);
    });

    it('valid-all-fields.md', () => {
      expect(validateSkillContent(fixture('valid-all-fields.md'))).toEqual([]);
    });

    it('valid-metadata-coercion.md', () => {
      expect(validateSkillContent(fixture('valid-metadata-coercion.md'))).toEqual([]);
    });

    it('valid-i18n-chinese.md', () => {
      expect(validateSkillContent(fixture('valid-i18n-chinese.md'))).toEqual([]);
    });

    it('valid-i18n-russian.md', () => {
      expect(validateSkillContent(fixture('valid-i18n-russian.md'))).toEqual([]);
    });

    it('valid-allowed-tools.md', () => {
      expect(validateSkillContent(fixture('valid-allowed-tools.md'))).toEqual([]);
    });
  });

  describe('validateSkillContent — invalid fixtures produce errors', () => {
    it('invalid-missing-frontmatter.md → parse error', () => {
      const errors = validateSkillContent(fixture('invalid-missing-frontmatter.md'));
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0]).toMatch(/frontmatter/);
    });

    it('invalid-unclosed-frontmatter.md → parse error', () => {
      const errors = validateSkillContent(fixture('invalid-unclosed-frontmatter.md'));
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0]).toMatch(/not properly closed/);
    });

    it('invalid-yaml.md → parse error', () => {
      const errors = validateSkillContent(fixture('invalid-yaml.md'));
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0]).toMatch(/Invalid YAML/);
    });

    it('invalid-non-dict.md → parse error', () => {
      const errors = validateSkillContent(fixture('invalid-non-dict.md'));
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0]).toMatch(/YAML mapping/);
    });

    it('invalid-missing-name.md → validation error', () => {
      const errors = validateSkillContent(fixture('invalid-missing-name.md'));
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0]).toMatch(/Missing required field.*name/);
    });

    it('invalid-missing-description.md → validation error', () => {
      const errors = validateSkillContent(fixture('invalid-missing-description.md'));
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0]).toMatch(/Missing required field.*description/);
    });

    it('invalid-name-uppercase.md → lowercase error', () => {
      const errors = validateSkillContent(fixture('invalid-name-uppercase.md'));
      expect(errors.some((e) => e.includes('lowercase'))).toBe(true);
    });

    it('invalid-name-too-long.md → character limit error', () => {
      const errors = validateSkillContent(fixture('invalid-name-too-long.md'));
      expect(errors.some((e) => e.includes('exceeds') && e.includes('64'))).toBe(true);
    });

    it('invalid-name-leading-hyphen.md → hyphen error', () => {
      const errors = validateSkillContent(fixture('invalid-name-leading-hyphen.md'));
      expect(errors.some((e) => e.includes('cannot start or end with a hyphen'))).toBe(true);
    });

    it('invalid-name-consecutive-hyphens.md → consecutive hyphens error', () => {
      const errors = validateSkillContent(fixture('invalid-name-consecutive-hyphens.md'));
      expect(errors.some((e) => e.includes('consecutive hyphens'))).toBe(true);
    });

    it('invalid-name-underscore.md → invalid characters error', () => {
      const errors = validateSkillContent(fixture('invalid-name-underscore.md'));
      expect(errors.some((e) => e.includes('invalid characters'))).toBe(true);
    });

    it('invalid-description-too-long.md → character limit error', () => {
      const errors = validateSkillContent(fixture('invalid-description-too-long.md'));
      expect(errors.some((e) => e.includes('exceeds') && e.includes('1024'))).toBe(true);
    });

    it('invalid-compatibility-too-long.md → character limit error', () => {
      const errors = validateSkillContent(fixture('invalid-compatibility-too-long.md'));
      expect(errors.some((e) => e.includes('exceeds') && e.includes('500'))).toBe(true);
    });

    it('invalid-unknown-fields.md → unexpected fields error', () => {
      const errors = validateSkillContent(fixture('invalid-unknown-fields.md'));
      expect(errors.some((e) => e.includes('Unexpected fields'))).toBe(true);
    });
  });

  describe('validateSkillProperties — NFKC normalization parity', () => {
    it('accepts decomposed café (NFKC normalized to precomposed)', () => {
      const errors = validateSkillProperties({
        name: 'cafe\u0301',
        description: 'A test skill',
      });
      expect(errors).toEqual([]);
    });

    it('rejects uppercase Cyrillic (НАВЫК)', () => {
      const errors = validateSkillProperties({
        name: 'НАВЫК',
        description: 'A test skill',
      });
      expect(errors.some((e) => e.includes('lowercase'))).toBe(true);
    });

    it('accepts lowercase Cyrillic (навык)', () => {
      const errors = validateSkillProperties({
        name: 'навык',
        description: 'A test skill',
      });
      expect(errors).toEqual([]);
    });
  });

  describe('validateSkillEntries — expectedName directory match', () => {
    it('accepts matching expectedName', () => {
      const entries = [{ name: 'SKILL.md', content: fixture('valid-minimal.md') }];
      const errors = validateSkillEntries(entries, { expectedName: 'my-skill' });
      expect(errors).toEqual([]);
    });

    it('rejects mismatched expectedName', () => {
      const entries = [{ name: 'SKILL.md', content: fixture('valid-minimal.md') }];
      const errors = validateSkillEntries(entries, { expectedName: 'wrong-name' });
      expect(errors.some((e) => e.includes('must match skill name'))).toBe(true);
    });

    it('reports null entries as missing path', () => {
      const errors = validateSkillEntries(null);
      expect(errors).toHaveLength(1);
      expect(errors[0]).toContain('Path does not exist');
    });

    it('uses custom location label', () => {
      const errors = validateSkillEntries(null, { location: '/custom/path' });
      expect(errors[0]).toContain('/custom/path');
    });
  });
});
