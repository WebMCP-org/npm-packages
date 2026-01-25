// Use 'zod' for schema types (works with both Zod 3.25+ and Zod 4)
// Use 'zod/v4' for toJSONSchema/fromJSONSchema (available in both versions)
import { z } from 'zod';
import { fromJSONSchema, toJSONSchema } from 'zod/v4';
import { createLogger } from './logger.js';
import type { InputSchema } from './types.js';

const logger = createLogger('WebModelContext');

/**
 * Detect if a schema is a Zod schema object (Record<string, ZodType>)
 * or a JSON Schema object.
 *
 * Uses duck-typing to detect Zod schemas:
 * - Zod 4 schemas have `_zod` property
 * - Zod 3 schemas have `_def` property
 *
 * Both are supported as of Zod 3.25+ (which includes Zod 4 under the hood).
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
    const obj = val as object;

    // Zod 4 native or Zod 3.25+ compat layer (both have _zod or _def)
    if ('_zod' in obj || '_def' in obj) {
      return true;
    }
  }

  return false;
}

/**
 * Convert JSON Schema to Zod validator.
 * Uses fromJSONSchema from 'zod/v4' which is available in Zod 3.25+ and Zod 4.
 */
export function jsonSchemaToZod(jsonSchema: InputSchema): z.ZodType {
  try {
    const zodSchema = fromJSONSchema(jsonSchema as Parameters<typeof fromJSONSchema>[0]);
    return zodSchema as unknown as z.ZodType;
  } catch (error) {
    logger.warn('Failed to convert JSON Schema to Zod:', error);
    return z.object({}).passthrough();
  }
}

/**
 * Convert Zod schema object to JSON Schema.
 * Uses toJSONSchema from 'zod/v4' which is available in Zod 3.25+ and Zod 4.
 *
 * Works with schemas created from both `import { z } from 'zod'` (Zod 3.25+ compat)
 * and `import { z } from 'zod/v4'` (native Zod 4).
 *
 * @param schema - Record of Zod type definitions (e.g., { name: z.string(), age: z.number() })
 * @returns JSON Schema object compatible with MCP InputSchema
 */
export function zodToJsonSchema(schema: Record<string, z.ZodTypeAny>): InputSchema {
  const zodObject = z.object(schema);
  // toJSONSchema from 'zod/v4' works with both Zod 3.25+ compat schemas and Zod 4 schemas
  // Cast through unknown due to type differences between zod compat and zod/v4
  const jsonSchema = toJSONSchema(zodObject as unknown as Parameters<typeof toJSONSchema>[0]);

  // Remove $schema field as it's not needed for MCP
  const { $schema: _, ...rest } = jsonSchema as unknown as { $schema?: string } & InputSchema;
  return rest as InputSchema;
}

/**
 * Normalize a schema to both JSON Schema and Zod formats.
 * Detects which format is provided and converts to the other.
 *
 * Supports:
 * - Zod schemas from `import { z } from 'zod'` (Zod 3.25+ compat layer)
 * - Zod schemas from `import { z } from 'zod/v4'` (native Zod 4)
 * - Plain JSON Schema objects
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
 * Validate data with Zod schema and return formatted result
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
