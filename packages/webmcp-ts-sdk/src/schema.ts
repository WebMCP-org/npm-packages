import type {
  CallToolResult,
  ContentBlock,
  StandardSchemaWithJSON,
  JSONValue as JsonValue,
} from '@modelcontextprotocol/server';
import type { InputSchema, WebMcpToolInput, WebMcpToolObjectInput } from './common.js';
import { isPlainObject, serializeInputSchema } from './normalize.js';
import type { StandardJSONSchemaV1, StandardSchemaV1 } from '@standard-schema/spec';

type StandardInputValidatorSchema = StandardSchemaV1<WebMcpToolInput, WebMcpToolInput>;
type StandardInputJsonSchema = StandardJSONSchemaV1<WebMcpToolInput, WebMcpToolInput>;

const DEFAULT_INPUT_SCHEMA: InputSchema = { type: 'object', properties: {} };
const STANDARD_JSON_SCHEMA_TARGETS = ['draft-2020-12', 'draft-07'] as const;

export type ToolInputSchema = InputSchema | StandardInputJsonSchema;

export interface NormalizedInputSchema {
  inputSchema: InputSchema;
  registeredInputSchema?: string;
}

function isJsonObjectRecord(value: unknown): value is WebMcpToolObjectInput {
  if (!isPlainObject(value)) {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function isJsonValue(value: unknown, seen = new WeakSet<object>()): value is JsonValue {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') {
    return true;
  }

  if (typeof value === 'number') {
    return Number.isFinite(value);
  }

  if (typeof value !== 'object') {
    return false;
  }

  if (seen.has(value)) {
    return false;
  }

  seen.add(value);
  try {
    const entries = Array.isArray(value)
      ? value
      : isJsonObjectRecord(value)
        ? Object.values(value)
        : null;
    return entries?.every((entry) => isJsonValue(entry, seen)) ?? false;
  } catch {
    return false;
  } finally {
    seen.delete(value);
  }
}

function isContentBlock(value: unknown): value is ContentBlock {
  if (!isPlainObject(value)) return false;
  switch (value.type) {
    case 'text':
      return typeof value.text === 'string';
    case 'image':
    case 'audio':
      return typeof value.data === 'string' && typeof value.mimeType === 'string';
    case 'resource_link':
      return typeof value.uri === 'string' && typeof value.name === 'string';
    case 'resource': {
      const resource = value.resource;
      return (
        isPlainObject(resource) &&
        typeof resource.uri === 'string' &&
        (typeof resource.text === 'string' || typeof resource.blob === 'string')
      );
    }
    default:
      return false;
  }
}

function isProtocolToolResponse(value: unknown): value is CallToolResult {
  return (
    isPlainObject(value) &&
    isJsonValue(value) &&
    Array.isArray(value.content) &&
    value.content.every(isContentBlock) &&
    (value.isError === undefined || typeof value.isError === 'boolean') &&
    (value._meta === undefined || isPlainObject(value._meta))
  );
}

function serializeTextContent(value: unknown): string {
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
}

export function normalizeToolResponse(value: unknown): CallToolResult {
  if (isProtocolToolResponse(value)) return value;
  const result: CallToolResult = {
    content: [{ type: 'text', text: serializeTextContent(value) }],
    isError: false,
  };
  if (isJsonValue(value)) result.structuredContent = value;
  return result;
}

interface StandardProperties {
  version?: unknown;
  vendor?: unknown;
  validate?: unknown;
  jsonSchema?: unknown;
}

function readStandardProperties(value: unknown): StandardProperties | null {
  if (!isPlainObject(value)) {
    return null;
  }

  const standard = value['~standard'];
  if (!isPlainObject(standard)) {
    return null;
  }

  return standard;
}

function isStandardInputValidatorSchema(value: unknown): value is StandardInputValidatorSchema {
  const standard = readStandardProperties(value);
  return Boolean(standard && standard.version === 1 && typeof standard.validate === 'function');
}

function isStandardInputJsonSchema(value: unknown): value is StandardInputJsonSchema {
  const standard = readStandardProperties(value);
  if (!standard || standard.version !== 1 || !isPlainObject(standard.jsonSchema)) {
    return false;
  }

  return typeof standard.jsonSchema.input === 'function';
}

/** Narrows a Standard Schema that also converts to JSON Schema, as the MCP server requires. */
export function isMcpStandardSchema(
  value: unknown
): value is StandardSchemaWithJSON<WebMcpToolObjectInput> {
  const standard = readStandardProperties(value);
  return Boolean(
    standard &&
    standard.version === 1 &&
    typeof standard.vendor === 'string' &&
    typeof standard.validate === 'function' &&
    isPlainObject(standard.jsonSchema) &&
    typeof standard.jsonSchema.input === 'function' &&
    typeof standard.jsonSchema.output === 'function'
  );
}

function convertStandardInputSchema(schema: StandardInputJsonSchema): InputSchema {
  for (const target of STANDARD_JSON_SCHEMA_TARGETS) {
    try {
      const converted = schema['~standard'].jsonSchema.input({ target });
      const parsed: unknown = JSON.parse(serializeInputSchema(converted));
      if (isPlainObject(parsed)) return parsed;
    } catch {}
  }

  throw new Error('Failed to convert Standard JSON Schema inputSchema to a JSON Schema object');
}

export function normalizeInputSchema(
  inputSchema: ToolInputSchema | undefined
): NormalizedInputSchema {
  if (inputSchema === undefined) {
    return { inputSchema: DEFAULT_INPUT_SCHEMA };
  }

  if (isStandardInputJsonSchema(inputSchema)) {
    const converted = convertStandardInputSchema(inputSchema);
    const registeredInputSchema = serializeInputSchema(converted);
    // Non-enumerable: the MCP server validates with the vendor schema, while JSON
    // metadata and clones stay plain.
    if (isStandardInputValidatorSchema(inputSchema)) {
      Object.defineProperty(converted, '~standard', { value: inputSchema['~standard'] });
    }
    return { inputSchema: converted, registeredInputSchema };
  }

  if (isStandardInputValidatorSchema(inputSchema)) {
    throw new Error(
      'Standard Schema inputSchema must provide ~standard.jsonSchema.input() for tool metadata'
    );
  }

  const registeredInputSchema = serializeInputSchema(inputSchema);
  const jsonSchema: unknown = JSON.parse(registeredInputSchema);
  // Empty {} is valid JSON Schema but lacks type:"object" required by MCP.
  if (!isPlainObject(jsonSchema) || Object.keys(jsonSchema).length === 0) {
    return { inputSchema: DEFAULT_INPUT_SCHEMA, registeredInputSchema };
  }

  return {
    inputSchema: jsonSchema.type === undefined ? { type: 'object', ...jsonSchema } : jsonSchema,
    registeredInputSchema,
  };
}
