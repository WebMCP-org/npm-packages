import type { SkillContent } from './models.js';
import { parseSkillContent } from './parser.js';

/**
 * Prompt-ready skill metadata.
 *
 * @example
 * ```ts
 * const entry: SkillPromptEntry = {
 *   name: "demo",
 *   description: "Demo skill",
 *   location: "/skills/demo/SKILL.md"
 * }
 * ```
 * @see https://agentskills.io/specification
 * @see https://github.com/agentskills/agentskills/blob/main/skills-ref/src/skills_ref/prompt.py
 */
export interface SkillPromptEntry {
  name: string;
  description: string;
  location: string;
}

/**
 * SKILL.md source data for prompt generation.
 *
 * @example
 * ```ts
 * const source: SkillPromptSource = {
 *   location: "/skills/demo/SKILL.md",
 *   content: "---\nname: demo\ndescription: Demo\n---\n# Instructions"
 * }
 * ```
 * @see https://agentskills.io/specification
 * @see https://github.com/agentskills/agentskills/blob/main/skills-ref/src/skills_ref/prompt.py
 */
export interface SkillPromptSource {
  content: SkillContent;
  location: string;
}

const escapeXml = (value: string): string => {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
};

/**
 * Generates the <available_skills> XML block for system prompts.
 *
 * @param entries - Prompt entries or raw SKILL.md sources.
 * @returns XML block describing available skills.
 * @throws {ParseError} If a `SkillPromptSource` entry contains invalid SKILL.md content.
 * @throws {ValidationError} If a `SkillPromptSource` entry is missing required frontmatter fields.
 * @example
 * ```ts
 * const prompt = toPrompt([
 *   { name: "demo", description: "Demo skill", location: "/skills/demo/SKILL.md" }
 * ])
 * ```
 * @see https://agentskills.io/specification
 * @see https://github.com/agentskills/agentskills/blob/main/skills-ref/src/skills_ref/prompt.py
 */
export function toPrompt(entries: SkillPromptEntry[]): string;
export function toPrompt(entries: SkillPromptSource[]): string;
export function toPrompt(entries: Array<SkillPromptEntry | SkillPromptSource>): string {
  if (entries.length === 0) {
    return '<available_skills>\n</available_skills>';
  }

  const lines: string[] = ['<available_skills>'];

  for (const entry of entries) {
    const promptEntry: SkillPromptEntry =
      'content' in entry
        ? {
            ...parseSkillContent(entry.content).properties,
            location: entry.location,
          }
        : entry;

    lines.push('<skill>');
    lines.push('<name>');
    lines.push(escapeXml(promptEntry.name));
    lines.push('</name>');
    lines.push('<description>');
    lines.push(escapeXml(promptEntry.description));
    lines.push('</description>');
    lines.push('<location>');
    lines.push(promptEntry.location);
    lines.push('</location>');
    lines.push('</skill>');
  }

  lines.push('</available_skills>');

  return lines.join('\n');
}
