import { z } from 'zod';

import {
  type ExtensionToolGroupContract,
  type ToolAnnotations,
  type ZodExtensionToolContract,
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
  active: z.boolean().optional().describe('Whether the tabs are active in their windows'),
  pinned: z.boolean().optional().describe('Whether the tabs are pinned'),
  url: z
    .union([z.string(), z.array(z.string())])
    .optional()
    .describe('URL patterns to match, following chrome.tabs.query'),
  title: z.string().optional().describe('Page title pattern to match'),
  windowId: chromeWindowIdSchema.optional().describe('Window ID to query'),
  index: chromeTabIndexSchema.optional().describe('Tab index within its window'),
  highlighted: z.boolean().optional().describe('Whether the tabs are highlighted'),
  status: z.enum(['loading', 'complete']).optional().describe('Tab loading status'),
  audible: z.boolean().optional().describe('Whether the tabs are audible'),
  muted: z.boolean().optional().describe('Whether the tabs are muted'),
  lastFocusedWindow: z.boolean().optional().describe('Whether tabs are in the last focused window'),
  discarded: z.boolean().optional().describe('Whether tabs are discarded'),
  autoDiscardable: z.boolean().optional().describe('Whether tabs can be automatically discarded'),
  groupId: z.number().int().optional().describe('Tab group ID to query'),
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

export const CHROME_TAB_OUTPUT_SCHEMA = z.object({
  id: z.number(),
  index: z.number(),
  windowId: z.number(),
  openerTabId: z.number().optional(),
  selected: z.boolean().optional(),
  highlighted: z.boolean().optional(),
  active: z.boolean(),
  pinned: z.boolean(),
  audible: z.boolean().optional(),
  discarded: z.boolean().optional(),
  autoDiscardable: z.boolean().optional(),
  mutedInfo: z.object({}).passthrough().optional(),
  url: z.string().optional(),
  pendingUrl: z.string().optional(),
  title: z.string().optional(),
  favIconUrl: z.string().optional(),
  status: z.enum(['loading', 'complete']).optional(),
  incognito: z.boolean().optional(),
  width: z.number().optional(),
  height: z.number().optional(),
  sessionId: z.string().optional(),
  groupId: z.number().optional(),
});

export const TAB_ZOOM_SETTINGS_VALUE_SCHEMA = z.object({
  mode: z.enum(['automatic', 'manual', 'disabled']),
  scope: z.enum(['per-origin', 'per-tab']),
  defaultZoomFactor: z.number(),
});

export const TAB_WINDOW_OUTPUT_SCHEMA = z.object({
  id: z.number().optional(),
  focused: z.boolean().optional(),
  top: z.number().optional(),
  left: z.number().optional(),
  width: z.number().optional(),
  height: z.number().optional(),
  incognito: z.boolean().optional(),
  type: z.string().optional(),
  state: z.string().optional(),
  alwaysOnTop: z.boolean().optional(),
  tabs: z.array(CHROME_TAB_OUTPUT_SCHEMA).optional(),
});

export const TAB_LIST_ACTIVE_ENTRY_OUTPUT_SCHEMA = z.object({
  tabId: z.number().optional(),
  domain: z.string(),
  url: z.string().optional(),
  title: z.string().optional(),
  isActive: z.boolean(),
  windowId: z.number(),
  index: z.number(),
  pinned: z.boolean(),
  audible: z.boolean().optional(),
  mutedInfo: z.object({}).passthrough().optional(),
  status: z.enum(['loading', 'complete']).optional(),
});

export const TAB_LIST_ACTIVE_OUTPUT_SCHEMA = z.object({
  domains: z.record(z.string(), z.array(TAB_LIST_ACTIVE_ENTRY_OUTPUT_SCHEMA)),
  totalTabs: z.number(),
});

export const TAB_CREATE_OUTPUT_SCHEMA = CHROME_TAB_OUTPUT_SCHEMA;

export const TAB_UPDATE_OUTPUT_SCHEMA = CHROME_TAB_OUTPUT_SCHEMA;

export const TAB_CLOSE_OUTPUT_SCHEMA = z.void();

export const TAB_GET_ALL_OUTPUT_SCHEMA = z.array(CHROME_TAB_OUTPUT_SCHEMA);

export const TAB_HISTORY_OUTPUT_SCHEMA = z.object({
  tabId: z.number(),
  direction: z.enum(['back', 'forward']),
});

export const TAB_RELOAD_OUTPUT_SCHEMA = z.object({
  tabId: z.number(),
  bypassCache: z.boolean(),
});

export const TAB_CAPTURE_VISIBLE_OUTPUT_SCHEMA = z.object({
  dataUrl: z.string(),
  length: z.number(),
});

export const TAB_DETECT_LANGUAGE_OUTPUT_SCHEMA = z.object({
  language: z.string(),
});

export const TAB_SINGLE_TAB_OUTPUT_SCHEMA = CHROME_TAB_OUTPUT_SCHEMA;

export const TAB_ZOOM_OUTPUT_SCHEMA = z.object({
  zoomFactor: z.number(),
});

export const TAB_ZOOM_SETTINGS_OUTPUT_SCHEMA = TAB_ZOOM_SETTINGS_VALUE_SCHEMA;

export const TAB_SET_ZOOM_OUTPUT_SCHEMA = z.object({
  tabId: z.number().optional(),
  zoomFactor: z.number(),
});

export const TAB_SET_ZOOM_SETTINGS_OUTPUT_SCHEMA = z.object({
  settings: TAB_ZOOM_SETTINGS_VALUE_SCHEMA,
});

export const TAB_GROUP_TABS_OUTPUT_SCHEMA = z.object({
  groupId: z.number(),
});

export const TAB_UNGROUP_OUTPUT_SCHEMA = z.object({
  tabIds: z.array(z.number()),
});

export const TAB_HIGHLIGHT_OUTPUT_SCHEMA = z.object({
  window: TAB_WINDOW_OUTPUT_SCHEMA,
});

export const TAB_MOVE_OUTPUT_SCHEMA = z.object({
  tabs: z.array(CHROME_TAB_OUTPUT_SCHEMA),
});

export const TAB_SEND_MESSAGE_OUTPUT_SCHEMA = z.object({
  response: z.unknown(),
});

export type TabListActiveInput = z.infer<typeof TAB_LIST_ACTIVE_INPUT_SCHEMA>;
export type TabListActiveOutput = z.infer<typeof TAB_LIST_ACTIVE_OUTPUT_SCHEMA>;
export type TabCreateInput = z.infer<typeof TAB_CREATE_INPUT_SCHEMA>;
export type TabCreateOutput = z.infer<typeof TAB_CREATE_OUTPUT_SCHEMA>;
export type TabUpdateInput = z.infer<typeof TAB_UPDATE_INPUT_SCHEMA>;
export type TabUpdateOutput = z.infer<typeof TAB_UPDATE_OUTPUT_SCHEMA>;
export type TabCloseInput = z.infer<typeof TAB_CLOSE_INPUT_SCHEMA>;
export type TabCloseOutput = z.infer<typeof TAB_CLOSE_OUTPUT_SCHEMA>;
export type TabGetAllInput = z.infer<typeof TAB_GET_ALL_INPUT_SCHEMA>;
export type TabGetAllOutput = z.infer<typeof TAB_GET_ALL_OUTPUT_SCHEMA>;
export type TabNavigateHistoryInput = z.infer<typeof TAB_NAVIGATE_HISTORY_INPUT_SCHEMA>;
export type TabNavigateHistoryOutput = z.infer<typeof TAB_HISTORY_OUTPUT_SCHEMA>;
export type TabReloadInput = z.infer<typeof TAB_RELOAD_INPUT_SCHEMA>;
export type TabReloadOutput = z.infer<typeof TAB_RELOAD_OUTPUT_SCHEMA>;
export type TabCaptureVisibleInput = z.infer<typeof TAB_CAPTURE_VISIBLE_INPUT_SCHEMA>;
export type TabCaptureVisibleOutput = z.infer<typeof TAB_CAPTURE_VISIBLE_OUTPUT_SCHEMA>;
export type TabDetectLanguageInput = z.infer<typeof TAB_DETECT_LANGUAGE_INPUT_SCHEMA>;
export type TabDetectLanguageOutput = z.infer<typeof TAB_DETECT_LANGUAGE_OUTPUT_SCHEMA>;
export type TabDiscardInput = z.infer<typeof TAB_DISCARD_INPUT_SCHEMA>;
export type TabDuplicateInput = z.infer<typeof TAB_DUPLICATE_INPUT_SCHEMA>;
export type TabGetInput = z.infer<typeof TAB_GET_INPUT_SCHEMA>;
export type TabSingleTabOutput = z.infer<typeof TAB_SINGLE_TAB_OUTPUT_SCHEMA>;
export type TabGetZoomInput = z.infer<typeof TAB_GET_ZOOM_INPUT_SCHEMA>;
export type TabZoomOutput = z.infer<typeof TAB_ZOOM_OUTPUT_SCHEMA>;
export type TabGetZoomSettingsInput = z.infer<typeof TAB_GET_ZOOM_SETTINGS_INPUT_SCHEMA>;
export type TabZoomSettingsOutput = z.infer<typeof TAB_ZOOM_SETTINGS_OUTPUT_SCHEMA>;
export type TabSetZoomInput = z.infer<typeof TAB_SET_ZOOM_INPUT_SCHEMA>;
export type TabSetZoomOutput = z.infer<typeof TAB_SET_ZOOM_OUTPUT_SCHEMA>;
export type TabSetZoomSettingsInput = z.infer<typeof TAB_SET_ZOOM_SETTINGS_INPUT_SCHEMA>;
export type TabSetZoomSettingsOutput = z.infer<typeof TAB_SET_ZOOM_SETTINGS_OUTPUT_SCHEMA>;
export type TabGroupInput = z.infer<typeof TAB_GROUP_INPUT_SCHEMA>;
export type TabGroupOutput = z.infer<typeof TAB_GROUP_TABS_OUTPUT_SCHEMA>;
export type TabUngroupInput = z.infer<typeof TAB_UNGROUP_INPUT_SCHEMA>;
export type TabUngroupOutput = z.infer<typeof TAB_UNGROUP_OUTPUT_SCHEMA>;
export type TabHighlightInput = z.infer<typeof TAB_HIGHLIGHT_INPUT_SCHEMA>;
export type TabHighlightOutput = z.infer<typeof TAB_HIGHLIGHT_OUTPUT_SCHEMA>;
export type TabMoveInput = z.infer<typeof TAB_MOVE_INPUT_SCHEMA>;
export type TabMoveOutput = z.infer<typeof TAB_MOVE_OUTPUT_SCHEMA>;
export type TabSendMessageInput = z.infer<typeof TAB_SEND_MESSAGE_INPUT_SCHEMA>;
export type TabSendMessageOutput = z.infer<typeof TAB_SEND_MESSAGE_OUTPUT_SCHEMA>;

const TAB_PERMISSIONS = ['tabs'] as const;

function defineTabTool<
  const TName extends string,
  const TActionId extends (typeof TAB_ACTION_IDS)[number],
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
  requiresActiveTab?: boolean;
  hostPermissions?: readonly string[];
}): ZodExtensionToolContract<TName, 'tabs', TActionId, TInputSchema, TOutputSchema> {
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
        groupId: 'tabs',
        actionId: options.actionId,
        chromeApi: TABS_GROUP_CONTRACT.chromeApi,
        permissions: TAB_PERMISSIONS,
        ...(options.hostPermissions ? { hostPermissions: options.hostPermissions } : {}),
        ...(options.requiresActiveTab ? { requiresActiveTab: true } : {}),
      },
    },
    groupId: 'tabs',
    actionId: options.actionId,
    zodInputSchema: options.inputSchema,
    ...(options.outputSchema ? { zodOutputSchema: options.outputSchema } : {}),
  };
}

