/**
 * agent-skills-ts-sdk
 *
 * TypeScript implementation of the AgentSkills specification.
 *
 * Reference: https://agentskills.io/specification
 * Reference Implementation: https://github.com/agentskills/agentskills/tree/main/skills-ref
 */

export type {
  ReadToolSchema,
  ReadToolSchemaOptions,
  SkillReadArgs,
  SkillReadError,
  SkillReadErrorCode,
  SkillReadResult,
} from './disclosure.js';
export { handleSkillRead, toReadToolSchema } from './disclosure.js';
export { ParseError, ValidationError } from './errors.js';
export type {
  ByteCount,
  ResolvedSkill,
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
  SkillResource,
  SkillTokenCount,
  UnixMillis,
} from './models.js';
export { SKILL_FRONTMATTER_KEYS, skillPropertiesToDict } from './models.js';
export type {
  ParseFrontmatterInputMode,
  ParseFrontmatterOptions,
  ReadSkillPropertiesOptions,
  ResourceLink,
} from './parser.js';
export {
  extractBody,
  extractResourceLinks,
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
export type {
  DisclosureInstructionOptions,
  DisclosurePromptEntry,
  SkillPromptEntry,
  SkillPromptSource,
} from './prompt.js';
export { toDisclosureInstructions, toDisclosurePrompt, toPrompt } from './prompt.js';
export { estimateTokens } from './utils/token-estimator.js';
export { normalizeNFKC } from './utils/unicode.js';
export type { SkillValidationOptions, ValidateSkillPropertiesOptions } from './validator.js';
export {
  ALLOWED_FIELDS,
  MAX_COMPATIBILITY_LENGTH,
  MAX_DESCRIPTION_LENGTH,
  MAX_SKILL_NAME_LENGTH,
  validateSkillContent,
  validateSkillEntries,
  validateSkillProperties,
} from './validator.js';
