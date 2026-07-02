import { z } from 'zod';

import {
  type ExtensionToolGroupContract,
  type ToolAnnotations,
  type ZodExtensionToolContract,
} from './core';

export const STORAGE_GROUP_CONTRACT = {
  id: 'storage',
  title: 'Storage',
  description: 'Chrome storage API actions for reading and mutating extension storage areas.',
  chromeApi: 'storage',
  requiredPermissions: ['storage'],
  optionalPermissions: [],
} as const satisfies ExtensionToolGroupContract;

export const STORAGE_ACTION_IDS = [
  'getStorage',
  'setStorage',
  'removeStorage',
  'clearStorage',
  'getBytesInUse',
] as const;

export const STORAGE_AREA_SCHEMA = z.enum(['sync', 'local', 'session']);

export const STORAGE_GET_INPUT_SCHEMA = z.object({
  keys: z
    .union([z.string(), z.array(z.string()), z.record(z.string(), z.unknown()), z.null()])
    .optional()
    .describe('Specific keys to retrieve, defaults object to merge, or null/omit for all'),
  area: STORAGE_AREA_SCHEMA.default('local').describe(
    'Storage area to use. Available: sync, local, session (default: local)'
  ),
});

export const STORAGE_SET_INPUT_SCHEMA = z.object({
  data: z.record(z.string(), z.any()).describe('Key-value pairs to store'),
  area: STORAGE_AREA_SCHEMA.default('local').describe(
    'Storage area to use. Available: sync, local, session (default: local)'
  ),
});

export const STORAGE_REMOVE_INPUT_SCHEMA = z.object({
  keys: z.array(z.string()).describe('Keys to remove from storage'),
  area: STORAGE_AREA_SCHEMA.default('local').describe(
    'Storage area to use. Available: sync, local, session (default: local)'
  ),
});

export const STORAGE_CLEAR_INPUT_SCHEMA = z.object({
  area: STORAGE_AREA_SCHEMA.describe('Storage area to clear. Available: sync, local, session'),
  confirm: z.boolean().describe('Confirmation flag - must be true to clear storage'),
});

export const STORAGE_GET_BYTES_IN_USE_INPUT_SCHEMA = z.object({
  keys: z
    .union([z.string(), z.array(z.string()), z.null()])
    .optional()
    .describe('Specific keys to check (omit or null for total)'),
  area: STORAGE_AREA_SCHEMA.default('local').describe(
    'Storage area to check. Available: sync, local, session (default: local)'
  ),
});

export const STORAGE_GET_OUTPUT_SCHEMA = z.object({
  area: STORAGE_AREA_SCHEMA,
  data: z.record(z.string(), z.unknown()),
  keyCount: z.number(),
});

export const STORAGE_MUTATE_KEYS_OUTPUT_SCHEMA = z.object({
  keys: z.array(z.string()),
});

export const STORAGE_SET_OUTPUT_SCHEMA = STORAGE_MUTATE_KEYS_OUTPUT_SCHEMA;
export const STORAGE_REMOVE_OUTPUT_SCHEMA = STORAGE_MUTATE_KEYS_OUTPUT_SCHEMA;

export const STORAGE_QUOTA_LOCAL_SCHEMA = z.object({
  quotaBytes: z.number(),
});

export const STORAGE_QUOTA_SYNC_SCHEMA = z.object({
  quotaBytes: z.number(),
  quotaBytesPerItem: z.number(),
  maxItems: z.number(),
  maxWriteOperationsPerHour: z.number(),
  maxWriteOperationsPerMinute: z.number(),
});

export const STORAGE_BYTES_IN_USE_OUTPUT_SCHEMA = z.object({
  area: STORAGE_AREA_SCHEMA,
  bytesInUse: z.number(),
  humanReadable: z.string(),
  quota: z.union([STORAGE_QUOTA_LOCAL_SCHEMA, STORAGE_QUOTA_SYNC_SCHEMA, z.null()]),
  percentageUsed: z.string().nullable(),
});

