import { z } from 'zod';

import {
  type ExtensionToolGroupContract,
  type ToolAnnotations,
  type ZodExtensionToolContract,
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

export const BOOKMARK_NODE_TYPE_SCHEMA = z.enum(['bookmark', 'folder']);

export interface BookmarkNodeOutput {
  id: string;
  title: string;
  url?: string | undefined;
  parentId?: string | undefined;
  index?: number | undefined;
  dateAdded?: number | undefined;
  dateGroupModified?: number | undefined;
  children?: BookmarkNodeOutput[] | undefined;
}

export const BOOKMARK_NODE_BASE_OUTPUT_SCHEMA = z
  .object({
    id: z.string(),
    title: z.string(),
    url: z.string().optional(),
    parentId: z.string().optional(),
    index: z.number().optional(),
    dateAdded: z.number().optional(),
    dateGroupModified: z.number().optional(),
  })
  .passthrough();

export const BOOKMARK_NODE_OUTPUT_SCHEMA: z.ZodType<BookmarkNodeOutput> = z.lazy(() =>
  BOOKMARK_NODE_BASE_OUTPUT_SCHEMA.extend({
    children: z.array(BOOKMARK_NODE_OUTPUT_SCHEMA).optional(),
  })
);

export const BOOKMARK_CREATE_OUTPUT_SCHEMA = BOOKMARK_NODE_BASE_OUTPUT_SCHEMA;
export const BOOKMARK_GET_OUTPUT_SCHEMA = z.array(BOOKMARK_NODE_BASE_OUTPUT_SCHEMA);
export const BOOKMARK_GET_CHILDREN_OUTPUT_SCHEMA = z.array(BOOKMARK_NODE_BASE_OUTPUT_SCHEMA);
export const BOOKMARK_GET_RECENT_OUTPUT_SCHEMA = z.array(BOOKMARK_NODE_BASE_OUTPUT_SCHEMA);
export const BOOKMARK_GET_SUBTREE_OUTPUT_SCHEMA = z.array(BOOKMARK_NODE_OUTPUT_SCHEMA);
export const BOOKMARK_GET_TREE_OUTPUT_SCHEMA = z.array(BOOKMARK_NODE_OUTPUT_SCHEMA);
export const BOOKMARK_MOVE_OUTPUT_SCHEMA = BOOKMARK_NODE_BASE_OUTPUT_SCHEMA;
export const BOOKMARK_REMOVE_OUTPUT_SCHEMA = z.void();
export const BOOKMARK_SEARCH_OUTPUT_SCHEMA = z.array(BOOKMARK_NODE_BASE_OUTPUT_SCHEMA);
export const BOOKMARK_UPDATE_OUTPUT_SCHEMA = BOOKMARK_NODE_BASE_OUTPUT_SCHEMA;

export type BookmarkCreateInput = z.infer<typeof BOOKMARK_CREATE_INPUT_SCHEMA>;
export type BookmarkCreateOutput = z.infer<typeof BOOKMARK_CREATE_OUTPUT_SCHEMA>;
export type BookmarkGetInput = z.infer<typeof BOOKMARK_GET_INPUT_SCHEMA>;
export type BookmarkGetOutput = z.infer<typeof BOOKMARK_GET_OUTPUT_SCHEMA>;
export type BookmarkGetChildrenInput = z.infer<typeof BOOKMARK_GET_CHILDREN_INPUT_SCHEMA>;
export type BookmarkGetChildrenOutput = z.infer<typeof BOOKMARK_GET_CHILDREN_OUTPUT_SCHEMA>;
export type BookmarkGetRecentInput = z.infer<typeof BOOKMARK_GET_RECENT_INPUT_SCHEMA>;
export type BookmarkGetRecentOutput = z.infer<typeof BOOKMARK_GET_RECENT_OUTPUT_SCHEMA>;
export type BookmarkGetSubTreeInput = z.infer<typeof BOOKMARK_GET_SUBTREE_INPUT_SCHEMA>;
export type BookmarkGetSubTreeOutput = z.infer<typeof BOOKMARK_GET_SUBTREE_OUTPUT_SCHEMA>;
export type BookmarkGetTreeInput = z.infer<typeof BOOKMARK_GET_TREE_INPUT_SCHEMA>;
export type BookmarkGetTreeOutput = z.infer<typeof BOOKMARK_GET_TREE_OUTPUT_SCHEMA>;
export type BookmarkMoveInput = z.infer<typeof BOOKMARK_MOVE_INPUT_SCHEMA>;
export type BookmarkMoveOutput = z.infer<typeof BOOKMARK_MOVE_OUTPUT_SCHEMA>;
export type BookmarkRemoveInput = z.infer<typeof BOOKMARK_REMOVE_INPUT_SCHEMA>;
export type BookmarkRemoveOutput = z.infer<typeof BOOKMARK_REMOVE_OUTPUT_SCHEMA>;
export type BookmarkRemoveTreeInput = z.infer<typeof BOOKMARK_REMOVE_TREE_INPUT_SCHEMA>;
export type BookmarkSearchInput = z.infer<typeof BOOKMARK_SEARCH_INPUT_SCHEMA>;
export type BookmarkSearchOutput = z.infer<typeof BOOKMARK_SEARCH_OUTPUT_SCHEMA>;
export type BookmarkUpdateInput = z.infer<typeof BOOKMARK_UPDATE_INPUT_SCHEMA>;
export type BookmarkUpdateOutput = z.infer<typeof BOOKMARK_UPDATE_OUTPUT_SCHEMA>;

const BOOKMARK_PERMISSIONS = ['bookmarks'] as const;

function defineBookmarkTool<
  const TName extends string,
  const TActionId extends (typeof BOOKMARK_ACTION_IDS)[number],
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
}): ZodExtensionToolContract<TName, 'bookmarks', TActionId, TInputSchema, TOutputSchema> {
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
        groupId: 'bookmarks',
        actionId: options.actionId,
        chromeApi: BOOKMARKS_GROUP_CONTRACT.chromeApi,
        permissions: BOOKMARK_PERMISSIONS,
      },
    },
    groupId: 'bookmarks',
    actionId: options.actionId,
    zodInputSchema: options.inputSchema,
    ...(options.outputSchema ? { zodOutputSchema: options.outputSchema } : {}),
  };
}

export const BOOKMARK_TOOL_CONTRACTS = {
  create: defineBookmarkTool({
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
  }),
  get: defineBookmarkTool({
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
  }),
  getChildren: defineBookmarkTool({
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
  }),
  getRecent: defineBookmarkTool({
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
  }),
  getSubTree: defineBookmarkTool({
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
  }),
  getTree: defineBookmarkTool({
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
  }),
  move: defineBookmarkTool({
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
  }),
  remove: defineBookmarkTool({
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
  }),
  removeTree: defineBookmarkTool({
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
  }),
  search: defineBookmarkTool({
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
  }),
  update: defineBookmarkTool({
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
  }),
} as const;

export type BookmarkActionId = keyof typeof BOOKMARK_TOOL_CONTRACTS;
export type BookmarkToolName = (typeof BOOKMARK_TOOL_CONTRACTS)[BookmarkActionId]['name'];
