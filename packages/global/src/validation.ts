/**
 * Zod validation utilities with compatibility for both Zod 3.x and Zod 4.x
 *
 * This module follows the same approach as the official MCP TypeScript SDK:
 * - Uses `zod-to-json-schema` for Zod 3.x
 * - Uses built-in `toJSONSchema` for Zod 4.x
 * - Detects Zod version at runtime via _zod property (Zod 4) vs _def (Zod 3)
 */
import { z } from 'zod';
import { zodToJsonSchema as zodToJsonSchemaV3 } from 'zod-to-json-schema';
import { createLogger } from './logger.js';
import type { InputSchema } from './types.js';

const logger = createLogger('WebModelContext');

// ============================================================================
// Zod Version Detection (following official MCP SDK approach)
// ============================================================================

/**
 * Check if a schema is a Zod 4 schema.
 * Zod 4 schemas have a `_zod` property, Zod 3 schemas have `_def`.
 */
function isZod4Schema(schema: unknown): boolean {
  if (typeof schema !== 'object' || schema === null) {
    return false;
  }
  return '_zod' in schema;
}

/**
 * Check if a schema is a Zod 3 schema.
 */
function isZod3Schema(schema: unknown): boolean {
  if (typeof schema !== 'object' || schema === null) {
    return false;
  }
  return '_def' in schema && !('_zod' in schema);
}

// ============================================================================
// Lazy-loaded Zod 4 functions (may not be available in Zod 3.x)
// ============================================================================

// Cache for zod/v4 module - use any to avoid type conflicts between Zod versions
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ZodV4ToJSONSchema = (schema: any, opts?: any) => any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ZodV4FromJSONSchema = (schema: any) => any;

interface ZodV4Module {
  toJSONSchema: ZodV4ToJSONSchema | undefined;
  fromJSONSchema: ZodV4FromJSONSchema | undefined;
}

let zodV4Module: ZodV4Module | null = null;
let zodV4LoadAttempted = false;

/**
 * Attempt to load zod/v4 module. Returns null if not available (Zod 3.x).
 */
async function getZodV4Module(): Promise<ZodV4Module | null> {
  if (zodV4LoadAttempted) {
    return zodV4Module;
  }
  zodV4LoadAttempted = true;

  try {
    // Dynamic import to avoid build-time errors in Zod 3.x
    const mod = await import('zod/v4');
    zodV4Module = {
      toJSONSchema: mod.toJSONSchema as ZodV4ToJSONSchema,
      fromJSONSchema:
        'fromJSONSchema' in mod ? (mod.fromJSONSchema as ZodV4FromJSONSchema) : undefined,
    };
  } catch {
    // zod/v4 not available (older Zod 3.x without the subpath)
    zodV4Module = null;
  }

  return zodV4Module;
}

// Synchronous version using cached module (for use after initial load)
function getZodV4ModuleSync(): ZodV4Module | null {
  return zodV4Module;
}

// Pre-load zod/v4 module on startup
getZodV4Module().catch(() => {
  // Silently fail - will use zod-to-json-schema fallback
});

// ============================================================================
// Public API
// ============================================================================

/**
 * Detect if a schema is a Zod schema object (Record<string, ZodType>)
 * or a JSON Schema object.
 *
 * Uses duck-typing to detect Zod schemas:
 * - Zod 4 schemas have `_zod` property
 * - Zod 3 schemas have `_def` property
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

/**
 * Convert Zod schema object to JSON Schema.
 * Uses the appropriate method based on detected Zod version:
 * - Zod 4: Built-in toJSONSchema from zod/v4
 * - Zod 3: zod-to-json-schema external library
 *
 * @param schema - Record of Zod type definitions (e.g., { name: z.string(), age: z.number() })
 * @returns JSON Schema object compatible with MCP InputSchema
 */
export function zodToJsonSchema(schema: Record<string, z.ZodTypeAny>): InputSchema {
  const zodObject = z.object(schema);

  // Check if this is a Zod 4 schema and we have the v4 module
  const zodV4 = getZodV4ModuleSync();
  if (isZod4Schema(zodObject) && zodV4?.toJSONSchema) {
    try {
      const jsonSchema = zodV4.toJSONSchema(zodObject, { target: 'draft-7' });
      const { $schema: _, ...rest } = jsonSchema as { $schema?: string } & InputSchema;
      return rest as InputSchema;
    } catch (error) {
      logger.warn('Zod 4 toJSONSchema failed, falling back to zod-to-json-schema:', error);
    }
  }

  // Zod 3 or fallback: use zod-to-json-schema
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const jsonSchema = zodToJsonSchemaV3(zodObject as any, {
      strictUnions: true,
      $refStrategy: 'none',
    });
    const { $schema: _, ...rest } = jsonSchema as { $schema?: string } & InputSchema;
    return rest as InputSchema;
  } catch (error) {
    logger.warn('zod-to-json-schema failed:', error);
    // Return minimal valid JSON Schema as fallback
    return {
      type: 'object',
      properties: {},
    };
  }
}

/**
 * Convert JSON Schema to Zod validator.
 * Only available in Zod 4.x via fromJSONSchema.
 * Falls back to a passthrough validator in Zod 3.x.
 *
 * Note: When using Zod 3.x with JSON Schema input, server-side validation
 * is skipped. The MCP client still validates against the JSON Schema.
 */
export function jsonSchemaToZod(jsonSchema: InputSchema): z.ZodType {
  const zodV4 = getZodV4ModuleSync();

  if (zodV4?.fromJSONSchema) {
    try {
      const zodSchema = zodV4.fromJSONSchema(jsonSchema);
      return zodSchema as unknown as z.ZodType;
    } catch (error) {
      logger.warn('fromJSONSchema failed:', error);
    }
  } else {
    // fromJSONSchema not available (Zod 3.x)
    logger.debug(
      'fromJSONSchema not available (Zod 3.x). ' +
        'Server-side validation will be skipped for JSON Schema input. ' +
        'Upgrade to Zod 4.x for full JSON Schema validation support.'
    );
  }

  // Fallback: passthrough validator (accepts any object)
  return z.object({}).passthrough();
}

/**
 * Normalize a schema to both JSON Schema and Zod formats.
 * Detects which format is provided and converts to the other.
 *
 * Supports:
 * - Zod schemas from Zod 3.x or Zod 4.x
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
