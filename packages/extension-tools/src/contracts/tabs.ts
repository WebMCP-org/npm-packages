import { z } from 'zod';

import {
  defineExtensionToolContract,
  type ExtensionToolGroupContract,
  type ExtensionToolOutputSchema,
} from './core';

export const TABS_GROUP_CONTRACT = {
  id: 'tabs',
  title: 'Tabs',
  description:
    'Chrome tabs API actions for reading, navigating, messaging, and mutating browser tabs.',
  chromeApi: 'tabs',
  requiredPermissions: ['tabs'],
  optionalPermissions: ['activeTab'],
} as const satisfies ExtensionToolGroupContract;

export const TAB_ACTION_IDS = [
  'listActiveTabs',
  'createTab',
  'updateTab',
  'closeTabs',
  'getAllTabs',
  'navigateHistory',
  'reloadTab',
  'captureVisibleTab',
  'detectLanguage',
  'discardTab',
  'duplicateTab',
  'getTab',
  'getZoom',
  'getZoomSettings',
  'setZoom',
  'setZoomSettings',
  'groupTabs',
  'ungroupTabs',
  'highlightTabs',
  'moveTabs',
  'sendMessage',
] as const;

const chromeTabIdSchema = z.number().int().min(0);
const chromeWindowIdSchema = z.number().int();
const chromeTabIndexSchema = z.number().int().min(0);

export const TAB_LIST_ACTIVE_INPUT_SCHEMA = z.object({});

export const TAB_CREATE_INPUT_SCHEMA = z.object({
  url: z
    .string()
    .optional()
    .describe(
      `URL to open in the new tab. Fully-qualified URLs must include a scheme (i.e., 'http://www.google.com', not 'www.google.com'). Relative URLs are relative to the current page within the extension. Defaults to the New Tab Page.`
    ),
  active: z.boolean().optional().describe('Whether the tab should be active'),
  pinned: z.boolean().optional().describe('Whether the tab should be pinned'),
});

export const TAB_UPDATE_INPUT_SCHEMA = z.object({
  tabId: chromeTabIdSchema.optional().describe('ID of the tab to update (defaults to active tab)'),
  url: z.string().optional().describe('New URL for the tab'),
  active: z.boolean().optional().describe('Whether to make the tab active'),
  pinned: z.boolean().optional().describe('Whether to pin/unpin the tab'),
  muted: z.boolean().optional().describe('Whether to mute/unmute the tab'),
});

export const TAB_CLOSE_INPUT_SCHEMA = z.object({
  tabIds: z.array(chromeTabIdSchema).min(1).describe('Array of tab IDs to close'),
});

export const TAB_GET_ALL_INPUT_SCHEMA = z.object({
  currentWindow: z.boolean().optional().describe('Only get tabs from current window'),
});

export const TAB_NAVIGATE_HISTORY_INPUT_SCHEMA = z.object({
  tabId: chromeTabIdSchema.optional().describe('Tab ID to navigate (defaults to active tab)'),
  direction: z.enum(['back', 'forward']).describe('Navigation direction'),
});

export const TAB_RELOAD_INPUT_SCHEMA = z.object({
  tabId: chromeTabIdSchema.optional().describe('Tab ID to reload (defaults to active tab)'),
  bypassCache: z.boolean().optional().describe('Bypass the cache when reloading'),
});

export const TAB_CAPTURE_VISIBLE_INPUT_SCHEMA = z.object({
  windowId: chromeWindowIdSchema.optional().describe('Window ID (defaults to current window)'),
});

export const TAB_DETECT_LANGUAGE_INPUT_SCHEMA = z.object({
  tabId: chromeTabIdSchema.optional().describe('Tab ID (defaults to active tab)'),
});

export const TAB_DISCARD_INPUT_SCHEMA = z.object({
  tabId: chromeTabIdSchema
    .optional()
    .describe('Tab ID to discard (if omitted, browser picks least important tab)'),
});

export const TAB_DUPLICATE_INPUT_SCHEMA = z.object({
  tabId: chromeTabIdSchema.describe('ID of the tab to duplicate'),
});

export const TAB_GET_INPUT_SCHEMA = z.object({
  tabId: chromeTabIdSchema.describe('Tab ID'),
});

export const TAB_GET_ZOOM_INPUT_SCHEMA = z.object({
  tabId: chromeTabIdSchema.optional().describe('Tab ID (defaults to active tab)'),
});

