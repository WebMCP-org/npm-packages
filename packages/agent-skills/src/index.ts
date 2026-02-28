/**
 * @mcp-b/agent-skills
 *
 * TypeScript implementation of the AgentSkills specification.
 *
 * Reference: https://agentskills.io/specification
 * Reference Implementation: https://github.com/agentskills/agentskills/tree/main/skills-ref
 */

export { ParseError, ValidationError } from './errors.js';
export type {
  ByteCount,
  SkillAllowedTools,
  SkillBody,
  SkillContent,
  SkillContentEntry,
  SkillFile,
  SkillFrontmatter,
  SkillFrontmatterKey,
  SkillFrontmatterParseResult,
  SkillId,
  SkillMetadata,
  SkillMetadataMap,
  SkillParseResult,
  SkillProperties,
  SkillTokenCount,
  UnixMillis,
} from './models.js';
export { SKILL_FRONTMATTER_KEYS, skillPropertiesToDict } from './models.js';
export {
  extractBody,
  findSkillMdFile,
  frontmatterToProperties,
  parseFrontmatter,
  parseSkillContent,
  readSkillProperties,
} from './parser.js';
export type {
  SkillDiffSegment,
  SkillDiffSegmentType,
  SkillLineDiff,
  SkillPatch,
  SkillPatchApplyOptions,
  SkillPatchApplyResult,
  SkillPatchCreateOptions,
  SkillPatchIssue,
  SkillPatchIssueCode,
  SkillPatchOperation,
  SkillPatchOperationType,
  SkillPatchValidationResult,
} from './patch.js';

export {
  applySkillPatch,
  createSkillPatch,
  diffSkillContent,
  validateSkillPatch,
} from './patch.js';
export type { SkillPromptEntry, SkillPromptSource } from './prompt.js';
export { toPrompt } from './prompt.js';
export { estimateTokens } from './utils/token-estimator.js';
export { normalizeNFKC } from './utils/unicode.js';
export type { SkillValidationOptions } from './validator.js';
export {
  ALLOWED_FIELDS,
  MAX_COMPATIBILITY_LENGTH,
  MAX_DESCRIPTION_LENGTH,
  MAX_SKILL_NAME_LENGTH,
  validateSkillContent,
  validateSkillEntries,
  validateSkillProperties,
} from './validator.js';
