import { z } from 'zod';

import {
  defineExtensionToolContract,
  type ExtensionToolGroupContract,
  type ExtensionToolOutputSchema,
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

export const HISTORY_MUTATE_URL_OUTPUT_SCHEMA = {
  type: 'object',
  properties: {
    url: { type: 'string' },
  },
  required: ['url'],
} as const satisfies ExtensionToolOutputSchema;

export const HISTORY_DELETE_RANGE_OUTPUT_SCHEMA = {
  type: 'object',
  properties: {
    startTime: { type: 'number' },
    endTime: { type: 'number' },
    startTimeFormatted: { type: 'string' },
    endTimeFormatted: { type: 'string' },
  },
  required: ['startTime', 'endTime', 'startTimeFormatted', 'endTimeFormatted'],
} as const satisfies ExtensionToolOutputSchema;

const historyItemOutputSchema = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    url: { type: 'string' },
    title: { type: 'string' },
    lastVisitTime: { type: 'number' },
    lastVisitTimeFormatted: { type: 'string' },
    visitCount: { type: 'number' },
    typedCount: { type: 'number' },
  },
  required: ['id'],
  additionalProperties: true,
} as const;

const historyVisitOutputSchema = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    visitId: { type: 'string' },
    visitTime: { type: 'number' },
    visitTimeFormatted: { type: 'string' },
    referringVisitId: { type: 'string' },
    transition: { type: 'string' },
  },
  required: ['id', 'visitId', 'transition'],
  additionalProperties: true,
} as const;

export const HISTORY_GET_VISITS_OUTPUT_SCHEMA = {
  type: 'object',
  properties: {
    url: { type: 'string' },
    visitCount: { type: 'number' },
    visits: {
      type: 'array',
      items: historyVisitOutputSchema,
    },
  },
  required: ['url', 'visitCount', 'visits'],
} as const satisfies ExtensionToolOutputSchema;

export const HISTORY_SEARCH_OUTPUT_SCHEMA = {
  type: 'object',
  properties: {
    query: {
      type: 'object',
      properties: {
        text: { type: 'string' },
        startTime: { type: 'number' },
        endTime: { type: 'number' },
        maxResults: { type: 'number' },
      },
      required: ['text'],
      additionalProperties: true,
    },
    resultCount: { type: 'number' },
    results: {
      type: 'array',
      items: historyItemOutputSchema,
    },
  },
  required: ['query', 'resultCount', 'results'],
} as const satisfies ExtensionToolOutputSchema;

const readMeta = {
  kind: 'chrome-api',
  runtimeContext: ['bgsw'],
  hostPermissionsRequired: false,
  activeTabRequired: false,
  tabIdRequired: false,
  frameIdSupported: false,
  originRequired: false,
  urlRequired: false,
  userGestureRequired: false,
  effect: 'read',
  riskLevel: 'low',
} as const;

const mutateMeta = {
  ...readMeta,
  urlRequired: true,
  effect: 'mutate',
  riskLevel: 'medium',
} as const;

const deleteMeta = {
  ...readMeta,
  effect: 'delete',
  riskLevel: 'high',
} as const;

export const HISTORY_TOOL_CONTRACTS = {
  addUrl: defineExtensionToolContract({
    group: HISTORY_GROUP_CONTRACT,
    actionId: 'addUrl',
    name: 'extension_tool_add_history_url',
    title: 'Add History URL',
    description: 'Add a URL to the history at the current time with a transition type of "link"',
    inputSchema: HISTORY_ADD_URL_INPUT_SCHEMA,
    outputSchema: HISTORY_MUTATE_URL_OUTPUT_SCHEMA,
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
    meta: mutateMeta,
  }),
  deleteAll: defineExtensionToolContract({
    group: HISTORY_GROUP_CONTRACT,
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
    meta: deleteMeta,
  }),
  deleteRange: defineExtensionToolContract({
    group: HISTORY_GROUP_CONTRACT,
    actionId: 'deleteRange',
    name: 'extension_tool_delete_history_range',
    title: 'Delete History Range',
    description:
      'Remove all items within the specified date range from history. Pages will not be removed unless all visits fall within the range',
    inputSchema: HISTORY_DELETE_RANGE_INPUT_SCHEMA,
    outputSchema: HISTORY_DELETE_RANGE_OUTPUT_SCHEMA,
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: true,
    },
    meta: deleteMeta,
  }),
  deleteUrl: defineExtensionToolContract({
    group: HISTORY_GROUP_CONTRACT,
    actionId: 'deleteUrl',
    name: 'extension_tool_delete_history_url',
    title: 'Delete History URL',
    description: 'Remove all occurrences of the given URL from history',
    inputSchema: HISTORY_DELETE_URL_INPUT_SCHEMA,
    outputSchema: HISTORY_MUTATE_URL_OUTPUT_SCHEMA,
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: true,
    },
    meta: {
      ...deleteMeta,
      urlRequired: true,
    },
  }),
  getVisits: defineExtensionToolContract({
    group: HISTORY_GROUP_CONTRACT,
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
    meta: {
      ...readMeta,
      urlRequired: true,
    },
  }),
  search: defineExtensionToolContract({
    group: HISTORY_GROUP_CONTRACT,
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
    meta: readMeta,
  }),
} as const;

export type HistoryActionId = keyof typeof HISTORY_TOOL_CONTRACTS;
export type HistoryToolName = (typeof HISTORY_TOOL_CONTRACTS)[HistoryActionId]['name'];
