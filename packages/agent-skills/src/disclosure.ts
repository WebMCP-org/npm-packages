import type { ResolvedSkill, SkillBody, SkillResource } from './models.js';

const DEFAULT_READ_TOOL_NAME = 'read_skill';
const DEFAULT_READ_TOOL_DESCRIPTION =
  'Read skill context. Without a resource, returns the skill overview. With a resource, returns detailed content.';
const READ_TOOL_PARAM_NAME = 'name';
const READ_TOOL_PARAM_RESOURCE = 'resource';
const READ_TOOL_PARAM_NAME_DESCRIPTION = 'The name of the skill to read';
const READ_TOOL_PARAM_RESOURCE_DESCRIPTION =
  'Optional: name of a specific resource within the skill';
const SCHEMA_TYPE_OBJECT = 'object';
const SCHEMA_TYPE_STRING = 'string';
const REQUIRED_READ_TOOL_FIELDS = [READ_TOOL_PARAM_NAME];
const ERROR_CODE_SKILL_NOT_FOUND = 'SKILL_NOT_FOUND';
const ERROR_CODE_RESOURCE_NOT_FOUND = 'RESOURCE_NOT_FOUND';

/**
 * Stable error codes for progressive disclosure read failures.
 */
export type SkillReadErrorCode =
  | typeof ERROR_CODE_SKILL_NOT_FOUND
  | typeof ERROR_CODE_RESOURCE_NOT_FOUND;

/**
 * Tool call arguments for skill progressive disclosure reads.
 */
export interface SkillReadArgs {
  /** Skill identifier from the current skill set. */
  name: ResolvedSkill['name'];
  /** Optional resource identifier within the selected skill. */
  resource?: SkillResource['name'];
}

/**
 * Successful result from a skill read request.
 */
export interface SkillReadResult {
  /** Indicates that the read resolved successfully. */
  ok: true;
  /** Skill body or resource content returned by the read. */
  content: SkillBody | SkillResource['content'];
}

/**
 * Machine-readable read failure for hosts and UIs.
 */
export interface SkillReadError {
  /** Indicates that the read failed. */
  ok: false;
  /** Machine-readable error code for host-side branching. */
  code: SkillReadErrorCode;
  /** Human-readable error message. */
  error: string;
}

/**
 * Options for building the read tool schema declaration.
 */
export interface ReadToolSchemaOptions {
  /** Tool name override (defaults to `read_skill`). */
  toolName?: string;
  /** Tool description override. */
  description?: string;
}

/**
 * Format-agnostic read tool schema declaration.
 *
 * This shape maps cleanly to Gemini `functionDeclarations`, OpenAI tools,
 * and MCP tool metadata.
 */
export interface ReadToolSchema {
  /** Tool name for the declaration payload. */
  name: NonNullable<ReadToolSchemaOptions['toolName']>;
  /** Human-readable tool description. */
  description: NonNullable<ReadToolSchemaOptions['description']>;
  /** JSON Schema object describing accepted arguments. */
  parametersJsonSchema: object;
}

/**
 * Handles a 2-level progressive disclosure read.
 *
 * - `name` only: returns skill body (tier 2)
 * - `name` + `resource`: returns resource content (tier 3)
 *
 * @param skills - Fully resolved in-memory skills.
 * @param args - Read request arguments.
 * @returns Structured success or failure payload.
 */
export function handleSkillRead(
  skills: ReadonlyArray<ResolvedSkill>,
  args: SkillReadArgs
): SkillReadResult | SkillReadError {
  let skill: ResolvedSkill | undefined;
  for (const candidate of skills) {
    if (candidate.name === args.name) {
      skill = candidate;
      break;
    }
  }
  if (!skill) {
    return {
      ok: false,
      code: ERROR_CODE_SKILL_NOT_FOUND,
      error: `Skill "${args.name}" not found.`,
    };
  }

  if (!args.resource) {
    return {
      ok: true,
      content: skill.body,
    };
  }

  let resource: SkillResource | undefined;
  for (const candidate of skill.resources) {
    if (candidate.name === args.resource) {
      resource = candidate;
      break;
    }
  }
  if (!resource) {
    return {
      ok: false,
      code: ERROR_CODE_RESOURCE_NOT_FOUND,
      error: `Resource "${args.resource}" not found in skill "${args.name}".`,
    };
  }

  return {
    ok: true,
    content: resource.content,
  };
}

/**
 * Builds a strict JSON Schema declaration for the skill read tool.
 *
 * The `name` enum is derived from current skills. `resource` remains a free-form
 * string because resources are typically discovered after reading the overview.
 *
 * @param skills - Skills available in the current host/session.
 * @param options - Optional tool naming and description overrides.
 * @returns Tool declaration object with `parametersJsonSchema`.
 */
export function toReadToolSchema(
  skills: ReadonlyArray<Pick<ResolvedSkill, 'name'>>,
  options: ReadToolSchemaOptions = {}
): ReadToolSchema {
  const seenNames = new Set<ResolvedSkill['name']>();
  const names: Array<ResolvedSkill['name']> = [];

  for (const skill of skills) {
    if (seenNames.has(skill.name)) {
      continue;
    }
    seenNames.add(skill.name);
    names.push(skill.name);
  }

  return {
    name: options.toolName ?? DEFAULT_READ_TOOL_NAME,
    description: options.description ?? DEFAULT_READ_TOOL_DESCRIPTION,
    parametersJsonSchema: {
      type: SCHEMA_TYPE_OBJECT,
      properties: {
        [READ_TOOL_PARAM_NAME]: {
          type: SCHEMA_TYPE_STRING,
          description: READ_TOOL_PARAM_NAME_DESCRIPTION,
          enum: names,
        },
        [READ_TOOL_PARAM_RESOURCE]: {
          type: SCHEMA_TYPE_STRING,
          description: READ_TOOL_PARAM_RESOURCE_DESCRIPTION,
        },
      },
      required: REQUIRED_READ_TOOL_FIELDS,
      additionalProperties: false,
    },
  };
}