export type StorageGetInput = z.infer<typeof STORAGE_GET_INPUT_SCHEMA>;
export type StorageGetOutput = z.infer<typeof STORAGE_GET_OUTPUT_SCHEMA>;
export type StorageSetInput = z.infer<typeof STORAGE_SET_INPUT_SCHEMA>;
export type StorageSetOutput = z.infer<typeof STORAGE_SET_OUTPUT_SCHEMA>;
export type StorageRemoveInput = z.infer<typeof STORAGE_REMOVE_INPUT_SCHEMA>;
export type StorageRemoveOutput = z.infer<typeof STORAGE_REMOVE_OUTPUT_SCHEMA>;
export type StorageClearInput = z.infer<typeof STORAGE_CLEAR_INPUT_SCHEMA>;
export type StorageGetBytesInUseInput = z.infer<typeof STORAGE_GET_BYTES_IN_USE_INPUT_SCHEMA>;
export type StorageGetBytesInUseOutput = z.infer<typeof STORAGE_BYTES_IN_USE_OUTPUT_SCHEMA>;

const STORAGE_PERMISSIONS = ['storage'] as const;

function defineStorageTool<
  const TName extends string,
  const TActionId extends (typeof STORAGE_ACTION_IDS)[number],
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
}): ZodExtensionToolContract<TName, 'storage', TActionId, TInputSchema, TOutputSchema> {
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
        groupId: 'storage',
        actionId: options.actionId,
        chromeApi: STORAGE_GROUP_CONTRACT.chromeApi,
        permissions: STORAGE_PERMISSIONS,
      },
    },
    groupId: 'storage',
    actionId: options.actionId,
    zodInputSchema: options.inputSchema,
    ...(options.outputSchema ? { zodOutputSchema: options.outputSchema } : {}),
  };
}

export const STORAGE_TOOL_CONTRACTS = {
  getStorage: defineStorageTool({
    actionId: 'getStorage',
    name: 'extension_tool_get_storage',
    title: 'Get Storage',
    description: 'Get data from extension storage',
    inputSchema: STORAGE_GET_INPUT_SCHEMA,
    outputSchema: STORAGE_GET_OUTPUT_SCHEMA,
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  }),
  setStorage: defineStorageTool({
    actionId: 'setStorage',
    name: 'extension_tool_set_storage',
    title: 'Set Storage',
    description: 'Set data in extension storage',
    inputSchema: STORAGE_SET_INPUT_SCHEMA,
    outputSchema: STORAGE_SET_OUTPUT_SCHEMA,
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  }),
  removeStorage: defineStorageTool({
    actionId: 'removeStorage',
    name: 'extension_tool_remove_storage',
    title: 'Remove Storage',
    description: 'Remove specific keys from extension storage',
    inputSchema: STORAGE_REMOVE_INPUT_SCHEMA,
    outputSchema: STORAGE_REMOVE_OUTPUT_SCHEMA,
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: false,
    },
  }),
  clearStorage: defineStorageTool({
    actionId: 'clearStorage',
    name: 'extension_tool_clear_storage',
    title: 'Clear Storage',
    description: 'Clear all data from a storage area',
    inputSchema: STORAGE_CLEAR_INPUT_SCHEMA,
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: false,
    },
  }),
  getBytesInUse: defineStorageTool({
    actionId: 'getBytesInUse',
    name: 'extension_tool_get_storage_bytes_in_use',
    title: 'Get Storage Bytes In Use',
    description: 'Get the amount of storage space used',
    inputSchema: STORAGE_GET_BYTES_IN_USE_INPUT_SCHEMA,
    outputSchema: STORAGE_BYTES_IN_USE_OUTPUT_SCHEMA,
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  }),
} as const;

export type StorageActionId = keyof typeof STORAGE_TOOL_CONTRACTS;
export type StorageToolName = (typeof STORAGE_TOOL_CONTRACTS)[StorageActionId]['name'];
