import * as z from 'zod/v4';

type JsonSchemaObject = Record<string, unknown>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
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
 * Convert a Zod v4 schema to JSON Schema.
 */
export function zodSchemaToJsonSchemaCompat(
  schema: z.ZodTypeAny,
  _name?: string
): JsonSchemaObject {
  return stripSchemaMeta(z.toJSONSchema(schema) as JsonSchemaObject);
}
