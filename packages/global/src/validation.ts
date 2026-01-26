import { jsonSchemaToZod as n8nJsonSchemaToZod } from '@n8n/json-schema-to-zod';
import { z } from 'zod';
import { zodToJsonSchema as zodToJsonSchemaV3 } from 'zod-to-json-schema';
import { createLogger } from './logger.js';
import type { InputSchema, ZodSchemaObject } from './types.js';

const logger = createLogger('WebModelContext');

const nativeToJsonSchema = (
  z as {
    toJSONSchema?: (schema: z.ZodTypeAny, options?: { target?: string }) => unknown;
  }
).toJSONSchema;

const hasNativeToJSONSchema = typeof nativeToJsonSchema === 'function';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const isZod4Schema = (schema: unknown): boolean => isRecord(schema) && '_zod' in schema;

const isZod3Schema = (schema: unknown): boolean =>
  isRecord(schema) && '_def' in schema && !('_zod' in schema);

const stripSchemaMeta = <T extends Record<string, unknown>>(schema: T): T => {
  const { $schema: _, ...rest } = schema as T & { $schema?: string };
  return rest as T;
};

const isOptionalSchema = (schema: z.ZodTypeAny): boolean => {
  const typeName = (schema as { _def?: { typeName?: string } })._def?.typeName;
  return typeName === 'ZodOptional' || typeName === 'ZodDefault';
};

export function isZodSchema(schema: unknown): schema is ZodSchemaObject {
  if (!isRecord(schema)) {
    return false;
  }

  if ('type' in schema && typeof (schema as { type: unknown }).type === 'string') {
    return false;
  }

  const values = Object.values(schema);
  if (values.length === 0) {
    return false;
  }

  return values.some((value) => isZod4Schema(value) || isZod3Schema(value));
}

const hasZod4Schemas = (schema: ZodSchemaObject): boolean =>
  Object.values(schema).some((value) => isZod4Schema(value));

const tryNativeZodToJsonSchema = (schema: ZodSchemaObject): InputSchema | null => {
  if (!hasZod4Schemas(schema) || !hasNativeToJSONSchema) {
    return null;
  }

  try {
    const jsonSchema = (nativeToJsonSchema as NonNullable<typeof nativeToJsonSchema>)(
      z.object(schema),
      { target: 'draft-7' }
    );
    return stripSchemaMeta(jsonSchema as InputSchema);
  } catch (error) {
    logger.warn('z.toJSONSchema failed, falling back to zod-to-json-schema:', error);
    return null;
  }
};

const fallbackZodToJsonSchema = (schema: ZodSchemaObject): InputSchema => {
  const properties: NonNullable<InputSchema['properties']> = {};
  const required: string[] = [];

  for (const [key, zodSchema] of Object.entries(schema)) {
    // Cast to any to handle Zod 3/4 type incompatibility - zod-to-json-schema works at runtime
    // biome-ignore lint/suspicious/noExplicitAny: Zod 3/4 type incompatibility
    const propSchema = zodToJsonSchemaV3(zodSchema as any, {
      strictUnions: true,
      $refStrategy: 'none',
    });

    properties[key] = stripSchemaMeta(propSchema as InputSchema);

    if (!isOptionalSchema(zodSchema)) {
      required.push(key);
    }
  }

  const result: InputSchema = {
    type: 'object',
    properties,
  };

  if (required.length > 0) {
    result.required = required;
  }

  return result;
};

export function zodToJsonSchema(schema: ZodSchemaObject): InputSchema {
  const nativeSchema = tryNativeZodToJsonSchema(schema);
  if (nativeSchema) {
    return nativeSchema;
  }

  try {
    return fallbackZodToJsonSchema(schema);
  } catch (error) {
    logger.warn('zodToJsonSchema failed:', error);
    return { type: 'object', properties: {} };
  }
}

export function jsonSchemaToZod(jsonSchema: InputSchema): z.ZodType {
  try {
    const zodSchema = n8nJsonSchemaToZod(jsonSchema);
    return zodSchema as unknown as z.ZodType;
  } catch (error) {
    logger.warn('jsonSchemaToZod failed:', error);
    return z.object({}).passthrough();
  }
}

const buildZodValidator = (schema: ZodSchemaObject, jsonSchema: InputSchema): z.ZodType => {
  if (hasZod4Schemas(schema) && hasNativeToJSONSchema) {
    return z.object(schema);
  }

  return jsonSchemaToZod(jsonSchema);
};

export function normalizeSchema(schema: InputSchema | ZodSchemaObject): {
  jsonSchema: InputSchema;
  zodValidator: z.ZodType;
} {
  if (isZodSchema(schema)) {
    const jsonSchema = zodToJsonSchema(schema);
    return { jsonSchema, zodValidator: buildZodValidator(schema, jsonSchema) };
  }

  return { jsonSchema: schema, zodValidator: jsonSchemaToZod(schema) };
}

export function validateWithZod(
  data: unknown,
  validator: z.ZodType
): { success: true; data: unknown } | { success: false; error: string } {
  const result = validator.safeParse(data);

  if (result.success) {
    return {
      success: true,
      data: result.data,
    };
  }

  const errors = result.error.issues
    .map((err) => `  - ${err.path.join('.') || 'root'}: ${err.message}`)
    .join('\n');

  return {
    success: false,
    error: `Validation failed:\n${errors}`,
  };
}
