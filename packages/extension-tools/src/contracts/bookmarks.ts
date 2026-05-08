import { z } from 'zod';

import {
  defineExtensionToolContract,
  type ExtensionToolOutputSchema,
  type ExtensionToolGroupContract,
} from './core';

export const BOOKMARKS_GROUP_CONTRACT = {
  id: 'bookmarks',
  title: 'Bookmarks',
  description: 'Chrome bookmarks API actions for reading and mutating the bookmark tree.',
  chromeApi: 'bookmarks',
  requiredPermissions: ['bookmarks'],
  optionalPermissions: [],
} as const satisfies ExtensionToolGroupContract;

export const BOOKMARK_ACTION_IDS = [
  'create',
  'get',
  'getChildren',
  'getRecent',
  'getSubTree',
  'getTree',
  'move',
  'remove',
  'removeTree',
  'search',
  'update',
] as const;

export const BOOKMARK_CREATE_INPUT_SCHEMA = z.object({
  parentId: z
    .string()
    .min(1)
    .optional()
    .describe('Parent folder ID. Defaults to the Other Bookmarks folder'),
  title: z.string().optional().describe('The title of the bookmark or folder'),
  url: z.string().optional().describe('The URL for the bookmark. Omit for folders'),
  index: z.number().int().min(0).optional().describe('The position within the parent folder'),
});

export const BOOKMARK_GET_INPUT_SCHEMA = z.object({
  idOrIdList: z
    .union([z.string().min(1), z.array(z.string().min(1)).min(1)])
    .describe('A single bookmark ID or array of bookmark IDs'),
});

export const BOOKMARK_GET_CHILDREN_INPUT_SCHEMA = z.object({
  id: z.string().min(1).describe('The ID of the folder to get children from'),
});

export const BOOKMARK_GET_RECENT_INPUT_SCHEMA = z.object({
  numberOfItems: z.number().int().min(1).describe('The maximum number of items to return'),
});

export const BOOKMARK_GET_SUBTREE_INPUT_SCHEMA = z.object({
  id: z.string().min(1).describe('The ID of the root of the subtree to retrieve'),
});

export const BOOKMARK_GET_TREE_INPUT_SCHEMA = z.object({});

export const BOOKMARK_MOVE_INPUT_SCHEMA = z.object({
  id: z.string().min(1).describe('The ID of the bookmark or folder to move'),
  parentId: z.string().min(1).optional().describe('The new parent folder ID'),
  index: z.number().int().min(0).optional().describe('The new position within the parent folder'),
});

export const BOOKMARK_REMOVE_INPUT_SCHEMA = z.object({
  id: z.string().min(1).describe('The ID of the bookmark or empty folder to remove'),
});

export const BOOKMARK_REMOVE_TREE_INPUT_SCHEMA = z.object({
  id: z.string().min(1).describe('The ID of the folder to remove recursively'),
});

export const BOOKMARK_SEARCH_INPUT_SCHEMA = z.object({
  query: z.union([
    z.string(),
    z.object({
      query: z.string().optional().describe('Words and phrases to match against URLs and titles'),
      url: z.string().optional().describe('URL to match exactly'),
      title: z.string().optional().describe('Title to match exactly'),
    }),
  ]),
});

export const BOOKMARK_UPDATE_INPUT_SCHEMA = z.object({
  id: z.string().min(1).describe('The ID of the bookmark or folder to update'),
  title: z.string().optional().describe('The new title'),
  url: z.string().optional().describe('The new URL (bookmarks only)'),
});

const bookmarkNodeProperties = {
  id: { type: 'string' },
  title: { type: 'string' },
  url: { type: 'string' },
  parentId: { type: 'string' },
  index: { type: 'number' },
  dateAdded: { type: 'number' },
  dateAddedFormatted: { type: 'string' },
  type: { type: 'string', enum: ['bookmark', 'folder'] },
} as const;

const bookmarkNodeOutputSchema = {
  type: 'object',
  properties: bookmarkNodeProperties,
  required: ['id', 'title', 'type'],
} as const;

const bookmarkNodeWithChildrenOutputSchema = {
  type: 'object',
  properties: {
    ...bookmarkNodeProperties,
    children: {
      type: 'array',
      items: {
        type: 'object',
        properties: bookmarkNodeProperties,
        required: ['id', 'title', 'type'],
      },
    },
  },
  required: ['id', 'title', 'type'],
} as const;

export const BOOKMARK_CREATE_OUTPUT_SCHEMA = {
  type: 'object',
  properties: bookmarkNodeProperties,
  required: ['id', 'title', 'parentId', 'index', 'dateAdded', 'type'],
} as const satisfies ExtensionToolOutputSchema;

