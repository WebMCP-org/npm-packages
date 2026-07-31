import type { CallToolResult, Tool, ToolAnnotations } from '@modelcontextprotocol/server';
import {
  CallToolRequestParamsSchema,
  CallToolResultSchema,
  ToolAnnotationsSchema,
  ToolSchema,
} from '@modelcontextprotocol/core';
import { z } from 'zod/v4';

/**
 * SDK-derived canonical tool schema used internally by the relay.
 */
export const NormalizedToolSchema = ToolSchema.extend({
  name: ToolSchema.shape.name.min(1),
});

/**
 * Permissive inbound tool shape from browser/widget payloads.
 *
 * Only enforces a non-empty name at ingest. All other fields are normalized
 * against SDK schemas by {@link normalizeInboundTool}.
 */
export const InboundToolSchema = z.object({ name: z.string().min(1) }).passthrough();

/**
 * SDK-derived argument schema for tool invocation payloads.
 */
export const RelayInvokeArgsSchema = CallToolRequestParamsSchema.shape.arguments;

/**
 * Default input schema applied when inbound payload omits or provides
 * a non-object input schema.
 */
export const DEFAULT_TOOL_INPUT_SCHEMA: Tool['inputSchema'] = {
  type: 'object',
  properties: {},
};

/**
 * Canonical normalized relay tool shape.
 */
export type RelayTool = z.infer<typeof NormalizedToolSchema>;

/**
 * Canonical relay tool annotations shape.
 */
export type RelayToolAnnotations = ToolAnnotations;

/**
 * Canonical relay call result shape.
 */
export type RelayCallToolResult = CallToolResult;

/**
 * Invocation argument object shape derived from MCP SDK request params.
 */
export type RelayInvokeArgs = Exclude<z.infer<typeof RelayInvokeArgsSchema>, undefined>;

/**
 * Normalizes permissive inbound tool payloads into SDK-compliant Tool objects.
 *
 * Invalid optional metadata (description, output schema, annotations, etc.)
 * is dropped. Invalid/missing inputSchema falls back to an empty object schema.
 */
export function normalizeInboundTool(inbound: z.infer<typeof InboundToolSchema>): RelayTool {
  const inputSchemaParsed = ToolSchema.shape.inputSchema.safeParse(inbound.inputSchema);

  const normalizedCandidate: Record<string, unknown> = {
    name: inbound.name,
    inputSchema: inputSchemaParsed.success ? inputSchemaParsed.data : DEFAULT_TOOL_INPUT_SCHEMA,
  };

  for (const key of [
    'title',
    'description',
    'outputSchema',
    'annotations',
    'icons',
    'execution',
    '_meta',
  ] as const) {
    const parsed = ToolSchema.shape[key].safeParse(inbound[key]);
    if (parsed.success && parsed.data !== undefined) {
      normalizedCandidate[key] = parsed.data;
    }
  }

  const normalizedParsed = NormalizedToolSchema.safeParse(normalizedCandidate);
  if (normalizedParsed.success) {
    return normalizedParsed.data;
  }

  return {
    name: inbound.name,
    inputSchema: DEFAULT_TOOL_INPUT_SCHEMA,
  };
}

export { CallToolRequestParamsSchema, CallToolResultSchema, ToolAnnotationsSchema, ToolSchema };
