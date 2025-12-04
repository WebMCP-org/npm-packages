import { jsonSchemaToZod as convertJsonSchemaToZod } from '@composio/json-schema-to-zod';
import { z } from 'zod';
import { zodToJsonSchema as zodToJsonSchemaLib } from 'zod-to-json-schema';
import type { InputSchema } from './types.js';

/**
 * Detect if a schema is a Zod schema object (Record<string, ZodType>)
 * or a JSON Schema object
 */
export function isZodSchema(schema: unknown): boolean {
  if (typeof schema !== 'object' || schema === null) {
    return false;
  }

  if ('type' in schema && typeof (schema as { type: unknown }).type === 'string') {
    return false;
  }

  const values = Object.values(schema);
  if (values.length === 0) {
    return false;
  }

  return values.some((val) => val instanceof z.ZodType);
}

/**
 * Convert JSON Schema to Zod validator
 * Uses @composio/json-schema-to-zod for conversion
 */
export function jsonSchemaToZod(jsonSchema: InputSchema): z.ZodType {
  try {
    const zodSchema = convertJsonSchemaToZod(jsonSchema as unknown as object);
    return zodSchema;
  } catch (error) {
    console.warn('[Web Model Context] Failed to convert JSON Schema to Zod:', error);
    return z.object({}).passthrough();
  }
}

/**
 * Convert Zod schema object to JSON Schema
 * Uses zod-to-json-schema package for comprehensive conversion
 *
 * @param schema - Record of Zod type definitions (e.g., { name: z.string(), age: z.number() })
 * @returns JSON Schema object compatible with MCP InputSchema
 */
export function zodToJsonSchema(schema: Record<string, z.ZodTypeAny>): InputSchema {
  const zodObject = z.object(schema);
  const jsonSchema = zodToJsonSchemaLib(zodObject, {
    $refStrategy: 'none',
    target: 'jsonSchema7',
  });

  // Remove $schema field as it's not needed for MCP
  const { $schema: _, ...rest } = jsonSchema as { $schema?: string } & InputSchema;
  return rest as InputSchema;
}

/**
 * Normalize a schema to both JSON Schema and Zod formats
 * Detects which format is provided and converts to the other
 */
export function normalizeSchema(schema: InputSchema | Record<string, z.ZodTypeAny>): {
  jsonSchema: InputSchema;
  zodValidator: z.ZodType;
} {
  const isZod = isZodSchema(schema);

  if (isZod) {
    const jsonSchema = zodToJsonSchema(schema as Record<string, z.ZodTypeAny>);
    const zodValidator = z.object(schema as Record<string, z.ZodTypeAny>);
    return { jsonSchema, zodValidator };
  }

  const jsonSchema = schema as InputSchema;
  const zodValidator = jsonSchemaToZod(jsonSchema);
  return { jsonSchema, zodValidator };
}

/**
 * Validate data with Zod schema and return formatted result
 */
export function validateWithZod(
  data: unknown,
  validator: z.ZodType
): { success: true; data: unknown } | { success: false; error: string } {
  const result = validator.safeParse(data);

  if (!result.success) {
    const errors = result.error.errors
      .map((err) => `  - ${err.path.join('.') || 'root'}: ${err.message}`)
      .join('\n');
    return {
      success: false,
      error: `Validation failed:\n${errors}`,
    };
  }

  return {
    success: true,
    data: result.data,
  };
}
