import type {
  CallToolResult,
  ContentBlock,
  StandardSchemaWithJSON,
  JSONValue as JsonValue,
} from '@modelcontextprotocol/server';
import type { InputSchema, WebMcpToolInput, WebMcpToolObjectInput } from './common.js';
import type { ToolDescriptor } from './tool.js';
import type { StandardJSONSchemaV1, StandardSchemaV1 } from '@standard-schema/spec';

type StandardInputValidatorSchema = StandardSchemaV1<WebMcpToolInput, WebMcpToolInput>;
type StandardInputJsonSchema = StandardJSONSchemaV1<WebMcpToolInput, WebMcpToolInput>;

const DEFAULT_INPUT_SCHEMA: InputSchema = { type: 'object', properties: {} };
const STANDARD_JSON_SCHEMA_TARGETS = ['draft-2020-12', 'draft-07'] as const;
const VALID_TOOL_NAME_RE = /^[A-Za-z0-9_.-]{1,128}$/u;

export type ToolInputSchema = InputSchema | StandardInputJsonSchema;

export interface NormalizedInputSchema {
  inputSchema: InputSchema;
  registeredInputSchema?: string;
}

/** Narrows a non-null, non-array object to WebMCP's tool callback input. */
export function isPlainObject(value: unknown): value is WebMcpToolObjectInput {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isWebIdlObject(value: unknown): value is object {
  return value !== null && (typeof value === 'object' || typeof value === 'function');
}

function toDomString(value: unknown): string {
  if (typeof value === 'symbol') {
    throw new TypeError('Symbol values cannot be converted to a DOMString');
  }
  return String(value);
}

/** Unconverted Web IDL tool members; each is coerced or validated before invocation. */
export interface ToolRegistrationDictionary {
  name?: unknown;
  description?: unknown;
  title?: unknown;
  annotations?: unknown;
  inputSchema?: ToolDescriptor<WebMcpToolInput>['inputSchema'];
  outputSchema?: ToolDescriptor<WebMcpToolInput>['outputSchema'];
  execute?: unknown;
}

export function coerceWebMcpToolDescriptor(
  tool: ToolRegistrationDictionary
): ToolDescriptor<WebMcpToolInput> {
  const name = tool.name;
  const description = tool.description;
  const title = tool.title;
  if (name === undefined) {
    throw new TypeError('Tool "name" is required');
  }
  if (description === undefined) {
    throw new TypeError('Tool "description" is required');
  }

  const annotations = tool.annotations;
  const annotationMembers = isPlainObject(annotations) ? annotations : {};
  const inputSchema = tool.inputSchema;
  const outputSchema = tool.outputSchema;
  const execute = tool.execute;

  const coercedName = toDomString(name);
  const coercedTitle = title === undefined ? undefined : toDomString(title).toWellFormed();
  const coercedDescription = toDomString(description);
  const invocation = { name: coercedName, description: coercedDescription, execute };
  const descriptor: Omit<ToolDescriptor<WebMcpToolInput>, 'execute'> & { execute: unknown } =
    invocation;
  if (coercedTitle !== undefined) descriptor.title = coercedTitle;
  if (inputSchema !== undefined) descriptor.inputSchema = inputSchema;
  if (outputSchema !== undefined) descriptor.outputSchema = outputSchema;
  if (annotations !== undefined) {
    const normalized: ToolDescriptor<WebMcpToolInput>['annotations'] = {
      readOnlyHint: false,
      untrustedContentHint: false,
    };
    if (annotationMembers.title !== undefined) {
      normalized.title = toDomString(annotationMembers.title).toWellFormed();
    }
    normalized.readOnlyHint = Boolean(annotationMembers.readOnlyHint);
    for (const name of ['destructiveHint', 'idempotentHint', 'openWorldHint'] as const) {
      if (annotationMembers[name] !== undefined)
        normalized[name] = Boolean(annotationMembers[name]);
    }
    normalized.untrustedContentHint = Boolean(annotationMembers.untrustedContentHint);
    for (const name of ['consequentialHint', 'debugging'] as const) {
      if (annotationMembers[name] !== undefined)
        normalized[name] = Boolean(annotationMembers[name]);
    }
    descriptor.annotations = normalized;
  }
  validateWebMcpToolDescriptor(descriptor);
  return descriptor;
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

export function createInvalidStateError(message: string): Error {
  return new DOMException(message, 'InvalidStateError');
}

export function validateWebMcpToolDescriptor<
  T extends { name: string; description: string; execute: unknown },
>(tool: T): asserts tool is T & { execute: ToolDescriptor<WebMcpToolInput>['execute'] } {
  if (tool.name === '') {
    throw createInvalidStateError('Tool "name" must be a non-empty string');
  }
  if (!VALID_TOOL_NAME_RE.test(tool.name)) {
    throw createInvalidStateError(
      'Tool "name" must be 1–128 characters and contain only ASCII alphanumeric, underscore, hyphen, or period'
    );
  }
  if (tool.description.length === 0) {
    throw createInvalidStateError('Tool "description" must be a non-empty string');
  }
  if (typeof tool.execute !== 'function') {
    throw new TypeError('Tool "execute" must be a function');
  }
}

export function withAbortSignal<T>(operation: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(signal.reason);
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => {
      cleanup();
      reject(signal.reason);
    };
    const cleanup = () => signal.removeEventListener('abort', onAbort);

    signal.addEventListener('abort', onAbort, { once: true });
    operation.then(
      (value) => {
        cleanup();
        resolve(value);
      },
      (error: ErrorOptions['cause']) => {
        cleanup();
        reject(error);
      }
    );
  });
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

function preserveStandardSchema(
  inputSchema: InputSchema,
  standardSchema: StandardInputValidatorSchema
): InputSchema {
  const normalized = { ...inputSchema };
  Object.defineProperty(normalized, '~standard', {
    value: standardSchema['~standard'],
  });
  return normalized;
}

function convertStandardInputSchema(schema: StandardInputJsonSchema): InputSchema {
  for (const target of STANDARD_JSON_SCHEMA_TARGETS) {
    try {
      const converted = schema['~standard'].jsonSchema.input({ target });
      const serialized = serializeInputSchema(converted);
      const parsed: unknown = JSON.parse(serialized);
      if (!isPlainObject(parsed)) throw new TypeError('inputSchema must serialize to an object');
      return parsed;
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
    return {
      inputSchema: isStandardInputValidatorSchema(inputSchema)
        ? preserveStandardSchema(converted, inputSchema)
        : converted,
      registeredInputSchema,
    };
  }

  if (isStandardInputValidatorSchema(inputSchema)) {
    throw new Error(
      'Standard Schema inputSchema must provide ~standard.jsonSchema.input() for tool metadata'
    );
  }

  if (!isWebIdlObject(inputSchema)) {
    throw new TypeError('inputSchema must be an object');
  }
  const registeredInputSchema = serializeInputSchema(inputSchema);
  const serializedValue: unknown = JSON.parse(registeredInputSchema);
  const jsonSchema = isPlainObject(serializedValue) ? serializedValue : undefined;

  // Empty {} is valid JSON Schema but lacks type:"object" required by MCP.
  if (!jsonSchema || Object.keys(jsonSchema).length === 0) {
    return {
      inputSchema: DEFAULT_INPUT_SCHEMA,
      registeredInputSchema,
    };
  }

  const normalizedSchema: InputSchema =
    jsonSchema.type === undefined ? { type: 'object', ...jsonSchema } : jsonSchema;
  return {
    inputSchema: normalizedSchema,
    registeredInputSchema,
  };
}

export function serializeInputSchema(schema: unknown): string {
  if (!isWebIdlObject(schema)) {
    throw new TypeError('inputSchema must be an object');
  }
  const serialized = JSON.stringify(schema);
  if (serialized === undefined) {
    throw new TypeError('inputSchema must be JSON-serializable');
  }
  return serialized;
}
