/**
 * Parser tests (29+ test cases)
 *
 * Following TDD: Tests written BEFORE implementation
 * Reference: https://github.com/agentskills/agentskills/blob/main/skills-ref/tests/test_parser.py
 * Spec: https://agentskills.io/specification
 */

import { describe, expect, it } from 'vitest';
import { ParseError, ValidationError } from '../src/errors';
import {
  extractBody,
  findSkillMdFile,
  parseFrontmatter,
  parseSkillContent,
  readSkillProperties,
} from '../src/parser';

describe('parseFrontmatter', () => {
  it('should parse valid frontmatter', () => {
    const content = `---
name: my-skill
description: A test skill
---
# My Skill

Instructions here.`;

    const { metadata, body } = parseFrontmatter(content);
    expect(metadata.name).toBe('my-skill');
    expect(metadata.description).toBe('A test skill');
    expect(body).toContain('# My Skill');
    expect(body).toContain('Instructions here.');
  });

  it('should throw ParseError if frontmatter missing', () => {
    const content = '# No frontmatter here';
    expect(() => parseFrontmatter(content)).toThrow(ParseError);
    expect(() => parseFrontmatter(content)).toThrow('must start with YAML frontmatter');
  });

  it('should throw ParseError if frontmatter not closed', () => {
    const content = `---
name: my-skill
description: A test skill`;

    expect(() => parseFrontmatter(content)).toThrow(ParseError);
    expect(() => parseFrontmatter(content)).toThrow('not properly closed');
  });

  it('should throw ParseError on invalid YAML', () => {
    const content = `---
name: [invalid
description: broken
---
Body here`;

    expect(() => parseFrontmatter(content)).toThrow(ParseError);
    expect(() => parseFrontmatter(content)).toThrow('Invalid YAML');
  });

  it('should throw ParseError if frontmatter is not an object', () => {
    const content = `---
- just
- a
- list
---
Body`;

    expect(() => parseFrontmatter(content)).toThrow(ParseError);
    expect(() => parseFrontmatter(content)).toThrow('must be a YAML mapping');
  });

  it('should parse metadata field', () => {
    const content = `---
name: my-skill
description: A test skill
metadata:
  author: Test Author
  version: "1.0"
---
Body`;

    const { metadata } = parseFrontmatter(content);
    expect(metadata.metadata).toEqual({
      author: 'Test Author',
      version: '1.0',
    });
  });

  it('should preserve numeric metadata formatting', () => {
    const content = `---
name: my-skill
description: A test skill
metadata:
  version: 1.0
---
Body`;

    const { metadata } = parseFrontmatter(content);
    expect(metadata.metadata).toEqual({
      version: '1.0',
    });
  });

  it('should parse allowed-tools field', () => {
    const content = `---
name: my-skill
description: A test skill
allowed-tools: Bash(jq:*) Bash(git:*)
---
Body`;

    const { metadata } = parseFrontmatter(content);
    expect(metadata['allowed-tools']).toBe('Bash(jq:*) Bash(git:*)');
  });

  it('should validate required field: name', () => {
    const content = `---
description: A test skill
---
Body`;

    expect(() => parseFrontmatter(content)).toThrow(ValidationError);
    expect(() => parseFrontmatter(content)).toThrow('Missing required field');
    expect(() => parseFrontmatter(content)).toThrow('name');
  });

  it('should validate required field: description', () => {
    const content = `---
name: my-skill
---
Body`;

    expect(() => parseFrontmatter(content)).toThrow(ValidationError);
    expect(() => parseFrontmatter(content)).toThrow('Missing required field');
    expect(() => parseFrontmatter(content)).toThrow('description');
  });

  it('should reject empty name', () => {
    const content = `---
name: ""
description: A test skill
---
Body`;

    expect(() => parseFrontmatter(content)).toThrow(ValidationError);
    expect(() => parseFrontmatter(content)).toThrow('non-empty string');
  });

  it('should reject whitespace-only name', () => {
    const content = `---
name: "   "
description: A test skill
---
Body`;

    expect(() => parseFrontmatter(content)).toThrow(ValidationError);
    expect(() => parseFrontmatter(content)).toThrow('non-empty string');
  });

  it('should reject empty description', () => {
    const content = `---
name: my-skill
description: ""
---
Body`;

    expect(() => parseFrontmatter(content)).toThrow(ValidationError);
    expect(() => parseFrontmatter(content)).toThrow('non-empty string');
  });

  it('should reject whitespace-only description', () => {
    const content = `---
name: my-skill
description: "   "
---
Body`;

    expect(() => parseFrontmatter(content)).toThrow(ValidationError);
    expect(() => parseFrontmatter(content)).toThrow('non-empty string');
  });

  it('should trim name and description', () => {
    const content = `---
name: "  my-skill  "
description: "  A test skill  "
---
Body`;

    const { metadata } = parseFrontmatter(content);
    expect(metadata.name).toBe('my-skill');
    expect(metadata.description).toBe('A test skill');
  });

  it('should reject non-string name', () => {
    const content = `---
name: 123
description: A test skill
---
Body`;

    expect(() => parseFrontmatter(content)).toThrow(ValidationError);
    expect(() => parseFrontmatter(content)).toThrow('non-empty string');
  });

  it('should reject non-string description', () => {
    const content = `---
name: my-skill
description: 123
---
Body`;

    expect(() => parseFrontmatter(content)).toThrow(ValidationError);
    expect(() => parseFrontmatter(content)).toThrow('non-empty string');
  });

  it('should parse license field', () => {
    const content = `---
name: my-skill
description: A test skill
license: MIT
---
Body`;

    const { metadata } = parseFrontmatter(content);
    expect(metadata.license).toBe('MIT');
  });

  it('should parse compatibility field', () => {
    const content = `---
name: my-skill
description: A test skill
compatibility: Requires Node.js 18+
---
Body`;

    const { metadata } = parseFrontmatter(content);
    expect(metadata.compatibility).toBe('Requires Node.js 18+');
  });

  it('should convert metadata values to strings', () => {
    const content = `---
name: my-skill
description: A test skill
metadata:
  version: 1.0
  count: 42
---
Body`;

    const { metadata } = parseFrontmatter(content);
    expect(metadata.metadata).toEqual({
      version: '1.0',
      count: '42',
    });
  });

  it('should handle metadata without proper formatting (fallback)', () => {
    const content = `---
name: my-skill
description: A test skill
metadata: {version: "1.0"}
---
Body`;

    const { metadata } = parseFrontmatter(content);
    expect(metadata.metadata).toBeDefined();
  });

  it('should coerce boolean metadata values to strings', () => {
    const content = `---
name: my-skill
description: A test skill
metadata:
  enabled: true
  disabled: false
---
Body`;

    const { metadata } = parseFrontmatter(content);
    expect(metadata.metadata?.enabled).toBe('True');
    expect(metadata.metadata?.disabled).toBe('False');
  });

  it("should coerce null metadata values to 'None'", () => {
    const content = `---
name: my-skill
description: A test skill
metadata:
  empty: null
---
Body`;

    const { metadata } = parseFrontmatter(content);
    expect(metadata.metadata?.empty).toBe('None');
  });

  it('should handle nested metadata values (non-scalar)', () => {
    const content = `---
name: my-skill
description: A test skill
metadata:
  nested:
    - item1
    - item2
---
Body`;

    const { metadata } = parseFrontmatter(content);
    expect(metadata.metadata?.nested).toBeDefined();
  });

  it('should handle metadata with null value node', () => {
    const content = `---
name: my-skill
description: A test skill
metadata:
  key:
---
Body`;

    const { metadata } = parseFrontmatter(content);
    // Null YAML value should produce empty string
    expect(metadata.metadata).toBeDefined();
  });

  it('should handle empty body', () => {
    const content = `---
name: my-skill
description: A test skill
---`;

    const { metadata, body } = parseFrontmatter(content);
    expect(metadata.name).toBe('my-skill');
    expect(body).toBe('');
  });

  it('should handle body with leading/trailing whitespace', () => {
    const content = `---
name: my-skill
description: A test skill
---

# My Skill

`;

    const { body } = parseFrontmatter(content);
    expect(body).toBe('# My Skill');
  });

  it('should preserve body formatting', () => {
    const content = `---
name: my-skill
description: A test skill
---
# My Skill

Line 1
Line 2

Line 4`;

    const { body } = parseFrontmatter(content);
    expect(body).toContain('Line 1\nLine 2\n\nLine 4');
  });

  it('should handle multiple --- in body', () => {
    const content = `---
name: my-skill
description: A test skill
---
# My Skill

---

This is a separator above.`;

    const { body } = parseFrontmatter(content);
    expect(body).toContain('---');
    expect(body).toContain('This is a separator above.');
  });
});

