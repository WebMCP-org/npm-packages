import type { z } from 'zod';
import { toJSONSchema as zod4ToJsonSchema } from 'zod/v4-mini';
import { zodToJsonSchema as zodToJsonSchemaV3 } from 'zod-to-json-schema';

type JsonSchemaObject = Record<string, unknown>;
type ZodVersion = 'v3' | 'v4';

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

function stripSchemaMeta(schema: JsonSchemaObject): JsonSchemaObject {
  const rest = { ...schema } as JsonSchemaObject & { $schema?: string; properties?: unknown };
  delete rest.$schema;

  if (isRecord(rest.properties)) {
    const props: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(rest.properties)) {
      props[key] = isRecord(value) ? stripSchemaMeta(value) : value;
    }
    rest.properties = props;
  }

  return rest;
}

/**
 * Convert a Zod schema to JSON Schema with Zod v3/v4 compatibility.
 * Uses the same split conversion model as MCP SDK compat helpers.
 */
export function zodSchemaToJsonSchemaCompat(
  schema: z.ZodTypeAny,
  _name?: string
): JsonSchemaObject {
  const version = detectZodVersion(schema);
  if (!version) {
    throw new Error('Expected a Zod schema instance (v3 or v4).');
  }

  if (version === 'v3') {
    return stripSchemaMeta(
      zodToJsonSchemaV3(schema, {
        strictUnions: true,
        $refStrategy: 'none',
      }) as JsonSchemaObject
    );
  }

  return stripSchemaMeta(
    zod4ToJsonSchema(schema as Parameters<typeof zod4ToJsonSchema>[0]) as JsonSchemaObject
  );
}
