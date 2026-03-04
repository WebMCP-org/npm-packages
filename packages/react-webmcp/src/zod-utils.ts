import type { InputSchema } from '@mcp-b/webmcp-types';
import type { z } from 'zod';
import { z as zod3 } from 'zod/v3';
import { z as zod4, toJSONSchema as zod4ToJsonSchema } from 'zod/v4-mini';
import { zodToJsonSchema as zodToJsonSchemaV3 } from 'zod-to-json-schema';

export type ZodSchemaObject = Record<string, z.ZodTypeAny>;

type ZodVersion = 'v3' | 'v4';

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function detectZodVersion(value: unknown): ZodVersion | null {
  if (!isRecord(value)) {
    return null;
  }

  if ('_zod' in value) {
    return 'v4';
  }

  if ('_def' in value) {
    return 'v3';
  }

  return null;
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

function getZodEntries(schema: Record<string, unknown>): Array<[string, z.ZodTypeAny, ZodVersion]> {
  const entries: Array<[string, z.ZodTypeAny, ZodVersion]> = [];

  for (const [key, value] of Object.entries(schema)) {
    const version = detectZodVersion(value);
    if (!version) {
      continue;
    }
    entries.push([key, value as z.ZodTypeAny, version]);
  }

  return entries;
}

function getSchemaVersion(entries: Array<[string, z.ZodTypeAny, ZodVersion]>): ZodVersion {
  const versions = new Set(entries.map((entry) => entry[2]));
  if (versions.size > 1) {
    throw new Error(
      'Mixed Zod versions detected in schema shape. Use either all Zod v3 schemas or all Zod v4 schemas.'
    );
  }

  const version = versions.values().next().value;
  if (!version) {
    throw new Error('No Zod schemas found in provided schema shape.');
  }

  return version;
}

export function isZodSchema(schema: unknown): schema is ZodSchemaObject {
  if (!isRecord(schema)) {
    return false;
  }

  return getZodEntries(schema).length > 0;
}

export function zodToJsonSchema(schema: ZodSchemaObject): InputSchema {
  const entries = getZodEntries(schema as Record<string, unknown>);
  const version = getSchemaVersion(entries);

  if (version === 'v3') {
    const objectSchema = zod3.object(
      Object.fromEntries(entries.map(([key, value]) => [key, value]))
    );
    const jsonSchema = zodToJsonSchemaV3(objectSchema, {
      strictUnions: true,
      $refStrategy: 'none',
    });
    return stripSchemaMeta(jsonSchema as InputSchema);
  }

  const objectSchema = zod4.object(Object.fromEntries(entries.map(([key, value]) => [key, value])));
  return stripSchemaMeta(zod4ToJsonSchema(objectSchema) as InputSchema);
}
