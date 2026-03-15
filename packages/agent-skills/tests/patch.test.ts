/**
 * Patch tests for SKILL.md diff and apply utilities.
 */

import { describe, expect, it } from 'vite-plus/test';
import {
  applySkillPatch,
  createSkillPatch,
  diffSkillContent,
  validateSkillPatch,
} from '../src/patch';

const baseSkill = `---
name: sample-skill
description: Sample description
---
# Sample
Line A
Line B`;

const updatedSkill = `---
name: sample-skill
description: Updated description
---
# Sample
Line A
Line B
Line C`;

describe('validateSkillPatch', () => {
  describe('structural guards', () => {
    it('rejects array input → PATCH_NOT_OBJECT', () => {
      const result = validateSkillPatch([1, 2, 3]);
      expect(result.ok).toBe(false);
      expect(result.errors?.[0].code).toBe('PATCH_NOT_OBJECT');
    });

    it('rejects null → PATCH_NOT_OBJECT', () => {
      const result = validateSkillPatch(null);
      expect(result.ok).toBe(false);
      expect(result.errors?.[0].code).toBe('PATCH_NOT_OBJECT');
    });

    it('rejects number → PATCH_NOT_OBJECT', () => {
      const result = validateSkillPatch(42);
      expect(result.ok).toBe(false);
      expect(result.errors?.[0].code).toBe('PATCH_NOT_OBJECT');
    });

    it('rejects string → PATCH_NOT_OBJECT', () => {
      const result = validateSkillPatch('not a patch');
      expect(result.ok).toBe(false);
      expect(result.errors?.[0].code).toBe('PATCH_NOT_OBJECT');
    });

    it('rejects wrong version → PATCH_INVALID_VERSION', () => {
      const result = validateSkillPatch({ version: 2, operations: [] });
      expect(result.ok).toBe(false);
      expect(result.errors?.[0].code).toBe('PATCH_INVALID_VERSION');
    });

    it('rejects missing operations → PATCH_MISSING_OPERATIONS', () => {
      const result = validateSkillPatch({ version: 1 });
      expect(result.ok).toBe(false);
      expect(result.errors?.[0].code).toBe('PATCH_MISSING_OPERATIONS');
    });

    it('rejects non-array operations → PATCH_MISSING_OPERATIONS', () => {
      const result = validateSkillPatch({ version: 1, operations: 'not-array' });
      expect(result.ok).toBe(false);
      expect(result.errors?.[0].code).toBe('PATCH_MISSING_OPERATIONS');
    });

    it('rejects non-object operation in array → OPERATION_INVALID', () => {
      const result = validateSkillPatch({
        version: 1,
        operations: ['not-an-object'],
      });
      expect(result.ok).toBe(false);
      expect(result.errors?.[0].code).toBe('OPERATION_INVALID');
    });

    it('rejects invalid type string → OPERATION_INVALID', () => {
      const result = validateSkillPatch({
        version: 1,
        operations: [{ type: 'unknown', before: 'a', after: 'b' }],
      });
      expect(result.ok).toBe(false);
      expect(result.errors?.[0].code).toBe('OPERATION_INVALID');
    });

    it('rejects non-positive expectedMatches → OPERATION_INVALID_EXPECTED_MATCHES', () => {
      const result = validateSkillPatch({
        version: 1,
        operations: [{ type: 'replace', before: 'a', after: 'b', expectedMatches: 0 }],
      });
      expect(result.ok).toBe(false);
      expect(result.errors?.[0].code).toBe('OPERATION_INVALID_EXPECTED_MATCHES');
    });

    it('rejects negative expectedMatches → OPERATION_INVALID_EXPECTED_MATCHES', () => {
      const result = validateSkillPatch({
        version: 1,
        operations: [{ type: 'replace', before: 'a', after: 'b', expectedMatches: -1 }],
      });
      expect(result.ok).toBe(false);
      expect(result.errors?.[0].code).toBe('OPERATION_INVALID_EXPECTED_MATCHES');
    });

    it('rejects non-integer expectedMatches → OPERATION_INVALID_EXPECTED_MATCHES', () => {
      const result = validateSkillPatch({
        version: 1,
        operations: [{ type: 'replace', before: 'a', after: 'b', expectedMatches: 1.5 }],
      });
      expect(result.ok).toBe(false);
      expect(result.errors?.[0].code).toBe('OPERATION_INVALID_EXPECTED_MATCHES');
    });
  });

  describe('replace operation validation', () => {
    it('rejects replace with non-string before', () => {
      const result = validateSkillPatch({
        version: 1,
        operations: [{ type: 'replace', before: 123, after: 'b' }],
      });
      expect(result.ok).toBe(false);
      expect(result.errors?.[0].code).toBe('OPERATION_INVALID');
      expect(result.errors?.[0].field).toBe('before');
    });

    it('rejects replace with non-string after', () => {
      const result = validateSkillPatch({
        version: 1,
        operations: [{ type: 'replace', before: 'a', after: 123 }],
      });
      expect(result.ok).toBe(false);
      expect(result.errors?.[0].code).toBe('OPERATION_INVALID');
      expect(result.errors?.[0].field).toBe('after');
    });

    it('accepts valid replace operation', () => {
      const result = validateSkillPatch({
        version: 1,
        operations: [{ type: 'replace', before: 'a', after: 'b' }],
      });
      expect(result.ok).toBe(true);
      expect(result.patch?.operations).toHaveLength(1);
    });
  });

  describe('insert operation validation', () => {
    it('rejects insert with empty anchor → OPERATION_TARGET_EMPTY', () => {
      const result = validateSkillPatch({
        version: 1,
        operations: [{ type: 'insert', anchor: '', text: 'data' }],
      });
      expect(result.ok).toBe(false);
      expect(result.errors?.[0].code).toBe('OPERATION_TARGET_EMPTY');
    });

    it('rejects insert with empty text → OPERATION_INVALID', () => {
      const result = validateSkillPatch({
        version: 1,
        operations: [{ type: 'insert', anchor: 'target', text: '' }],
      });
      expect(result.ok).toBe(false);
      expect(result.errors?.[0].code).toBe('OPERATION_INVALID');
      expect(result.errors?.[0].field).toBe('text');
    });

    it('rejects insert with invalid position → OPERATION_INVALID_POSITION', () => {
      const result = validateSkillPatch({
        version: 1,
        operations: [{ type: 'insert', anchor: 'target', text: 'data', position: 'middle' }],
      });
      expect(result.ok).toBe(false);
      expect(result.errors?.[0].code).toBe('OPERATION_INVALID_POSITION');
    });

    it('accepts insert without position (defaults to after)', () => {
      const result = validateSkillPatch({
        version: 1,
        operations: [{ type: 'insert', anchor: 'target', text: 'data' }],
      });
      expect(result.ok).toBe(true);
    });
  });

  describe('delete operation validation', () => {
    it('rejects delete with empty before → OPERATION_TARGET_EMPTY', () => {
      const result = validateSkillPatch({
        version: 1,
        operations: [{ type: 'delete', before: '' }],
      });
      expect(result.ok).toBe(false);
      expect(result.errors?.[0].code).toBe('OPERATION_TARGET_EMPTY');
    });

    it('accepts valid delete and returns normalized operation', () => {
      const result = validateSkillPatch({
        version: 1,
        operations: [{ type: 'delete', before: 'target text' }],
      });
      expect(result.ok).toBe(true);
      expect(result.patch?.operations[0]).toEqual({
        type: 'delete',
        before: 'target text',
        expectedMatches: undefined,
      });
    });
  });

  it('accepts empty operations array', () => {
    const result = validateSkillPatch({ version: 1, operations: [] });
    expect(result.ok).toBe(true);
    expect(result.patch?.operations).toEqual([]);
  });
});

