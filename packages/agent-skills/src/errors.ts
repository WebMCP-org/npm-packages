/**
 * Error types for AgentSkills parsing and validation
 *
 * Reference: https://agentskills.io/specification
 * Reference Implementation: https://github.com/agentskills/agentskills/blob/main/skills-ref/src/skills_ref/errors.py
 */

/**
 * Error thrown during SKILL.md parsing (invalid YAML, missing frontmatter, etc.)
 *
 * Used for:
 * - Missing or malformed frontmatter
 * - Invalid YAML syntax
 * - Non-mapping YAML structure
 * - Missing SKILL.md inputs in a host-provided file list
 *
 * @param message - Human-readable parse failure detail.
 * @example
 * ```ts
 * throw new ParseError("SKILL.md must start with YAML frontmatter (---)")
 * ```
 * @see https://agentskills.io/specification
 * @see https://github.com/agentskills/agentskills/blob/main/skills-ref/src/skills_ref/errors.py
 */
export class ParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ParseError';
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, ParseError);
    }
  }
}

/**
 * Error thrown during skill validation (invalid name, missing fields, etc.)
 *
 * Used for:
 * - Missing required fields (name, description)
 * - Invalid field formats (name not lowercase, etc.)
 * - Field length violations (name > 64 chars, description > 1024 chars, etc.)
 * - Unexpected frontmatter fields
 *
 * @param message - Human-readable validation failure detail.
 * @example
 * ```ts
 * throw new ValidationError("Field 'name' must be a non-empty string")
 * ```
 * @see https://agentskills.io/specification
 * @see https://github.com/agentskills/agentskills/blob/main/skills-ref/src/skills_ref/errors.py
 */
export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, ValidationError);
    }
  }
}
