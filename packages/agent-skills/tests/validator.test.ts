/**
 * Validator tests (32+ test cases)
 *
 * Following TDD: Tests written BEFORE implementation
 * Reference: https://github.com/agentskills/agentskills/blob/main/skills-ref/tests/test_validator.py
 * Spec: https://agentskills.io/specification
 */

import { describe, expect, it } from 'vitest';
import {
  validateSkillContent,
  validateSkillEntries,
  validateSkillProperties,
} from '../src/validator';

describe('validateSkillProperties', () => {
  it('should accept valid skill', () => {
    const properties = {
      name: 'my-skill',
      description: 'A test skill',
    };
    const errors = validateSkillProperties(properties);
    expect(errors).toEqual([]);
  });

  it('should reject uppercase name', () => {
    const properties = {
      name: 'MySkill',
      description: 'A test skill',
    };
    const errors = validateSkillProperties(properties);
    expect(errors.some((e) => e.includes('lowercase'))).toBe(true);
  });

  it('should reject name exceeding 64 chars', () => {
    const properties = {
      name: 'a'.repeat(70),
      description: 'A test skill',
    };
    const errors = validateSkillProperties(properties);
    expect(errors.some((e) => e.includes('exceeds') && e.includes('64'))).toBe(true);
  });

  it('should reject name starting with hyphen', () => {
    const properties = {
      name: '-my-skill',
      description: 'A test skill',
    };
    const errors = validateSkillProperties(properties);
    expect(errors.some((e) => e.includes('cannot start or end with a hyphen'))).toBe(true);
  });

  it('should reject name ending with hyphen', () => {
    const properties = {
      name: 'my-skill-',
      description: 'A test skill',
    };
    const errors = validateSkillProperties(properties);
    expect(errors.some((e) => e.includes('cannot start or end with a hyphen'))).toBe(true);
  });

  it('should reject consecutive hyphens', () => {
    const properties = {
      name: 'my--skill',
      description: 'A test skill',
    };
    const errors = validateSkillProperties(properties);
    expect(errors.some((e) => e.includes('consecutive hyphens'))).toBe(true);
  });

  it('should reject invalid characters (underscore)', () => {
    const properties = {
      name: 'my_skill',
      description: 'A test skill',
    };
    const errors = validateSkillProperties(properties);
    expect(errors.some((e) => e.includes('invalid characters'))).toBe(true);
  });

  it('should reject invalid characters (spaces)', () => {
    const properties = {
      name: 'my skill',
      description: 'A test skill',
    };
    const errors = validateSkillProperties(properties);
    expect(errors.some((e) => e.includes('invalid characters'))).toBe(true);
  });

  it('should reject invalid characters (special chars)', () => {
    const properties = {
      name: 'my@skill',
      description: 'A test skill',
    };
    const errors = validateSkillProperties(properties);
    expect(errors.some((e) => e.includes('invalid characters'))).toBe(true);
  });

  it('should reject description exceeding 1024 chars', () => {
    const properties = {
      name: 'my-skill',
      description: 'x'.repeat(1100),
    };
    const errors = validateSkillProperties(properties);
    expect(errors.some((e) => e.includes('exceeds') && e.includes('1024'))).toBe(true);
  });

  it('should accept valid compatibility', () => {
    const properties = {
      name: 'my-skill',
      description: 'A test skill',
      compatibility: 'Requires Node.js 18+',
    };
    const errors = validateSkillProperties(properties);
    expect(errors).toEqual([]);
  });

  it('should reject compatibility exceeding 500 chars', () => {
    const properties = {
      name: 'my-skill',
      description: 'A test skill',
      compatibility: 'x'.repeat(550),
    };
    const errors = validateSkillProperties(properties);
    expect(errors.some((e) => e.includes('exceeds') && e.includes('500'))).toBe(true);
  });

  it('should reject non-string compatibility', () => {
    const properties = {
      name: 'my-skill',
      description: 'A test skill',
      compatibility: 123 as unknown as string,
    };
    const errors = validateSkillProperties(properties);
    expect(errors.some((e) => e.includes('must be a string'))).toBe(true);
  });

  it('should accept all valid fields', () => {
    const properties = {
      name: 'my-skill',
      description: 'A test skill',
      license: 'MIT',
      compatibility: 'Node.js 18+',
      allowedTools: 'Bash(git:*)',
      metadata: { author: 'Test' },
    };
    const errors = validateSkillProperties(properties);
    expect(errors).toEqual([]);
  });

  it('should accept Chinese name (lowercase)', () => {
    const properties = {
      name: '技能',
      description: 'A skill with Chinese name',
    };
    const errors = validateSkillProperties(properties);
    expect(errors).toEqual([]);
  });

  it('should accept Russian name with hyphens', () => {
    const properties = {
      name: 'мой-навык',
      description: 'A skill with Russian name',
    };
    const errors = validateSkillProperties(properties);
    expect(errors).toEqual([]);
  });

  it('should accept Russian lowercase name', () => {
    const properties = {
      name: 'навык',
      description: 'A skill with Russian lowercase name',
    };
    const errors = validateSkillProperties(properties);
    expect(errors).toEqual([]);
  });

  it('should reject Russian uppercase name', () => {
    const properties = {
      name: 'НАВЫК',
      description: 'A skill with Russian uppercase name',
    };
    const errors = validateSkillProperties(properties);
    expect(errors.some((e) => e.includes('lowercase'))).toBe(true);
  });

  it('should normalize Unicode (NFKC)', () => {
    const decomposedName = 'cafe\u0301';
    const properties = {
      name: decomposedName,
      description: 'A test skill',
    };
    const errors = validateSkillProperties(properties);
    expect(errors).toEqual([]);
  });

  it('should accept digits in name', () => {
    const properties = {
      name: 'skill-v2',
      description: 'A test skill',
    };
    const errors = validateSkillProperties(properties);
    expect(errors).toEqual([]);
  });

  it('should accept name with only letters', () => {
    const properties = {
      name: 'myskill',
      description: 'A test skill',
    };
    const errors = validateSkillProperties(properties);
    expect(errors).toEqual([]);
  });

  it('should accept name with only letters and hyphens', () => {
    const properties = {
      name: 'my-test-skill',
      description: 'A test skill',
    };
    const errors = validateSkillProperties(properties);
    expect(errors).toEqual([]);
  });

  it('should reject empty name', () => {
    const properties = {
      name: '',
      description: 'A test skill',
    };
    const errors = validateSkillProperties(properties);
    expect(errors.some((e) => e.includes('non-empty string'))).toBe(true);
  });

  it('should reject whitespace-only name', () => {
    const properties = {
      name: '   ',
      description: 'A test skill',
    };
    const errors = validateSkillProperties(properties);
    expect(errors.some((e) => e.includes('non-empty string'))).toBe(true);
  });

  it('should reject empty description', () => {
    const properties = {
      name: 'my-skill',
      description: '',
    };
    const errors = validateSkillProperties(properties);
    expect(errors.some((e) => e.includes('non-empty string'))).toBe(true);
  });

  it('should reject whitespace-only description', () => {
    const properties = {
      name: 'my-skill',
      description: '   ',
    };
    const errors = validateSkillProperties(properties);
    expect(errors.some((e) => e.includes('non-empty string'))).toBe(true);
  });

  it('should accept name at maximum length (64 chars)', () => {
    const properties = {
      name: 'a'.repeat(64),
      description: 'A test skill',
    };
    const errors = validateSkillProperties(properties);
    expect(errors).toEqual([]);
  });

  it('should accept description at maximum length (1024 chars)', () => {
    const properties = {
      name: 'my-skill',
      description: 'x'.repeat(1024),
    };
    const errors = validateSkillProperties(properties);
    expect(errors).toEqual([]);
  });

  it('should accept compatibility at maximum length (500 chars)', () => {
    const properties = {
      name: 'my-skill',
      description: 'A test skill',
      compatibility: 'x'.repeat(500),
    };
    const errors = validateSkillProperties(properties);
    expect(errors).toEqual([]);
  });

  it('should return multiple errors for multiple violations', () => {
    const properties = {
      name: 'My_Skill',
      description: '',
    };
    const errors = validateSkillProperties(properties);
    expect(errors.length).toBeGreaterThan(1);
  });
});

