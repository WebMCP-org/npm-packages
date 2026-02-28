/**
 * YAML frontmatter parsing for SKILL.md files
 *
 * Reference: https://agentskills.io/specification
 * Reference Implementation: https://github.com/agentskills/agentskills/blob/main/skills-ref/src/skills_ref/parser.py
 */

import type { Document, Scalar, YAMLMap } from 'yaml';
import YAML from 'yaml';
import { ParseError, ValidationError } from './errors.js';
import type {
  SkillBody,
  SkillContent,
  SkillContentEntry,
  SkillFrontmatter,
  SkillFrontmatterParseResult,
  SkillMetadataMap,
  SkillParseResult,
  SkillProperties,
} from './models.js';
import { entriesToRecord } from './utils/objects.js';

const FRONTMATTER_DELIMITER = '---';
const FIELD_NAME = 'name';
const FIELD_DESCRIPTION = 'description';

/**
 * Checks whether a value is a non-array object record.
 *
 * @param value - Candidate value.
 * @returns `true` when the value is an object record.
 */
const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
};

/**
 * Checks whether a YAML node is a scalar.
 *
 * @param value - Candidate YAML AST node.
 * @returns `true` when the node is a scalar.
 */
const isScalarNode = (value: unknown): value is Scalar => {
  return YAML.isScalar(value);
};

/**
 * Checks whether a YAML node is a map.
 *
 * @param value - Candidate YAML AST node.
 * @returns `true` when the node is a map.
 */
const isMapNode = (value: unknown): value is YAMLMap => {
  return YAML.isMap(value);
};

/**
 * Checks whether a value is a string.
 *
 * @param value - Candidate value.
 * @returns `true` when the value is a string.
 */
const isString = (value: unknown): value is string => typeof value === 'string';

/**
 * Narrows unknown values to metadata maps with string values.
 *
 * @param value - Candidate value.
 * @returns `true` when the value is a string map.
 */
const isMetadataMap = <TMetadata extends SkillMetadataMap>(value: unknown): value is TMetadata => {
  if (!isRecord(value)) {
    return false;
  }
  return Object.values(value).every(isString);
};

/**
 * Extracts an optional string field from raw YAML frontmatter.
 *
 * @param value - Candidate value.
 * @returns The string value when present, otherwise `undefined`.
 */
const optionalString = (value: unknown): string | undefined => {
  return isString(value) ? value : undefined;
};

/**
 * Validates a required trimmed string field.
 *
 * @param metadata - Parsed frontmatter object.
 * @param field - Required field name.
 * @returns Trimmed field value.
 * @throws {ValidationError} If the field is missing or not a non-empty string.
 */
const readRequiredTrimmedString = (
  metadata: Record<string, unknown>,
  field: typeof FIELD_NAME | typeof FIELD_DESCRIPTION
): string => {
  if (!(field in metadata)) {
    throw new ValidationError(`Missing required field in frontmatter: ${field}`);
  }

  const value = metadata[field];
  if (!isString(value) || !value.trim()) {
    throw new ValidationError(`Field '${field}' must be a non-empty string`);
  }

  return value.trim();
};

/**
 * Converts parsed YAML metadata into the typed frontmatter model.
 *
 * @param metadataObject - Raw frontmatter object.
 * @param metadataMap - Normalized metadata string map from the YAML AST.
 * @returns Typed frontmatter representation.
 */
const toSkillFrontmatter = <TMetadata extends SkillMetadataMap>(
  metadataObject: Record<string, unknown>,
  metadataMap: SkillMetadataMap | null
): SkillFrontmatter<TMetadata> & Record<string, unknown> => {
  const normalizedFrontmatter: SkillFrontmatter<TMetadata> = {
    name: readRequiredTrimmedString(metadataObject, FIELD_NAME),
    description: readRequiredTrimmedString(metadataObject, FIELD_DESCRIPTION),
  };

  const frontmatter: SkillFrontmatter<TMetadata> & Record<string, unknown> = {
    ...metadataObject,
    ...normalizedFrontmatter,
  };

  const license = optionalString(metadataObject.license);
  if (license !== undefined) {
    frontmatter.license = license;
  }

  const compatibility = optionalString(metadataObject.compatibility);
  if (compatibility !== undefined) {
    frontmatter.compatibility = compatibility;
  }

  const allowedTools = optionalString(metadataObject['allowed-tools']);
  if (allowedTools !== undefined) {
    frontmatter['allowed-tools'] = allowedTools;
  }

  if (metadataMap !== null && isMetadataMap<TMetadata>(metadataMap)) {
    frontmatter.metadata = metadataMap;
  }

  return frontmatter;
};

