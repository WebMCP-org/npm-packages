import type {
  InputSchema,
  JsonValue,
  ToolDescriptor,
  ToolResponse,
  WebMcpToolAnnotations,
} from '@mcp-b/webmcp-types';
import type { StandardJSONSchemaV1, StandardSchemaV1 } from '@standard-schema/spec';
export type { StandardJSONSchemaV1 } from '@standard-schema/spec';

const DEFAULT_INPUT_SCHEMA: InputSchema = { type: 'object', properties: {} };
const FAILED_TO_PARSE_INPUT_ARGUMENTS_MESSAGE = 'Failed to parse input arguments';
const STANDARD_JSON_SCHEMA_TARGETS = ['draft-2020-12', 'draft-07'] as const;
const VALID_TOOL_NAME_RE = /^[A-Za-z0-9_.-]{1,128}$/u;

export type StandardInputValidatorSchema = StandardSchemaV1<
  Record<string, unknown>,
  Record<string, unknown>
>;
export type StandardInputJsonSchema = StandardJSONSchemaV1<
  Record<string, unknown>,
  Record<string, unknown>
>;
export type StandardInputSchema = StandardInputValidatorSchema & StandardInputJsonSchema;
export type ToolInputSchema = InputSchema | StandardInputJsonSchema;

export interface NormalizedInputSchema {
  inputSchema: InputSchema;
  registeredInputSchema?: string;
}

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function toDomString(value: unknown): string {
  if (typeof value === 'symbol') {
    throw new TypeError('Symbol values cannot be converted to a DOMString');
  }
  return String(value);
}

export function coerceWebMcpToolDescriptor(tool: ToolDescriptor): ToolDescriptor {
  if (tool.name === undefined) {
    throw new TypeError('Tool "name" is required');
  }
  if (tool.description === undefined) {
    throw new TypeError('Tool "description" is required');
  }

  const annotations = tool.annotations as unknown;
  const annotationMembers = isPlainObject(annotations) ? annotations : {};

  return {
    ...tool,
    name: toDomString(tool.name),
    ...(tool.title === undefined
      ? {}
      : {
          title: new TextDecoder().decode(new TextEncoder().encode(toDomString(tool.title))),
        }),
    description: toDomString(tool.description),
    ...(annotations === undefined
      ? {}
      : {
          annotations: {
            ...annotationMembers,
            readOnlyHint: Boolean(annotationMembers.readOnlyHint),
            untrustedContentHint: Boolean(annotationMembers.untrustedContentHint),
          },
        }),
  };
}

function isJsonObjectRecord(value: unknown): value is Record<string, unknown> {
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

export function toJsonValue(value: unknown): JsonValue | undefined {
  return isJsonValue(value) ? value : undefined;
}

function isCallToolResult(value: unknown): value is ToolResponse {
  return isPlainObject(value) && Array.isArray(value.content);
}

export function serializeTextContent(value: unknown): string {
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
}

export function normalizeToolResponse(value: unknown): ToolResponse {
  if (isCallToolResult(value)) return value;
  const structuredContent = toJsonValue(value);
  return {
    content: [{ type: 'text', text: serializeTextContent(value) }],
    ...(structuredContent === undefined ? {} : { structuredContent }),
    isError: false,
  };
}

export function createUnknownError(message: string): Error {
  return new DOMException(message, 'UnknownError');
}

export function createInvalidStateError(message: string): Error {
  return new DOMException(message, 'InvalidStateError');
}

export function validateWebMcpToolDescriptor(tool: ToolDescriptor): void {
  if (tool.name === '') {
    throw createInvalidStateError('Tool "name" must be a non-empty string');
  }
  if (typeof tool.name !== 'string' || !VALID_TOOL_NAME_RE.test(tool.name)) {
    throw createInvalidStateError(
      'Tool "name" must be 1–128 characters and contain only ASCII alphanumeric, underscore, hyphen, or period'
    );
  }
  if (typeof tool.description !== 'string' || tool.description.length === 0) {
    throw createInvalidStateError('Tool "description" must be a non-empty string');
  }
  if (typeof tool.execute !== 'function') {
    throw new TypeError('Tool "execute" must be a function');
  }
}

export function toWebMcpAnnotations(
  annotations: NonNullable<ToolDescriptor['annotations']>
): WebMcpToolAnnotations {
  return {
    readOnlyHint: annotations.readOnlyHint ?? false,
    untrustedContentHint: annotations.untrustedContentHint ?? false,
  };
}

export function parseChromeToolInput(input: string): Record<string, unknown> {
  try {
    const value = JSON.parse(input) as unknown;
    if (value !== null && typeof value === 'object') {
      return value as Record<string, unknown>;
    }
  } catch {
    // Chrome reports invalid JSON and non-object inputs as UnknownError.
  }
  throw createUnknownError(FAILED_TO_PARSE_INPUT_ARGUMENTS_MESSAGE);
}

export function serializeChromeToolResult(value: unknown): string {
  if ((typeof value === 'object' && value !== null) || typeof value === 'function') {
    const serialized = JSON.stringify(value);
    if (serialized) return serialized;
  }
  return String(value) || 'Operation succeeded';
}

export function withRegistrationLifetime<T>(
  operation: Promise<T>,
  signal?: AbortSignal
): Promise<T> {
  if (!signal) return operation;
  if (signal.aborted) return Promise.reject(createUnknownError('Tool unregistered'));

  return new Promise<T>((resolve, reject) => {
    const unregister = () => reject(createUnknownError('Tool unregistered'));
    signal.addEventListener('abort', unregister, { once: true });
    operation.then(
      (value) => {
        signal.removeEventListener('abort', unregister);
        resolve(value);
      },
      (error: unknown) => {
        signal.removeEventListener('abort', unregister);
        reject(error);
      }
    );
  });
}

export function withAbortSignal<T>(operation: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return operation;

  signal.throwIfAborted();
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
      (error: unknown) => {
        cleanup();
        reject(error);
      }
    );
  });
}