export const TAB_GET_ZOOM_SETTINGS_INPUT_SCHEMA = z.object({
  tabId: chromeTabIdSchema.optional().describe('Tab ID (defaults to active tab)'),
});

export const TAB_SET_ZOOM_INPUT_SCHEMA = z.object({
  tabId: chromeTabIdSchema.optional().describe('Tab ID (defaults to active tab)'),
  zoomFactor: z
    .union([z.literal(0), z.number().min(0.25).max(5)])
    .describe('New zoom factor (0 resets to default, 0.25-5 sets a specific zoom)'),
});

export const TAB_SET_ZOOM_SETTINGS_INPUT_SCHEMA = z.object({
  tabId: chromeTabIdSchema.optional().describe('Tab ID (defaults to active tab)'),
  mode: z
    .enum(['automatic', 'manual', 'disabled'])
    .optional()
    .describe('How zoom changes are handled'),
  scope: z
    .enum(['per-origin', 'per-tab'])
    .optional()
    .describe('Whether zoom persists across pages'),
});

export const TAB_GROUP_INPUT_SCHEMA = z.object({
  tabIds: z.array(chromeTabIdSchema).min(1).describe('Tab IDs to group'),
  groupId: z.number().int().min(0).optional().describe('Existing group ID to add tabs to'),
  createProperties: z
    .object({
      windowId: chromeWindowIdSchema.optional().describe('Window ID for new group'),
    })
    .optional()
    .describe('Properties for creating a new group'),
});

export const TAB_UNGROUP_INPUT_SCHEMA = z.object({
  tabIds: z.array(chromeTabIdSchema).min(1).describe('Tab IDs to ungroup'),
});

export const TAB_HIGHLIGHT_INPUT_SCHEMA = z.object({
  tabs: z.array(chromeTabIndexSchema).min(1).describe('Tab indices to highlight'),
  windowId: chromeWindowIdSchema.optional().describe('Window ID containing the tabs'),
});

export const TAB_MOVE_INPUT_SCHEMA = z.object({
  tabIds: z.array(chromeTabIdSchema).min(1).describe('Tab IDs to move'),
  index: z.number().int().min(-1).describe('Position to move tabs to (-1 for end)'),
  windowId: chromeWindowIdSchema.optional().describe('Target window ID'),
});

export const TAB_SEND_MESSAGE_INPUT_SCHEMA = z.object({
  tabId: chromeTabIdSchema.describe('Tab ID to send message to'),
  message: z.any().describe('Message to send (must be JSON-serializable)'),
  frameId: z.number().int().min(0).optional().describe('Specific frame ID to target'),
  documentId: z.string().optional().describe('Specific document ID to target'),
});

const chromeTabOutputProperties = {
  id: { type: 'number' },
  index: { type: 'number' },
  windowId: { type: 'number' },
  openerTabId: { type: 'number' },
  selected: { type: 'boolean' },
  highlighted: { type: 'boolean' },
  active: { type: 'boolean' },
  pinned: { type: 'boolean' },
  audible: { type: 'boolean' },
  discarded: { type: 'boolean' },
  autoDiscardable: { type: 'boolean' },
  mutedInfo: { type: 'object', additionalProperties: true },
  url: { type: 'string' },
  pendingUrl: { type: 'string' },
  title: { type: 'string' },
  favIconUrl: { type: 'string' },
  status: { type: 'string', enum: ['loading', 'complete'] },
  incognito: { type: 'boolean' },
  width: { type: 'number' },
  height: { type: 'number' },
  sessionId: { type: 'string' },
  groupId: { type: 'number' },
} as const;

const chromeTabOutputSchema = {
  type: 'object',
  properties: chromeTabOutputProperties,
  required: ['id', 'index', 'windowId', 'active', 'pinned'],
  additionalProperties: true,
} as const;

const zoomSettingsOutputSchema = {
  type: 'object',
  properties: {
    mode: { type: 'string', enum: ['automatic', 'manual', 'disabled'] },
    scope: { type: 'string', enum: ['per-origin', 'per-tab'] },
    defaultZoomFactor: { type: 'number' },
  },
  required: ['mode', 'scope', 'defaultZoomFactor'],
  additionalProperties: true,
} as const;

