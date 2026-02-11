import { createLogger } from './logger.js';
import type {
  InputSchema,
  SchemaValidationResult,
  SchemaValidator,
  ValidationIssue,
} from './types.js';

const logger = createLogger('WebModelContext');

type PrimitiveType = 'string' | 'number' | 'integer' | 'boolean' | 'null';
type SupportedType = PrimitiveType | 'object' | 'array';
type ValidationFn = (
  value: unknown,
  path: Array<string | number>,
  issues: ValidationIssue[]
) => void;

const SUPPORTED_TYPES = new Set<SupportedType>([
  'array',
  'boolean',
  'integer',
  'null',
  'number',
  'object',
  'string',
]);

const UNSUPPORTED_KEYWORDS = new Set([
  '$defs',
  '$ref',
  'additionalItems',
  'allOf',
  'anyOf',
  'contains',
  'definitions',
  'dependentRequired',
  'dependentSchemas',
  'format',
  'if',
  'maxContains',
  'minContains',
  'not',
  'oneOf',
  'patternProperties',
  'prefixItems',
  'propertyNames',
  'then',
  'unevaluatedItems',
  'unevaluatedProperties',
]);

const MAX_SCHEMA_DEPTH = 25;
const MAX_OBJECT_PROPERTIES = 1000;
const MAX_ENUM_SIZE = 500;
const MAX_PATTERN_LENGTH = 4096;
const MAX_ISSUES = 50;
const FLOAT_EPSILON = Number.EPSILON;

const validatorCacheByIdentity = new WeakMap<object, SchemaValidator>();
const validatorCacheByHash = new Map<string, SchemaValidator>();

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  isRecord(value) && !Array.isArray(value);

const objectHasOwnProperty = Object.prototype.hasOwnProperty;

const hasOwn = (record: Record<string, unknown>, key: string): boolean =>
  objectHasOwnProperty.call(record, key);

const isPrimitive = (value: unknown): value is string | number | boolean | null =>
  typeof value === 'string' ||
  typeof value === 'number' ||
  typeof value === 'boolean' ||
  value === null;

