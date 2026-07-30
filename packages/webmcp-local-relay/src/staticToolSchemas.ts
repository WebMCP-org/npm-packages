import { z } from 'zod/v4';

export type StaticToolInputShape = Record<string, z.ZodTypeAny>;

export const EMPTY_STATIC_TOOL_INPUT_SHAPE = {} satisfies StaticToolInputShape;

export const WEBMCP_OPEN_PAGE_INPUT_SHAPE = {
  url: z.string().describe('URL to open or match for refresh.'),
  refresh: z
    .boolean()
    .optional()
    .describe(
      'If true, refresh the connected source matching this URL instead of opening a new tab.'
    ),
} satisfies StaticToolInputShape;
