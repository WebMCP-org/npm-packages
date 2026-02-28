/**
 * Prompt tests
 *
 * Reference: https://github.com/agentskills/agentskills/blob/main/skills-ref/tests/test_prompt.py
 */

import { describe, expect, it } from 'vitest';
import { toPrompt } from '../src/prompt';

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
});
