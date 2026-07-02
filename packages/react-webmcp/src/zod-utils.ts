import type { InputSchema } from '@mcp-b/webmcp-types';
import type { AnySchema, ZodRawShapeCompat } from '@modelcontextprotocol/sdk/server/zod-compat.js';
import { normalizeObjectSchema } from '@modelcontextprotocol/sdk/server/zod-compat.js';
import { toJsonSchemaCompat } from '@modelcontextprotocol/sdk/server/zod-json-schema-compat.js';

export type ZodTypeLike = {
  readonly _def?: unknown;
  readonly _output?: unknown;
  readonly _zod?: { readonly def?: unknown; readonly output?: unknown };
};
export type ZodSchemaObject = Record<string, ZodTypeLike>;
export type ZodSchema = ZodSchemaObject | ZodTypeLike;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function isZodType(schema: unknown): schema is ZodTypeLike {
  return isRecord(schema) && ('_def' in schema || '_zod' in schema);
}

export function isZodSchema(schema: unknown): schema is ZodSchemaObject {
  if (!isRecord(schema) || isZodType(schema)) {
    return false;
  }

  return normalizeObjectSchema(schema as ZodRawShapeCompat) !== undefined;
}

export function zodToJsonSchema(schema: ZodSchema): InputSchema {
  const normalized = normalizeObjectSchema(schema as AnySchema | ZodRawShapeCompat);
  const zodSchema = normalized ?? (isZodType(schema) ? (schema as AnySchema) : undefined);
  if (!zodSchema) {
    throw new Error('Expected a Zod schema or Zod schema object');
  }

  return toJsonSchemaCompat(zodSchema, {
    strictUnions: true,
    pipeStrategy: 'input',
  }) as InputSchema;
}