describe('validateSkillContent', () => {
  it('should validate complete SKILL.md content', () => {
    const content = `---
name: my-skill
description: A test skill
---
# My Skill`;

    const errors = validateSkillContent(content);
    expect(errors).toEqual([]);
  });

  it('should catch parse errors', () => {
    const content = '# No frontmatter';
    const errors = validateSkillContent(content);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.some((e) => e.includes('frontmatter'))).toBe(true);
  });

  it('should catch validation errors', () => {
    const content = `---
name: Invalid_Name
description: A test skill
---
Body`;

    const errors = validateSkillContent(content);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.some((e) => e.includes('invalid characters'))).toBe(true);
  });

  it('should validate all fields together', () => {
    const content = `---
name: my-skill
description: A comprehensive test skill
license: MIT
compatibility: Node.js 18+
allowed-tools: Bash(git:*)
metadata:
  author: Test
---
# My Skill`;

    const errors = validateSkillContent(content);
    expect(errors).toEqual([]);
  });

  it('should reject unexpected frontmatter fields', () => {
    const content = `---
name: my-skill
description: A test skill
unknown_field: should not be here
---
Body`;

    const errors = validateSkillContent(content);
    expect(errors.some((e) => e.includes('Unexpected fields'))).toBe(true);
  });

  it('should handle unexpected error types gracefully', () => {
    // Pass something that will cause an unexpected error (not ParseError or ValidationError)
    // This exercises the catch-all branch in validateSkillContent
    const errors = validateSkillContent(null as unknown as string);
    expect(errors.length).toBeGreaterThan(0);
  });
});