function toJsonPointer(path: Array<string | number>): string {
  if (path.length === 0) {
    return '#';
  }

  return (
    '#' +
    path
      .map((part) => String(part).replace(/~/g, '~0').replace(/\//g, '~1'))
      .map((part) => `/${part}`)
      .join('')
  );
}

function stableSerializeForHash(value: unknown, seen: Set<object> = new Set()): string {
  if (value === null) {
    return 'null';
  }

  const valueType = typeof value;
  if (valueType === 'string') {
    return JSON.stringify(value);
  }
  if (valueType === 'number') {
    return Number.isFinite(value as number) ? String(value) : '"__non_finite_number__"';
  }
  if (valueType === 'boolean') {
    return value ? 'true' : 'false';
  }
  if (valueType === 'undefined') {
    return '"__undefined__"';
  }

  if (valueType !== 'object') {
    return JSON.stringify(String(value));
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => stableSerializeForHash(item, seen)).join(',')}]`;
  }

  const obj = value as object;
  if (seen.has(obj)) {
    throw new Error(
      '[Web Model Context] Invalid JSON Schema at "#": Circular references are not supported'
    );
  }

  seen.add(obj);
  const record = value as Record<string, unknown>;
  const entries = Object.keys(record)
    .sort()
    .filter((key) => record[key] !== undefined)
    .map((key) => `${JSON.stringify(key)}:${stableSerializeForHash(record[key], seen)}`);
  seen.delete(obj);

  return `{${entries.join(',')}}`;
}

function schemaHash(schema: InputSchema): string {
  return stableSerializeForHash(schema);
}

function schemaError(
  kind: 'invalid' | 'limit' | 'unsupported',
  path: Array<string | number>,
  message: string
): never {
  const pointer = toJsonPointer(path);
  const docsPointer = 'docs/PURE_JSON_SCHEMA_TYPE_INFERENCE_PLAN.md';

  if (kind === 'unsupported') {
    throw new Error(
      `[Web Model Context] Unsupported JSON Schema keyword ${message} at "${pointer}". ` +
        `Supported MVP subset is documented in ${docsPointer}.`
    );
  }

  if (kind === 'limit') {
    throw new Error(`[Web Model Context] JSON Schema limit exceeded at "${pointer}": ${message}`);
  }

  throw new Error(`[Web Model Context] Invalid JSON Schema at "${pointer}": ${message}`);
}

function pushIssue(issues: ValidationIssue[], path: Array<string | number>, message: string): void {
  if (issues.length >= MAX_ISSUES) {
    return;
  }
  issues.push({ path: [...path], message });
}

function ensureNoUnsupportedKeywords(
  schema: Record<string, unknown>,
  path: Array<string | number>
): void {
  for (const key of Object.keys(schema)) {
    if (UNSUPPORTED_KEYWORDS.has(key)) {
      schemaError('unsupported', [...path, key], `"${key}"`);
    }
  }
}

function parseType(schema: Record<string, unknown>, path: Array<string | number>): SupportedType {
  const typeValue = schema.type;

  if (typeValue === undefined && path.length === 0) {
    // Backward compatibility: historically `{}` has been accepted as a permissive
    // root object schema in tests and examples.
    return 'object';
  }

  if (typeof typeValue !== 'string') {
    schemaError('invalid', [...path, 'type'], 'Expected "type" to be a string');
  }

  if (!SUPPORTED_TYPES.has(typeValue as SupportedType)) {
    schemaError(
      'invalid',
      [...path, 'type'],
      `Unsupported type "${typeValue}". Supported types: ${Array.from(SUPPORTED_TYPES).join(', ')}`
    );
  }

  return typeValue as SupportedType;
}

function parseNumberKeyword(
  schema: Record<string, unknown>,
  keyword: string,
  path: Array<string | number>,
  options: { integer?: boolean; min?: number } = {}
): number | undefined {
  const raw = schema[keyword];
  if (raw === undefined) {
    return undefined;
  }

  if (typeof raw !== 'number' || !Number.isFinite(raw)) {
    schemaError('invalid', [...path, keyword], `Expected "${keyword}" to be a finite number`);
  }

  if (options.integer && !Number.isInteger(raw)) {
    schemaError('invalid', [...path, keyword], `Expected "${keyword}" to be an integer`);
  }

  if (options.min !== undefined && raw < options.min) {
    schemaError('invalid', [...path, keyword], `Expected "${keyword}" to be >= ${options.min}`);
  }

  return raw;
}

function parseRequired(schema: Record<string, unknown>, path: Array<string | number>): Set<string> {
  const requiredRaw = schema.required;
  if (requiredRaw === undefined) {
    return new Set();
  }

  if (!Array.isArray(requiredRaw) || requiredRaw.some((entry) => typeof entry !== 'string')) {
    schemaError('invalid', [...path, 'required'], 'Expected "required" to be an array of strings');
  }

  return new Set(requiredRaw);
}

function parseConstPrimitive(
  schema: Record<string, unknown>,
  path: Array<string | number>,
  expectedType: PrimitiveType
): string | number | boolean | null | undefined {
  const raw = schema.const;
  if (raw === undefined) {
    return undefined;
  }

  if (!isPrimitive(raw)) {
    schemaError('invalid', [...path, 'const'], 'Expected "const" to be a primitive JSON value');
  }

  if (!matchesPrimitiveType(raw, expectedType)) {
    schemaError(
      'invalid',
      [...path, 'const'],
      `Expected "const" to match schema type "${expectedType}"`
    );
  }

  return raw;
}

function parseEnumPrimitive(
  schema: Record<string, unknown>,
  path: Array<string | number>,
  expectedType: PrimitiveType
): Array<string | number | boolean | null> | undefined {
  const raw = schema.enum;
  if (raw === undefined) {
    return undefined;
  }

  if (!Array.isArray(raw)) {
    schemaError('invalid', [...path, 'enum'], 'Expected "enum" to be an array');
  }

  if (raw.length > MAX_ENUM_SIZE) {
    schemaError(
      'limit',
      [...path, 'enum'],
      `Enum size ${raw.length} exceeds max supported size ${MAX_ENUM_SIZE}`
    );
  }

  const values: Array<string | number | boolean | null> = [];
  for (const [index, entry] of raw.entries()) {
    if (!isPrimitive(entry)) {
      schemaError(
        'invalid',
        [...path, 'enum', index],
        'Expected enum values to be primitive JSON values'
      );
    }
    if (!matchesPrimitiveType(entry, expectedType)) {
      schemaError(
        'invalid',
        [...path, 'enum', index],
        `Expected enum values to match schema type "${expectedType}"`
      );
    }
    values.push(entry);
  }

  return values;
}

function ensureNoConstEnumForStructuralTypes(
  schema: Record<string, unknown>,
  path: Array<string | number>
): void {
  if (schema.const !== undefined) {
    schemaError(
      'invalid',
      [...path, 'const'],
      'The MVP subset only supports "const" for primitive schema types'
    );
  }

  if (schema.enum !== undefined) {
    schemaError(
      'invalid',
      [...path, 'enum'],
      'The MVP subset only supports "enum" for primitive schema types'
    );
  }
}

function matchesPrimitiveType(value: unknown, type: PrimitiveType): boolean {
  if (type === 'null') return value === null;
  if (type === 'integer') return typeof value === 'number' && Number.isInteger(value);
  return typeof value === type;
}

function deepEqual(
  a: unknown,
  b: unknown,
  seenPairs: WeakMap<object, WeakSet<object>> = new WeakMap()
): boolean {
  if (Object.is(a, b)) {
    return true;
  }

  if (typeof a !== typeof b) {
    return false;
  }

  if (Array.isArray(a) && Array.isArray(b)) {
    const existing = seenPairs.get(a);
    if (existing?.has(b)) {
      return true;
    }
    if (existing) {
      existing.add(b);
    } else {
      const set = new WeakSet<object>();
      set.add(b);
      seenPairs.set(a, set);
    }

    if (a.length !== b.length) {
      return false;
    }
    for (let i = 0; i < a.length; i++) {
      if (!deepEqual(a[i], b[i], seenPairs)) {
        return false;
      }
    }
    return true;
  }

  if (isPlainObject(a) && isPlainObject(b)) {
    const existing = seenPairs.get(a);
    if (existing?.has(b)) {
      return true;
    }
    if (existing) {
      existing.add(b);
    } else {
      const set = new WeakSet<object>();
      set.add(b);
      seenPairs.set(a, set);
    }

    const keysA = Object.keys(a);
    const keysB = Object.keys(b);
    if (keysA.length !== keysB.length) {
      return false;
    }

    for (const key of keysA) {
      if (!hasOwn(b, key)) {
        return false;
      }
      if (!deepEqual(a[key], b[key], seenPairs)) {
        return false;
      }
    }

    return true;
  }

  return false;
}

function compileSchemaNode(
  rawSchema: unknown,
  path: Array<string | number>,
  depth: number
): ValidationFn {
  if (depth > MAX_SCHEMA_DEPTH) {
    schemaError('limit', path, `Schema nesting depth exceeds maximum of ${MAX_SCHEMA_DEPTH}`);
  }

  if (!isRecord(rawSchema)) {
    schemaError('invalid', path, 'Schema node must be an object');
  }

  ensureNoUnsupportedKeywords(rawSchema, path);
  const type = parseType(rawSchema, path);

  if (type === 'object') {
    ensureNoConstEnumForStructuralTypes(rawSchema, path);

    const propertiesRaw = rawSchema.properties;
    const propertyValidators = new Map<string, ValidationFn>();
    if (propertiesRaw !== undefined) {
      if (!isPlainObject(propertiesRaw)) {
        schemaError('invalid', [...path, 'properties'], 'Expected "properties" to be an object');
      }

      const entries = Object.entries(propertiesRaw);
      if (entries.length > MAX_OBJECT_PROPERTIES) {
        schemaError(
          'limit',
          [...path, 'properties'],
          `Property count ${entries.length} exceeds max supported count ${MAX_OBJECT_PROPERTIES}`
        );
      }

      for (const [propertyName, propertySchema] of entries) {
        propertyValidators.set(
          propertyName,
          compileSchemaNode(propertySchema, [...path, 'properties', propertyName], depth + 1)
        );
      }
    }

    const required = parseRequired(rawSchema, path);
    const additionalProperties = rawSchema.additionalProperties;

    if (additionalProperties !== undefined && typeof additionalProperties !== 'boolean') {
      schemaError(
        'unsupported',
        [...path, 'additionalProperties'],
        '"additionalProperties" object schemas are not supported in MVP'
      );
    }

    const minProperties = parseNumberKeyword(rawSchema, 'minProperties', path, {
      integer: true,
      min: 0,
    });
    const maxProperties = parseNumberKeyword(rawSchema, 'maxProperties', path, {
      integer: true,
      min: 0,
    });

    if (
      minProperties !== undefined &&
      maxProperties !== undefined &&
      minProperties > maxProperties
    ) {
      schemaError(
        'invalid',
        path,
        `"minProperties" (${minProperties}) must be <= "maxProperties" (${maxProperties})`
      );
    }

    return (value, currentPath, issues) => {
      if (!isPlainObject(value)) {
        pushIssue(issues, currentPath, 'Expected object');
        return;
      }

      const keys = Object.keys(value);

      if (minProperties !== undefined && keys.length < minProperties) {
        pushIssue(
          issues,
          currentPath,
          `Expected at least ${minProperties} properties, received ${keys.length}`
        );
      }

      if (maxProperties !== undefined && keys.length > maxProperties) {
        pushIssue(
          issues,
          currentPath,
          `Expected at most ${maxProperties} properties, received ${keys.length}`
        );
      }

      for (const key of required) {
        if (!hasOwn(value, key)) {
          pushIssue(issues, [...currentPath, key], 'Missing required property');
          if (issues.length >= MAX_ISSUES) {
            return;
          }
        }
      }

      for (const [key, validator] of propertyValidators) {
        if (hasOwn(value, key)) {
          validator(value[key], [...currentPath, key], issues);
          if (issues.length >= MAX_ISSUES) {
            return;
          }
        }
      }

      if (additionalProperties === false) {
        for (const key of keys) {
          if (!propertyValidators.has(key)) {
            pushIssue(issues, [...currentPath, key], 'Unknown property is not allowed');
            if (issues.length >= MAX_ISSUES) {
              return;
            }
          }
        }
      }
    };
  }

  if (type === 'array') {
    ensureNoConstEnumForStructuralTypes(rawSchema, path);

    const itemsSchema = rawSchema.items;
    if (itemsSchema === undefined) {
      schemaError('invalid', [...path, 'items'], 'Expected "items" schema for array type');
    }

    const itemValidator = compileSchemaNode(itemsSchema, [...path, 'items'], depth + 1);
    const minItems = parseNumberKeyword(rawSchema, 'minItems', path, { integer: true, min: 0 });
    const maxItems = parseNumberKeyword(rawSchema, 'maxItems', path, { integer: true, min: 0 });

    if (minItems !== undefined && maxItems !== undefined && minItems > maxItems) {
      schemaError('invalid', path, `"minItems" (${minItems}) must be <= "maxItems" (${maxItems})`);
    }

    const uniqueItemsRaw = rawSchema.uniqueItems;
    if (uniqueItemsRaw !== undefined && typeof uniqueItemsRaw !== 'boolean') {
      schemaError('invalid', [...path, 'uniqueItems'], 'Expected "uniqueItems" to be a boolean');
    }

    const uniqueItems = uniqueItemsRaw === true;

    return (value, currentPath, issues) => {
      if (!Array.isArray(value)) {
        pushIssue(issues, currentPath, 'Expected array');
        return;
      }

      if (minItems !== undefined && value.length < minItems) {
        pushIssue(
          issues,
          currentPath,
          `Expected at least ${minItems} items, received ${value.length}`
        );
        if (issues.length >= MAX_ISSUES) {
          return;
        }
      }

      if (maxItems !== undefined && value.length > maxItems) {
        pushIssue(
          issues,
          currentPath,
          `Expected at most ${maxItems} items, received ${value.length}`
        );
        if (issues.length >= MAX_ISSUES) {
          return;
        }
      }

      if (uniqueItems) {
        for (let i = 0; i < value.length; i++) {
          for (let j = i + 1; j < value.length; j++) {
            if (deepEqual(value[i], value[j])) {
              pushIssue(
                issues,
                [...currentPath, j],
                `Array items must be unique (duplicate of index ${i})`
              );
              if (issues.length >= MAX_ISSUES) {
                return;
              }
            }
          }
        }
      }

      for (let i = 0; i < value.length; i++) {
        itemValidator(value[i], [...currentPath, i], issues);
        if (issues.length >= MAX_ISSUES) {
          return;
        }
      }
    };
  }

  if (type === 'string') {
    const constValue = parseConstPrimitive(rawSchema, path, 'string');
    const enumValues = parseEnumPrimitive(rawSchema, path, 'string');
    const minLength = parseNumberKeyword(rawSchema, 'minLength', path, { integer: true, min: 0 });
    const maxLength = parseNumberKeyword(rawSchema, 'maxLength', path, { integer: true, min: 0 });

    if (minLength !== undefined && maxLength !== undefined && minLength > maxLength) {
      schemaError(
        'invalid',
        path,
        `"minLength" (${minLength}) must be <= "maxLength" (${maxLength})`
      );
    }

    const patternRaw = rawSchema.pattern;
    let pattern: RegExp | undefined;
    if (patternRaw !== undefined) {
      if (typeof patternRaw !== 'string') {
        schemaError('invalid', [...path, 'pattern'], 'Expected "pattern" to be a string');
      }

      if (patternRaw.length > MAX_PATTERN_LENGTH) {
        schemaError(
          'limit',
          [...path, 'pattern'],
          `Pattern length ${patternRaw.length} exceeds max supported length ${MAX_PATTERN_LENGTH}`
        );
      }

      try {
        pattern = new RegExp(patternRaw);
      } catch (error) {
        schemaError(
          'invalid',
          [...path, 'pattern'],
          `Invalid regular expression: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }

    return (value, currentPath, issues) => {
      if (typeof value !== 'string') {
        pushIssue(issues, currentPath, 'Expected string');
        return;
      }

      if (constValue !== undefined && value !== constValue) {
        pushIssue(issues, currentPath, `Expected constant value "${constValue}"`);
      }

      if (enumValues && !enumValues.includes(value)) {
        pushIssue(issues, currentPath, `Expected one of: ${enumValues.map(String).join(', ')}`);
      }

      if (minLength !== undefined && value.length < minLength) {
        pushIssue(
          issues,
          currentPath,
          `Expected minimum string length ${minLength}, received ${value.length}`
        );
      }

      if (maxLength !== undefined && value.length > maxLength) {
        pushIssue(
          issues,
          currentPath,
          `Expected maximum string length ${maxLength}, received ${value.length}`
        );
      }

      if (pattern && !pattern.test(value)) {
        pushIssue(issues, currentPath, `String does not match pattern "${pattern.source}"`);
      }
    };
  }

  if (type === 'number' || type === 'integer') {
    const constValue = parseConstPrimitive(rawSchema, path, type);
    const enumValues = parseEnumPrimitive(rawSchema, path, type);
    const minimum = parseNumberKeyword(rawSchema, 'minimum', path);
    const maximum = parseNumberKeyword(rawSchema, 'maximum', path);
    const exclusiveMinimum = parseNumberKeyword(rawSchema, 'exclusiveMinimum', path);
    const exclusiveMaximum = parseNumberKeyword(rawSchema, 'exclusiveMaximum', path);
    const multipleOf = parseNumberKeyword(rawSchema, 'multipleOf', path);

    if (multipleOf !== undefined && multipleOf <= 0) {
      schemaError('invalid', [...path, 'multipleOf'], 'Expected "multipleOf" to be > 0');
    }

    if (minimum !== undefined && maximum !== undefined && minimum > maximum) {
      schemaError('invalid', path, `"minimum" (${minimum}) must be <= "maximum" (${maximum})`);
    }

    if (
      exclusiveMinimum !== undefined &&
      exclusiveMaximum !== undefined &&
      exclusiveMinimum >= exclusiveMaximum
    ) {
      schemaError(
        'invalid',
        path,
        `"exclusiveMinimum" (${exclusiveMinimum}) must be < "exclusiveMaximum" (${exclusiveMaximum})`
      );
    }

    return (value, currentPath, issues) => {
      if (typeof value !== 'number' || !Number.isFinite(value)) {
        pushIssue(issues, currentPath, 'Expected finite number');
        return;
      }

      if (type === 'integer' && !Number.isInteger(value)) {
        pushIssue(issues, currentPath, 'Expected integer');
      }

      if (constValue !== undefined && value !== constValue) {
        pushIssue(issues, currentPath, `Expected constant value ${constValue}`);
      }

      if (enumValues && !enumValues.includes(value)) {
        pushIssue(issues, currentPath, `Expected one of: ${enumValues.map(String).join(', ')}`);
      }

      if (minimum !== undefined && value < minimum) {
        pushIssue(issues, currentPath, `Expected value >= ${minimum}`);
      }

      if (maximum !== undefined && value > maximum) {
        pushIssue(issues, currentPath, `Expected value <= ${maximum}`);
      }

      if (exclusiveMinimum !== undefined && value <= exclusiveMinimum) {
        pushIssue(issues, currentPath, `Expected value > ${exclusiveMinimum}`);
      }

      if (exclusiveMaximum !== undefined && value >= exclusiveMaximum) {
        pushIssue(issues, currentPath, `Expected value < ${exclusiveMaximum}`);
      }

      if (multipleOf !== undefined) {
        const quotient = value / multipleOf;
        if (Math.abs(Math.round(quotient) - quotient) > FLOAT_EPSILON * 10) {
          pushIssue(issues, currentPath, `Expected value to be a multiple of ${multipleOf}`);
        }
      }
    };
  }

  if (type === 'boolean') {
    const constValue = parseConstPrimitive(rawSchema, path, 'boolean');
    const enumValues = parseEnumPrimitive(rawSchema, path, 'boolean');

    return (value, currentPath, issues) => {
      if (typeof value !== 'boolean') {
        pushIssue(issues, currentPath, 'Expected boolean');
        return;
      }

      if (constValue !== undefined && value !== constValue) {
        pushIssue(issues, currentPath, `Expected constant value ${constValue}`);
      }

      if (enumValues && !enumValues.includes(value)) {
        pushIssue(issues, currentPath, `Expected one of: ${enumValues.map(String).join(', ')}`);
      }
    };
  }

  const constValue = parseConstPrimitive(rawSchema, path, 'null');
  const enumValues = parseEnumPrimitive(rawSchema, path, 'null');

  return (value, currentPath, issues) => {
    if (value !== null) {
      pushIssue(issues, currentPath, 'Expected null');
      return;
    }

    if (constValue !== undefined && value !== constValue) {
      pushIssue(issues, currentPath, 'Expected constant value null');
    }

    if (enumValues && !enumValues.includes(value)) {
      pushIssue(issues, currentPath, 'Expected value from null enum');
    }
  };
}

