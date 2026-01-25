/**
 * Zod validation utilities with compatibility for both Zod 3.x and Zod 4.x
 *
 * Conversion strategy:
 * - Zod → JSON Schema:
 *   - Zod 4.x: Uses native `z.toJSONSchema()` (available on main zod import)
 *   - Zod 3.x: Uses `zod-to-json-schema` library
 * - JSON Schema → Zod: Uses `@n8n/json-schema-to-zod` (works with both Zod versions)
 */
import { jsonSchemaToZod as n8nJsonSchemaToZod } from '@n8n/json-schema-to-zod';
import { z } from 'zod';
import { zodToJsonSchema as zodToJsonSchemaV3 } from 'zod-to-json-schema';
import { createLogger } from './logger.js';
import type { InputSchema } from './types.js';

const logger = createLogger('WebModelContext');

// ============================================================================
// Zod Schema Detection
// ============================================================================

/**
 * Check if a schema is a Zod 4 schema (has `_zod` property).
 */
function isZod4Schema(schema: unknown): boolean {
  return typeof schema === 'object' && schema !== null && '_zod' in schema;
}

/**
 * Check if a schema is a Zod 3 schema (has `_def` but not `_zod`).
 */
function isZod3Schema(schema: unknown): boolean {
  return typeof schema === 'object' && schema !== null && '_def' in schema && !('_zod' in schema);
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Detect if a schema is a Zod schema object (Record<string, ZodType>)
 * or a JSON Schema object.
 */
export function isZodSchema(schema: unknown): boolean {
  if (typeof schema !== 'object' || schema === null) {
    return false;
  }

  // JSON Schema has a 'type' property that's a string
  if ('type' in schema && typeof (schema as { type: unknown }).type === 'string') {
    return false;
  }

  const values = Object.values(schema);
  if (values.length === 0) {
    return false;
  }

  for (const val of values) {
    if (val == null || typeof val !== 'object') continue;
    if (isZod4Schema(val) || isZod3Schema(val)) {
      return true;
    }
  }

  return false;
}

// Check if native z.toJSONSchema is available (Zod 4.x)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const hasNativeToJSONSchema = typeof (z as any).toJSONSchema === 'function';

/**
 * Convert Zod schema object to JSON Schema.
 * - Zod 4.x: Uses native `z.toJSONSchema()` (available on main zod import)
 * - Zod 3.x: Uses `zod-to-json-schema` library
 *
 * @param schema - Record of Zod type definitions (e.g., { name: z.string(), age: z.number() })
 * @returns JSON Schema object compatible with MCP InputSchema
 */
export function zodToJsonSchema(schema: Record<string, z.ZodTypeAny>): InputSchema {
  const zodObject = z.object(schema);

  // Zod 4.x: Use native toJSONSchema
  if (hasNativeToJSONSchema) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const jsonSchema = (z as any).toJSONSchema(zodObject, { target: 'draft-7' });
      const { $schema: _, ...rest } = jsonSchema as { $schema?: string } & InputSchema;
      return rest as InputSchema;
    } catch (error) {
      logger.warn('z.toJSONSchema failed, falling back to zod-to-json-schema:', error);
    }
  }

  // Zod 3.x or fallback: use zod-to-json-schema
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const jsonSchema = zodToJsonSchemaV3(zodObject as any, {
      strictUnions: true,
      $refStrategy: 'none',
    });
    const { $schema: _, ...rest } = jsonSchema as { $schema?: string } & InputSchema;
    return rest as InputSchema;
  } catch (error) {
    logger.warn('zodToJsonSchema failed:', error);
    return { type: 'object', properties: {} };
  }
}

/**
 * Convert JSON Schema to Zod validator.
 * Works with both Zod 3.x and Zod 4.x using @n8n/json-schema-to-zod.
 *
 * @param jsonSchema - JSON Schema object
 * @returns Zod schema for validation
 */
export function jsonSchemaToZod(jsonSchema: InputSchema): z.ZodType {
  try {
    const zodSchema = n8nJsonSchemaToZod(jsonSchema);
    return zodSchema as unknown as z.ZodType;
  } catch (error) {
    logger.warn('jsonSchemaToZod failed:', error);
    // Fallback: passthrough validator
    return z.object({}).passthrough();
  }
}

/**
 * Normalize a schema to both JSON Schema and Zod formats.
 * Detects which format is provided and converts to the other.
 */
export function normalizeSchema(schema: InputSchema | Record<string, z.ZodTypeAny>): {
  jsonSchema: InputSchema;
  zodValidator: z.ZodType;
} {
  if (isZodSchema(schema)) {
    const jsonSchema = zodToJsonSchema(schema as Record<string, z.ZodTypeAny>);
    const zodValidator = z.object(schema as Record<string, z.ZodTypeAny>);
    return { jsonSchema, zodValidator };
  }

  const jsonSchema = schema as InputSchema;
  const zodValidator = jsonSchemaToZod(jsonSchema);
  return { jsonSchema, zodValidator };
}

/**
 * Validate data with Zod schema and return formatted result.
 */
export function validateWithZod(
  data: unknown,
  validator: z.ZodType
): { success: true; data: unknown } | { success: false; error: string } {
  const result = validator.safeParse(data);

  if (!result.success) {
    const errors = result.error.issues
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