describe('validateSkillEntries', () => {
  it('should validate a valid skill entry', () => {
    const entries = [
      {
        name: 'SKILL.md',
        content: `---
name: my-skill
description: A test skill
---
# My Skill`,
      },
    ];

    const errors = validateSkillEntries(entries, { expectedName: 'my-skill' });
    expect(errors).toEqual([]);
  });

  it('should report missing path', () => {
    const errors = validateSkillEntries(undefined, { location: '/missing', exists: false });
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('Path does not exist');
  });

  it('should report non-directory source', () => {
    const errors = validateSkillEntries(undefined, { location: '/file.txt', isDirectory: false });
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('Not a directory');
  });

  it('should report missing SKILL.md', () => {
    const errors = validateSkillEntries([], { location: '/skill' });
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('Missing required file: SKILL.md');
  });

  it('should reject uppercase name', () => {
    const entries = [
      {
        name: 'SKILL.md',
        content: `---
name: MySkill
description: A test skill
---
Body`,
      },
    ];

    const errors = validateSkillEntries(entries, { expectedName: 'MySkill' });
    expect(errors.some((e) => e.includes('lowercase'))).toBe(true);
  });

  it('should reject name exceeding 64 chars', () => {
    const longName = 'a'.repeat(70);
    const entries = [
      {
        name: 'SKILL.md',
        content: `---
name: ${longName}
description: A test skill
---
Body`,
      },
    ];

    const errors = validateSkillEntries(entries, { expectedName: longName });
    expect(errors.some((e) => e.includes('exceeds') && e.includes('character limit'))).toBe(true);
  });

  it('should reject name starting with hyphen', () => {
    const entries = [
      {
        name: 'SKILL.md',
        content: `---
name: -my-skill
description: A test skill
---
Body`,
      },
    ];

    const errors = validateSkillEntries(entries, { expectedName: '-my-skill' });
    expect(errors.some((e) => e.includes('cannot start or end with a hyphen'))).toBe(true);
  });

  it('should reject consecutive hyphens', () => {
    const entries = [
      {
        name: 'SKILL.md',
        content: `---
name: my--skill
description: A test skill
---
Body`,
      },
    ];

    const errors = validateSkillEntries(entries, { expectedName: 'my--skill' });
    expect(errors.some((e) => e.includes('consecutive hyphens'))).toBe(true);
  });

  it('should reject invalid characters', () => {
    const entries = [
      {
        name: 'SKILL.md',
        content: `---
name: my_skill
description: A test skill
---
Body`,
      },
    ];

    const errors = validateSkillEntries(entries, { expectedName: 'my_skill' });
    expect(errors.some((e) => e.includes('invalid characters'))).toBe(true);
  });

  it('should reject name mismatch with expected name', () => {
    const entries = [
      {
        name: 'SKILL.md',
        content: `---
name: correct-name
description: A test skill
---
Body`,
      },
    ];

    const errors = validateSkillEntries(entries, { expectedName: 'wrong-name' });
    expect(errors.some((e) => e.includes('must match skill name'))).toBe(true);
  });

  it('should reject unexpected fields', () => {
    const entries = [
      {
        name: 'SKILL.md',
        content: `---
name: my-skill
description: A test skill
unknown_field: should not be here
---
Body`,
      },
    ];

    const errors = validateSkillEntries(entries, { expectedName: 'my-skill' });
    expect(errors.some((e) => e.includes('Unexpected fields'))).toBe(true);
  });

  it('should accept all fields', () => {
    const entries = [
      {
        name: 'SKILL.md',
        content: `---
name: my-skill
description: A test skill
license: MIT
metadata:
  author: Test
---
Body`,
      },
    ];

    const errors = validateSkillEntries(entries, { expectedName: 'my-skill' });
    expect(errors).toEqual([]);
  });

  it('should accept allowed-tools', () => {
    const entries = [
      {
        name: 'SKILL.md',
        content: `---
name: my-skill
description: A test skill
allowed-tools: Bash(jq:*) Bash(git:*)
---
Body`,
      },
    ];

    const errors = validateSkillEntries(entries, { expectedName: 'my-skill' });
    expect(errors).toEqual([]);
  });

  it('should accept Chinese name', () => {
    const entries = [
      {
        name: 'SKILL.md',
        content: `---
name: 技能
description: A skill with Chinese name
---
Body`,
      },
    ];

    const errors = validateSkillEntries(entries, { expectedName: '技能' });
    expect(errors).toEqual([]);
  });

  it('should accept Russian name with hyphens', () => {
    const entries = [
      {
        name: 'SKILL.md',
        content: `---
name: мой-навык
description: A skill with Russian name
---
Body`,
      },
    ];

    const errors = validateSkillEntries(entries, { expectedName: 'мой-навык' });
    expect(errors).toEqual([]);
  });

  it('should accept Russian lowercase name', () => {
    const entries = [
      {
        name: 'SKILL.md',
        content: `---
name: навык
description: A skill with Russian lowercase name
---
Body`,
      },
    ];

    const errors = validateSkillEntries(entries, { expectedName: 'навык' });
    expect(errors).toEqual([]);
  });

  it('should reject Russian uppercase name', () => {
    const entries = [
      {
        name: 'SKILL.md',
        content: `---
name: НАВЫК
description: A skill with Russian uppercase name
---
Body`,
      },
    ];

    const errors = validateSkillEntries(entries, { expectedName: 'НАВЫК' });
    expect(errors.some((e) => e.includes('lowercase'))).toBe(true);
  });

  it('should reject overly long description', () => {
    const longDescription = 'x'.repeat(1100);
    const entries = [
      {
        name: 'SKILL.md',
        content: `---
name: my-skill
description: ${longDescription}
---
Body`,
      },
    ];

    const errors = validateSkillEntries(entries, { expectedName: 'my-skill' });
    expect(errors.some((e) => e.includes('1024'))).toBe(true);
  });

  it('should accept valid compatibility', () => {
    const entries = [
      {
        name: 'SKILL.md',
        content: `---
name: my-skill
description: A test skill
compatibility: Requires Python 3.11+
---
Body`,
      },
    ];

    const errors = validateSkillEntries(entries, { expectedName: 'my-skill' });
    expect(errors).toEqual([]);
  });

  it('should reject overly long compatibility', () => {
    const longCompatibility = 'x'.repeat(550);
    const entries = [
      {
        name: 'SKILL.md',
        content: `---
name: my-skill
description: A test skill
compatibility: ${longCompatibility}
---
Body`,
      },
    ];

    const errors = validateSkillEntries(entries, { expectedName: 'my-skill' });
    expect(errors.some((e) => e.includes('500'))).toBe(true);
  });

  it('should handle unexpected error types gracefully', () => {
    // null content will cause an unexpected runtime error in parseFrontmatter
    const entries = [{ name: 'SKILL.md', content: null as unknown as string }];
    const errors = validateSkillEntries(entries);
    expect(errors.length).toBeGreaterThan(0);
  });
});
