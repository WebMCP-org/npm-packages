import { z } from 'zod';

import {
  type ExtensionToolGroupContract,
  type ToolAnnotations,
  type ZodExtensionToolContract,
} from './core';

export const WINDOWS_GROUP_CONTRACT = {
  id: 'windows',
  title: 'Windows',
  description: 'Chrome windows API actions for reading and mutating browser windows.',
  chromeApi: 'windows',
  requiredPermissions: [],
  optionalPermissions: [],
} as const satisfies ExtensionToolGroupContract;

export const WINDOW_ACTION_IDS = [
  'create',
  'get',
  'getAll',
  'getCurrent',
  'getLastFocused',
  'remove',
  'update',
] as const;

export const WINDOW_STATE_SCHEMA = z.enum([
  'normal',
  'minimized',
  'maximized',
  'fullscreen',
  'locked-fullscreen',
]);
export const WINDOW_CREATE_TYPE_SCHEMA = z.enum(['normal', 'popup', 'panel']);
export const WINDOW_FILTER_TYPE_SCHEMA = z.enum(['normal', 'popup', 'panel', 'app', 'devtools']);

const chromeWindowIdSchema = z.number().int();
const chromeWindowPositionSchema = z.number().int();
const chromeWindowSizeSchema = z.number().int().min(1);
const chromeTabIdSchema = z.number().int().min(0);

export const WINDOW_CREATE_INPUT_SCHEMA = z.object({
  url: z
    .union([z.string(), z.array(z.string())])
    .optional()
    .describe('A URL or array of URLs to open as tabs in the window'),
  focused: z
    .boolean()
    .optional()
    .describe('If true, opens an active window. If false, opens an inactive window'),
  height: chromeWindowSizeSchema
    .optional()
    .describe('The height in pixels of the new window, including the frame'),
  incognito: z
    .boolean()
    .optional()
    .describe('Whether the new window should be an incognito window'),
  left: chromeWindowPositionSchema
    .optional()
    .describe('The number of pixels to position the new window from the left edge of the screen'),
  setSelfAsOpener: z
    .boolean()
    .optional()
    .describe("If true, the newly-created window's 'window.opener' is set to the caller"),
  state: WINDOW_STATE_SCHEMA.optional().describe('The initial state of the window'),
  tabId: chromeTabIdSchema.optional().describe('The ID of the tab to add to the new window'),
  top: chromeWindowPositionSchema
    .optional()
    .describe('The number of pixels to position the new window from the top edge of the screen'),
  type: WINDOW_CREATE_TYPE_SCHEMA.optional().describe(
    'Specifies what type of browser window to create'
  ),
  width: chromeWindowSizeSchema
    .optional()
    .describe('The width in pixels of the new window, including the frame'),
});

export const WINDOW_GET_INPUT_SCHEMA = z.object({
  windowId: chromeWindowIdSchema.describe('The ID of the window to get'),
  populate: z
    .boolean()
    .optional()
    .describe('If true, the window object will include a tabs property with tab details'),
  windowTypes: z
    .array(WINDOW_FILTER_TYPE_SCHEMA)
    .optional()
    .describe('Filter the window based on its type'),
});

export const WINDOW_GET_ALL_INPUT_SCHEMA = z.object({
  populate: z
    .boolean()
    .optional()
    .describe('If true, each window object will include a tabs property with tab details'),
  windowTypes: z
    .array(WINDOW_FILTER_TYPE_SCHEMA)
    .optional()
    .describe('Filter windows based on their type'),
});

export const WINDOW_GET_CURRENT_INPUT_SCHEMA = z.object({
  populate: z
    .boolean()
    .optional()
    .describe('If true, the window object will include a tabs property with tab details'),
  windowTypes: z
    .array(WINDOW_FILTER_TYPE_SCHEMA)
    .optional()
    .describe('Filter the window based on its type'),
});

export const WINDOW_GET_LAST_FOCUSED_INPUT_SCHEMA = z.object({
  populate: z
    .boolean()
    .optional()
    .describe('If true, the window object will include a tabs property with tab details'),
  windowTypes: z
    .array(WINDOW_FILTER_TYPE_SCHEMA)
    .optional()
    .describe('Filter the window based on its type'),
});

export const WINDOW_REMOVE_INPUT_SCHEMA = z.object({
  windowId: chromeWindowIdSchema.describe('The ID of the window to remove'),
});

export const WINDOW_UPDATE_INPUT_SCHEMA = z.object({
  windowId: chromeWindowIdSchema.describe('The ID of the window to update'),
  drawAttention: z
    .boolean()
    .optional()
    .describe(
      "If true, causes the window to be displayed in a manner that draws the user's attention"
    ),
  focused: z.boolean().optional().describe('If true, brings the window to the front'),
  height: chromeWindowSizeSchema
    .optional()
    .describe('The height to resize the window to in pixels'),
  left: chromeWindowPositionSchema
    .optional()
    .describe('The offset from the left edge of the screen to move the window to in pixels'),
  state: WINDOW_STATE_SCHEMA.optional().describe('The new state of the window'),
  top: chromeWindowPositionSchema
    .optional()
    .describe('The offset from the top edge of the screen to move the window to in pixels'),
  width: chromeWindowSizeSchema.optional().describe('The width to resize the window to in pixels'),
});

export const WINDOW_TAB_OUTPUT_SCHEMA = z.object({
  id: z.number().optional(),
  index: z.number().optional(),
  url: z.string().optional(),
  title: z.string().optional(),
  active: z.boolean().optional(),
});

