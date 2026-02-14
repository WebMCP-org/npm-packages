import type { InputSchema } from '@mcp-b/webmcp-types';
import type { z } from 'zod';
import { zodToJsonSchema as zodToJsonSchemaLib } from 'zod-to-json-schema';

const stripSchemaMeta = <T extends Record<string, unknown>>(schema: T): T => {
  const { $schema: _, ...rest } = schema as T & { $schema?: string };
  return rest as T;
};

const isOptionalSchema = (schema: z.ZodTypeAny): boolean => {
  const typeName = (schema as { _def?: { typeName?: string } })._def?.typeName;
  return typeName === 'ZodOptional' || typeName === 'ZodDefault';
};

/**
 * Converts a Zod schema object (Record<string, z.ZodTypeAny>) to a JSON Schema
 * compatible with the MCP `InputSchema` type.
 *
 * @param schema - Zod schema object where keys are property names
 * @returns JSON Schema object compatible with MCP InputSchema
 */
export function zodSchemaObjectToJsonSchema(schema: Record<string, z.ZodTypeAny>): InputSchema {
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