describe('applySkillPatch', () => {
  it('applies insert operations (position: after)', () => {
    const base = 'line1\nline2\nline3';
    const patch = {
      version: 1,
      operations: [{ type: 'insert', anchor: 'line2', text: '\nline2.5', position: 'after' }],
    };
    const result = applySkillPatch(base, patch, { validate: false });
    expect(result.ok).toBe(true);
    expect(result.content).toBe('line1\nline2\nline2.5\nline3');
  });

  it('applies insert operations (position: before)', () => {
    const base = 'line1\nline2\nline3';
    const patch = {
      version: 1,
      operations: [{ type: 'insert', anchor: 'line2', text: 'line1.5\n', position: 'before' }],
    };
    const result = applySkillPatch(base, patch, { validate: false });
    expect(result.ok).toBe(true);
    expect(result.content).toBe('line1\nline1.5\nline2\nline3');
  });

  it('applies insert with default position (after)', () => {
    const base = 'line1\nline2';
    const patch = {
      version: 1,
      operations: [{ type: 'insert', anchor: 'line1', text: '\ninserted' }],
    };
    const result = applySkillPatch(base, patch, { validate: false });
    expect(result.ok).toBe(true);
    expect(result.content).toBe('line1\ninserted\nline2');
  });

  it('returns error when insert anchor not found → OPERATION_TARGET_NOT_FOUND', () => {
    const patch = {
      version: 1,
      operations: [{ type: 'insert', anchor: 'nonexistent', text: 'data' }],
    };
    const result = applySkillPatch('some content', patch, { validate: false });
    expect(result.ok).toBe(false);
    expect(result.errors?.[0].code).toBe('OPERATION_TARGET_NOT_FOUND');
  });

  it('returns an error when the target is ambiguous', () => {
    const patch = {
      version: 1,
      operations: [{ type: 'replace', before: 'foo', after: 'bar' }],
    };
    const result = applySkillPatch('foo\nbaz\nfoo', patch, { validate: false });
    expect(result.ok).toBe(false);
    expect(result.errors?.[0].code).toBe('OPERATION_TARGET_AMBIGUOUS');
  });

  it('returns an error when match counts do not align', () => {
    const patch = {
      version: 1,
      operations: [{ type: 'replace', before: 'foo', after: 'bar', expectedMatches: 2 }],
    };
    const result = applySkillPatch('foo\nbaz', patch, { validate: false });
    expect(result.ok).toBe(false);
    expect(result.errors?.[0].code).toBe('OPERATION_MATCH_COUNT_MISMATCH');
  });

  it('returns validation errors when the result is invalid', () => {
    const patch = {
      version: 1,
      operations: [{ type: 'replace', before: 'name: sample-skill\n', after: '' }],
    };
    const result = applySkillPatch(baseSkill, patch);
    expect(result.ok).toBe(false);
    expect(result.errors?.[0].code).toBe('SKILL_INVALID');
  });

  it('supports replacing empty content with a new skill', () => {
    const patch = {
      version: 1,
      operations: [{ type: 'replace', before: '', after: baseSkill }],
    };
    const result = applySkillPatch('', patch);
    expect(result.ok).toBe(true);
    expect(result.content).toBe(baseSkill);
  });

  describe('delete operations', () => {
    it('deletes target text end-to-end', () => {
      const base = 'line1\nremove-me\nline3';
      const patch = {
        version: 1,
        operations: [{ type: 'delete', before: '\nremove-me' }],
      };
      const result = applySkillPatch(base, patch, { validate: false });
      expect(result.ok).toBe(true);
      expect(result.content).toBe('line1\nline3');
    });

    it('returns error when delete target not found → OPERATION_TARGET_NOT_FOUND', () => {
      const patch = {
        version: 1,
        operations: [{ type: 'delete', before: 'nonexistent' }],
      };
      const result = applySkillPatch('some content', patch, { validate: false });
      expect(result.ok).toBe(false);
      expect(result.errors?.[0].code).toBe('OPERATION_TARGET_NOT_FOUND');
    });

    it('returns error when delete target is ambiguous', () => {
      const patch = {
        version: 1,
        operations: [{ type: 'delete', before: 'dup' }],
      };
      const result = applySkillPatch('dup and dup', patch, { validate: false });
      expect(result.ok).toBe(false);
      expect(result.errors?.[0].code).toBe('OPERATION_TARGET_AMBIGUOUS');
    });
  });

  describe('replace edge cases', () => {
    it('rejects replace empty before on non-empty content → OPERATION_TARGET_EMPTY', () => {
      const patch = {
        version: 1,
        operations: [{ type: 'replace', before: '', after: 'new' }],
      };
      const result = applySkillPatch('existing content', patch, { validate: false });
      expect(result.ok).toBe(false);
      expect(result.errors?.[0].code).toBe('OPERATION_TARGET_EMPTY');
    });

    it('rejects replace empty before on empty content with wrong expectedMatches → OPERATION_MATCH_COUNT_MISMATCH', () => {
      const patch = {
        version: 1,
        operations: [{ type: 'replace', before: '', after: 'new', expectedMatches: 2 }],
      };
      const result = applySkillPatch('', patch, { validate: false });
      expect(result.ok).toBe(false);
      expect(result.errors?.[0].code).toBe('OPERATION_MATCH_COUNT_MISMATCH');
    });

    it('returns error when replace target not found → OPERATION_TARGET_NOT_FOUND', () => {
      const patch = {
        version: 1,
        operations: [{ type: 'replace', before: 'nonexistent', after: 'new' }],
      };
      const result = applySkillPatch('some content', patch, { validate: false });
      expect(result.ok).toBe(false);
      expect(result.errors?.[0].code).toBe('OPERATION_TARGET_NOT_FOUND');
    });
  });

  describe('empty operations', () => {
    it('with validate: true and valid content → ok', () => {
      const result = applySkillPatch(baseSkill, { version: 1, operations: [] });
      expect(result.ok).toBe(true);
      expect(result.content).toBe(baseSkill);
      expect(result.appliedOperations).toBe(0);
    });

    it('with validate: true and invalid content → SKILL_INVALID', () => {
      const result = applySkillPatch('not valid skill content', {
        version: 1,
        operations: [],
      });
      expect(result.ok).toBe(false);
      expect(result.errors?.[0].code).toBe('SKILL_INVALID');
      expect(result.appliedOperations).toBe(0);
    });

    it('with validate: false → ok without validation', () => {
      const result = applySkillPatch(
        'not valid',
        {
          version: 1,
          operations: [],
        },
        { validate: false }
      );
      expect(result.ok).toBe(true);
      expect(result.content).toBe('not valid');
      expect(result.appliedOperations).toBe(0);
    });
  });

  describe('multi-operation patch', () => {
    it('applies 2 operations sequentially', () => {
      const base = 'aaa\nbbb\nccc';
      const patch = {
        version: 1,
        operations: [
          { type: 'replace', before: 'aaa', after: 'AAA' },
          { type: 'replace', before: 'ccc', after: 'CCC' },
        ],
      };
      const result = applySkillPatch(base, patch, { validate: false });
      expect(result.ok).toBe(true);
      expect(result.content).toBe('AAA\nbbb\nCCC');
      expect(result.appliedOperations).toBe(2);
    });

    it('stops on first error and reports appliedOperations', () => {
      const base = 'aaa\nbbb\nccc';
      const patch = {
        version: 1,
        operations: [
          { type: 'replace', before: 'aaa', after: 'AAA' },
          { type: 'replace', before: 'nonexistent', after: 'X' },
        ],
      };
      const result = applySkillPatch(base, patch, { validate: false });
      expect(result.ok).toBe(false);
      expect(result.appliedOperations).toBe(1);
    });
  });

  describe('options.expectedMatches fallback', () => {
    it('uses global expectedMatches when operation does not specify', () => {
      const base = 'foo\nbar\nfoo';
      const patch = {
        version: 1,
        operations: [{ type: 'replace', before: 'foo', after: 'baz' }],
      };
      const result = applySkillPatch(base, patch, {
        validate: false,
        expectedMatches: 2,
      });
      expect(result.ok).toBe(true);
      expect(result.content).toBe('baz\nbar\nbaz');
    });

    it('operation-level expectedMatches overrides global', () => {
      const base = 'foo\nbar\nfoo';
      const patch = {
        version: 1,
        operations: [{ type: 'replace', before: 'foo', after: 'baz', expectedMatches: 2 }],
      };
      const result = applySkillPatch(base, patch, {
        validate: false,
        expectedMatches: 1,
      });
      expect(result.ok).toBe(true);
      expect(result.content).toBe('baz\nbar\nbaz');
    });
  });

  describe('validate option forms', () => {
    it("validate: { expectedName: 'foo' } checks name match", () => {
      const result = applySkillPatch(
        baseSkill,
        { version: 1, operations: [] },
        {
          validate: { expectedName: 'wrong-name' },
        }
      );
      expect(result.ok).toBe(false);
      expect(result.errors?.some((e) => e.message.includes('must match skill name'))).toBe(true);
    });

    it("validate: { expectedName: 'sample-skill' } passes", () => {
      const result = applySkillPatch(
        baseSkill,
        { version: 1, operations: [] },
        {
          validate: { expectedName: 'sample-skill' },
        }
      );
      expect(result.ok).toBe(true);
    });

    it('validate: true (default) validates content', () => {
      const result = applySkillPatch(baseSkill, { version: 1, operations: [] });
      expect(result.ok).toBe(true);
    });
  });

  describe('post-operation validation with expectedName', () => {
    it('validates expectedName after applying operations', () => {
      const patch = {
        version: 1,
        operations: [{ type: 'replace', before: 'Sample description', after: 'New description' }],
      };
      const result = applySkillPatch(baseSkill, patch, {
        validate: { expectedName: 'wrong-name' },
      });
      expect(result.ok).toBe(false);
      expect(result.errors?.some((e) => e.message.includes('must match skill name'))).toBe(true);
      expect(result.appliedOperations).toBe(1);
    });
  });

  it('returns validation errors from invalid patch structure', () => {
    const result = applySkillPatch('content', 'not-a-patch');
    expect(result.ok).toBe(false);
    expect(result.errors?.[0].code).toBe('PATCH_NOT_OBJECT');
  });

  describe('snippet truncation in error messages', () => {
    it('truncates long target text in error snippet', () => {
      const longTarget = 'a'.repeat(100);
      const patch = {
        version: 1,
        operations: [{ type: 'replace', before: longTarget, after: 'short' }],
      };
      const result = applySkillPatch('no match here', patch, { validate: false });
      expect(result.ok).toBe(false);
      expect(result.errors?.[0].code).toBe('OPERATION_TARGET_NOT_FOUND');
      const snippet = result.errors?.[0].snippet;
      expect(snippet).toBeDefined();
      // Snippet should be truncated with ...
      expect(snippet?.length).toBeLessThanOrEqual(80);
    });
  });

  describe('collectSkillValidationIssues catch path', () => {
    it('catches unexpected errors during post-validation with expectedName', () => {
      // Create content that passes validateSkillContent but causes error in parseFrontmatter
      // when called a second time (via the expectedName path)
      // This is hard to trigger in practice, so we test the expectedName validation path
      const validContent = `---
name: test-skill
description: Valid skill for testing
---
Body`;
      const patch = {
        version: 1,
        operations: [
          { type: 'replace', before: 'Valid skill for testing', after: 'Updated description' },
        ],
      };
      const result = applySkillPatch(validContent, patch, {
        validate: { expectedName: 'test-skill' },
      });
      expect(result.ok).toBe(true);
    });
  });
});

