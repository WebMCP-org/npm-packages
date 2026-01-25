import { z } from 'zod';
import { createLogger } from './logger.js';
import type { InputSchema } from './types.js';

const logger = createLogger('WebModelContext');

/**
 * Result of Zod schema detection with version information
 */
export interface ZodSchemaDetection {
  isZodSchema: boolean;
  hasZod4: boolean;
  hasZod3: boolean;
}

/**
 * Detect if a schema is a Zod schema object and which version.
 *
 * Uses duck-typing to detect Zod schemas:
 * - Zod 4 schemas have `_zod` property
 * - Zod 3 schemas have `_def` property (but not `_zod`)
 */
export function detectZodSchema(schema: unknown): ZodSchemaDetection {
  if (typeof schema !== 'object' || schema === null) {
    return { isZodSchema: false, hasZod4: false, hasZod3: false };
  }

  // JSON Schema has a 'type' property that's a string
  if ('type' in schema && typeof (schema as { type: unknown }).type === 'string') {
    return { isZodSchema: false, hasZod4: false, hasZod3: false };
  }

  const values = Object.values(schema);
  if (values.length === 0) {
    return { isZodSchema: false, hasZod4: false, hasZod3: false };
  }

  let hasZod4 = false;
  let hasZod3 = false;

  for (const val of values) {
    if (val == null || typeof val !== 'object') continue;
    const obj = val as object;

    if ('_zod' in obj) {
      hasZod4 = true;
    } else if ('_def' in obj) {
      // Has _def but not _zod = Zod 3
      hasZod3 = true;
    }
  }

  return {
    isZodSchema: hasZod4 || hasZod3,
    hasZod4,
    hasZod3,
  };
}

/**
 * Detect if a schema is a Zod schema object (Record<string, ZodType>)
 * or a JSON Schema object.
 *
 * Uses duck-typing to detect Zod schemas:
 * - Zod 4 schemas have `_zod` property
 * - Zod 3 schemas have `_def` property
 */
export function isZodSchema(schema: unknown): boolean {
  return detectZodSchema(schema).isZodSchema;
}

/**
 * Convert JSON Schema to Zod validator
 * Uses Zod 4's native z.fromJSONSchema() for conversion
 */
export function jsonSchemaToZod(jsonSchema: InputSchema): z.ZodType {
  try {
    // Zod 4 has native fromJSONSchema support
    const zodSchema = z.fromJSONSchema(jsonSchema as z.core.JSONSchema.BaseSchema);
    return zodSchema;
  } catch (error) {
    logger.warn('Failed to convert JSON Schema to Zod:', error);
    return z.object({}).passthrough();
  }
}

/**
 * Convert Zod schema object to JSON Schema
 * Uses Zod 4's native z.toJSONSchema() for conversion
 *
 * @param schema - Record of Zod type definitions (e.g., { name: z.string(), age: z.number() })
 * @returns JSON Schema object compatible with MCP InputSchema
 */
export function zodToJsonSchema(schema: Record<string, z.ZodTypeAny>): InputSchema {
  const zodObject = z.object(schema);
  const jsonSchema = z.toJSONSchema(zodObject);

  // Remove $schema field as it's not needed for MCP
  const { $schema: _, ...rest } = jsonSchema as { $schema?: string } & InputSchema;
  return rest as InputSchema;
}

/**
 * Error thrown when Zod 3 schemas are detected.
 * Zod 4 is required for schema conversion.
 */
export class Zod3SchemaError extends Error {
  constructor() {
    super(
      'Zod 3 schema detected. This package requires Zod 4 for schema support.\n\n' +
        'Solutions:\n' +
        '  1. Upgrade to zod@4.x: pnpm add zod@4\n' +
        '  2. If using zod@3.25+, import from the v4 subpath:\n' +
        '     import { z } from "zod/v4"\n' +
        '  3. Use JSON Schema instead of Zod schemas\n\n' +
        'See https://zod.dev/v4/versioning for more information.'
    );
    this.name = 'Zod3SchemaError';
  }
}

/**
 * Normalize a schema to both JSON Schema and Zod formats
 * Detects which format is provided and converts to the other
 *
 * @throws {Zod3SchemaError} If Zod 3 schemas are detected
 */
export function normalizeSchema(schema: InputSchema | Record<string, z.ZodTypeAny>): {
  jsonSchema: InputSchema;
  zodValidator: z.ZodType;
} {
  const detection = detectZodSchema(schema);

  if (detection.hasZod3 && !detection.hasZod4) {
    throw new Zod3SchemaError();
  }

  if (detection.isZodSchema) {
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