/**
 * Converts a YAML scalar to the canonical metadata string form.
 *
 * @param value - Scalar node from the metadata map.
 * @returns String representation matching `skills-ref` behavior.
 */
const formatMetadataScalar = (value: Scalar): string => {
  const scalarValue = value.value;

  if (typeof scalarValue === 'number') {
    return typeof value.source === 'string' ? value.source : String(scalarValue);
  }

  if (typeof scalarValue === 'boolean') {
    return scalarValue ? 'True' : 'False';
  }

  if (scalarValue === null) {
    return 'None';
  }

  // YAML scalars are always string, number, boolean, or null
  return String(scalarValue);
};

/**
 * Extracts and string-normalizes the `metadata` map from a YAML document AST.
 *
 * @param document - Parsed YAML document.
 * @returns A metadata map when present; otherwise `null`.
 */
const extractMetadataStringMap = (document: Document.Parsed): SkillMetadataMap | null => {
  const root = document.contents;
  if (!isMapNode(root)) {
    return null;
  }

  const metadataPair = root.items.find((pair) => {
    return isScalarNode(pair.key) && pair.key.value === 'metadata';
  });

  if (!metadataPair || !isMapNode(metadataPair.value)) {
    return null;
  }

  const entries: Array<[string, string]> = [];
  for (const item of metadataPair.value.items) {
    if (!isScalarNode(item.key)) {
      continue;
    }
    const key = String(item.key.value);
    const valueNode = item.value;

    if (valueNode === null) {
      entries.push([key, '']);
      continue;
    }

    if (isScalarNode(valueNode)) {
      entries.push([key, formatMetadataScalar(valueNode)]);
      continue;
    }

    entries.push([key, String(valueNode.toJSON())]);
  }

  return entriesToRecord(entries);
};

/**
 * Finds SKILL.md in a list of file entries, preferring uppercase over lowercase.
 *
 * @param files - File entries from any storage backend.
 * @returns The selected `SKILL.md` entry, or `null` when not found.
 * @example
 * ```ts
 * const entry = findSkillMdFile([
 *   { name: "skill.md", content: "..." },
 *   { name: "SKILL.md", content: "..." }
 * ])
 * ```
 * @see https://agentskills.io/specification
 * @see https://github.com/agentskills/agentskills/blob/main/skills-ref/src/skills_ref/parser.py
 */
export function findSkillMdFile<T extends { name: string }>(files: Iterable<T>): T | null {
  let lowercaseMatch: T | null = null;

  for (const file of files) {
    if (file.name === 'SKILL.md') {
      return file;
    }
    if (file.name === 'skill.md') {
      lowercaseMatch = file;
    }
  }

  return lowercaseMatch;
}

/**
 * Reads and parses the SKILL.md content from an in-memory file list.
 * The lookup mirrors the reference behavior by preferring SKILL.md over skill.md.
 *
 * @param files - File entries that may contain `SKILL.md`.
 * @param options - Optional location label for parse errors.
 * @returns Parsed `SkillProperties`.
 * @throws {ParseError} If `SKILL.md` cannot be located.
 * @throws {ValidationError} If required frontmatter fields are missing or invalid.
 * @example
 * ```ts
 * const properties = readSkillProperties([
 *   { name: "SKILL.md", content: "---\nname: demo\ndescription: Demo\n---" }
 * ])
 * ```
 * @see https://agentskills.io/specification
 * @see https://github.com/agentskills/agentskills/blob/main/skills-ref/src/skills_ref/parser.py
 */
export function readSkillProperties<T extends SkillContentEntry>(
  files: Iterable<T>,
  options: { location?: string } = {}
): SkillProperties {
  const skillFile = findSkillMdFile(files);
  if (!skillFile) {
    const locationLabel = options.location ? ` in ${options.location}` : '';
    throw new ParseError(`SKILL.md not found${locationLabel}`);
  }

  const { properties } = parseSkillContent(skillFile.content);
  return properties;
}

/**
 * Converts hyphenated frontmatter keys into a JS-friendly properties shape.
 *
 * @param metadata - Parsed frontmatter using spec keys.
 * @returns Camel-cased `SkillProperties` representation.
 * @example
 * ```ts
 * const properties = frontmatterToProperties({
 *   name: "demo",
 *   description: "Demo skill",
 *   "allowed-tools": "Bash(git:*)"
 * })
 * ```
 * @see https://agentskills.io/specification
 * @see https://github.com/agentskills/agentskills/blob/main/skills-ref/src/skills_ref/models.py
 */
export function frontmatterToProperties<TMetadata extends SkillMetadataMap = SkillMetadataMap>(
  metadata: SkillFrontmatter<TMetadata>
): SkillProperties<TMetadata> {
  return {
    name: metadata.name,
    description: metadata.description,
    license: metadata.license,
    compatibility: metadata.compatibility,
    allowedTools: metadata['allowed-tools'],
    metadata: metadata.metadata,
  };
}