function createJsonSchemaValidator(jsonSchema: InputSchema): SchemaValidator {
  const validatorFn = compileSchemaNode(jsonSchema, [], 0);

  return {
    safeParse(data: unknown): SchemaValidationResult {
      const issues: ValidationIssue[] = [];
      validatorFn(data, [], issues);

      if (issues.length === 0) {
        return { success: true, data };
      }

      return { success: false, error: { issues } };
    },
  };
}

const passthroughValidator: SchemaValidator = {
  safeParse: (data) => ({ success: true, data }),
};

export function compileJsonSchema(
  jsonSchema: InputSchema,
  options: { strict?: boolean } = {}
): SchemaValidator {
  if (isRecord(jsonSchema)) {
    const cachedByIdentity = validatorCacheByIdentity.get(jsonSchema);
    if (cachedByIdentity) {
      return cachedByIdentity;
    }
  }

  let hashKey: string | undefined;
  try {
    hashKey = schemaHash(jsonSchema);
    const cachedByHash = validatorCacheByHash.get(hashKey);
    if (cachedByHash) {
      if (isRecord(jsonSchema)) {
        validatorCacheByIdentity.set(jsonSchema, cachedByHash);
      }
      return cachedByHash;
    }
  } catch (error) {
    if (options.strict) {
      throw error;
    }

    logger.warn('compileJsonSchema failed while hashing schema:', error);
  }

  try {
    const validator = createJsonSchemaValidator(jsonSchema);
    if (isRecord(jsonSchema)) {
      validatorCacheByIdentity.set(jsonSchema, validator);
    }
    if (hashKey) {
      validatorCacheByHash.set(hashKey, validator);
    }
    return validator;
  } catch (error) {
    if (options.strict) {
      throw error;
    }

    logger.warn('compileJsonSchema failed:', error);
    return passthroughValidator;
  }
}

export function validateWithSchema(
  data: unknown,
  validator: SchemaValidator
): { success: true; data: unknown } | { success: false; error: string } {
  const result = validator.safeParse(data);

  if (result.success) {
    return { success: true, data: result.data };
  }

  const errors = result.error.issues
    .map((err) => `  - ${err.path.join('.') || 'root'}: ${err.message}`)
    .join('\n');

  return { success: false, error: `Validation failed:\n${errors}` };
}