describe('extractBody', () => {
  it('should extract body from SKILL.md content', () => {
    const content = `---
name: my-skill
description: A test skill
---
# My Skill

Instructions here.`;

    const body = extractBody(content);
    expect(body).toBe('# My Skill\n\nInstructions here.');
  });

  it('should handle empty body', () => {
    const content = `---
name: my-skill
description: A test skill
---`;

    const body = extractBody(content);
    expect(body).toBe('');
  });

  it('should trim body whitespace', () => {
    const content = `---
name: my-skill
description: A test skill
---

# My Skill

`;

    const body = extractBody(content);
    expect(body).toBe('# My Skill');
  });

  it('should handle content without frontmatter', () => {
    const content = '# Just regular markdown';
    const body = extractBody(content);
    expect(body).toBe('# Just regular markdown');
  });

  it('should handle content with unclosed frontmatter', () => {
    const content = `---
name: my-skill
# Body starts here`;

    const body = extractBody(content);
    expect(body).toBe('---\nname: my-skill\n# Body starts here');
  });
});

describe('parseSkillContent', () => {
  it('should parse complete SKILL.md content', () => {
    const content = `---
name: my-skill
description: A test skill
license: MIT
---
# My Skill`;

    const { properties, body } = parseSkillContent(content);
    expect(properties.name).toBe('my-skill');
    expect(properties.description).toBe('A test skill');
    expect(properties.license).toBe('MIT');
    expect(body).toBe('# My Skill');
  });

  it('should convert allowed-tools to allowedTools property', () => {
    const content = `---
name: my-skill
description: A test skill
allowed-tools: Bash(git:*)
---
Body`;

    const { properties } = parseSkillContent(content);
    expect(properties.allowedTools).toBe('Bash(git:*)');
  });

  it('should handle all optional fields', () => {
    const content = `---
name: my-skill
description: A test skill
license: Apache-2.0
compatibility: Node.js 18+
allowed-tools: Bash(git:*) Read
metadata:
  author: Test
  version: "2.0"
---
Body`;

    const { properties } = parseSkillContent(content);
    expect(properties.license).toBe('Apache-2.0');
    expect(properties.compatibility).toBe('Node.js 18+');
    expect(properties.allowedTools).toBe('Bash(git:*) Read');
    expect(properties.metadata).toEqual({
      author: 'Test',
      version: '2.0',
    });
  });
});