export const BOOKMARK_GET_OUTPUT_SCHEMA = {
  type: 'object',
  properties: {
    count: { type: 'number' },
    bookmarks: {
      type: 'array',
      items: bookmarkNodeOutputSchema,
    },
  },
  required: ['count', 'bookmarks'],
} as const satisfies ExtensionToolOutputSchema;

export const BOOKMARK_GET_CHILDREN_OUTPUT_SCHEMA = {
  type: 'object',
  properties: {
    parentId: { type: 'string' },
    count: { type: 'number' },
    children: {
      type: 'array',
      items: bookmarkNodeOutputSchema,
    },
  },
  required: ['parentId', 'count', 'children'],
} as const satisfies ExtensionToolOutputSchema;

export const BOOKMARK_GET_RECENT_OUTPUT_SCHEMA = {
  type: 'object',
  properties: {
    count: { type: 'number' },
    recentBookmarks: {
      type: 'array',
      items: {
        type: 'object',
        properties: bookmarkNodeProperties,
        required: ['id', 'title'],
      },
    },
  },
  required: ['count', 'recentBookmarks'],
} as const satisfies ExtensionToolOutputSchema;

export const BOOKMARK_GET_SUBTREE_OUTPUT_SCHEMA = {
  type: 'object',
  properties: {
    rootId: { type: 'string' },
    subtree: {
      type: 'array',
      items: bookmarkNodeWithChildrenOutputSchema,
    },
  },
  required: ['rootId', 'subtree'],
} as const satisfies ExtensionToolOutputSchema;

export const BOOKMARK_GET_TREE_OUTPUT_SCHEMA = {
  type: 'object',
  properties: {
    tree: {
      type: 'array',
      items: bookmarkNodeWithChildrenOutputSchema,
    },
  },
  required: ['tree'],
} as const satisfies ExtensionToolOutputSchema;

export const BOOKMARK_MOVE_OUTPUT_SCHEMA = {
  type: 'object',
  properties: bookmarkNodeProperties,
  required: ['id', 'title', 'parentId', 'index', 'type'],
} as const satisfies ExtensionToolOutputSchema;

export const BOOKMARK_REMOVE_OUTPUT_SCHEMA = {
  type: 'object',
  properties: {
    id: { type: 'string' },
  },
  required: ['id'],
} as const satisfies ExtensionToolOutputSchema;

export const BOOKMARK_SEARCH_OUTPUT_SCHEMA = {
  type: 'object',
  properties: {
    query: { type: 'string' },
    count: { type: 'number' },
    results: {
      type: 'array',
      items: bookmarkNodeOutputSchema,
    },
  },
  required: ['query', 'count', 'results'],
} as const satisfies ExtensionToolOutputSchema;

export const BOOKMARK_UPDATE_OUTPUT_SCHEMA = {
  type: 'object',
  properties: {
    ...bookmarkNodeProperties,
    changes: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        url: { type: 'string' },
      },
    },
  },
  required: ['id', 'title', 'parentId', 'index', 'type', 'changes'],
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
  effect: 'delete',
  riskLevel: 'high',
} as const;