const windowOutputSchema = {
  type: 'object',
  properties: {
    id: { type: 'number' },
    focused: { type: 'boolean' },
    top: { type: 'number' },
    left: { type: 'number' },
    width: { type: 'number' },
    height: { type: 'number' },
    incognito: { type: 'boolean' },
    type: { type: 'string' },
    state: { type: 'string' },
    alwaysOnTop: { type: 'boolean' },
    tabs: {
      type: 'array',
      items: chromeTabOutputSchema,
    },
  },
  additionalProperties: true,
} as const;

export const TAB_LIST_ACTIVE_OUTPUT_SCHEMA = {
  type: 'object',
  properties: {
    domains: {
      type: 'object',
      additionalProperties: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            tabId: { type: 'number' },
            domain: { type: 'string' },
            url: { type: 'string' },
            title: { type: 'string' },
            isActive: { type: 'boolean' },
            windowId: { type: 'number' },
            index: { type: 'number' },
            pinned: { type: 'boolean' },
            audible: { type: 'boolean' },
            mutedInfo: { type: 'object', additionalProperties: true },
            status: { type: 'string', enum: ['loading', 'complete'] },
          },
          required: ['domain', 'isActive', 'windowId', 'index', 'pinned'],
          additionalProperties: true,
        },
      },
    },
    totalTabs: { type: 'number' },
  },
  required: ['domains', 'totalTabs'],
} as const satisfies ExtensionToolOutputSchema;

export const TAB_CREATE_OUTPUT_SCHEMA = chromeTabOutputSchema satisfies ExtensionToolOutputSchema;

export const TAB_UPDATE_OUTPUT_SCHEMA = {
  type: 'object',
  properties: {
    tab: chromeTabOutputSchema,
    changes: { type: 'object', additionalProperties: true },
  },
  required: ['tab', 'changes'],
} as const satisfies ExtensionToolOutputSchema;

export const TAB_CLOSE_OUTPUT_SCHEMA = {
  type: 'object',
  properties: {
    tabIds: { type: 'array', items: { type: 'number' } },
  },
  required: ['tabIds'],
} as const satisfies ExtensionToolOutputSchema;

export const TAB_GET_ALL_OUTPUT_SCHEMA = {
  type: 'object',
  properties: {
    count: { type: 'number' },
    tabs: {
      type: 'array',
      items: chromeTabOutputSchema,
    },
  },
  required: ['count', 'tabs'],
} as const satisfies ExtensionToolOutputSchema;

export const TAB_HISTORY_OUTPUT_SCHEMA = {
  type: 'object',
  properties: {
    tabId: { type: 'number' },
    direction: { type: 'string', enum: ['back', 'forward'] },
  },
  required: ['tabId', 'direction'],
} as const satisfies ExtensionToolOutputSchema;

export const TAB_RELOAD_OUTPUT_SCHEMA = {
  type: 'object',
  properties: {
    tabId: { type: 'number' },
    bypassCache: { type: 'boolean' },
  },
  required: ['tabId', 'bypassCache'],
} as const satisfies ExtensionToolOutputSchema;

export const TAB_CAPTURE_VISIBLE_OUTPUT_SCHEMA = {
  type: 'object',
  properties: {
    dataUrl: { type: 'string' },
    length: { type: 'number' },
  },
  required: ['dataUrl', 'length'],
} as const satisfies ExtensionToolOutputSchema;

export const TAB_DETECT_LANGUAGE_OUTPUT_SCHEMA = {
  type: 'object',
  properties: {
    language: { type: 'string' },
  },
  required: ['language'],
} as const satisfies ExtensionToolOutputSchema;

export const TAB_SINGLE_TAB_OUTPUT_SCHEMA = {
  type: 'object',
  properties: {
    tab: chromeTabOutputSchema,
  },
  required: ['tab'],
} as const satisfies ExtensionToolOutputSchema;

export const TAB_ZOOM_OUTPUT_SCHEMA = {
  type: 'object',
  properties: {
    zoomFactor: { type: 'number' },
  },
  required: ['zoomFactor'],
} as const satisfies ExtensionToolOutputSchema;

export const TAB_ZOOM_SETTINGS_OUTPUT_SCHEMA =
  zoomSettingsOutputSchema satisfies ExtensionToolOutputSchema;

export const TAB_SET_ZOOM_OUTPUT_SCHEMA = {
  type: 'object',
  properties: {
    tabId: { type: 'number' },
    zoomFactor: { type: 'number' },
  },
  required: ['zoomFactor'],
} as const satisfies ExtensionToolOutputSchema;

