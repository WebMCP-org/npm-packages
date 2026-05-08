import { z } from 'zod';

import {
  defineExtensionToolContract,
  type ExtensionToolGroupContract,
  type ExtensionToolOutputSchema,
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

const chromeWindowTabOutputSchema = {
  type: 'object',
  properties: {
    id: { type: 'number' },
    index: { type: 'number' },
    url: { type: 'string' },
    title: { type: 'string' },
    active: { type: 'boolean' },
  },
  additionalProperties: true,
} as const;

const chromeWindowOutputSchema = {
  type: 'object',
  properties: {
    id: { type: 'number' },
    focused: { type: 'boolean' },
    incognito: { type: 'boolean' },
    alwaysOnTop: { type: 'boolean' },
    state: {
      type: 'string',
      enum: ['normal', 'minimized', 'maximized', 'fullscreen', 'locked-fullscreen'],
    },
    type: { type: 'string', enum: ['normal', 'popup', 'panel', 'app', 'devtools'] },
    left: { type: 'number' },
    top: { type: 'number' },
    width: { type: 'number' },
    height: { type: 'number' },
    sessionId: { type: 'string' },
    tabs: {
      type: 'array',
      items: chromeWindowTabOutputSchema,
    },
  },
  required: ['id', 'focused', 'incognito', 'alwaysOnTop', 'state', 'type'],
  additionalProperties: true,
} as const;

export const WINDOW_SINGLE_OUTPUT_SCHEMA =
  chromeWindowOutputSchema satisfies ExtensionToolOutputSchema;

export const WINDOW_GET_ALL_OUTPUT_SCHEMA = {
  type: 'object',
  properties: {
    count: { type: 'number' },
    windows: {
      type: 'array',
      items: chromeWindowOutputSchema,
    },
  },
  required: ['count', 'windows'],
} as const satisfies ExtensionToolOutputSchema;

export const WINDOW_REMOVE_OUTPUT_SCHEMA = {
  type: 'object',
  properties: {
    windowId: { type: 'number' },
  },
  required: ['windowId'],
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
  effect: 'mutate',
  riskLevel: 'medium',
} as const;

const deleteMeta = {
  ...readMeta,
  tabIdRequired: false,
  effect: 'delete',
  riskLevel: 'high',
} as const;

export const WINDOW_TOOL_CONTRACTS = {
  create: defineExtensionToolContract({
    group: WINDOWS_GROUP_CONTRACT,
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
    meta: {
      ...mutateMeta,
      urlRequired: false,
    },
  }),
  get: defineExtensionToolContract({
    group: WINDOWS_GROUP_CONTRACT,
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
    meta: readMeta,
  }),
  getAll: defineExtensionToolContract({
    group: WINDOWS_GROUP_CONTRACT,
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
    meta: readMeta,
  }),
  getCurrent: defineExtensionToolContract({
    group: WINDOWS_GROUP_CONTRACT,
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
    meta: readMeta,
  }),
  getLastFocused: defineExtensionToolContract({
    group: WINDOWS_GROUP_CONTRACT,
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
    meta: readMeta,
  }),
  remove: defineExtensionToolContract({
    group: WINDOWS_GROUP_CONTRACT,
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
    meta: deleteMeta,
  }),
  update: defineExtensionToolContract({
    group: WINDOWS_GROUP_CONTRACT,
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
    meta: mutateMeta,
  }),
} as const;

export type WindowActionId = keyof typeof WINDOW_TOOL_CONTRACTS;
export type WindowToolName = (typeof WINDOW_TOOL_CONTRACTS)[WindowActionId]['name'];
