import {
  CallToolRequestParamsSchema,
  type CallToolResult,
  CallToolResultSchema,
  type Tool,
  type ToolAnnotations,
  ToolAnnotationsSchema,
  ToolSchema,
} from '@modelcontextprotocol/sdk/types.js';
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
  const outputSchemaParsed = ToolSchema.shape.outputSchema.safeParse(inbound.outputSchema);
  const annotationsParsed = ToolAnnotationsSchema.safeParse(inbound.annotations);

  const normalizedCandidate: Record<string, unknown> = {
    name: inbound.name,
    inputSchema: inputSchemaParsed.success ? inputSchemaParsed.data : DEFAULT_TOOL_INPUT_SCHEMA,
  };

  if (typeof inbound.description === 'string') {
    normalizedCandidate.description = inbound.description;
  }
  if (typeof inbound.title === 'string') {
    normalizedCandidate.title = inbound.title;
  }
  if (outputSchemaParsed.success && outputSchemaParsed.data !== undefined) {
    normalizedCandidate.outputSchema = outputSchemaParsed.data;
  }
  if (annotationsParsed.success && annotationsParsed.data !== undefined) {
    normalizedCandidate.annotations = annotationsParsed.data;
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
