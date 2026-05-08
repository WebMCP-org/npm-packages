import { z } from 'zod';

import {
  defineExtensionToolContract,
  type ExtensionToolGroupContract,
  type ExtensionToolOutputSchema,
} from './core';

export const TAB_GROUPS_GROUP_CONTRACT = {
  id: 'tabGroups',
  title: 'Tab Groups',
  description: 'Chrome tabGroups API actions for reading and mutating browser tab groups.',
  chromeApi: 'tabGroups',
  requiredPermissions: ['tabGroups'],
  optionalPermissions: [],
} as const satisfies ExtensionToolGroupContract;

export const TAB_GROUP_ACTION_IDS = ['get', 'query', 'update', 'move'] as const;

export const TAB_GROUP_COLOR_SCHEMA = z.enum([
  'grey',
  'blue',
  'red',
  'yellow',
  'green',
  'pink',
  'purple',
  'cyan',
  'orange',
]);

const chromeTabGroupIdSchema = z.number().int().min(0);
const chromeTabGroupWindowIdSchema = z
  .number()
  .int()
  .refine((value) => value >= 0 || value === -2, 'Expected a window ID or -2 for current window');

export const TAB_GROUP_GET_INPUT_SCHEMA = z.object({
  groupId: chromeTabGroupIdSchema.describe('The ID of the tab group to retrieve'),
});

export const TAB_GROUP_QUERY_INPUT_SCHEMA = z.object({
  collapsed: z.boolean().optional().describe('Whether the groups are collapsed'),
  color: TAB_GROUP_COLOR_SCHEMA.optional().describe('The color of the groups'),
  shared: z.boolean().optional().describe('Whether the group is shared (Chrome 137+)'),
  title: z.string().optional().describe('Pattern to match group titles against'),
  windowId: chromeTabGroupWindowIdSchema
    .optional()
    .describe('The ID of the parent window, or use -2 for the current window'),
});

export const TAB_GROUP_UPDATE_INPUT_SCHEMA = z.object({
  groupId: chromeTabGroupIdSchema.describe('The ID of the group to modify'),
  collapsed: z.boolean().optional().describe('Whether the group should be collapsed'),
  color: TAB_GROUP_COLOR_SCHEMA.optional().describe('The color of the group'),
  title: z.string().optional().describe('The title of the group'),
});

export const TAB_GROUP_MOVE_INPUT_SCHEMA = z.object({
  groupId: chromeTabGroupIdSchema.describe('The ID of the group to move'),
  index: z
    .number()
    .int()
    .min(-1)
    .describe('The position to move the group to. Use -1 to place at the end'),
  windowId: chromeTabGroupWindowIdSchema
    .optional()
    .describe('The window to move the group to. Defaults to current window'),
});

const tabGroupOutputSchema = {
  type: 'object',
  properties: {
    id: { type: 'number' },
    title: { type: 'string' },
    color: { type: 'string', enum: TAB_GROUP_COLOR_SCHEMA.options },
    collapsed: { type: 'boolean' },
    shared: { type: 'boolean' },
    windowId: { type: 'number' },
  },
  required: ['id', 'color', 'collapsed', 'windowId'],
  additionalProperties: true,
} as const;

export const TAB_GROUP_GET_OUTPUT_SCHEMA = tabGroupOutputSchema satisfies ExtensionToolOutputSchema;

export const TAB_GROUP_QUERY_OUTPUT_SCHEMA = {
  type: 'object',
  properties: {
    count: { type: 'number' },
    groups: {
      type: 'array',
      items: tabGroupOutputSchema,
    },
  },
  required: ['count', 'groups'],
  additionalProperties: true,
} as const satisfies ExtensionToolOutputSchema;

export const TAB_GROUP_UPDATE_OUTPUT_SCHEMA =
  tabGroupOutputSchema satisfies ExtensionToolOutputSchema;

export const TAB_GROUP_MOVE_OUTPUT_SCHEMA =
  tabGroupOutputSchema satisfies ExtensionToolOutputSchema;

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
  minChromeVersion: '89',
  effect: 'read',
  riskLevel: 'low',
} as const;

const mutateMeta = {
  ...readMeta,
  effect: 'mutate',
  riskLevel: 'medium',
} as const;

export const TAB_GROUP_TOOL_CONTRACTS = {
  get: defineExtensionToolContract({
    group: TAB_GROUPS_GROUP_CONTRACT,
    actionId: 'get',
    name: 'extension_tool_get_tab_group',
    title: 'Get Tab Group',
    description: 'Retrieve a tab group by its ID',
    inputSchema: TAB_GROUP_GET_INPUT_SCHEMA,
    outputSchema: TAB_GROUP_GET_OUTPUT_SCHEMA,
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    meta: readMeta,
  }),
  query: defineExtensionToolContract({
    group: TAB_GROUPS_GROUP_CONTRACT,
    actionId: 'query',
    name: 'extension_tool_query_tab_groups',
    title: 'Query Tab Groups',
    description: 'Search for tab groups that match specified criteria',
    inputSchema: TAB_GROUP_QUERY_INPUT_SCHEMA,
    outputSchema: TAB_GROUP_QUERY_OUTPUT_SCHEMA,
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    meta: readMeta,
  }),
  update: defineExtensionToolContract({
    group: TAB_GROUPS_GROUP_CONTRACT,
    actionId: 'update',
    name: 'extension_tool_update_tab_group',
    title: 'Update Tab Group',
    description: 'Modify properties of a tab group',
    inputSchema: TAB_GROUP_UPDATE_INPUT_SCHEMA,
    outputSchema: TAB_GROUP_UPDATE_OUTPUT_SCHEMA,
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    meta: mutateMeta,
  }),
  move: defineExtensionToolContract({
    group: TAB_GROUPS_GROUP_CONTRACT,
    actionId: 'move',
    name: 'extension_tool_move_tab_group',
    title: 'Move Tab Group',
    description: 'Move a tab group within its window or to a new window',
    inputSchema: TAB_GROUP_MOVE_INPUT_SCHEMA,
    outputSchema: TAB_GROUP_MOVE_OUTPUT_SCHEMA,
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
    meta: mutateMeta,
  }),
} as const;

export type TabGroupActionId = keyof typeof TAB_GROUP_TOOL_CONTRACTS;
export type TabGroupToolName = (typeof TAB_GROUP_TOOL_CONTRACTS)[TabGroupActionId]['name'];
