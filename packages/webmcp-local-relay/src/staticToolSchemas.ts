import { toJsonSchemaCompat } from '@modelcontextprotocol/sdk/server/zod-json-schema-compat.js';
import { z } from 'zod/v4';

export type StaticToolInputShape = Record<string, z.ZodTypeAny>;

export const EMPTY_STATIC_TOOL_INPUT_SHAPE = {} satisfies StaticToolInputShape;

export const WEBMCP_CALL_TOOL_INPUT_SHAPE = {
  name: z
    .string()
    .describe('The tool name to call. Use webmcp_list_tools to see available tool names.'),
  arguments: z
    .record(z.string(), z.unknown())
    .optional()
    .describe(
      'Arguments to pass to the tool as a JSON object. Check the tool inputSchema from webmcp_list_tools for expected fields.'
    ),
} satisfies StaticToolInputShape;

export const WEBMCP_OPEN_PAGE_INPUT_SHAPE = {
  url: z.string().describe('URL to open or match for refresh.'),
  refresh: z
    .boolean()
    .optional()
    .describe(
      'If true, refresh the connected source matching this URL instead of opening a new tab.'
    ),
} satisfies StaticToolInputShape;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function stripJsonSchemaMetadata(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => stripJsonSchemaMetadata(item));
  }

  if (!isRecord(value)) {
    return value;
  }

  const next: Record<string, unknown> = {};
  for (const [key, nestedValue] of Object.entries(value)) {
    if (key === '$schema') {
      continue;
    }
    next[key] = stripJsonSchemaMetadata(nestedValue);
  }
  return next;
}

export function publicInputSchemaFromZodShape(
  inputShape: StaticToolInputShape
): Record<string, unknown> {
  return stripJsonSchemaMetadata(
    toJsonSchemaCompat(z.object(inputShape), {
      strictUnions: true,
      pipeStrategy: 'input',
    }) as Record<string, unknown>
  ) as Record<string, unknown>;
}
