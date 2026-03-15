/**
 * Prompt tests
 *
 * Reference: https://github.com/agentskills/agentskills/blob/main/skills-ref/tests/test_prompt.py
 */

import { describe, expect, it } from 'vite-plus/test';
import { toDisclosureInstructions, toDisclosurePrompt, toPrompt } from '../src/prompt';

describe('toPrompt', () => {
  it('should handle empty list', () => {
    const result = toPrompt([]);
    expect(result).toBe('<available_skills>\n</available_skills>');
  });

  it('should format a single skill', () => {
    const result = toPrompt([
      {
        content: `---
name: my-skill
description: A test skill
---
Body`,
        location: '/path/to/my-skill/SKILL.md',
      },
    ]);

    expect(result).toContain('<available_skills>');
    expect(result).toContain('</available_skills>');
    expect(result).toContain('<name>\nmy-skill\n</name>');
    expect(result).toContain('<description>\nA test skill\n</description>');
    expect(result).toContain('<location>');
    expect(result).toContain('SKILL.md');
  });

  it('should omit location tag when location is not provided', () => {
    const result = toPrompt([
      {
        name: 'my-skill',
        description: 'A test skill',
      },
    ]);

    expect(result).toContain('<name>\nmy-skill\n</name>');
    expect(result).not.toContain('<location>');
  });

  it('should format multiple skills', () => {
    const result = toPrompt([
      {
        content: `---
name: skill-a
description: First skill
---
Body`,
        location: '/path/to/skill-a/SKILL.md',
      },
      {
        content: `---
name: skill-b
description: Second skill
---
Body`,
        location: '/path/to/skill-b/SKILL.md',
      },
    ]);

    expect(result.split('<skill>').length - 1).toBe(2);
    expect(result.split('</skill>').length - 1).toBe(2);
    expect(result).toContain('skill-a');
    expect(result).toContain('skill-b');
  });

  it('should escape special characters', () => {
    const result = toPrompt([
      {
        content: `---
name: special-skill
description: Use <foo> & <bar> tags
---
Body`,
        location: '/path/to/special-skill/SKILL.md',
      },
    ]);

    expect(result).toContain('&lt;foo&gt;');
    expect(result).toContain('&amp;');
    expect(result).toContain('&lt;bar&gt;');
    expect(result).not.toContain('<foo>');
    expect(result).not.toContain('<bar>');
  });

  it('should escape special characters in location', () => {
    const result = toPrompt([
      {
        name: 'special-skill',
        description: 'Skill with XML-sensitive location',
        location: '/path?x=1&y=<tag>',
      },
    ]);

    expect(result).toContain('<location>');
    expect(result).toContain('/path?x=1&amp;y=&lt;tag&gt;');
    expect(result).not.toContain('/path?x=1&y=<tag>');
  });
});

describe('toDisclosurePrompt', () => {
  it('should include resource hints when provided', () => {
    const result = toDisclosurePrompt([
      {
        name: 'pizza-maker',
        description: 'Interactive pizza builder',
        resources: ['build-pizza', 'topping-reference'],
      },
    ]);

    expect(result).toContain('<resources>');
    expect(result).toContain('build-pizza, topping-reference');
    expect(result).not.toContain('<location>');
  });

  it('should omit resources tag when resource list is empty', () => {
    const result = toDisclosurePrompt([
      {
        name: 'pizza-maker',
        description: 'Interactive pizza builder',
        resources: [],
      },
    ]);

    expect(result).not.toContain('<resources>');
  });
});

describe('toDisclosureInstructions', () => {
  it('should generate canonical disclosure instructions with default tool name', () => {
    const result = toDisclosureInstructions();

    expect(result).toContain('Call read_skill with a skill name');
    expect(result).toContain('Then call read_skill with both a skill name and resource name');
  });

  it('should support custom tool name', () => {
    const result = toDisclosureInstructions({ toolName: 'read_site_context' });

    expect(result).toContain('Call read_site_context with a skill name');
    expect(result).toContain(
      'Then call read_site_context with both a skill name and resource name'
    );
  });
});
