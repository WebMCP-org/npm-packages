import { z } from 'zod';

import {
  type ExtensionToolGroupContract,
  type ToolAnnotations,
  type ZodExtensionToolContract,
} from './core';

export const HISTORY_GROUP_CONTRACT = {
  id: 'history',
  title: 'History',
  description: 'Chrome history API actions for reading and mutating browser history.',
  chromeApi: 'history',
  requiredPermissions: ['history'],
  optionalPermissions: [],
} as const satisfies ExtensionToolGroupContract;

export const HISTORY_ACTION_IDS = [
  'addUrl',
  'deleteAll',
  'deleteRange',
  'deleteUrl',
  'getVisits',
  'search',
] as const;

export const HISTORY_ADD_URL_INPUT_SCHEMA = z.object({
  url: z.string().url().describe('The URL to add to history. Must be a valid URL format'),
});

export const HISTORY_DELETE_ALL_INPUT_SCHEMA = z.object({});

export const HISTORY_DELETE_RANGE_INPUT_SCHEMA = z.object({
  startTime: z
    .number()
    .min(0)
    .describe(
      'Items added to history after this date, represented in milliseconds since the epoch'
    ),
  endTime: z
    .number()
    .min(0)
    .describe(
      'Items added to history before this date, represented in milliseconds since the epoch'
    ),
});

export const HISTORY_DELETE_URL_INPUT_SCHEMA = z.object({
  url: z
    .string()
    .url()
    .describe(
      'The URL to remove from history. Must be in the format as returned from a call to history.search()'
    ),
});

export const HISTORY_GET_VISITS_INPUT_SCHEMA = z.object({
  url: z
    .string()
    .url()
    .describe(
      'The URL to get visit information for. Must be in the format as returned from a call to history.search()'
    ),
});

export const HISTORY_SEARCH_INPUT_SCHEMA = z.object({
  text: z
    .string()
    .describe('A free-text query to the history service. Leave empty to retrieve all pages'),
  startTime: z
    .number()
    .optional()
    .describe(
      'Limit results to those visited after this date, represented in milliseconds since the epoch. Defaults to 24 hours ago if not specified'
    ),
  endTime: z
    .number()
    .optional()
    .describe(
      'Limit results to those visited before this date, represented in milliseconds since the epoch'
    ),
  maxResults: z
    .number()
    .int()
    .min(1)
    .optional()
    .describe('The maximum number of results to retrieve. Defaults to 100'),
});

export const HISTORY_MUTATE_URL_OUTPUT_SCHEMA = z.object({
  url: z.string(),
});

export const HISTORY_DELETE_RANGE_OUTPUT_SCHEMA = z.object({
  startTime: z.number(),
  endTime: z.number(),
  startTimeFormatted: z.string(),
  endTimeFormatted: z.string(),
});

export const HISTORY_ITEM_OUTPUT_SCHEMA = z.object({
  id: z.string(),
  url: z.string().optional(),
  title: z.string().optional(),
  lastVisitTime: z.number().optional(),
  lastVisitTimeFormatted: z.string().optional(),
  visitCount: z.number().optional(),
  typedCount: z.number().optional(),
});

export const HISTORY_VISIT_OUTPUT_SCHEMA = z.object({
  id: z.string(),
  visitId: z.string(),
  visitTime: z.number().optional(),
  visitTimeFormatted: z.string().optional(),
  referringVisitId: z.string().optional(),
  transition: z.string(),
});

export const HISTORY_GET_VISITS_OUTPUT_SCHEMA = z.array(HISTORY_VISIT_OUTPUT_SCHEMA);
export const HISTORY_SEARCH_OUTPUT_SCHEMA = z.array(HISTORY_ITEM_OUTPUT_SCHEMA);

export type HistoryAddUrlInput = z.infer<typeof HISTORY_ADD_URL_INPUT_SCHEMA>;
export type HistoryAddUrlOutput = z.infer<typeof HISTORY_MUTATE_URL_OUTPUT_SCHEMA>;
export type HistoryDeleteAllInput = z.infer<typeof HISTORY_DELETE_ALL_INPUT_SCHEMA>;
export type HistoryDeleteRangeInput = z.infer<typeof HISTORY_DELETE_RANGE_INPUT_SCHEMA>;
export type HistoryDeleteRangeOutput = z.infer<typeof HISTORY_DELETE_RANGE_OUTPUT_SCHEMA>;
export type HistoryDeleteUrlInput = z.infer<typeof HISTORY_DELETE_URL_INPUT_SCHEMA>;
export type HistoryDeleteUrlOutput = z.infer<typeof HISTORY_MUTATE_URL_OUTPUT_SCHEMA>;
export type HistoryGetVisitsInput = z.infer<typeof HISTORY_GET_VISITS_INPUT_SCHEMA>;
export type HistoryGetVisitsOutput = z.infer<typeof HISTORY_GET_VISITS_OUTPUT_SCHEMA>;
export type HistorySearchInput = z.infer<typeof HISTORY_SEARCH_INPUT_SCHEMA>;
export type HistorySearchOutput = z.infer<typeof HISTORY_SEARCH_OUTPUT_SCHEMA>;