function isPotentiallyTrustworthyOrigin(url: URL): boolean {
  const originUrl = url.origin === 'null' ? url : new URL(url.origin);
  const protocol = originUrl.protocol;
  if (['https:', 'wss:', 'file:', 'chrome-extension:', 'moz-extension:'].includes(protocol)) {
    return true;
  }

  const hostname = originUrl.hostname.toLowerCase();
  const ipv4 = hostname.split('.');
  const isLoopbackIpv4 =
    ipv4.length === 4 &&
    ipv4.every((part) => /^\d{1,3}$/u.test(part) && Number(part) <= 255) &&
    Number(ipv4[0]) === 127;
  return (
    hostname === '::1' ||
    hostname === '[::1]' ||
    hostname === 'localhost' ||
    hostname === 'localhost.' ||
    hostname.endsWith('.localhost') ||
    hostname.endsWith('.localhost.') ||
    isLoopbackIpv4
  );
}

export function validatePotentiallyTrustworthyOrigins(
  origins: readonly string[] | undefined
): void {
  for (const origin of origins ?? []) {
    let parsed: URL;
    try {
      parsed = new URL(origin);
    } catch {
      throw new DOMException(`Invalid or untrustworthy origin: ${String(origin)}`, 'SecurityError');
    }
    if (!isPotentiallyTrustworthyOrigin(parsed)) {
      throw new DOMException(`Invalid or untrustworthy origin: ${origin}`, 'SecurityError');
    }
  }
}

export function validateOriginAgentCluster(): void {
  if (
    (globalThis as { originAgentCluster?: boolean }).originAgentCluster === false &&
    globalThis.location?.protocol !== 'file:'
  ) {
    throw new DOMException('', 'SecurityError');
  }
}

export function validateExecutableOrigin(origin: unknown): void {
  try {
    if (new URL(String(origin)).origin !== 'null') return;
  } catch {
    // Invalid and opaque origins share the WebMCP NotSupportedError result.
  }
  throw new DOMException(`Unsupported tool origin: ${String(origin)}`, 'NotSupportedError');
}

function getStandardProps(value: unknown): Record<string, unknown> | null {
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
  const standard = getStandardProps(value);
  return Boolean(standard && standard.version === 1 && typeof standard.validate === 'function');
}

function isStandardInputJsonSchema(value: unknown): value is StandardInputJsonSchema {
  const standard = getStandardProps(value);
  if (!standard || standard.version !== 1 || !isPlainObject(standard.jsonSchema)) {
    return false;
  }

  return typeof standard.jsonSchema.input === 'function';
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
  const failures: Array<{ error: unknown; target: (typeof STANDARD_JSON_SCHEMA_TARGETS)[number] }> =
    [];

  for (const target of STANDARD_JSON_SCHEMA_TARGETS) {
    try {
      const converted = schema['~standard'].jsonSchema.input({ target });
      const serialized = serializeInputSchema(converted);
      const parsed = JSON.parse(serialized);
      if (!isPlainObject(parsed)) throw new TypeError('inputSchema must serialize to an object');
      return parsed as InputSchema;
    } catch (error) {
      failures.push({ target, error });
    }
  }

  console.warn('[WebMCPPolyfill] Standard JSON Schema conversion failed:', failures);
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

  if (
    inputSchema === null ||
    (typeof inputSchema !== 'object' && typeof inputSchema !== 'function')
  ) {
    throw new TypeError('inputSchema must be an object');
  }
  const registeredInputSchema = serializeInputSchema(inputSchema);
  const serializedValue = JSON.parse(registeredInputSchema) as unknown;
  const jsonSchema = isPlainObject(serializedValue) ? (serializedValue as InputSchema) : undefined;

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

function serializeInputSchema(schema: unknown): string {
  const serialized = JSON.stringify(schema);
  if (serialized === undefined) {
    throw new TypeError('inputSchema must be JSON-serializable');
  }
  return serialized;
}
