import { jsonSchemaToZod as n8nJsonSchemaToZod } from '@n8n/json-schema-to-zod';
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

const isOptionalSchema = (schema: z.ZodTypeAny): boolean => {
  const typeName = (schema as { _def?: { typeName?: string } })._def?.typeName;
  return typeName === 'ZodOptional' || typeName === 'ZodDefault';
};

/**
 * Detect if schema is a Zod schema object (Record<string, ZodType>).
 * Only supports Zod 3.x schemas.
 */
export function isZodSchema(schema: unknown): schema is ZodSchemaObject {
  if (!isRecord(schema)) return false;

  // If it has 'type' as a string, it's JSON Schema not Zod
  if ('type' in schema && typeof schema.type === 'string') return false;

  const values = Object.values(schema);
  if (values.length === 0) return false;

  // Check if values are Zod 3 schemas (have _def property)
  return values.some((v) => isRecord(v) && '_def' in v);
}

/**
 * Convert Zod 3 schema object to JSON Schema.
 * Only supports Zod 3.x - Zod 4 is not supported.
 */
export function zodToJsonSchema(schema: ZodSchemaObject): InputSchema {
  const properties: NonNullable<InputSchema['properties']> = {};
  const required: string[] = [];

  for (const [key, zodSchema] of Object.entries(schema)) {
    // biome-ignore lint/suspicious/noExplicitAny: zod-to-json-schema types
    const propSchema = zodToJsonSchemaLib(zodSchema as any, {
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
    return n8nJsonSchemaToZod(jsonSchema) as unknown as z.ZodType;
  } catch (error) {
    logger.warn('jsonSchemaToZod failed:', error);
    return z.object({}).passthrough();
  }
}

export function normalizeSchema(schema: InputSchema | ZodSchemaObject): {
  jsonSchema: InputSchema;
  zodValidator: z.ZodType;
} {
  if (isZodSchema(schema)) {
    const jsonSchema = zodToJsonSchema(schema);
    return { jsonSchema, zodValidator: jsonSchemaToZod(jsonSchema) };
  }
  return { jsonSchema: schema, zodValidator: jsonSchemaToZod(schema) };
}

export function validateWithZod(
  data: unknown,
  validator: z.ZodType
): { success: true; data: unknown } | { success: false; error: string } {
  const result = validator.safeParse(data);
  if (result.success) return { success: true, data: result.data };

  const errors = result.error.issues
    .map((err) => `  - ${err.path.join('.') || 'root'}: ${err.message}`)
    .join('\n');
  return { success: false, error: `Validation failed:\n${errors}` };
}
