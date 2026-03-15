/**
 * Prompt conformance tests — parity with skills-ref (commit fbb6c82)
 *
 * Tests toPrompt XML output format against fixtures.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vite-plus/test';
import { toPrompt } from '../../src/prompt';

const fixture = (name: string): string =>
  readFileSync(resolve(__dirname, 'fixtures', name), 'utf-8');

describe('Prompt conformance', () => {
  it('empty list → wrapping tags only', () => {
    const result = toPrompt([]);
    expect(result).toBe('<available_skills>\n</available_skills>');
  });

  it('each tag on its own line with values between open/close tags', () => {
    const result = toPrompt([
      { content: fixture('valid-minimal.md'), location: '/skills/my-skill/SKILL.md' },
    ]);

    const lines = result.split('\n');
    expect(lines[0]).toBe('<available_skills>');
    expect(lines[1]).toBe('<skill>');
    expect(lines[2]).toBe('<name>');
    expect(lines[3]).toBe('my-skill');
    expect(lines[4]).toBe('</name>');
    expect(lines[5]).toBe('<description>');
    expect(lines[6]).toBe('A minimal valid skill');
    expect(lines[7]).toBe('</description>');
    expect(lines[8]).toBe('<location>');
    expect(lines[9]).toBe('/skills/my-skill/SKILL.md');
    expect(lines[10]).toBe('</location>');
    expect(lines[11]).toBe('</skill>');
    expect(lines[12]).toBe('</available_skills>');
  });

  it('escapes XML entities in name and description', () => {
    const result = toPrompt([
      {
        name: 'skill-with-<special>&"chars\'',
        description: 'Uses <tags> & "quotes" and \'apostrophes\'',
        location: '/loc',
      },
    ]);

    expect(result).toContain('&lt;special&gt;');
    expect(result).toContain('&amp;');
    expect(result).toContain('&quot;chars&#x27;');
    expect(result).not.toContain('<special>');
    expect(result).toContain('&#x27;');
    expect(result).toContain('&lt;tags&gt;');
  });

  it('multi-skill output produces 2 <skill> blocks', () => {
    const result = toPrompt([
      { content: fixture('valid-minimal.md'), location: '/a' },
      { content: fixture('valid-all-fields.md'), location: '/b' },
    ]);

    expect(result.split('<skill>').length - 1).toBe(2);
    expect(result.split('</skill>').length - 1).toBe(2);
    expect(result).toContain('my-skill');
    expect(result).toContain('full-skill');
  });
});
