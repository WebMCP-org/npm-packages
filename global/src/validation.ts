// validation.ts - JSON Schema <-> Zod conversion and validation utilities

import { jsonSchemaToZod as convertJsonSchemaToZod } from '@composio/json-schema-to-zod';
import { z } from 'zod';
import type { InputSchema } from './types.js';

/**
 * Detect if a schema is a Zod schema object (Record<string, ZodType>)
 * or a JSON Schema object
 */
export function isZodSchema(schema: unknown): boolean {
  if (typeof schema !== 'object' || schema === null) {
    return false;
  }

  // JSON Schema always has a 'type' property at the root
  if ('type' in schema && typeof (schema as { type: unknown }).type === 'string') {
    return false; // This is JSON Schema
  }

  // Check if any property value is a Zod type instance
  const values = Object.values(schema);
  if (values.length === 0) {
    return false; // Empty object, treat as JSON Schema
  }

  // If any value is a ZodType, it's a Zod schema
  return values.some((val) => val instanceof z.ZodType);
}

/**
 * Convert JSON Schema to Zod validator
 * Uses @composio/json-schema-to-zod for conversion
 */
export function jsonSchemaToZod(jsonSchema: InputSchema): z.ZodType {
  try {
    // convertJsonSchemaToZod returns a Zod schema from JSON Schema
    const zodSchema = convertJsonSchemaToZod(jsonSchema as unknown as object);
    return zodSchema;
  } catch (error) {
    console.warn('[Web Model Context] Failed to convert JSON Schema to Zod:', error);
    // Fallback: accept anything with passthrough
    return z.object({}).passthrough();
  }
}

/**
 * Convert Zod schema object to JSON Schema
 * Based on react-webmcp implementation
 */
export function zodToJsonSchema(schema: Record<string, z.ZodTypeAny>): InputSchema {
  const properties: Record<string, { type: string; description?: string; [key: string]: unknown }> =
    {};
  const required: string[] = [];

  for (const [key, zodType] of Object.entries(schema)) {
    // Extract description if available
    const description = (zodType as { description?: string }).description || undefined;

    // Infer JSON Schema type from Zod type
    let type = 'string';
    let enumValues: unknown[] | undefined;
    let items: unknown | undefined;

    if (zodType instanceof z.ZodString) {
      type = 'string';
    } else if (zodType instanceof z.ZodNumber) {
      type = 'number';
    } else if (zodType instanceof z.ZodBoolean) {
      type = 'boolean';
    } else if (zodType instanceof z.ZodArray) {
      type = 'array';
      // Try to get array item type
      const elementType = (zodType as { element?: z.ZodTypeAny }).element;
      if (elementType instanceof z.ZodString) {
        items = { type: 'string' };
      } else if (elementType instanceof z.ZodNumber) {
        items = { type: 'number' };
      } else if (elementType instanceof z.ZodBoolean) {
        items = { type: 'boolean' };
      } else {
        items = { type: 'string' };
      }
    } else if (zodType instanceof z.ZodObject) {
      type = 'object';
    } else if (zodType instanceof z.ZodEnum) {
      type = 'string';
      // Extract enum values
      const enumDef = (zodType as { _def?: { values?: unknown[] } })._def;
      if (enumDef?.values) {
        enumValues = enumDef.values;
      }
    }

    const propertySchema: { type: string; description?: string; [key: string]: unknown } = { type };
    if (description) {
      propertySchema.description = description;
    }
    if (enumValues) {
      propertySchema.enum = enumValues;
    }
    if (items) {
      propertySchema.items = items;
    }

    properties[key] = propertySchema;

    // Check if field is required (not optional)
    if (!zodType.isOptional()) {
      required.push(key);
    }
  }

  return {
    type: 'object',
    properties,
    ...(required.length > 0 && { required }),
  };
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
    // Input is Zod schema object → convert to JSON Schema and wrap in z.object()
    const jsonSchema = zodToJsonSchema(schema as Record<string, z.ZodTypeAny>);
    const zodValidator = z.object(schema as Record<string, z.ZodTypeAny>);
    return { jsonSchema, zodValidator };
  }

  // Input is JSON Schema → convert to Zod
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
    // Format Zod errors into readable message
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
