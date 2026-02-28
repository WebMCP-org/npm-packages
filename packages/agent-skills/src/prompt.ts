import type { ResolvedSkill, SkillContent, SkillResource } from './models.js';
import { parseSkillContent } from './parser.js';

const DEFAULT_DISCLOSURE_TOOL_NAME = 'read_skill';
const AVAILABLE_SKILLS_OPEN_TAG = '<available_skills>';
const AVAILABLE_SKILLS_CLOSE_TAG = '</available_skills>';
const XML_TAG_SKILL = 'skill';
const XML_TAG_NAME = 'name';
const XML_TAG_DESCRIPTION = 'description';
const XML_TAG_LOCATION = 'location';
const XML_TAG_RESOURCES = 'resources';
const DISCLOSURE_INSTRUCTION_LINE_1 = 'Skills provide context for using tools effectively.';

/**
 * Prompt-ready skill metadata.
 *
 * This shape is storage-agnostic and works for both filesystem hosts
 * (with `location`) and tool-only hosts (without `location`).
 *
 * @see https://agentskills.io/specification
 * @see https://github.com/agentskills/agentskills/blob/main/skills-ref/src/skills_ref/prompt.py
 */
export interface SkillPromptEntry
  extends Pick<ResolvedSkill, 'name' | 'description' | 'location'> {}

/**
 * SKILL.md source data for prompt generation.
 *
 * @see https://agentskills.io/specification
 * @see https://github.com/agentskills/agentskills/blob/main/skills-ref/src/skills_ref/prompt.py
 */
export interface SkillPromptSource {
  /** Raw SKILL.md content to parse for prompt metadata. */
  content: SkillContent;
  /** Optional source location label for prompt output. */
  location?: SkillPromptEntry['location'];
}

/**
 * Prompt entry for resource-aware progressive disclosure hosts.
 */
export interface DisclosurePromptEntry extends SkillPromptEntry {
  /** Optional tier-3 resource names exposed as prompt hints. */
  resources?: Array<SkillResource['name']>;
}

/**
 * Options for disclosure protocol instruction text generation.
 */
export interface DisclosureInstructionOptions {
  /** Tool name override used in generated instruction text. */
  toolName?: string;
}

const pushXmlNode = (lines: string[], tag: string, value: string): void => {
  lines.push(`<${tag}>`);
  lines.push(value);
  lines.push(`</${tag}>`);
};

const escapeXml = (value: string): string => {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
};

const appendSkill = (
  lines: string[],
  entry: SkillPromptEntry | DisclosurePromptEntry,
  options: { includeResources: boolean }
): void => {
  lines.push(`<${XML_TAG_SKILL}>`);
  pushXmlNode(lines, XML_TAG_NAME, escapeXml(entry.name));
  pushXmlNode(lines, XML_TAG_DESCRIPTION, escapeXml(entry.description));

  if (entry.location) {
    pushXmlNode(lines, XML_TAG_LOCATION, escapeXml(entry.location));
  }

  if (
    options.includeResources &&
    'resources' in entry &&
    entry.resources &&
    entry.resources.length > 0
  ) {
    pushXmlNode(lines, XML_TAG_RESOURCES, escapeXml(entry.resources.join(', ')));
  }

  lines.push(`</${XML_TAG_SKILL}>`);
};

const toPromptEntry = (entry: SkillPromptEntry | SkillPromptSource): SkillPromptEntry => {
  if (!('content' in entry)) {
    return entry;
  }

  const { properties } = parseSkillContent(entry.content);

  return {
    name: properties.name,
    description: properties.description,
    location: entry.location,
  };
};

/**
 * Generates the `<available_skills>` XML block for system prompts.
 *
 * The base output mirrors the reference XML shape and omits host-specific
 * protocol instructions.
 *
 * @param entries - Prompt entries or raw SKILL.md sources.
 * @returns XML block describing available skills.
 */
export function toPrompt(entries: SkillPromptEntry[]): string;
export function toPrompt(entries: SkillPromptSource[]): string;
export function toPrompt(entries: Array<SkillPromptEntry | SkillPromptSource>): string {
  if (entries.length === 0) {
    return `${AVAILABLE_SKILLS_OPEN_TAG}\n${AVAILABLE_SKILLS_CLOSE_TAG}`;
  }

  const lines: string[] = [AVAILABLE_SKILLS_OPEN_TAG];

  for (const entry of entries) {
    appendSkill(lines, toPromptEntry(entry), { includeResources: false });
  }

  lines.push(AVAILABLE_SKILLS_CLOSE_TAG);
  return lines.join('\n');
}

/**
 * Generates `<available_skills>` XML including optional tier-3 resource hints.
 *
 * This is a host extension for progressive disclosure workflows and does not
 * replace the base `toPrompt` output contract.
 *
 * @param entries - Prompt entries with optional resource names.
 * @returns XML block describing skills and available resources.
 */
export function toDisclosurePrompt(entries: DisclosurePromptEntry[]): string {
  if (entries.length === 0) {
    return `${AVAILABLE_SKILLS_OPEN_TAG}\n${AVAILABLE_SKILLS_CLOSE_TAG}`;
  }

  const lines: string[] = [AVAILABLE_SKILLS_OPEN_TAG];

  for (const entry of entries) {
    appendSkill(lines, entry, { includeResources: true });
  }

  lines.push(AVAILABLE_SKILLS_CLOSE_TAG);
  return lines.join('\n');
}

/**
 * Generates canonical system-instruction text for progressive disclosure reads.
 *
 * @param options - Optional tool naming override.
 * @returns Multi-line guidance text for model system prompts.
 */
export function toDisclosureInstructions(options: DisclosureInstructionOptions = {}): string {
  const toolName = options.toolName ?? DEFAULT_DISCLOSURE_TOOL_NAME;

  return [
    DISCLOSURE_INSTRUCTION_LINE_1,
    `Call ${toolName} with a skill name to read its overview and discover available resources.`,
    `Then call ${toolName} with both a skill name and resource name to read detailed instructions.`,
  ].join('\n');
}
