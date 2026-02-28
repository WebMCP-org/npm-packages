/**
 * Data models for Agent Skills
 *
 * Reference: https://agentskills.io/specification
 * Reference Implementation: https://github.com/agentskills/agentskills/blob/main/skills-ref/src/skills_ref/models.py
 */

/**
 * Stable identifier for a stored skill record.
 *
 * @example
 * ```ts
 * const id: SkillId = "skill_123"
 * ```
 * @see https://agentskills.io/specification
 */
export type SkillId = string;

/**
 * Raw `SKILL.md` file content.
 *
 * @example
 * ```ts
 * const content: SkillContent = "---\nname: demo\ndescription: Demo\n---\n# Body"
 * ```
 * @see https://agentskills.io/specification
 */
export type SkillContent = string;

/**
 * Markdown body content after frontmatter is removed.
 *
 * @example
 * ```ts
 * const body: SkillBody = "# Instructions"
 * ```
 * @see https://agentskills.io/specification
 */
export type SkillBody = string;

/**
 * String key-value metadata map from frontmatter.
 *
 * @example
 * ```ts
 * const metadata: SkillMetadataMap = { author: "example-org", version: "1.0" }
 * ```
 * @see https://agentskills.io/specification
 */
export type SkillMetadataMap = Record<string, string>;

/**
 * Space-delimited tool allowlist string (`allowed-tools` in frontmatter).
 *
 * @example
 * ```ts
 * const allowed: SkillAllowedTools = "Bash(git:*) Read"
 * ```
 * @see https://agentskills.io/specification
 */
export type SkillAllowedTools = string;

/**
 * Token count estimate used for progressive disclosure.
 *
 * @example
 * ```ts
 * const tokens: SkillTokenCount = 120
 * ```
 * @see https://agentskills.io/specification
 */
export type SkillTokenCount = number;

/**
 * Unix timestamp in milliseconds.
 *
 * @example
 * ```ts
 * const updatedAt: UnixMillis = Date.now()
 * ```
 * @see https://agentskills.io/specification
 */
export type UnixMillis = number;

/**
 * Byte count for persisted skill content.
 *
 * @example
 * ```ts
 * const size: ByteCount = 2048
 * ```
 * @see https://agentskills.io/specification
 */
export type ByteCount = number;

/**
 * Minimal in-memory representation of a file entry.
 *
 * @example
 * ```ts
 * const entry: SkillContentEntry = { name: "SKILL.md", content: "---\n...\n---" }
 * ```
 * @see https://agentskills.io/specification
 */
export interface SkillContentEntry {
  name: string;
  content: SkillContent;
}

/**
 * Canonical frontmatter keys accepted by the spec.
 *
 * @example
 * ```ts
 * for (const key of SKILL_FRONTMATTER_KEYS) {
 *   console.log(key)
 * }
 * ```
 * @see https://agentskills.io/specification
 */
export const SKILL_FRONTMATTER_KEYS = [
  'name',
  'description',
  'license',
  'compatibility',
  'allowed-tools',
  'metadata',
] as const;

/**
 * Union of allowed frontmatter keys.
 *
 * @example
 * ```ts
 * const key: SkillFrontmatterKey = "allowed-tools"
 * ```
 * @see https://agentskills.io/specification
 */
export type SkillFrontmatterKey = (typeof SKILL_FRONTMATTER_KEYS)[number];

/**
 * Frontmatter shape as defined by the spec.
 * Required: name, description.
 * Optional: license, compatibility, allowed-tools, metadata.
 *
 * @example
 * ```ts
 * const frontmatter: SkillFrontmatter = {
 *   name: "demo-skill",
 *   description: "Demonstrates the format",
 *   "allowed-tools": "Bash(git:*)"
 * }
 * ```
 * @see https://agentskills.io/specification
 * @see https://github.com/agentskills/agentskills/blob/main/skills-ref/src/skills_ref/models.py
 */
export interface SkillFrontmatter<TMetadata extends SkillMetadataMap = SkillMetadataMap> {
  name: string;
  description: string;
  license?: string;
  compatibility?: string;
  'allowed-tools'?: SkillAllowedTools;
  metadata?: TMetadata;
}

/**
 * Result returned by `parseFrontmatter`.
 *
 * @example
 * ```ts
 * const result: SkillFrontmatterParseResult = {
 *   metadata: { name: "demo", description: "Demo" },
 *   body: "# Instructions"
 * }
 * ```
 * @see https://agentskills.io/specification
 */
export interface SkillFrontmatterParseResult<
  TMetadata extends SkillMetadataMap = SkillMetadataMap,