export const TAB_SET_ZOOM_SETTINGS_OUTPUT_SCHEMA = {
  type: 'object',
  properties: {
    settings: zoomSettingsOutputSchema,
  },
  required: ['settings'],
} as const satisfies ExtensionToolOutputSchema;

export const TAB_GROUP_OUTPUT_SCHEMA = {
  type: 'object',
  properties: {
    groupId: { type: 'number' },
  },
  required: ['groupId'],
} as const satisfies ExtensionToolOutputSchema;

export const TAB_UNGROUP_OUTPUT_SCHEMA = {
  type: 'object',
  properties: {
    tabIds: { type: 'array', items: { type: 'number' } },
  },
  required: ['tabIds'],
} as const satisfies ExtensionToolOutputSchema;

export const TAB_HIGHLIGHT_OUTPUT_SCHEMA = {
  type: 'object',
  properties: {
    window: windowOutputSchema,
  },
  required: ['window'],
} as const satisfies ExtensionToolOutputSchema;

export const TAB_MOVE_OUTPUT_SCHEMA = {
  type: 'object',
  properties: {
    tabs: {
      type: 'array',
      items: chromeTabOutputSchema,
    },
  },
  required: ['tabs'],
} as const satisfies ExtensionToolOutputSchema;

export const TAB_SEND_MESSAGE_OUTPUT_SCHEMA = {
  type: 'object',
  properties: {
    response: {
      anyOf: [
        { type: 'object', additionalProperties: true },
        { type: 'array', items: true },
        { type: 'string' },
        { type: 'number' },
        { type: 'boolean' },
        { type: 'null' },
      ],
    },
  },
  required: ['response'],
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

const navigateMeta = {
  ...readMeta,
  effect: 'navigate',
  riskLevel: 'medium',
} as const;

const deleteMeta = {
  ...readMeta,
  effect: 'delete',
  riskLevel: 'high',
} as const;

const executeMeta = {
  ...readMeta,
  effect: 'execute',
  riskLevel: 'medium',
} as const;

export const TAB_TOOL_CONTRACTS = {
  listActiveTabs: defineExtensionToolContract({
    group: TABS_GROUP_CONTRACT,
    actionId: 'listActiveTabs',
    name: 'extension_tool_list_active_tabs',
    title: 'List Active Tabs',
    description: 'Lists all tabs grouped by domain',
    inputSchema: TAB_LIST_ACTIVE_INPUT_SCHEMA,
    outputSchema: TAB_LIST_ACTIVE_OUTPUT_SCHEMA,
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    meta: readMeta,
  }),
  createTab: defineExtensionToolContract({
    group: TABS_GROUP_CONTRACT,
    actionId: 'createTab',
    name: 'extension_tool_create_tab',
    title: 'Create Tab',
    description: 'Create a new browser tab',
    inputSchema: TAB_CREATE_INPUT_SCHEMA,
    outputSchema: TAB_CREATE_OUTPUT_SCHEMA,
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
    meta: navigateMeta,
  }),
  updateTab: defineExtensionToolContract({
    group: TABS_GROUP_CONTRACT,
    actionId: 'updateTab',
    name: 'extension_tool_update_tab',
    title: 'Update Tab',
    description:
      'Update properties of an existing tab. If no tabId is specified, operates on the currently active tab',
    inputSchema: TAB_UPDATE_INPUT_SCHEMA,
    outputSchema: TAB_UPDATE_OUTPUT_SCHEMA,
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    meta: {
      ...navigateMeta,
      urlRequired: false,
    },
  }),
  closeTabs: defineExtensionToolContract({
    group: TABS_GROUP_CONTRACT,
    actionId: 'closeTabs',
    name: 'extension_tool_close_tabs',
    title: 'Close Tabs',
    description: 'Close one or more tabs',
    inputSchema: TAB_CLOSE_INPUT_SCHEMA,
    outputSchema: TAB_CLOSE_OUTPUT_SCHEMA,
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: true,
    },
    meta: {
      ...deleteMeta,
      tabIdRequired: true,
    },
  }),
  getAllTabs: defineExtensionToolContract({
    group: TABS_GROUP_CONTRACT,
    actionId: 'getAllTabs',
    name: 'extension_tool_get_all_tabs',
    title: 'Get All Tabs',
    description: 'Get information about all open tabs',
    inputSchema: TAB_GET_ALL_INPUT_SCHEMA,
    outputSchema: TAB_GET_ALL_OUTPUT_SCHEMA,
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    meta: readMeta,
  }),
  navigateHistory: defineExtensionToolContract({
    group: TABS_GROUP_CONTRACT,
    actionId: 'navigateHistory',
    name: 'extension_tool_navigate_tab_history',
    title: 'Navigate Tab History',
    description:
      "Navigate forward or backward in a tab's history. If no tabId is specified, operates on the currently active tab",
    inputSchema: TAB_NAVIGATE_HISTORY_INPUT_SCHEMA,
    outputSchema: TAB_HISTORY_OUTPUT_SCHEMA,
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
    meta: navigateMeta,
  }),
  reloadTab: defineExtensionToolContract({
    group: TABS_GROUP_CONTRACT,
    actionId: 'reloadTab',
    name: 'extension_tool_reload_tab',
    title: 'Reload Tab',
    description: 'Reload a tab. If no tabId is specified, operates on the currently active tab',
    inputSchema: TAB_RELOAD_INPUT_SCHEMA,
    outputSchema: TAB_RELOAD_OUTPUT_SCHEMA,
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
    meta: navigateMeta,
  }),
  captureVisibleTab: defineExtensionToolContract({
    group: TABS_GROUP_CONTRACT,
    actionId: 'captureVisibleTab',
    name: 'extension_tool_capture_visible_tab',
    title: 'Capture Visible Tab',
    description: 'Take a screenshot of the visible area of the currently active tab in a window',
    inputSchema: TAB_CAPTURE_VISIBLE_INPUT_SCHEMA,
    outputSchema: TAB_CAPTURE_VISIBLE_OUTPUT_SCHEMA,
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
    meta: {
      ...readMeta,
      activeTabRequired: true,
    },
  }),
  detectLanguage: defineExtensionToolContract({
    group: TABS_GROUP_CONTRACT,
    actionId: 'detectLanguage',
    name: 'extension_tool_detect_tab_language',
    title: 'Detect Tab Language',
    description: 'Detect the primary language of the content in a tab',
    inputSchema: TAB_DETECT_LANGUAGE_INPUT_SCHEMA,
    outputSchema: TAB_DETECT_LANGUAGE_OUTPUT_SCHEMA,
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    meta: readMeta,
  }),
  discardTab: defineExtensionToolContract({
    group: TABS_GROUP_CONTRACT,
    actionId: 'discardTab',
    name: 'extension_tool_discard_tab',
    title: 'Discard Tab',
    description:
      'Discards a tab from memory. Discarded tabs are still visible but need to reload when activated',
    inputSchema: TAB_DISCARD_INPUT_SCHEMA,
    outputSchema: TAB_SINGLE_TAB_OUTPUT_SCHEMA,
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
    meta: mutateMeta,
  }),
  duplicateTab: defineExtensionToolContract({
    group: TABS_GROUP_CONTRACT,
    actionId: 'duplicateTab',
    name: 'extension_tool_duplicate_tab',
    title: 'Duplicate Tab',
    description: 'Duplicate a tab',
    inputSchema: TAB_DUPLICATE_INPUT_SCHEMA,
    outputSchema: TAB_SINGLE_TAB_OUTPUT_SCHEMA,
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
    meta: {
      ...mutateMeta,
      tabIdRequired: true,
    },
  }),
  getTab: defineExtensionToolContract({
    group: TABS_GROUP_CONTRACT,
    actionId: 'getTab',
    name: 'extension_tool_get_tab',
    title: 'Get Tab',
    description: 'Retrieves details about a specific tab',
    inputSchema: TAB_GET_INPUT_SCHEMA,
    outputSchema: TAB_SINGLE_TAB_OUTPUT_SCHEMA,
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    meta: {
      ...readMeta,
      tabIdRequired: true,
    },
  }),
  getZoom: defineExtensionToolContract({
    group: TABS_GROUP_CONTRACT,
    actionId: 'getZoom',
    name: 'extension_tool_get_tab_zoom',
    title: 'Get Tab Zoom',
    description: 'Retrieves the current zoom level of a tab',
    inputSchema: TAB_GET_ZOOM_INPUT_SCHEMA,
    outputSchema: TAB_ZOOM_OUTPUT_SCHEMA,
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    meta: readMeta,
  }),
  getZoomSettings: defineExtensionToolContract({
    group: TABS_GROUP_CONTRACT,
    actionId: 'getZoomSettings',
    name: 'extension_tool_get_tab_zoom_settings',
    title: 'Get Tab Zoom Settings',
    description: 'Gets the current zoom settings of a tab',
    inputSchema: TAB_GET_ZOOM_SETTINGS_INPUT_SCHEMA,
    outputSchema: TAB_ZOOM_SETTINGS_OUTPUT_SCHEMA,
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    meta: readMeta,
  }),
  setZoom: defineExtensionToolContract({
    group: TABS_GROUP_CONTRACT,
    actionId: 'setZoom',
    name: 'extension_tool_set_tab_zoom',
    title: 'Set Tab Zoom',
    description: 'Sets the zoom factor of a tab',
    inputSchema: TAB_SET_ZOOM_INPUT_SCHEMA,
    outputSchema: TAB_SET_ZOOM_OUTPUT_SCHEMA,
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    meta: mutateMeta,
  }),
  setZoomSettings: defineExtensionToolContract({
    group: TABS_GROUP_CONTRACT,
    actionId: 'setZoomSettings',
    name: 'extension_tool_set_tab_zoom_settings',
    title: 'Set Tab Zoom Settings',
    description: 'Sets zoom settings for a tab (how zoom changes are handled)',
    inputSchema: TAB_SET_ZOOM_SETTINGS_INPUT_SCHEMA,
    outputSchema: TAB_SET_ZOOM_SETTINGS_OUTPUT_SCHEMA,
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    meta: mutateMeta,
  }),
  groupTabs: defineExtensionToolContract({
    group: TABS_GROUP_CONTRACT,
    actionId: 'groupTabs',
    name: 'extension_tool_group_tabs',
    title: 'Group Tabs',
    description: 'Groups one or more tabs together',
    inputSchema: TAB_GROUP_INPUT_SCHEMA,
    outputSchema: TAB_GROUP_OUTPUT_SCHEMA,
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
    meta: {
      ...mutateMeta,
      tabIdRequired: true,
    },
  }),
  ungroupTabs: defineExtensionToolContract({
    group: TABS_GROUP_CONTRACT,
    actionId: 'ungroupTabs',
    name: 'extension_tool_ungroup_tabs',
    title: 'Ungroup Tabs',
    description: 'Removes tabs from their groups',
    inputSchema: TAB_UNGROUP_INPUT_SCHEMA,
    outputSchema: TAB_UNGROUP_OUTPUT_SCHEMA,
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
    meta: {
      ...mutateMeta,
      tabIdRequired: true,
    },
  }),
  highlightTabs: defineExtensionToolContract({
    group: TABS_GROUP_CONTRACT,
    actionId: 'highlightTabs',
    name: 'extension_tool_highlight_tabs',
    title: 'Highlight Tabs',
    description: 'Highlights the given tabs and focuses on the first one',
    inputSchema: TAB_HIGHLIGHT_INPUT_SCHEMA,
    outputSchema: TAB_HIGHLIGHT_OUTPUT_SCHEMA,
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    meta: mutateMeta,
  }),
  moveTabs: defineExtensionToolContract({
    group: TABS_GROUP_CONTRACT,
    actionId: 'moveTabs',
    name: 'extension_tool_move_tabs',
    title: 'Move Tabs',
    description: 'Moves tabs to a new position within their window or to another window',
    inputSchema: TAB_MOVE_INPUT_SCHEMA,
    outputSchema: TAB_MOVE_OUTPUT_SCHEMA,
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
    meta: {
      ...mutateMeta,
      tabIdRequired: true,
    },
  }),
  sendMessage: defineExtensionToolContract({
    group: TABS_GROUP_CONTRACT,
    actionId: 'sendMessage',
    name: 'extension_tool_send_tab_message',
    title: 'Send Tab Message',
    description: 'Sends a message to content scripts in a specific tab',
    inputSchema: TAB_SEND_MESSAGE_INPUT_SCHEMA,
    outputSchema: TAB_SEND_MESSAGE_OUTPUT_SCHEMA,
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
    meta: {
      ...executeMeta,
      hostPermissionsRequired: true,
      tabIdRequired: true,
      frameIdSupported: true,
    },
  }),
} as const;

export type TabActionId = keyof typeof TAB_TOOL_CONTRACTS;
export type TabToolName = (typeof TAB_TOOL_CONTRACTS)[TabActionId]['name'];
