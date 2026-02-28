/**
 * Skill validation logic
 *
 * Reference: https://agentskills.io/specification
 * Reference Implementation: https://github.com/agentskills/agentskills/blob/main/skills-ref/src/skills_ref/validator.py
 */

import { ParseError, ValidationError } from './errors.js';
import type { SkillContent, SkillContentEntry, SkillProperties } from './models.js';
import { SKILL_FRONTMATTER_KEYS } from './models.js';
import { findSkillMdFile, frontmatterToProperties, parseFrontmatter } from './parser.js';
import { normalizeNFKC } from './utils/unicode.js';

/**
 * Maximum allowed skill name length.
 *
 * @see https://agentskills.io/specification
 * @example
 * ```ts
 * if (name.length > MAX_SKILL_NAME_LENGTH) {
 *   // invalid
 * }
 * ```
 */
export const MAX_SKILL_NAME_LENGTH = 64;

/**
 * Maximum allowed description length.
 *
 * @see https://agentskills.io/specification
 * @example
 * ```ts
 * if (description.length > MAX_DESCRIPTION_LENGTH) {
 *   // invalid
 * }
 * ```
 */
export const MAX_DESCRIPTION_LENGTH = 1024;

/**
 * Maximum allowed compatibility string length.
 *
 * @see https://agentskills.io/specification
 * @example
 * ```ts
 * if (compatibility.length > MAX_COMPATIBILITY_LENGTH) {
 *   // invalid
 * }
 * ```
 */
export const MAX_COMPATIBILITY_LENGTH = 500;

/**
 * Allowed frontmatter fields per Agent Skills Spec.
 * https://agentskills.io/specification
 *
 * @example
 * ```ts
 * if (!ALLOWED_FIELDS.has("name")) {
 *   throw new Error("configuration bug")
 * }
 * ```
 * @see https://agentskills.io/specification
 * @see https://github.com/agentskills/agentskills/blob/main/skills-ref/src/skills_ref/validator.py
 */
export const ALLOWED_FIELDS = new Set<string>(SKILL_FRONTMATTER_KEYS);

/**
 * Renders a deterministic list of frontmatter fields for error messages.
 *
 * @param fields - Field names to format.
 * @returns Sorted quoted list string.
 */
const formatFieldList = (fields: Iterable<string>): string => {
  const items = [...fields].sort();
  return `[${items.map((field) => `'${field}'`).join(', ')}]`;
};

/**
 * Validates frontmatter keys against the spec allowlist.
 *
 * @param metadata - Parsed frontmatter object.
 * @returns Validation errors for unknown keys.
 */
const validateFrontmatterFields = (metadata: object): string[] => {
  const errors: string[] = [];
  const extraFields = Object.keys(metadata).filter((field) => !ALLOWED_FIELDS.has(field));

  if (extraFields.length > 0) {
    errors.push(
      `Unexpected fields in frontmatter: ${extraFields.sort().join(', ')}. ` +
        `Only ${formatFieldList(ALLOWED_FIELDS)} are allowed.`
    );
  }

  return errors;
};

/**
 * Validate skill name format.
 *
 * Skill names support i18n characters (Unicode letters) plus hyphens.
 * Names must be lowercase and cannot start/end with hyphens.
 *
 * Spec: https://agentskills.io/specification
 * - Max 64 characters
 * - Lowercase only
 * - Letters, digits, and hyphens
 * - Cannot start/end with hyphen
 * - Cannot contain consecutive hyphens
 * - NFKC normalized
 */
function validateName(name: SkillProperties['name']): string[] {
  const errors: string[] = [];

  if (!name || typeof name !== 'string' || !name.trim()) {
    errors.push("Field 'name' must be a non-empty string");
    return errors;
  }

  const normalized = normalizeNFKC(name.trim());

  if (normalized.length > MAX_SKILL_NAME_LENGTH) {
    errors.push(
      `Skill name '${normalized}' exceeds ${MAX_SKILL_NAME_LENGTH} character limit (${normalized.length} chars)`
    );
  }

  if (normalized !== normalized.toLowerCase()) {
    errors.push(`Skill name '${normalized}' must be lowercase`);
  }

  if (normalized.startsWith('-') || normalized.endsWith('-')) {
    errors.push('Skill name cannot start or end with a hyphen');
  }

  if (normalized.includes('--')) {
    errors.push('Skill name cannot contain consecutive hyphens');
  }

  const isValid = [...normalized].every((c) => {
    return /[\p{L}\p{N}-]/u.test(c);
  });

  if (!isValid) {
    errors.push(
      `Skill name '${normalized}' contains invalid characters. Only letters, digits, and hyphens are allowed.`
    );
  }

  return errors;
}

/**
 * Validate description format.
 *
 * Spec: https://agentskills.io/specification
 * - Max 1024 characters
 * - Non-empty
 */
function validateDescription(description: SkillProperties['description']): string[] {
  const errors: string[] = [];

  if (!description || typeof description !== 'string' || !description.trim()) {
    errors.push("Field 'description' must be a non-empty string");
    return errors;
  }

  if (description.length > MAX_DESCRIPTION_LENGTH) {
    errors.push(
      `Description exceeds ${MAX_DESCRIPTION_LENGTH} character limit (${description.length} chars)`
    );
  }

  return errors;
}

/**
 * Validate compatibility format.
 *
 * Spec: https://agentskills.io/specification
 * - Max 500 characters
 * - Optional field
 */
function validateCompatibility(compatibility: string): string[] {
  const errors: string[] = [];

  if (typeof compatibility !== 'string') {
    errors.push("Field 'compatibility' must be a string");
    return errors;
  }

  if (compatibility.length > MAX_COMPATIBILITY_LENGTH) {
    errors.push(
      `Compatibility exceeds ${MAX_COMPATIBILITY_LENGTH} character limit (${compatibility.length} chars)`
    );
  }

  return errors;
}

