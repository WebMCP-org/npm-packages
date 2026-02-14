import { jsonSchemaToZod as composioJsonSchemaToZod } from '@composio/json-schema-to-zod';
import { z } from 'zod';
import { zodToJsonSchema as zodToJsonSchemaLib } from 'zod-to-json-schema';
import { createLogger } from './logger.js';
import type { InputSchema, ZodSchemaObject } from './types.js';

const logger = createLogger('WebModelContext');

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const stripSchemaMeta = <T extends Record<string, unknown>>(schema: T): T => {
  const { $schema: _, ...rest } = schema as T & { $schema?: string };
  return rest as T;
};

const JSON_SCHEMA_PRIMITIVE_TYPES = new Set([
  'string',
  'number',
  'integer',
  'boolean',
  'object',
  'array',
  'null',
]);

function validateJsonSchemaStrict(schema: unknown, path = 'schema'): void {
  if (!isRecord(schema)) {
    throw new TypeError(`${path} must be an object`);
  }

  if ('type' in schema) {
    const typeValue = schema.type;
    if (typeof typeValue === 'string') {
      if (!JSON_SCHEMA_PRIMITIVE_TYPES.has(typeValue)) {
        throw new TypeError(
          `${path}.type must be one of: ${Array.from(JSON_SCHEMA_PRIMITIVE_TYPES).join(', ')}`
        );
      }
    } else if (Array.isArray(typeValue)) {
      if (typeValue.length === 0) {
        throw new TypeError(`${path}.type must not be an empty array`);
      }
      for (const [index, typeItem] of typeValue.entries()) {
        if (typeof typeItem !== 'string' || !JSON_SCHEMA_PRIMITIVE_TYPES.has(typeItem)) {
          throw new TypeError(`${path}.type[${index}] is not a valid JSON Schema type`);
        }
      }
    } else {
      throw new TypeError(`${path}.type must be a string or string[]`);
    }
  }

  if ('properties' in schema && schema.properties !== undefined) {
    if (!isRecord(schema.properties)) {
      throw new TypeError(`${path}.properties must be an object`);
    }
    for (const [key, value] of Object.entries(schema.properties)) {
      validateJsonSchemaStrict(value, `${path}.properties.${key}`);
    }
  }

  if ('items' in schema && schema.items !== undefined) {
    if (Array.isArray(schema.items)) {
      for (const [index, itemSchema] of schema.items.entries()) {
        validateJsonSchemaStrict(itemSchema, `${path}.items[${index}]`);
      }
    } else {
      validateJsonSchemaStrict(schema.items, `${path}.items`);
    }
  }

  if ('required' in schema && schema.required !== undefined) {
    if (
      !Array.isArray(schema.required) ||
      schema.required.some((item) => typeof item !== 'string')
    ) {
      throw new TypeError(`${path}.required must be an array of strings`);
    }
  }
}

const isOptionalSchema = (schema: z.ZodTypeAny): boolean => {
  const typeName = (schema as { _def?: { typeName?: string } })._def?.typeName;
  return typeName === 'ZodOptional' || typeName === 'ZodDefault';
};

export function isZodSchema(schema: unknown): schema is ZodSchemaObject {
  if (!isRecord(schema)) return false;
  if ('type' in schema && typeof schema.type === 'string') return false;
  const values = Object.values(schema);
  if (values.length === 0) return false;
  return values.some((v) => isRecord(v) && '_def' in v);
}

export function zodToJsonSchema(schema: ZodSchemaObject): InputSchema {
  const properties: NonNullable<InputSchema['properties']> = {};
  const required: string[] = [];

  for (const [key, zodSchema] of Object.entries(schema)) {
    const propSchema = zodToJsonSchemaLib(zodSchema as z.ZodTypeAny, {
      strictUnions: true,
      $refStrategy: 'none',
    });

    properties[key] = stripSchemaMeta(propSchema as InputSchema);

    if (!isOptionalSchema(zodSchema)) {
      required.push(key);
    }
  }

  const result: InputSchema = { type: 'object', properties };
  if (required.length > 0) result.required = required;
  return result;
}

export function jsonSchemaToZod(jsonSchema: InputSchema): z.ZodType {
  try {
    // Cast to unknown first since InputSchema is compatible at runtime but
    // has a more permissive type signature than the library expects
    const zodSchema = composioJsonSchemaToZod(
      jsonSchema as unknown as Parameters<typeof composioJsonSchemaToZod>[0]
    );
    return zodSchema as unknown as z.ZodType;
  } catch (error) {
    logger.warn('jsonSchemaToZod failed:', error);
    return z.object({}).passthrough();
  }
}

export function jsonSchemaToZodStrict(jsonSchema: InputSchema): z.ZodType {
  validateJsonSchemaStrict(jsonSchema);

  try {
    const zodSchema = composioJsonSchemaToZod(
      jsonSchema as unknown as Parameters<typeof composioJsonSchemaToZod>[0]
    );
    return zodSchema as unknown as z.ZodType;
  } catch (error) {
    throw new TypeError(
      `[Web Model Context] Invalid JSON schema: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
}

export function normalizeSchema(schema: InputSchema | ZodSchemaObject): {
  jsonSchema: InputSchema;
  zodValidator: z.ZodType;
};
export function normalizeSchema(
  schema: InputSchema | ZodSchemaObject,
  options: { strict?: boolean }
): {
  jsonSchema: InputSchema;
  zodValidator: z.ZodType;
};
export function normalizeSchema(
  schema: InputSchema | ZodSchemaObject,
  options?: { strict?: boolean }
): {
  jsonSchema: InputSchema;
  zodValidator: z.ZodType;
} {
  const isStrict = options?.strict === true;
  if (isZodSchema(schema)) {
    const jsonSchema = zodToJsonSchema(schema);
    return {
      jsonSchema,
      zodValidator: isStrict ? jsonSchemaToZodStrict(jsonSchema) : jsonSchemaToZod(jsonSchema),
    };
  }

  return {
    jsonSchema: schema,
    zodValidator: isStrict ? jsonSchemaToZodStrict(schema) : jsonSchemaToZod(schema),
  };
}

export function validateWithZod(
  data: unknown,
  validator: z.ZodType
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
