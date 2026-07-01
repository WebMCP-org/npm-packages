import { type Schema, Validator } from '@cfworker/json-schema';
import type { InputSchema, JsonObject, JsonValue } from '@mcp-b/webmcp-types';
import type { StandardJSONSchemaV1, StandardSchemaV1 } from '@standard-schema/spec';
export type { StandardJSONSchemaV1 } from '@standard-schema/spec';

const DEFAULT_INPUT_SCHEMA: InputSchema = { type: 'object', properties: {} };
const STANDARD_JSON_SCHEMA_TARGETS = ['draft-2020-12', 'draft-07'] as const;

export type StandardInputValidatorSchema = StandardSchemaV1<
  Record<string, unknown>,
  Record<string, unknown>
>;
export type StandardInputJsonSchema = StandardJSONSchemaV1<
  Record<string, unknown>,
  Record<string, unknown>
>;
export type ToolInputSchema = InputSchema | StandardInputValidatorSchema | StandardInputJsonSchema;
export type ToolOutputSchema = InputSchema | StandardInputJsonSchema;

export type StandardValidationResult = Awaited<
  ReturnType<StandardInputValidatorSchema['~standard']['validate']>
>;
export type StandardValidationIssue = NonNullable<StandardValidationResult['issues']>[number];

export interface NormalizedInputSchema {
  inputSchema: InputSchema;
  standardValidator: StandardInputValidatorSchema;
}

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
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

export function toJsonObject(value: unknown): JsonObject | undefined {
  if (!isJsonObjectRecord(value) || !isJsonValue(value)) {
    return undefined;
  }

  return value;
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

function createStandardValidatorFromJsonSchema(schema: InputSchema): StandardInputValidatorSchema {
  return {
    '~standard': {
      version: 1,
      vendor: '@mcp-b/webmcp-polyfill-json-schema',
      validate(value: unknown): StandardValidationResult {
        if (!isPlainObject(value)) {
          return {
            issues: [{ message: 'expected object arguments' }],
          };
        }

        const issue = validateArgsWithSchema(value, schema);
        if (issue) {
          return {
            issues: [issue],
          };
        }

        return {
          value,
        };
      },
    },
  };
}

function convertStandardInputSchema(schema: StandardInputJsonSchema): InputSchema {
  const failures: Array<{ error: unknown; target: (typeof STANDARD_JSON_SCHEMA_TARGETS)[number] }> =
    [];

  for (const target of STANDARD_JSON_SCHEMA_TARGETS) {
    try {
      const converted = schema['~standard'].jsonSchema.input({ target });
      validateInputSchema(converted);
      return converted;
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
    const normalized = DEFAULT_INPUT_SCHEMA;
    return {
      inputSchema: normalized,
      standardValidator: createStandardValidatorFromJsonSchema(normalized),
    };
  }

  if (isStandardInputJsonSchema(inputSchema)) {
    // Prefer JSON conversion for parity across JSON and Standard Schema inputs.
    const converted = convertStandardInputSchema(inputSchema);
    return {
      inputSchema: converted,
      standardValidator: createStandardValidatorFromJsonSchema(converted),
    };
  }

  if (isStandardInputValidatorSchema(inputSchema)) {
    return {
      inputSchema: DEFAULT_INPUT_SCHEMA,
      standardValidator: inputSchema,
    };
  }

  validateInputSchema(inputSchema);

  // Empty {} is valid JSON Schema but lacks type:"object" required by MCP.
  if (Object.keys(inputSchema as Record<string, unknown>).length === 0) {
    return {
      inputSchema: DEFAULT_INPUT_SCHEMA,
      standardValidator: createStandardValidatorFromJsonSchema(DEFAULT_INPUT_SCHEMA),
    };
  }

  const normalizedSchema =
    inputSchema.type === undefined
      ? ({ type: 'object', ...inputSchema } as InputSchema)
      : inputSchema;
  return {
    inputSchema: normalizedSchema,
    standardValidator: createStandardValidatorFromJsonSchema(normalizedSchema),
  };
}

function validateInputSchema(schema: unknown): asserts schema is InputSchema {
  if (!isPlainObject(schema)) {
    throw new Error('inputSchema must be a JSON Schema object');
  }

  validateJsonSchemaNode(schema, '$');
}

function validateJsonSchemaNode(node: Record<string, unknown>, path: string): void {
  const typeValue = node.type;
  if (
    typeValue !== undefined &&
    typeof typeValue !== 'string' &&
    !(
      Array.isArray(typeValue) &&
      typeValue.every((entry) => typeof entry === 'string' && entry.length > 0)
    )
  ) {
    throw new Error(`Invalid JSON Schema at ${path}: "type" must be a string or string[]`);
  }

  const requiredValue = node.required;
  if (
    requiredValue !== undefined &&
    !(Array.isArray(requiredValue) && requiredValue.every((entry) => typeof entry === 'string'))
  ) {
    throw new Error(`Invalid JSON Schema at ${path}: "required" must be an array of strings`);
  }

  const propertiesValue = node.properties;
  if (propertiesValue !== undefined) {
    if (!isPlainObject(propertiesValue)) {
      throw new Error(`Invalid JSON Schema at ${path}: "properties" must be an object`);
    }

    for (const [key, value] of Object.entries(propertiesValue)) {
      if (!isPlainObject(value)) {
        throw new Error(`Invalid JSON Schema at ${path}.properties.${key}: expected object schema`);
      }
      validateJsonSchemaNode(value, `${path}.properties.${key}`);
    }
  }

  const itemsValue = node.items;
  if (itemsValue !== undefined) {
    if (Array.isArray(itemsValue)) {
      for (const [index, value] of itemsValue.entries()) {
        if (!isPlainObject(value)) {
          throw new Error(`Invalid JSON Schema at ${path}.items[${index}]: expected object schema`);
        }
        validateJsonSchemaNode(value, `${path}.items[${index}]`);
      }
    } else if (isPlainObject(itemsValue)) {
      validateJsonSchemaNode(itemsValue, `${path}.items`);
    } else {
      throw new Error(`Invalid JSON Schema at ${path}: "items" must be an object or object[]`);
    }
  }

  for (const keyword of ['allOf', 'anyOf', 'oneOf'] as const) {
    const value = node[keyword];
    if (value === undefined) {
      continue;
    }

    if (!Array.isArray(value)) {
      throw new Error(`Invalid JSON Schema at ${path}: "${keyword}" must be an array`);
    }

    for (const [index, entry] of value.entries()) {
      if (!isPlainObject(entry)) {
        throw new Error(
          `Invalid JSON Schema at ${path}.${keyword}[${index}]: expected object schema`
        );
      }
      validateJsonSchemaNode(entry, `${path}.${keyword}[${index}]`);
    }
  }

  const notValue = node.not;
  if (notValue !== undefined) {
    if (!isPlainObject(notValue)) {
      throw new Error(`Invalid JSON Schema at ${path}: "not" must be an object schema`);
    }
    validateJsonSchemaNode(notValue, `${path}.not`);
  }

  try {
    JSON.stringify(node);
  } catch {
    throw new Error(`Invalid JSON Schema at ${path}: schema must be JSON-serializable`);
  }
}

export function validateArgsWithSchema(
  args: Record<string, unknown>,
  schema: InputSchema
): StandardValidationIssue | null {
  const validator = new Validator(schema as Schema, '2020-12', true);
  const result = validator.validate(args);

  if (result.valid) {
    return null;
  }

  // Use the deepest (last) error for the most specific message.
  const error = result.errors[result.errors.length - 1];
  if (!error) {
    return { message: 'Input validation failed' };
  }

  return { message: error.error };
}