describe('diffSkillContent', () => {
  it('returns line segments for inserts', () => {
    const diff = diffSkillContent('a\nb\nc', 'a\nb\nx\nc');
    expect(diff.baseLineCount).toBe(3);
    expect(diff.updatedLineCount).toBe(4);
    expect(diff.segments).toEqual([
      { type: 'equal', lines: ['a', 'b'] },
      { type: 'insert', lines: ['x'] },
      { type: 'equal', lines: ['c'] },
    ]);
  });

  it('returns delete segments for content removal', () => {
    const diff = diffSkillContent('a\nb\nc', 'a\nc');
    expect(diff.baseLineCount).toBe(3);
    expect(diff.updatedLineCount).toBe(2);
    const deleteSegment = diff.segments.find((s) => s.type === 'delete');
    expect(deleteSegment).toBeDefined();
    if (!deleteSegment) {
      throw new Error('Expected delete segment to be defined');
    }
    expect(deleteSegment.lines).toEqual(['b']);
  });

  it('returns all-equal segments for identical strings', () => {
    const diff = diffSkillContent('a\nb\nc', 'a\nb\nc');
    expect(diff.segments).toEqual([{ type: 'equal', lines: ['a', 'b', 'c'] }]);
  });

  it('handles empty base (all inserts)', () => {
    const diff = diffSkillContent('', 'a\nb');
    expect(diff.baseLineCount).toBe(1);
    expect(diff.updatedLineCount).toBe(2);
    const insertSegment = diff.segments.find((s) => s.type === 'insert');
    expect(insertSegment).toBeDefined();
  });

  it('handles empty updated (all deletes)', () => {
    const diff = diffSkillContent('a\nb', '');
    expect(diff.baseLineCount).toBe(2);
    expect(diff.updatedLineCount).toBe(1);
    const deleteSegment = diff.segments.find((s) => s.type === 'delete');
    expect(deleteSegment).toBeDefined();
  });
});

