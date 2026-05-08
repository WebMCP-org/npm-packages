import { z } from 'zod';

import {
  defineExtensionToolContract,
  type ExtensionToolOutputSchema,
  type ExtensionToolGroupContract,
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
  keys: z.array(z.string()).optional().describe('Specific keys to retrieve (omit for all)'),
  area: STORAGE_AREA_SCHEMA.optional().describe(
    'Storage area to use. Available: sync, local, session (default: local)'
  ),
});

export const STORAGE_SET_INPUT_SCHEMA = z.object({
  data: z.record(z.string(), z.any()).describe('Key-value pairs to store'),
  area: STORAGE_AREA_SCHEMA.optional().describe(
    'Storage area to use. Available: sync, local, session (default: local)'
  ),
});

export const STORAGE_REMOVE_INPUT_SCHEMA = z.object({
  keys: z.array(z.string()).describe('Keys to remove from storage'),
  area: STORAGE_AREA_SCHEMA.optional().describe(
    'Storage area to use. Available: sync, local, session (default: local)'
  ),
});

export const STORAGE_CLEAR_INPUT_SCHEMA = z.object({
  area: STORAGE_AREA_SCHEMA.describe('Storage area to clear. Available: sync, local, session'),
  confirm: z.boolean().describe('Confirmation flag - must be true to clear storage'),
});

export const STORAGE_GET_BYTES_IN_USE_INPUT_SCHEMA = z.object({
  keys: z.array(z.string()).optional().describe('Specific keys to check (omit for total)'),
  area: STORAGE_AREA_SCHEMA.optional().describe(
    'Storage area to check. Available: sync, local, session (default: local)'
  ),
});

export const STORAGE_GET_OUTPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    area: {
      type: 'string',
      enum: ['sync', 'local', 'session'],
    },
    data: {
      type: 'object',
      additionalProperties: true,
    },
    keyCount: {
      type: 'number',
    },
  },
  required: ['area', 'data', 'keyCount'],
} as const satisfies ExtensionToolOutputSchema;

export const STORAGE_SET_OUTPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    keys: {
      type: 'array',
      items: {
        type: 'string',
      },
    },
  },
  required: ['keys'],
} as const satisfies ExtensionToolOutputSchema;

export const STORAGE_REMOVE_OUTPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    keys: {
      type: 'array',
      items: {
        type: 'string',
      },
    },
  },
  required: ['keys'],
} as const satisfies ExtensionToolOutputSchema;

export const STORAGE_BYTES_IN_USE_OUTPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    area: {
      type: 'string',
      enum: ['sync', 'local', 'session'],
    },
    bytesInUse: {
      type: 'number',
    },
    humanReadable: {
      type: 'string',
    },
    quota: {
      anyOf: [
        {
          type: 'object',
          additionalProperties: false,
          properties: {
            quotaBytes: {
              type: 'number',
            },
          },
          required: ['quotaBytes'],
        },
        {
          type: 'object',
          additionalProperties: false,
          properties: {
            quotaBytes: {
              type: 'number',
            },
            quotaBytesPerItem: {
              type: 'number',
            },
            maxItems: {
              type: 'number',
            },
            maxWriteOperationsPerHour: {
              type: 'number',
            },
            maxWriteOperationsPerMinute: {
              type: 'number',
            },
          },
          required: [
            'quotaBytes',
            'quotaBytesPerItem',
            'maxItems',
            'maxWriteOperationsPerHour',
            'maxWriteOperationsPerMinute',
          ],
        },
        {
          type: 'null',
        },
      ],
    },
    percentageUsed: {
      anyOf: [
        {
          type: 'string',
        },
        {
          type: 'null',
        },
      ],
    },
  },
  required: ['area', 'bytesInUse', 'humanReadable', 'quota', 'percentageUsed'],
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

export const STORAGE_TOOL_CONTRACTS = {
  getStorage: defineExtensionToolContract({
    group: STORAGE_GROUP_CONTRACT,
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
    meta: readMeta,
  }),
  setStorage: defineExtensionToolContract({
    group: STORAGE_GROUP_CONTRACT,
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
    meta: mutateMeta,
  }),
  removeStorage: defineExtensionToolContract({
    group: STORAGE_GROUP_CONTRACT,
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
    meta: deleteMeta,
  }),
  clearStorage: defineExtensionToolContract({
    group: STORAGE_GROUP_CONTRACT,
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
    meta: deleteMeta,
  }),
  getBytesInUse: defineExtensionToolContract({
    group: STORAGE_GROUP_CONTRACT,
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
    meta: readMeta,
  }),
} as const;

export type StorageActionId = keyof typeof STORAGE_TOOL_CONTRACTS;
export type StorageToolName = (typeof STORAGE_TOOL_CONTRACTS)[StorageActionId]['name'];