> {
  metadata: SkillFrontmatter<TMetadata>;
  body: SkillBody;
}

/**
 * Result returned by `parseSkillContent`.
 *
 * @example
 * ```ts
 * const result: SkillParseResult = {
 *   properties: { name: "demo", description: "Demo" },
 *   body: "# Instructions"
 * }
 * ```
 * @see https://agentskills.io/specification
 */
export interface SkillParseResult<TMetadata extends SkillMetadataMap = SkillMetadataMap> {
  properties: SkillProperties<TMetadata>;
  body: SkillBody;
}

/**
 * Frontmatter normalized for JavaScript usage.
 * Matches the reference implementation semantics with camel-cased keys.
 *
 * @example
 * ```ts
 * const props: SkillProperties = {
 *   name: "demo",
 *   description: "Demo",
 *   allowedTools: "Read"
 * }
 * ```
 * @see https://agentskills.io/specification
 * @see https://github.com/agentskills/agentskills/blob/main/skills-ref/src/skills_ref/models.py
 */
export interface SkillProperties<TMetadata extends SkillMetadataMap = SkillMetadataMap> {
  name: string;
  description: string;
  license?: string;
  compatibility?: string;
  allowedTools?: SkillAllowedTools;
  metadata?: TMetadata;
}

/**
 * Convert SkillProperties to dictionary, excluding null/undefined values.
 * Matches Python reference implementation's to_dict() behavior.
 *
 * Note: `allowedTools` becomes `allowed-tools` with hyphen
 * Empty metadata object is excluded
 *
 * @param props - JavaScript-friendly skill properties.
 * @returns Spec-keyed frontmatter dictionary.
 * @example
 * ```ts
 * const dict = skillPropertiesToDict({
 *   name: "demo",
 *   description: "Demo skill",
 *   allowedTools: "Read"
 * })
 * // => { name: "demo", description: "Demo skill", "allowed-tools": "Read" }
 * ```
 * @see https://agentskills.io/specification
 * @see https://github.com/agentskills/agentskills/blob/main/skills-ref/src/skills_ref/models.py
 */
export function skillPropertiesToDict<TMetadata extends SkillMetadataMap = SkillMetadataMap>(
  props: SkillProperties<TMetadata>
): SkillFrontmatter<TMetadata> {
  const result: SkillFrontmatter<TMetadata> = {
    name: props.name,
    description: props.description,
  };

  if (props.license !== undefined) {
    result.license = props.license;
  }

  if (props.compatibility !== undefined) {
    result.compatibility = props.compatibility;
  }

  if (props.allowedTools !== undefined) {
    result['allowed-tools'] = props.allowedTools;
  }

  if (props.metadata && Object.keys(props.metadata).length > 0) {
    result.metadata = props.metadata;
  }

  return result;
}

/**
 * Full skill record suitable for storage in an app-owned persistence layer.
 *
 * @example
 * ```ts
 * const file: SkillFile = {
 *   id: "skill_1",
 *   content: "---\nname: demo\ndescription: Demo\n---",
 *   properties: { name: "demo", description: "Demo" },
 *   size: 42,
 *   createdAt: Date.now(),
 *   updatedAt: Date.now()
 * }
 * ```
 * @see https://agentskills.io/specification
 */
export interface SkillFile<TMetadata extends SkillMetadataMap = SkillMetadataMap> {
  id: SkillId;
  content: SkillContent;
  properties: SkillProperties<TMetadata>;
  size: ByteCount;
  createdAt: UnixMillis;
  updatedAt: UnixMillis;
}

/**
 * Lightweight metadata for progressive disclosure.
 * Used in list views and skill selection UI.
 *
 * Progressive disclosure strategy:
 * 1. Metadata (roughly 50-100 tokens): name + description loaded at startup
 * 2. Full content (roughly 500-5000 tokens): loaded when activated
 *
 * @example
 * ```ts
 * const metadata: SkillMetadata = {
 *   id: "skill_1",
 *   name: "demo",
 *   description: "Demo skill",
 *   metadataTokens: 80,
 *   fullTokens: 900,
 *   createdAt: Date.now(),
 *   updatedAt: Date.now()
 * }
 * ```
 * @see https://agentskills.io/specification
 */
export interface SkillMetadata<TMetadata extends SkillMetadataMap = SkillMetadataMap> {
  id: SkillId;
  name: string;
  description: string;
  license?: string;
  compatibility?: string;
  allowedTools?: SkillAllowedTools;
  metadata?: TMetadata;
  metadataTokens: SkillTokenCount;
  fullTokens: SkillTokenCount;
  createdAt: UnixMillis;
  updatedAt: UnixMillis;
}