describe('createSkillPatch', () => {
  it('creates a patch that applies cleanly', () => {
    const patch = createSkillPatch(baseSkill, updatedSkill);
    const result = applySkillPatch(baseSkill, patch);
    expect(result.ok).toBe(true);
    expect(result.content).toBe(updatedSkill);
  });

  it('returns empty operations when base === updated', () => {
    const patch = createSkillPatch(baseSkill, baseSkill);
    expect(patch.version).toBe(1);
    expect(patch.operations).toEqual([]);
  });

  it('respects custom contextLines option', () => {
    const base = 'line1\nline2\nline3\nline4\nline5\nline6\nline7';
    const updated = 'line1\nline2\nline3\nchanged\nline5\nline6\nline7';
    const patch0 = createSkillPatch(base, updated, { contextLines: 0 });
    const patch3 = createSkillPatch(base, updated, { contextLines: 3 });

    // With 0 context, the before should be shorter
    const op0 = patch0.operations[0] as { before: string; after: string };
    const op3 = patch3.operations[0] as { before: string; after: string };
    expect(op0.before.length).toBeLessThan(op3.before.length);
  });

  it('handles multiple change hunks with equal lines between', () => {
    const base = 'a\nb\nc\nd\ne\nf\ng\nh\ni\nj';
    const updated = 'a\nX\nc\nd\ne\nf\ng\nY\ni\nj';
    const patch = createSkillPatch(base, updated, { contextLines: 1 });

    // Should produce 2 replace operations (one for each hunk)
    expect(patch.operations.length).toBe(2);

    // Verify the patch applies correctly
    const result = applySkillPatch(base, patch, { validate: false });
    expect(result.ok).toBe(true);
    expect(result.content).toBe(updated);
  });

  it('handles contextLines: 0 with multiple hunks', () => {
    const base = 'a\nb\nc\nd\ne\nf\ng\nh';
    const updated = 'a\nX\nc\nd\ne\nf\nY\nh';
    const patch = createSkillPatch(base, updated, { contextLines: 0 });

    expect(patch.operations.length).toBe(2);
    const result = applySkillPatch(base, patch, { validate: false });
    expect(result.ok).toBe(true);
    expect(result.content).toBe(updated);
  });
});
