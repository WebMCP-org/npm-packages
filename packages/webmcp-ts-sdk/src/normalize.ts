import type { WebMcpToolInput, WebMcpToolObjectInput } from './common.js';
import type { ToolAnnotations, ToolDescriptor } from './tool.js';

const VALID_TOOL_NAME_RE = /^[A-Za-z0-9_.-]{1,128}$/u;

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
  const { name, description, title } = tool;
  if (name === undefined) {
    throw new TypeError('Tool "name" is required');
  }
  if (description === undefined) {
    throw new TypeError('Tool "description" is required');
  }
  const { annotations, inputSchema, outputSchema, execute } = tool;

  const coercedName = toDomString(name);
  const coercedTitle = title === undefined ? undefined : toDomString(title).toWellFormed();
  const descriptor: Omit<ToolDescriptor<WebMcpToolInput>, 'execute'> & { execute: unknown } = {
    name: coercedName,
    description: toDomString(description),
    execute,
  };
  if (coercedTitle !== undefined) descriptor.title = coercedTitle;
  if (inputSchema !== undefined) descriptor.inputSchema = inputSchema;
  if (outputSchema !== undefined) descriptor.outputSchema = outputSchema;
  if (annotations !== undefined) {
    const members = isPlainObject(annotations) ? annotations : {};
    const normalized: ToolAnnotations = {
      readOnlyHint: Boolean(members.readOnlyHint),
      untrustedContentHint: Boolean(members.untrustedContentHint),
    };
    if (members.title !== undefined) normalized.title = toDomString(members.title).toWellFormed();
    for (const hint of [
      'destructiveHint',
      'idempotentHint',
      'openWorldHint',
      'consequentialHint',
      'debugging',
    ] as const) {
      const value = members[hint];
      if (value !== undefined) normalized[hint] = Boolean(value);
    }
    descriptor.annotations = normalized;
  }
  validateWebMcpToolDescriptor(descriptor);
  return descriptor;
}

export function createInvalidStateError(message: string): Error {
  return new DOMException(message, 'InvalidStateError');
}

function validateWebMcpToolDescriptor<
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