/**
 * Parse YAML frontmatter from SKILL.md content.
 *
 * @param content - Raw content of SKILL.md file
 * @returns Parsed frontmatter metadata and trimmed markdown body.
 * @throws {ParseError} If frontmatter is missing or invalid
 * @throws {ValidationError} If required fields are missing or invalid
 * @example
 * ```ts
 * const { metadata, body } = parseFrontmatter(`---
 * name: demo
 * description: Demo skill
 * ---
 * # Instructions`)
 * ```
 * @see https://agentskills.io/specification
 * @see https://github.com/agentskills/agentskills/blob/main/skills-ref/src/skills_ref/parser.py
 *
 * Spec: https://agentskills.io/specification
 * - File must start with `---`
 * - Frontmatter must be closed with second `---`
 * - YAML must be valid mapping (object)
 * - Required fields: name, description
 * - Required fields must be non-empty strings
 */
export function parseFrontmatter<TMetadata extends SkillMetadataMap = SkillMetadataMap>(
  content: SkillContent
): SkillFrontmatterParseResult<TMetadata> {
  if (!content.startsWith(FRONTMATTER_DELIMITER)) {
    throw new ParseError('SKILL.md must start with YAML frontmatter (---)');
  }

  const firstDelimiter = content.indexOf(FRONTMATTER_DELIMITER);
  const secondDelimiter = content.indexOf(FRONTMATTER_DELIMITER, firstDelimiter + 3);

  if (secondDelimiter === -1) {
    throw new ParseError('SKILL.md frontmatter not properly closed with ---');
  }

  const frontmatterStr = content.substring(firstDelimiter + 3, secondDelimiter);
  const body = content.substring(secondDelimiter + 3).trim();

  const document = YAML.parseDocument(frontmatterStr, { keepSourceTokens: true });
  if (document.errors.length > 0) {
    const errorMessage = document.errors.at(0)?.message ?? 'Unknown YAML parse error';
    throw new ParseError(`Invalid YAML in frontmatter: ${errorMessage}`);
  }

  const rawMetadata = document.toJSON();

  if (!isRecord(rawMetadata)) {
    throw new ParseError('SKILL.md frontmatter must be a YAML mapping');
  }

  const metadataObject = rawMetadata;
  const metadataMap =
    'metadata' in metadataObject && isRecord(metadataObject.metadata)
      ? extractMetadataStringMap(document)
      : null;

  return { metadata: toSkillFrontmatter<TMetadata>(metadataObject, metadataMap), body };
}

/**
 * Extract markdown body from SKILL.md content (strips frontmatter).
 *
 * @param content - Raw content of SKILL.md file
 * @returns Markdown body without frontmatter
 * @example
 * ```ts
 * const body = extractBody(`---\nname: demo\ndescription: Demo\n---\n# Body`)
 * ```
 * @see https://agentskills.io/specification
 * @see https://github.com/agentskills/agentskills/blob/main/skills-ref/src/skills_ref/parser.py
 *
 * If content doesn't have valid frontmatter, returns the content as-is.
 */
export function extractBody(content: SkillContent): SkillBody {
  if (!content.startsWith(FRONTMATTER_DELIMITER)) {
    return content.trim();
  }

  const firstDelimiter = content.indexOf(FRONTMATTER_DELIMITER);
  const secondDelimiter = content.indexOf(FRONTMATTER_DELIMITER, firstDelimiter + 3);

  if (secondDelimiter === -1) {
    return content.trim();
  }

  return content.substring(secondDelimiter + 3).trim();
}

/**
 * Parse SKILL.md content into SkillProperties.
 *
 * @param content - Raw content of SKILL.md file
 * @returns SkillProperties with parsed metadata and body
 * @throws {ParseError} If SKILL.md has invalid format
 * @throws {ValidationError} If required fields are missing
 * @example
 * ```ts
 * const parsed = parseSkillContent(`---
 * name: demo
 * description: Demo skill
 * ---
 * # Instructions`)
 * ```
 * @see https://agentskills.io/specification
 * @see https://github.com/agentskills/agentskills/blob/main/skills-ref/src/skills_ref/parser.py
 *
 * Spec: https://agentskills.io/specification
 */
export function parseSkillContent<TMetadata extends SkillMetadataMap = SkillMetadataMap>(
  content: SkillContent
): SkillParseResult<TMetadata> {
  const { metadata, body } = parseFrontmatter<TMetadata>(content);

  return { properties: frontmatterToProperties(metadata), body };
}