describe('findSkillMdFile', () => {
  it('should prefer SKILL.md over skill.md', () => {
    const files = [
      { name: 'skill.md', content: 'lowercase' },
      { name: 'SKILL.md', content: 'uppercase' },
    ];
    const result = findSkillMdFile(files);
    expect(result?.name).toBe('SKILL.md');
  });

  it('should accept lowercase skill.md', () => {
    const files = [{ name: 'skill.md', content: 'lowercase' }];
    const result = findSkillMdFile(files);
    expect(result?.name).toBe('skill.md');
  });

  it('should return null when missing', () => {
    const files = [{ name: 'README.md', content: 'no skill file' }];
    const result = findSkillMdFile(files);
    expect(result).toBeNull();
  });
});

describe('readSkillProperties', () => {
  it('should read valid skill properties', () => {
    const files = [
      {
        name: 'SKILL.md',
        content: `---
name: my-skill
description: A test skill
license: MIT
---
# My Skill`,
      },
    ];
    const properties = readSkillProperties(files);
    expect(properties.name).toBe('my-skill');
    expect(properties.description).toBe('A test skill');
    expect(properties.license).toBe('MIT');
  });

  it('should read from lowercase skill.md', () => {
    const files = [
      {
        name: 'skill.md',
        content: `---
name: my-skill
description: A test skill
---
# My Skill`,
      },
    ];
    const properties = readSkillProperties(files);
    expect(properties.name).toBe('my-skill');
    expect(properties.description).toBe('A test skill');
  });

  it('should read metadata values as strings', () => {
    const files = [
      {
        name: 'SKILL.md',
        content: `---
name: my-skill
description: A test skill
metadata:
  author: Test Author
  version: 1.0
---
Body`,
      },
    ];
    const properties = readSkillProperties(files);
    expect(properties.metadata).toEqual({
      author: 'Test Author',
      version: '1.0',
    });
  });

  it('should read allowed-tools', () => {
    const files = [
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
    const properties = readSkillProperties(files);
    expect(properties.allowedTools).toBe('Bash(jq:*) Bash(git:*)');
  });

  it('should throw when SKILL.md is missing', () => {
    const files = [{ name: 'README.md', content: 'no skill file' }];
    expect(() => readSkillProperties(files)).toThrow(ParseError);
    expect(() => readSkillProperties(files)).toThrow('SKILL.md not found');
  });

  it('should include location in error when SKILL.md is missing', () => {
    const files = [{ name: 'README.md', content: 'no skill file' }];
    expect(() => readSkillProperties(files, { location: '/my/path' })).toThrow(
      'SKILL.md not found in /my/path'
    );
  });
});
