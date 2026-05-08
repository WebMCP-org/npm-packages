import type { InputSchema } from '@mcp-b/webmcp-ts-sdk';
import type { z } from 'zod';
import { toJSONSchema as zod4ToJsonSchema } from 'zod/v4-mini';
import { zodToJsonSchema as zodToJsonSchemaV3 } from 'zod-to-json-schema';

type ZodVersion = 'v3' | 'v4';

const zodToJsonSchemaV3Compat = zodToJsonSchemaV3 as unknown as (
  schema: z.ZodTypeAny,
  options: {
    strictUnions: boolean;
    $refStrategy: 'none';
  }
) => InputSchema;

const zod4ToJsonSchemaCompat = zod4ToJsonSchema as unknown as (schema: z.ZodTypeAny) => InputSchema;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function detectZodVersion(schema: unknown): ZodVersion | null {
  if (!isRecord(schema)) {
    return null;
  }

  if ('_zod' in schema) {
    return 'v4';
  }

  if ('_def' in schema) {
    return 'v3';
  }

  return null;
}

function stripSchemaMeta(schema: InputSchema): InputSchema {
  const rest = { ...schema } as InputSchema & { $schema?: string; properties?: unknown };
  delete rest.$schema;

  if (isRecord(rest.properties)) {
    const props: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(rest.properties)) {
      props[key] = isRecord(value) ? stripSchemaMeta(value) : value;
    }
    rest.properties = props as NonNullable<InputSchema['properties']>;
  }

  return rest;
}

/**
 * Convert a Zod schema to JSON Schema with Zod v3/v4 compatibility.
 * Uses the same split conversion model as MCP SDK compat helpers.
 */
export function zodSchemaToJsonSchemaCompat(schema: z.ZodTypeAny, _name?: string): InputSchema {
  const version = detectZodVersion(schema);
  if (!version) {
    throw new Error('Expected a Zod schema instance (v3 or v4).');
  }

  if (version === 'v3') {
    return stripSchemaMeta(
      zodToJsonSchemaV3Compat(schema, {
        strictUnions: true,
        $refStrategy: 'none',
      })
    );
  }

  return stripSchemaMeta(zod4ToJsonSchemaCompat(schema));
}