const normalizeSkillName = (name: SkillProperties['name']): string => normalizeNFKC(name.trim());

/**
 * Formats unexpected errors in a stable, human-readable way.
 *
 * @param error - Unknown thrown value.
 * @returns Error message string.
 */
const formatUnexpectedError = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
};

/**
 * Optional host-level constraints for `validateSkillProperties`.
 */
export interface ValidateSkillPropertiesOptions {
  /** Expected skill name (for example, directory or slug match). */
  expectedName?: SkillProperties['name'];
}

/**
 * Validate skill properties.
 *
 * This is the core validation function that works on parsed properties.
 * Provide expectedName to enforce a host-level name match (directory, slug, or ID).
 *
 * @param properties - Parsed skill properties
 * @param options - Validation options including optional expected skill name.
 * @returns List of validation error messages. Empty list means valid.
 * @example
 * ```ts
 * const errors = validateSkillProperties({
 *   name: "demo-skill",
 *   description: "Demo skill"
 * })
 * ```
 * @see https://agentskills.io/specification
 * @see https://github.com/agentskills/agentskills/blob/main/skills-ref/src/skills_ref/validator.py
 *
 * Spec: https://agentskills.io/specification
 */
export function validateSkillProperties(
  properties: SkillProperties,
  options: ValidateSkillPropertiesOptions = {}
): string[] {
  const errors: string[] = [];

  errors.push(...validateName(properties.name));

  errors.push(...validateDescription(properties.description));

  if (properties.compatibility !== undefined) {
    errors.push(...validateCompatibility(properties.compatibility));
  }

  if (options.expectedName && typeof properties.name === 'string' && properties.name.trim()) {
    const expectedName = normalizeNFKC(options.expectedName);
    const normalizedName = normalizeSkillName(properties.name);

    if (expectedName !== normalizedName) {
      errors.push(
        `Directory name '${options.expectedName}' must match skill name '${normalizedName}'`
      );
    }
  }

  return errors;
}

/**
 * Validate complete SKILL.md content.
 *
 * Parses the content and validates the resulting properties.
 *
 * @param content - Raw SKILL.md content
 * @returns List of validation error messages. Empty list means valid.
 * @example
 * ```ts
 * const errors = validateSkillContent(`---
 * name: demo
 * description: Demo skill
 * ---
 * # Body`)
 * ```
 * @see https://agentskills.io/specification
 * @see https://github.com/agentskills/agentskills/blob/main/skills-ref/src/skills_ref/validator.py
 *
 * Spec: https://agentskills.io/specification
 */
export function validateSkillContent(content: SkillContent): string[] {
  try {
    const { metadata } = parseFrontmatter(content);
    const errors = validateFrontmatterFields(metadata);
    const properties = frontmatterToProperties(metadata);
    errors.push(...validateSkillProperties(properties));
    return errors;
  } catch (error) {
    if (error instanceof ParseError || error instanceof ValidationError) {
      return [error.message];
    }
    return [`Unexpected error: ${formatUnexpectedError(error)}`];
  }
}

/**
 * Host-provided context for validating in-memory skill entries.
 *
 * @example
 * ```ts
 * const options: SkillValidationOptions = {
 *   location: "/skills/demo",
 *   expectedName: "demo",
 *   exists: true,
 *   isDirectory: true
 * }
 * ```
 * @see https://agentskills.io/specification
 * @see https://github.com/agentskills/agentskills/blob/main/skills-ref/src/skills_ref/validator.py
 */
export interface SkillValidationOptions {
  /** Optional location label included in error messages. */
  location?: string;
  /** Expected skill name (for example, directory or slug match). */
  expectedName?: ValidateSkillPropertiesOptions['expectedName'];
  /** Whether the host path exists. */
  exists?: boolean;
  /** Whether the host path is a directory. */
  isDirectory?: boolean;
}

/**
 * Validates a skill represented as an in-memory file list.
 * The host can map filesystem concepts (exists, isDirectory, name) into options.
 *
 * @param entries - In-memory file entries for one skill directory.
 * @param options - Host context for path state and expected name checks.
 * @returns List of validation errors. Empty list means valid.
 * @example
 * ```ts
 * const errors = validateSkillEntries(
 *   [{ name: "SKILL.md", content: "---\nname: demo\ndescription: Demo\n---" }],
 *   { expectedName: "demo" }
 * )
 * ```
 * @see https://agentskills.io/specification
 * @see https://github.com/agentskills/agentskills/blob/main/skills-ref/src/skills_ref/validator.py
 */
export function validateSkillEntries(
  entries: Iterable<SkillContentEntry> | null | undefined,
  options: SkillValidationOptions = {}
): string[] {
  const locationLabel = options.location ?? 'skill';

  if (options.exists === false) {
    return [`Path does not exist: ${locationLabel}`];
  }

  if (options.isDirectory === false) {
    return [`Not a directory: ${locationLabel}`];
  }

  if (entries === null || entries === undefined) {
    return [`Path does not exist: ${locationLabel}`];
  }

  const skillFile = findSkillMdFile(entries);
  if (!skillFile) {
    return ['Missing required file: SKILL.md'];
  }

  try {
    const { metadata } = parseFrontmatter(skillFile.content);
    const errors = validateFrontmatterFields(metadata);
    const properties = frontmatterToProperties(metadata);
    errors.push(...validateSkillProperties(properties, { expectedName: options.expectedName }));
    return errors;
  } catch (error) {
    if (error instanceof ParseError || error instanceof ValidationError) {
      return [error.message];
    }
    return [`Unexpected error: ${formatUnexpectedError(error)}`];
  }
}