export const WINDOW_SINGLE_OUTPUT_SCHEMA = z.object({
  id: z.number(),
  focused: z.boolean(),
  incognito: z.boolean(),
  alwaysOnTop: z.boolean(),
  state: WINDOW_STATE_SCHEMA,
  type: WINDOW_FILTER_TYPE_SCHEMA,
  left: z.number().optional(),
  top: z.number().optional(),
  width: z.number().optional(),
  height: z.number().optional(),
  sessionId: z.string().optional(),
  tabs: z.array(WINDOW_TAB_OUTPUT_SCHEMA).optional(),
});

export const WINDOW_GET_ALL_OUTPUT_SCHEMA = z.object({
  count: z.number(),
  windows: z.array(WINDOW_SINGLE_OUTPUT_SCHEMA),
});

export const WINDOW_REMOVE_OUTPUT_SCHEMA = z.object({
  windowId: z.number(),
});

export type WindowCreateInput = z.infer<typeof WINDOW_CREATE_INPUT_SCHEMA>;
export type WindowCreateOutput = z.infer<typeof WINDOW_SINGLE_OUTPUT_SCHEMA>;
export type WindowGetInput = z.infer<typeof WINDOW_GET_INPUT_SCHEMA>;
export type WindowGetOutput = z.infer<typeof WINDOW_SINGLE_OUTPUT_SCHEMA>;
export type WindowGetAllInput = z.infer<typeof WINDOW_GET_ALL_INPUT_SCHEMA>;
export type WindowGetAllOutput = z.infer<typeof WINDOW_GET_ALL_OUTPUT_SCHEMA>;
export type WindowGetCurrentInput = z.infer<typeof WINDOW_GET_CURRENT_INPUT_SCHEMA>;
export type WindowGetLastFocusedInput = z.infer<typeof WINDOW_GET_LAST_FOCUSED_INPUT_SCHEMA>;
export type WindowRemoveInput = z.infer<typeof WINDOW_REMOVE_INPUT_SCHEMA>;
export type WindowRemoveOutput = z.infer<typeof WINDOW_REMOVE_OUTPUT_SCHEMA>;
export type WindowUpdateInput = z.infer<typeof WINDOW_UPDATE_INPUT_SCHEMA>;
export type WindowUpdateOutput = z.infer<typeof WINDOW_SINGLE_OUTPUT_SCHEMA>;

const WINDOW_PERMISSIONS = [] as const;

function defineWindowTool<
  const TName extends string,
  const TActionId extends (typeof WINDOW_ACTION_IDS)[number],
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
}): ZodExtensionToolContract<TName, 'windows', TActionId, TInputSchema, TOutputSchema> {
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
        groupId: 'windows',
        actionId: options.actionId,
        chromeApi: WINDOWS_GROUP_CONTRACT.chromeApi,
        permissions: WINDOW_PERMISSIONS,
      },
    },
    groupId: 'windows',
    actionId: options.actionId,
    zodInputSchema: options.inputSchema,
    zodOutputSchema: options.outputSchema,
  };
}

export const WINDOW_TOOL_CONTRACTS = {
  create: defineWindowTool({
    actionId: 'create',
    name: 'extension_tool_create_window',
    title: 'Create Window',
    description: 'Create a new browser window with optional sizing, position, or default URL',
    inputSchema: WINDOW_CREATE_INPUT_SCHEMA,
    outputSchema: WINDOW_SINGLE_OUTPUT_SCHEMA,
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
  }),
  get: defineWindowTool({
    actionId: 'get',
    name: 'extension_tool_get_window',
    title: 'Get Window',
    description: 'Get details about a specific window',
    inputSchema: WINDOW_GET_INPUT_SCHEMA,
    outputSchema: WINDOW_SINGLE_OUTPUT_SCHEMA,
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
  }),
  getAll: defineWindowTool({
    actionId: 'getAll',
    name: 'extension_tool_get_all_windows',
    title: 'Get All Windows',
    description: 'Get all browser windows',
    inputSchema: WINDOW_GET_ALL_INPUT_SCHEMA,
    outputSchema: WINDOW_GET_ALL_OUTPUT_SCHEMA,
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
  }),
  getCurrent: defineWindowTool({
    actionId: 'getCurrent',
    name: 'extension_tool_get_current_window',
    title: 'Get Current Window',
    description: 'Get the current window',
    inputSchema: WINDOW_GET_CURRENT_INPUT_SCHEMA,
    outputSchema: WINDOW_SINGLE_OUTPUT_SCHEMA,
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
  }),
  getLastFocused: defineWindowTool({
    actionId: 'getLastFocused',
    name: 'extension_tool_get_last_focused_window',
    title: 'Get Last Focused Window',
    description: 'Get the window that was most recently focused',
    inputSchema: WINDOW_GET_LAST_FOCUSED_INPUT_SCHEMA,
    outputSchema: WINDOW_SINGLE_OUTPUT_SCHEMA,
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
  }),
  remove: defineWindowTool({
    actionId: 'remove',
    name: 'extension_tool_remove_window',
    title: 'Remove Window',
    description: 'Remove (close) a window and all the tabs inside it',
    inputSchema: WINDOW_REMOVE_INPUT_SCHEMA,
    outputSchema: WINDOW_REMOVE_OUTPUT_SCHEMA,
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: true,
    },
  }),
  update: defineWindowTool({
    actionId: 'update',
    name: 'extension_tool_update_window',
    title: 'Update Window',
    description: 'Update the properties of a window',
    inputSchema: WINDOW_UPDATE_INPUT_SCHEMA,
    outputSchema: WINDOW_SINGLE_OUTPUT_SCHEMA,
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
  }),
} as const;

export type WindowActionId = keyof typeof WINDOW_TOOL_CONTRACTS;
export type WindowToolName = (typeof WINDOW_TOOL_CONTRACTS)[WindowActionId]['name'];