const HISTORY_PERMISSIONS = ['history'] as const;

function defineHistoryTool<
  const TName extends string,
  const TActionId extends (typeof HISTORY_ACTION_IDS)[number],
  const TInputSchema extends z.AnyZodObject,
  const TOutputSchema extends z.ZodTypeAny | undefined = undefined,
>(options: {
  actionId: TActionId;
  name: TName;
  title: string;
  description: string;
  inputSchema: TInputSchema;
  outputSchema?: TOutputSchema;
  annotations: ToolAnnotations;
}): ZodExtensionToolContract<TName, 'history', TActionId, TInputSchema, TOutputSchema> {
  return {
    name: options.name,
    title: options.title,
    description: options.description,
    inputSchema: options.inputSchema,
    ...(options.outputSchema ? { outputSchema: options.outputSchema } : {}),
    annotations: {
      title: options.title,
      ...options.annotations,
    },
    _meta: {
      extension: {
        groupId: 'history',
        actionId: options.actionId,
        chromeApi: HISTORY_GROUP_CONTRACT.chromeApi,
        permissions: HISTORY_PERMISSIONS,
      },
    },
    groupId: 'history',
    actionId: options.actionId,
    zodInputSchema: options.inputSchema,
    ...(options.outputSchema ? { zodOutputSchema: options.outputSchema } : {}),
  };
}

export const HISTORY_TOOL_CONTRACTS = {
  addUrl: defineHistoryTool({
    actionId: 'addUrl',
    name: 'extension_tool_add_history_url',
    title: 'Add History URL',
    description: 'Add a URL to the history at the current time with a transition type of "link"',
    inputSchema: HISTORY_ADD_URL_INPUT_SCHEMA,
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
  }),
  deleteAll: defineHistoryTool({
    actionId: 'deleteAll',
    name: 'extension_tool_delete_all_history',
    title: 'Delete All History',
    description: 'Delete all items from the browser history',
    inputSchema: HISTORY_DELETE_ALL_INPUT_SCHEMA,
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: true,
    },
  }),
  deleteRange: defineHistoryTool({
    actionId: 'deleteRange',
    name: 'extension_tool_delete_history_range',
    title: 'Delete History Range',
    description:
      'Remove all items within the specified date range from history. Pages will not be removed unless all visits fall within the range',
    inputSchema: HISTORY_DELETE_RANGE_INPUT_SCHEMA,
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: true,
    },
  }),
  deleteUrl: defineHistoryTool({
    actionId: 'deleteUrl',
    name: 'extension_tool_delete_history_url',
    title: 'Delete History URL',
    description: 'Remove all occurrences of the given URL from history',
    inputSchema: HISTORY_DELETE_URL_INPUT_SCHEMA,
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: true,
    },
  }),
  getVisits: defineHistoryTool({
    actionId: 'getVisits',
    name: 'extension_tool_get_history_visits',
    title: 'Get History Visits',
    description: 'Retrieve information about visits to a specific URL',
    inputSchema: HISTORY_GET_VISITS_INPUT_SCHEMA,
    outputSchema: HISTORY_GET_VISITS_OUTPUT_SCHEMA,
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
  }),
  search: defineHistoryTool({
    actionId: 'search',
    name: 'extension_tool_search_history',
    title: 'Search History',
    description: 'Search the history for the last visit time of each page matching the query',
    inputSchema: HISTORY_SEARCH_INPUT_SCHEMA,
    outputSchema: HISTORY_SEARCH_OUTPUT_SCHEMA,
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
  }),
} as const;

export type HistoryActionId = keyof typeof HISTORY_TOOL_CONTRACTS;
export type HistoryToolName = (typeof HISTORY_TOOL_CONTRACTS)[HistoryActionId]['name'];
