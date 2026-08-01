import type {
  CallToolResult,
  InputSchema,
  JsonValue,
  ToolDescriptor,
  WebMcpToolInput,
  WebMcpToolAnnotations,
} from '@mcp-b/webmcp-types';
import type { StandardJSONSchemaV1, StandardSchemaV1 } from '@standard-schema/spec';

type StandardInputValidatorSchema = StandardSchemaV1<WebMcpToolInput, WebMcpToolInput>;
type StandardInputJsonSchema = StandardJSONSchemaV1<WebMcpToolInput, WebMcpToolInput>;

const DEFAULT_INPUT_SCHEMA: InputSchema = { type: 'object', properties: {} };
const FAILED_TO_PARSE_INPUT_ARGUMENTS_MESSAGE = 'Failed to parse input arguments';
const TOOL_INVOCATION_FAILED_MESSAGE =
  'Tool was executed but the invocation failed. For example, the script function threw an error';
const STANDARD_JSON_SCHEMA_TARGETS = ['draft-2020-12', 'draft-07'] as const;
const VALID_TOOL_NAME_RE = /^[A-Za-z0-9_.-]{1,128}$/u;

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

export function coerceWebMcpToolDescriptor<TArgs extends WebMcpToolInput>(
  tool: ToolDescriptor<TArgs>
): ToolDescriptor<TArgs>;
export function coerceWebMcpToolDescriptor(
  tool: Record<string, unknown>
): ToolDescriptor<WebMcpToolInput>;
export function coerceWebMcpToolDescriptor(tool: object): ToolDescriptor<WebMcpToolInput> {
  const name = Reflect.get(tool, 'name') as unknown;
  const description = Reflect.get(tool, 'description') as unknown;
  const title = Reflect.get(tool, 'title') as unknown;
  if (name === undefined) {
    throw new TypeError('Tool "name" is required');
  }
  if (description === undefined) {
    throw new TypeError('Tool "description" is required');
  }

  const annotations: unknown = Reflect.get(tool, 'annotations');
  const annotationMembers = isPlainObject(annotations) ? annotations : {};
  const inputSchema: unknown = Reflect.get(tool, 'inputSchema');
  const outputSchema: unknown = Reflect.get(tool, 'outputSchema');
  const execute: unknown = Reflect.get(tool, 'execute');

  // Web IDL dictionaries read known members without retaining the caller's object.
  return {
    name: toDomString(name),
    ...(title === undefined
      ? {}
      : {
          title: toDomString(title).toWellFormed(),
        }),
    description: toDomString(description),
    ...(inputSchema === undefined ? {} : { inputSchema }),
    ...(outputSchema === undefined ? {} : { outputSchema }),
    execute,
    ...(annotations === undefined
      ? {}
      : {
          annotations: {
            ...(annotationMembers.title === undefined
              ? {}
              : { title: toDomString(annotationMembers.title).toWellFormed() }),
            readOnlyHint: Boolean(annotationMembers.readOnlyHint),
            ...(annotationMembers.destructiveHint === undefined
              ? {}
              : { destructiveHint: Boolean(annotationMembers.destructiveHint) }),
            ...(annotationMembers.idempotentHint === undefined
              ? {}
              : { idempotentHint: Boolean(annotationMembers.idempotentHint) }),
            ...(annotationMembers.openWorldHint === undefined
              ? {}
              : { openWorldHint: Boolean(annotationMembers.openWorldHint) }),
            untrustedContentHint: Boolean(annotationMembers.untrustedContentHint),
          },
        }),
  } as ToolDescriptor<WebMcpToolInput>;
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

function toJsonValue(value: unknown): JsonValue | undefined {
  return isJsonValue(value) ? value : undefined;
}

function hasCallToolResultShape(
  value: unknown
): value is Record<string, unknown> & { content: unknown[] } {
  return isPlainObject(value) && Array.isArray(value.content);
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
  // Preserve protocol-evolving content blocks at this compatibility boundary.
  if (hasCallToolResultShape(value)) return value as CallToolResult;
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

export function createToolInvocationFailedError(error: unknown): Error {
  return createUnknownError(
    error instanceof Error
      ? `${TOOL_INVOCATION_FAILED_MESSAGE}: ${error.message}`
      : TOOL_INVOCATION_FAILED_MESSAGE
  );
}

export function createInvalidStateError(message: string): Error {
  return new DOMException(message, 'InvalidStateError');
}

export function validateWebMcpToolDescriptor<TArgs extends WebMcpToolInput>(
  tool: ToolDescriptor<TArgs>
): void {
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

export function toWebMcpAnnotations(annotations: WebMcpToolAnnotations): WebMcpToolAnnotations {
  return {
    readOnlyHint: annotations.readOnlyHint ?? false,
    untrustedContentHint: annotations.untrustedContentHint ?? false,
  };
}

export function parseChromeToolInput(input: string): WebMcpToolInput {
  try {
    const value: unknown = JSON.parse(input);
    if (Array.isArray(value) || isPlainObject(value)) return value;
  } catch {
    // Chrome reports invalid JSON and non-object inputs as UnknownError.
  }
  throw createUnknownError(FAILED_TO_PARSE_INPUT_ARGUMENTS_MESSAGE);
}

export function serializeChromeToolResult(value: unknown): string {
  if ((typeof value === 'object' && value !== null) || typeof value === 'function') {
    try {
      const serialized = JSON.stringify(value);
      if (serialized) return serialized;
    } catch {
      // Chromium falls back to string conversion when JSON serialization fails.
    }
  }
  return String(value) || 'Operation succeeded';
}

export function withAbortSignal<T>(
  operation: Promise<T>,
  signal?: AbortSignal,
  getAbortReason: () => unknown = () => signal?.reason
): Promise<T> {
  if (!signal) return operation;
  if (signal.aborted) return Promise.reject(getAbortReason());
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => {
      cleanup();
      reject(getAbortReason());
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

export function validateWebMcpAccess(ownerDocument: Document | null): void {
  validateOriginAgentCluster();
  if (!ownerDocument) return;

  const DOMExceptionConstructor = ownerDocument.defaultView?.DOMException ?? DOMException;
  let fullyActive = false;
  try {
    const ownerWindow = ownerDocument.defaultView;
    fullyActive = Boolean(ownerWindow && ownerWindow.document === ownerDocument);
  } catch {
    // A navigated cross-origin WindowProxy is not the document's active window.
  }
  if (!fullyActive) {
    throw new DOMExceptionConstructor(
      'The associated document is not fully active',
      'InvalidStateError'
    );
  }

  const policy: unknown =
    Reflect.get(ownerDocument, 'permissionsPolicy') ?? Reflect.get(ownerDocument, 'featurePolicy');
  if (policy && typeof policy === 'object') {
    const features = Reflect.get(policy, 'features');
    const allowsFeature = Reflect.get(policy, 'allowsFeature');
    if (typeof features === 'function' && typeof allowsFeature === 'function') {
      const supported: unknown = Reflect.apply(features, policy, []);
      if (Array.isArray(supported) && supported.includes('tools')) {
        if (Reflect.apply(allowsFeature, policy, ['tools']) === true) return;
        throw new DOMExceptionConstructor(
          'WebMCP is disabled by Permissions Policy',
          'NotAllowedError'
        );
      }
    }
  }

  const ownerWindow = ownerDocument.defaultView;
  if (!ownerWindow || ownerWindow.parent === ownerWindow) return;
  try {
    void ownerWindow.parent.document;
    return;
  } catch {
    // Without native policy support, cross-origin frames fail closed.
  }
  throw new DOMExceptionConstructor(
    'WebMCP in cross-origin frames requires native Permissions Policy support',
    'NotAllowedError'
  );
}

export function validateOriginAgentCluster(): void {
  if (globalThis.originAgentCluster === false && globalThis.location?.protocol !== 'file:') {
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
  for (const target of STANDARD_JSON_SCHEMA_TARGETS) {
    try {
      const converted = schema['~standard'].jsonSchema.input({ target });
      const serialized = serializeInputSchema(converted);
      const parsed: unknown = JSON.parse(serialized);
      if (!isPlainObject(parsed)) throw new TypeError('inputSchema must serialize to an object');
      return parsed as InputSchema;
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

  if (
    inputSchema === null ||
    (typeof inputSchema !== 'object' && typeof inputSchema !== 'function')
  ) {
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
  if (schema === null || (typeof schema !== 'object' && typeof schema !== 'function')) {
    throw new TypeError('inputSchema must be an object');
  }
  const serialized = JSON.stringify(schema);
  if (serialized === undefined) {
    throw new TypeError('inputSchema must be JSON-serializable');
  }
  return serialized;
}
