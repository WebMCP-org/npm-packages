/**
 * Parser conformance tests — parity with skills-ref (commit fbb6c82)
 *
 * Tests parseFrontmatter, parseSkillContent, findSkillMdFile, extractBody
 * against fixture files to pin expected behavior.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ParseError, ValidationError } from '../../src/errors';
import {
  extractBody,
  findSkillMdFile,
  parseFrontmatter,
  parseSkillContent,
} from '../../src/parser';

const fixture = (name: string): string =>
  readFileSync(resolve(__dirname, 'fixtures', name), 'utf-8');

describe('Parser conformance', () => {
  describe('parseFrontmatter — valid fixtures', () => {
    it('parses valid-minimal.md', () => {
      const { metadata, body } = parseFrontmatter(fixture('valid-minimal.md'));
      expect(metadata.name).toBe('my-skill');
      expect(metadata.description).toBe('A minimal valid skill');
      expect(body).toBe('');
    });

    it('parses valid-all-fields.md with all optional fields', () => {
      const { metadata, body } = parseFrontmatter(fixture('valid-all-fields.md'));
      expect(metadata.name).toBe('full-skill');
      expect(metadata.description).toBe('A skill with all optional fields populated');
      expect(metadata.license).toBe('MIT');
      expect(metadata.compatibility).toBe('Requires Node.js 18+');
      expect(metadata['allowed-tools']).toBe('Bash(jq:*) Bash(git:*)');
      expect(metadata.metadata).toEqual({
        author: 'Test Author',
        version: '2.0',
      });
      expect(body).toContain('# Full Skill');
    });

    it('coerces numeric metadata values to strings (valid-metadata-coercion.md)', () => {
      const { metadata } = parseFrontmatter(fixture('valid-metadata-coercion.md'));
      expect(metadata.metadata).toEqual({
        version: '1.0',
        count: '42',
        pi: '3.14',
      });
    });

    it('parses valid-i18n-chinese.md (CJK name)', () => {
      const { metadata } = parseFrontmatter(fixture('valid-i18n-chinese.md'));
      expect(metadata.name).toBe('技能');
    });

    it('parses valid-i18n-russian.md (Cyrillic name with hyphens)', () => {
      const { metadata } = parseFrontmatter(fixture('valid-i18n-russian.md'));
      expect(metadata.name).toBe('мой-навык');
    });

    it('parses valid-allowed-tools.md', () => {
      const { metadata } = parseFrontmatter(fixture('valid-allowed-tools.md'));
      expect(metadata['allowed-tools']).toBe('Bash(jq:*) Bash(git:*)');
    });
  });

  describe('parseFrontmatter — invalid fixtures', () => {
    it('throws ParseError for invalid-missing-frontmatter.md', () => {
      expect(() => parseFrontmatter(fixture('invalid-missing-frontmatter.md'))).toThrow(ParseError);
      expect(() => parseFrontmatter(fixture('invalid-missing-frontmatter.md'))).toThrow(
        'must start with YAML frontmatter'
      );
    });

    it('throws ParseError for invalid-unclosed-frontmatter.md', () => {
      expect(() => parseFrontmatter(fixture('invalid-unclosed-frontmatter.md'))).toThrow(
        ParseError
      );
      expect(() => parseFrontmatter(fixture('invalid-unclosed-frontmatter.md'))).toThrow(
        'not properly closed'
      );
    });

    it('throws ParseError for invalid-yaml.md', () => {
      expect(() => parseFrontmatter(fixture('invalid-yaml.md'))).toThrow(ParseError);
      expect(() => parseFrontmatter(fixture('invalid-yaml.md'))).toThrow('Invalid YAML');
    });

    it('throws ParseError for invalid-non-dict.md (YAML list)', () => {
      expect(() => parseFrontmatter(fixture('invalid-non-dict.md'))).toThrow(ParseError);
      expect(() => parseFrontmatter(fixture('invalid-non-dict.md'))).toThrow(
        'must be a YAML mapping'
      );
    });

    it('throws ValidationError for invalid-missing-name.md', () => {
      expect(() => parseFrontmatter(fixture('invalid-missing-name.md'))).toThrow(ValidationError);
      expect(() => parseFrontmatter(fixture('invalid-missing-name.md'))).toThrow(
        'Missing required field'
      );
    });

    it('throws ValidationError for invalid-missing-description.md', () => {
      expect(() => parseFrontmatter(fixture('invalid-missing-description.md'))).toThrow(
        ValidationError
      );
      expect(() => parseFrontmatter(fixture('invalid-missing-description.md'))).toThrow(
        'Missing required field'
      );
    });
  });

  describe('parseSkillContent — field mapping', () => {
    it('maps allowed-tools to allowedTools in properties', () => {
      const { properties } = parseSkillContent(fixture('valid-allowed-tools.md'));
      expect(properties.allowedTools).toBe('Bash(jq:*) Bash(git:*)');
    });

    it('maps all fields to camelCase properties', () => {
      const { properties } = parseSkillContent(fixture('valid-all-fields.md'));
      expect(properties.name).toBe('full-skill');
      expect(properties.description).toBe('A skill with all optional fields populated');
      expect(properties.license).toBe('MIT');
      expect(properties.compatibility).toBe('Requires Node.js 18+');
      expect(properties.allowedTools).toBe('Bash(jq:*) Bash(git:*)');
      expect(properties.metadata).toEqual({
        author: 'Test Author',
        version: '2.0',
      });
    });
  });

  describe('extractBody', () => {
    it('extracts trimmed body after second ---', () => {
      const body = extractBody(fixture('valid-all-fields.md'));
      expect(body).toContain('# Full Skill');
      expect(body).toContain('This skill has every field populated.');
    });

    it('returns empty string when no body after frontmatter', () => {
      const body = extractBody(fixture('valid-minimal.md'));
      expect(body).toBe('');
    });

    it('returns content as-is when no frontmatter', () => {
      const body = extractBody(fixture('invalid-missing-frontmatter.md'));
      expect(body).toContain('# No frontmatter here');
    });
  });

  describe('findSkillMdFile', () => {
    it('prefers SKILL.md over skill.md', () => {
      const files = [
        { name: 'skill.md', content: 'lower' },
        { name: 'SKILL.md', content: 'upper' },
      ];
      const result = findSkillMdFile(files);
      expect(result?.name).toBe('SKILL.md');
      expect(result?.content).toBe('upper');
    });

    it('falls back to skill.md when SKILL.md absent', () => {
      const files = [{ name: 'skill.md', content: 'lower' }];
      const result = findSkillMdFile(files);
      expect(result?.name).toBe('skill.md');
    });

    it('returns null when neither exists', () => {
      const files = [{ name: 'README.md', content: 'nope' }];
      expect(findSkillMdFile(files)).toBeNull();
    });
  });
});
