import type { InputSchema } from '@mcp-b/webmcp-types';
import { normalizeObjectSchema } from '@modelcontextprotocol/sdk/server/zod-compat.js';
import { toJsonSchemaCompat } from '@modelcontextprotocol/sdk/server/zod-json-schema-compat.js';

export const DEFAULT_INPUT_SCHEMA: InputSchema = { type: 'object', properties: {} };

export interface ToWebMcpJsonSchemaOptions {
  requireObjectType?: boolean;
}

/**
 * Converts Zod schemas, Zod raw shapes, or plain JSON Schema objects to the
 * JSON Schema shape expected by WebMCP tool descriptors.
 */
export function toWebMcpJsonSchema(
  schema: unknown,
  options: ToWebMcpJsonSchemaOptions = {}
): InputSchema {
  const requireObjectType = options.requireObjectType ?? true;

  if (!schema || typeof schema !== 'object') {
    return requireObjectType ? DEFAULT_INPUT_SCHEMA : ({} as InputSchema);
  }

  const normalized = normalizeObjectSchema(schema as Parameters<typeof normalizeObjectSchema>[0]);
  const jsonSchema = normalized
    ? (toJsonSchemaCompat(normalized, {
        strictUnions: true,
        pipeStrategy: 'input',
      }) as unknown as Record<string, unknown>)
    : (schema as Record<string, unknown>);

  if (Object.keys(jsonSchema).length === 0) {
    return requireObjectType ? DEFAULT_INPUT_SCHEMA : (jsonSchema as InputSchema);
  }

  if (requireObjectType && jsonSchema.type === undefined) {
    return { type: 'object', ...jsonSchema } as InputSchema;
  }

  return jsonSchema as InputSchema;
}

export function toWebMcpInputSchema(schema: unknown): InputSchema {
  return toWebMcpJsonSchema(schema, { requireObjectType: true });
}
