import type { InputSchema } from '@mcp-b/webmcp-types';
import type { z } from 'zod';
import { zodToJsonSchema as zodToJsonSchemaLib } from 'zod-to-json-schema';

export type ZodSchemaObject = Record<string, z.ZodTypeAny>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isZodLikeValue(value: unknown): boolean {
  // `_def` is present on both zod/v3 and zod v4 schema instances.
  // Restricting detection to `_def` avoids misclassifying non-Zod Standard Schema values.
  return isRecord(value) && '_def' in value;
}

type ZodDefinitionCarrier = {
  _def: {
    typeName: unknown;
    type?: unknown;
  };
};

type ZodJsonSchemaCarrier = {
  toJSONSchema: () => unknown;
};

function hasZodTypeName(schema: unknown): schema is ZodDefinitionCarrier {
  if (!isRecord(schema)) {
    return false;
  }

  const definition = schema._def;
  return isRecord(definition) && 'typeName' in definition;
}

export function isZodSchema(schema: unknown): schema is ZodSchemaObject {
  if (!isRecord(schema)) return false;
  const values = Object.values(schema);
  if (values.length === 0) return false;
  return values.some((value) => isZodLikeValue(value));
}

function isOptionalSchema(schema: unknown): boolean {
  if (!hasZodTypeName(schema)) {
    if (!isRecord(schema) || !isRecord(schema._def)) {
      return false;
    }

    return schema._def.type === 'optional' || schema._def.type === 'default';
  }

  const { typeName } = schema._def;
  return typeName === 'ZodOptional' || typeName === 'ZodDefault';
}

function hasNativeJsonSchema(schema: unknown): schema is ZodJsonSchemaCarrier {
  return isRecord(schema) && typeof schema.toJSONSchema === 'function';
}

function stripSchemaMeta(schema: InputSchema): InputSchema {
  const rest = { ...schema } as InputSchema & { $schema?: string };
  delete rest.$schema;
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

  for (const [key, rawValue] of Object.entries(schema)) {
    if (!isZodLikeValue(rawValue)) {
      continue;
    }

    const zodSchema = rawValue as z.ZodTypeAny;
    let propSchema: unknown = zodToJsonSchemaLib(zodSchema, {
      strictUnions: true,
      $refStrategy: 'none',
    });

    if (isRecord(propSchema) && !('type' in propSchema) && hasNativeJsonSchema(zodSchema)) {
      propSchema = zodSchema.toJSONSchema();
    }

    properties[key] = stripSchemaMeta(propSchema as InputSchema);
    if (!isOptionalSchema(zodSchema)) {
      required.push(key);
    }
  }

  const result: InputSchema = { type: 'object', properties };
  if (required.length > 0) result.required = required;
  return result;
}
