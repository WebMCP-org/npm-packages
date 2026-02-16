import type { InputSchema } from '@mcp-b/webmcp-types';
import type { z } from 'zod';
import { zodToJsonSchema as zodToJsonSchemaLib } from 'zod-to-json-schema';

export type ZodSchemaObject = Record<string, z.ZodTypeAny>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function isZodSchema(schema: unknown): schema is ZodSchemaObject {
  if (!isRecord(schema)) return false;
  if ('type' in schema && typeof schema.type === 'string') return false;
  const values = Object.values(schema);
  if (values.length === 0) return false;
  return values.some((v) => isRecord(v) && '_def' in v);
}

function isOptionalSchema(schema: unknown): boolean {
  if (!isRecord(schema) || !isRecord((schema as any)._def)) return false;
  const typeName = (schema as any)._def.typeName;
  return typeName === 'ZodOptional' || typeName === 'ZodDefault';
}

function stripSchemaMeta(schema: InputSchema): InputSchema {
  const { $schema, ...rest } = schema as InputSchema & { $schema?: string };
  if (rest.properties) {
    const props: Record<string, InputSchema> = {};
    for (const [k, v] of Object.entries(rest.properties)) {
      props[k] = stripSchemaMeta(v as InputSchema);
    }
    rest.properties = props;
  }
  return rest;
}

export function zodToJsonSchema(schema: ZodSchemaObject): InputSchema {
  const properties: Record<string, InputSchema> = {};
  const required: string[] = [];

  for (const [key, zodSchema] of Object.entries(schema)) {
    const propSchema = zodToJsonSchemaLib(zodSchema, {
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
