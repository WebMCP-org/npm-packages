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

/** SDK tool schema with a browser-compatible default input schema. */
export const InboundToolSchema = NormalizedToolSchema.extend({
  inputSchema: NormalizedToolSchema.shape.inputSchema.optional(),
});

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
 * Applies the browser default input schema and validates the complete SDK tool.
 */
export function normalizeInboundTool(inbound: z.infer<typeof InboundToolSchema>): RelayTool {
  return NormalizedToolSchema.parse({
    ...inbound,
    inputSchema: inbound.inputSchema ?? DEFAULT_TOOL_INPUT_SCHEMA,
  });
}

export { CallToolRequestParamsSchema, CallToolResultSchema, ToolAnnotationsSchema, ToolSchema };
