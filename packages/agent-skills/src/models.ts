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
 * A single tier-3 resource associated with a skill.
 *
 * Resources are loaded on demand by the host and can originate from
 * `scripts/`, `references/`, or `assets/`.
 *
 * @example
 * ```ts
 * const resource: SkillResource = {
 *   name: "build-pizza",
 *   path: "references/build-pizza",
 *   content: "# Build Pizza\n..."
 * }
 * ```
 * @see https://agentskills.io/specification
 */
export interface SkillResource {
  /** Resource identifier used by read handlers/tool calls. */
  name: string;
  /** Relative resource path from skill root. */
  path: string;
  /** Raw resource file contents. */
  content: string;
}

/**
 * Fully resolved in-memory skill used for progressive disclosure reads.
 *
 * This model intentionally includes only pure data so it can be shared across
 * browser, server, and CLI hosts without coupling to storage or transport.
 *
 * @example
 * ```ts
 * const skill: ResolvedSkill = {
 *   name: "pizza-maker",
 *   description: "Interactive pizza builder",
 *   body: "Use [build-pizza](references/build-pizza)",
 *   resources: [{ name: "build-pizza", path: "references/build-pizza", content: "..." }]
 * }
 * ```
 * @see https://agentskills.io/specification
 */
export interface ResolvedSkill {
  /** Skill identifier from frontmatter. */
  name: SkillFrontmatter['name'];
  /** Skill description from frontmatter. */
  description: SkillFrontmatter['description'];
  /** Tier-2 instruction body from SKILL.md. */
  body: SkillBody;
  /** Tier-3 resources associated with this skill. */
  resources: SkillResource[];
  /** Optional host location label (path/URL/etc). */
  location?: string;
}

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
  /** File name (for example `SKILL.md`). */
  name: string;
  /** File contents. */
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
  /** Required skill identifier. */
  name: string;
  /** Required skill description. */
  description: string;
  /** Optional license declaration. */
  license?: string;
  /** Optional host/runtime compatibility notes. */
  compatibility?: string;
  /** Optional space-delimited allowed-tools declaration. */
  'allowed-tools'?: SkillAllowedTools;
  /** Optional string metadata map. */
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
  /** Parsed spec-keyed frontmatter object. */
  metadata: SkillFrontmatter<TMetadata>;
  /** Markdown body after frontmatter removal. */
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
  /** Parsed camel-cased properties for JS usage. */
  properties: SkillProperties<TMetadata>;
  /** Markdown body after frontmatter removal. */
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
  /** Required skill identifier. */
  name: SkillFrontmatter<TMetadata>['name'];
  /** Required skill description. */
  description: SkillFrontmatter<TMetadata>['description'];
  /** Optional license declaration. */
  license?: SkillFrontmatter<TMetadata>['license'];
  /** Optional host/runtime compatibility notes. */
  compatibility?: SkillFrontmatter<TMetadata>['compatibility'];
  /** Optional space-delimited allowed-tools declaration. */
  allowedTools?: SkillFrontmatter<TMetadata>['allowed-tools'];
  /** Optional string metadata map. */
  metadata?: SkillFrontmatter<TMetadata>['metadata'];
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
  /** Host-owned unique skill id. */
  id: SkillId;
  /** Raw SKILL.md content. */
  content: SkillContent;
  /** Parsed skill properties. */
  properties: SkillProperties<TMetadata>;
  /** Content byte size. */
  size: ByteCount;
  /** Record creation timestamp in milliseconds. */
  createdAt: UnixMillis;
  /** Record update timestamp in milliseconds. */
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
  /** Host-owned unique skill id. */
  id: SkillId;
  /** Skill identifier. */
  name: SkillProperties<TMetadata>['name'];
  /** Skill description. */
  description: SkillProperties<TMetadata>['description'];
  /** Optional license declaration. */
  license?: SkillProperties<TMetadata>['license'];
  /** Optional host/runtime compatibility notes. */
  compatibility?: SkillProperties<TMetadata>['compatibility'];
  /** Optional space-delimited allowed-tools declaration. */
  allowedTools?: SkillProperties<TMetadata>['allowedTools'];
  /** Optional string metadata map. */
  metadata?: SkillProperties<TMetadata>['metadata'];
  /** Estimated token size for metadata-only tier. */
  metadataTokens: SkillTokenCount;
  /** Estimated token size for full skill content. */
  fullTokens: SkillTokenCount;
  /** Record creation timestamp in milliseconds. */
  createdAt: UnixMillis;
  /** Record update timestamp in milliseconds. */
  updatedAt: UnixMillis;
}