export const TAB_TOOL_CONTRACTS = {
  listActiveTabs: defineTabTool({
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
  }),
  createTab: defineTabTool({
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
  }),
  updateTab: defineTabTool({
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
  }),
  closeTabs: defineTabTool({
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
  }),
  getAllTabs: defineTabTool({
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
  }),
  navigateHistory: defineTabTool({
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
  }),
  reloadTab: defineTabTool({
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
  }),
  captureVisibleTab: defineTabTool({
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
  }),
  detectLanguage: defineTabTool({
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
  }),
  discardTab: defineTabTool({
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
  }),
  duplicateTab: defineTabTool({
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
  }),
  getTab: defineTabTool({
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
  }),
  getZoom: defineTabTool({
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
  }),
  getZoomSettings: defineTabTool({
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
  }),
  setZoom: defineTabTool({
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
  }),
  setZoomSettings: defineTabTool({
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
  }),
  groupTabs: defineTabTool({
    actionId: 'groupTabs',
    name: 'extension_tool_group_tabs',
    title: 'Group Tabs',
    description: 'Groups one or more tabs together',
    inputSchema: TAB_GROUP_INPUT_SCHEMA,
    outputSchema: TAB_GROUP_TABS_OUTPUT_SCHEMA,
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
  }),
  ungroupTabs: defineTabTool({
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
  }),
  highlightTabs: defineTabTool({
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
  }),
  moveTabs: defineTabTool({
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
  }),
  sendMessage: defineTabTool({
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
  }),
} as const;

export type TabActionId = keyof typeof TAB_TOOL_CONTRACTS;
export type TabToolName = (typeof TAB_TOOL_CONTRACTS)[TabActionId]['name'];