export const BOOKMARK_TOOL_CONTRACTS = {
  create: defineExtensionToolContract({
    group: BOOKMARKS_GROUP_CONTRACT,
    actionId: 'create',
    name: 'extension_tool_create_bookmark',
    title: 'Create Bookmark',
    description:
      'Create a bookmark or folder under the specified parent. A folder must have a title and no url',
    inputSchema: BOOKMARK_CREATE_INPUT_SCHEMA,
    outputSchema: BOOKMARK_CREATE_OUTPUT_SCHEMA,
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    },
    meta: mutateMeta,
  }),
  get: defineExtensionToolContract({
    group: BOOKMARKS_GROUP_CONTRACT,
    actionId: 'get',
    name: 'extension_tool_get_bookmarks',
    title: 'Get Bookmarks',
    description: 'Retrieve the specified bookmark(s) by ID',
    inputSchema: BOOKMARK_GET_INPUT_SCHEMA,
    outputSchema: BOOKMARK_GET_OUTPUT_SCHEMA,
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    meta: readMeta,
  }),
  getChildren: defineExtensionToolContract({
    group: BOOKMARKS_GROUP_CONTRACT,
    actionId: 'getChildren',
    name: 'extension_tool_get_bookmark_children',
    title: 'Get Bookmark Children',
    description: 'Retrieve the children of the specified bookmark folder',
    inputSchema: BOOKMARK_GET_CHILDREN_INPUT_SCHEMA,
    outputSchema: BOOKMARK_GET_CHILDREN_OUTPUT_SCHEMA,
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    meta: readMeta,
  }),
  getRecent: defineExtensionToolContract({
    group: BOOKMARKS_GROUP_CONTRACT,
    actionId: 'getRecent',
    name: 'extension_tool_get_recent_bookmarks',
    title: 'Get Recent Bookmarks',
    description: 'Retrieve the recently added bookmarks',
    inputSchema: BOOKMARK_GET_RECENT_INPUT_SCHEMA,
    outputSchema: BOOKMARK_GET_RECENT_OUTPUT_SCHEMA,
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    meta: readMeta,
  }),
  getSubTree: defineExtensionToolContract({
    group: BOOKMARKS_GROUP_CONTRACT,
    actionId: 'getSubTree',
    name: 'extension_tool_get_bookmark_subtree',
    title: 'Get Bookmark Subtree',
    description: 'Retrieve part of the bookmarks hierarchy, starting at the specified node',
    inputSchema: BOOKMARK_GET_SUBTREE_INPUT_SCHEMA,
    outputSchema: BOOKMARK_GET_SUBTREE_OUTPUT_SCHEMA,
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    meta: readMeta,
  }),
  getTree: defineExtensionToolContract({
    group: BOOKMARKS_GROUP_CONTRACT,
    actionId: 'getTree',
    name: 'extension_tool_get_bookmark_tree',
    title: 'Get Bookmark Tree',
    description: 'Retrieve the entire bookmarks hierarchy',
    inputSchema: BOOKMARK_GET_TREE_INPUT_SCHEMA,
    outputSchema: BOOKMARK_GET_TREE_OUTPUT_SCHEMA,
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    meta: readMeta,
  }),
  move: defineExtensionToolContract({
    group: BOOKMARKS_GROUP_CONTRACT,
    actionId: 'move',
    name: 'extension_tool_move_bookmark',
    title: 'Move Bookmark',
    description: 'Move the specified bookmark or folder to a new location',
    inputSchema: BOOKMARK_MOVE_INPUT_SCHEMA,
    outputSchema: BOOKMARK_MOVE_OUTPUT_SCHEMA,
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    },
    meta: mutateMeta,
  }),
  remove: defineExtensionToolContract({
    group: BOOKMARKS_GROUP_CONTRACT,
    actionId: 'remove',
    name: 'extension_tool_remove_bookmark',
    title: 'Remove Bookmark',
    description: 'Remove the specified bookmark or empty folder',
    inputSchema: BOOKMARK_REMOVE_INPUT_SCHEMA,
    outputSchema: BOOKMARK_REMOVE_OUTPUT_SCHEMA,
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: false,
    },
    meta: deleteMeta,
  }),
  removeTree: defineExtensionToolContract({
    group: BOOKMARKS_GROUP_CONTRACT,
    actionId: 'removeTree',
    name: 'extension_tool_remove_bookmark_tree',
    title: 'Remove Bookmark Tree',
    description: 'Recursively remove a bookmark folder and all its contents',
    inputSchema: BOOKMARK_REMOVE_TREE_INPUT_SCHEMA,
    outputSchema: BOOKMARK_REMOVE_OUTPUT_SCHEMA,
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: false,
    },
    meta: deleteMeta,
  }),
  search: defineExtensionToolContract({
    group: BOOKMARKS_GROUP_CONTRACT,
    actionId: 'search',
    name: 'extension_tool_search_bookmarks',
    title: 'Search Bookmarks',
    description: 'Search for bookmarks matching the given query',
    inputSchema: BOOKMARK_SEARCH_INPUT_SCHEMA,
    outputSchema: BOOKMARK_SEARCH_OUTPUT_SCHEMA,
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    meta: readMeta,
  }),
  update: defineExtensionToolContract({
    group: BOOKMARKS_GROUP_CONTRACT,
    actionId: 'update',
    name: 'extension_tool_update_bookmark',
    title: 'Update Bookmark',
    description: 'Update the properties of a bookmark or folder. Only title and url can be changed',
    inputSchema: BOOKMARK_UPDATE_INPUT_SCHEMA,
    outputSchema: BOOKMARK_UPDATE_OUTPUT_SCHEMA,
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    meta: mutateMeta,
  }),
} as const;

export type BookmarkActionId = keyof typeof BOOKMARK_TOOL_CONTRACTS;
export type BookmarkToolName = (typeof BOOKMARK_TOOL_CONTRACTS)[BookmarkActionId]['name'];
