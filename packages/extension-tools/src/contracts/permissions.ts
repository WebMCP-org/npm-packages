import { z } from 'zod';
import { contract, emptyInputSchema, messageResultSchema } from './shared';

export const permissionsObjectInputSchema = z
  .object({
    permissions: z.array(z.string()).optional(),
    origins: z.array(z.string()).optional(),
  })
  .refine((input) => Boolean(input.permissions?.length || input.origins?.length), {
    message: 'Either permissions or origins must be specified',
  });
export type PermissionsObjectInput = z.infer<typeof permissionsObjectInputSchema>;

export const containsPermissionsOutputSchema = z.object({
  hasPermissions: z.boolean(),
  checkedPermissions: z.array(z.string()),
  checkedOrigins: z.array(z.string()),
});
export type ContainsPermissionsOutput = z.infer<typeof containsPermissionsOutputSchema>;

export const getAllPermissionsOutputSchema = z.object({
  permissions: z.array(z.string()),
  origins: z.array(z.string()),
  permissionsCount: z.number(),
  originsCount: z.number(),
});
export type GetAllPermissionsInput = z.infer<typeof emptyInputSchema>;
export type GetAllPermissionsOutput = z.infer<typeof getAllPermissionsOutputSchema>;

export const hostAccessRequestInputSchema = z
  .object({
    tabId: z.number().optional(),
    documentId: z.string().optional(),
    pattern: z.string().optional(),
  })
  .refine((input) => input.tabId !== undefined || input.documentId !== undefined, {
    message: 'Either tabId or documentId must be specified',
  });
export type HostAccessRequestInput = z.infer<typeof hostAccessRequestInputSchema>;

const meta = (actionId: string, chromeApi: string, gated = false) => ({
  extension: {
    groupId: 'permissions',
    actionId,
    chromeApi,
    permissions: ['permissions'],
    ...(gated ? { modelFacing: false as const, risk: 'high' as const } : {}),
  },
});

export const permissionContracts = {
  request: contract({
    name: 'extension_tool_request_permissions',
    title: 'Request permissions',
    description: 'Request optional extension permissions. High-risk raw compatibility tool.',
    inputSchema: permissionsObjectInputSchema,
    outputSchema: messageResultSchema,
    annotations: { openWorldHint: true },
    _meta: meta('request', 'chrome.permissions.request', true),
  }),
  contains: contract({
    name: 'extension_tool_contains_permissions',
    title: 'Contains permissions',
    description: 'Check whether the extension already has permissions.',
    inputSchema: permissionsObjectInputSchema,
    outputSchema: containsPermissionsOutputSchema,
    annotations: { readOnlyHint: true, idempotentHint: true },
    _meta: meta('contains', 'chrome.permissions.contains'),
  }),
  getAll: contract({
    name: 'extension_tool_get_all_permissions',
    title: 'Get all permissions',
    description: 'List current extension permissions.',
    inputSchema: emptyInputSchema,
    outputSchema: getAllPermissionsOutputSchema,
    annotations: { readOnlyHint: true, idempotentHint: true },
    _meta: meta('getAll', 'chrome.permissions.getAll'),
  }),
  remove: contract({
    name: 'extension_tool_remove_permissions',
    title: 'Remove permissions',
    description: 'Remove optional extension permissions. High-risk raw compatibility tool.',
    inputSchema: permissionsObjectInputSchema,
    outputSchema: messageResultSchema,
    annotations: { destructiveHint: true, openWorldHint: true },
    _meta: meta('remove', 'chrome.permissions.remove', true),
  }),
  addHostAccessRequest: contract({
    name: 'extension_tool_add_host_access_request',
    title: 'Add host access request',
    description: 'Add a host access request. High-risk raw compatibility tool.',
    inputSchema: hostAccessRequestInputSchema,
    outputSchema: messageResultSchema,
    annotations: { openWorldHint: true },
    _meta: meta('addHostAccessRequest', 'chrome.permissions.addHostAccessRequest', true),
  }),
  removeHostAccessRequest: contract({
    name: 'extension_tool_remove_host_access_request',
    title: 'Remove host access request',
    description: 'Remove a host access request. High-risk raw compatibility tool.',
    inputSchema: hostAccessRequestInputSchema,
    outputSchema: messageResultSchema,
    annotations: { destructiveHint: true, idempotentHint: true },
    _meta: meta('removeHostAccessRequest', 'chrome.permissions.removeHostAccessRequest', true),
  }),
} as const;

export const permissionsContracts = Object.values(permissionContracts);
