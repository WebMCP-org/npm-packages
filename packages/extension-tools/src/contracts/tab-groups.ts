import { z } from 'zod';

import {
  type ExtensionToolGroupContract,
  type ToolAnnotations,
  type ZodExtensionToolContract,
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

export const TAB_GROUP_OUTPUT_SCHEMA = z.object({
  id: z.number(),
  title: z.string().optional(),
  color: TAB_GROUP_COLOR_SCHEMA,
  collapsed: z.boolean(),
  shared: z.boolean().optional(),
  windowId: z.number(),
});

export const TAB_GROUP_GET_OUTPUT_SCHEMA = TAB_GROUP_OUTPUT_SCHEMA;

export const TAB_GROUP_QUERY_OUTPUT_SCHEMA = z.object({
  count: z.number(),
  groups: z.array(TAB_GROUP_OUTPUT_SCHEMA),
});

export const TAB_GROUP_UPDATE_OUTPUT_SCHEMA = TAB_GROUP_OUTPUT_SCHEMA;
export const TAB_GROUP_MOVE_OUTPUT_SCHEMA = TAB_GROUP_OUTPUT_SCHEMA;

export type TabGroupGetInput = z.infer<typeof TAB_GROUP_GET_INPUT_SCHEMA>;
export type TabGroupGetOutput = z.infer<typeof TAB_GROUP_GET_OUTPUT_SCHEMA>;
export type TabGroupQueryInput = z.infer<typeof TAB_GROUP_QUERY_INPUT_SCHEMA>;
export type TabGroupQueryOutput = z.infer<typeof TAB_GROUP_QUERY_OUTPUT_SCHEMA>;
export type TabGroupUpdateInput = z.infer<typeof TAB_GROUP_UPDATE_INPUT_SCHEMA>;
export type TabGroupUpdateOutput = z.infer<typeof TAB_GROUP_UPDATE_OUTPUT_SCHEMA>;
export type TabGroupMoveInput = z.infer<typeof TAB_GROUP_MOVE_INPUT_SCHEMA>;
export type TabGroupMoveOutput = z.infer<typeof TAB_GROUP_MOVE_OUTPUT_SCHEMA>;

const TAB_GROUP_PERMISSIONS = ['tabGroups'] as const;

function defineTabGroupTool<
  const TName extends string,
  const TActionId extends (typeof TAB_GROUP_ACTION_IDS)[number],
  const TInputSchema extends z.AnyZodObject,
  const TOutputSchema extends z.ZodTypeAny,
>(options: {
  actionId: TActionId;
  name: TName;
  title: string;
  description: string;
  inputSchema: TInputSchema;
  outputSchema: TOutputSchema;
  annotations: ToolAnnotations;
}): ZodExtensionToolContract<TName, 'tabGroups', TActionId, TInputSchema, TOutputSchema> {
  return {
    name: options.name,
    title: options.title,
    description: options.description,
    inputSchema: options.inputSchema,
    outputSchema: options.outputSchema,
    annotations: {
      title: options.title,
      ...options.annotations,
    },
    _meta: {
      extension: {
        groupId: 'tabGroups',
        actionId: options.actionId,
        chromeApi: TAB_GROUPS_GROUP_CONTRACT.chromeApi,
        permissions: TAB_GROUP_PERMISSIONS,
      },
    },
    groupId: 'tabGroups',
    actionId: options.actionId,
    zodInputSchema: options.inputSchema,
    zodOutputSchema: options.outputSchema,
  };
}

export const TAB_GROUP_TOOL_CONTRACTS = {
  get: defineTabGroupTool({
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
  }),
  query: defineTabGroupTool({
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
  }),
  update: defineTabGroupTool({
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
  }),
  move: defineTabGroupTool({
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
  }),
} as const;

export type TabGroupActionId = keyof typeof TAB_GROUP_TOOL_CONTRACTS;
export type TabGroupToolName = (typeof TAB_GROUP_TOOL_CONTRACTS)[TabGroupActionId]['name'];
