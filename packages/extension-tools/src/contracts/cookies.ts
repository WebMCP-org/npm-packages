import { z } from 'zod';
import { contract, emptyInputSchema } from './shared';

export const cookiePartitionKeySchema = z.object({
  topLevelSite: z.string().optional(),
  hasCrossSiteAncestor: z.boolean().optional(),
});

export const cookieSchema = z.object({
  name: z.string(),
  value: z.string(),
  domain: z.string(),
  path: z.string(),
  secure: z.boolean(),
  httpOnly: z.boolean(),
  sameSite: z.string().optional(),
  session: z.boolean(),
  expirationDate: z.number().optional(),
  hostOnly: z.boolean(),
  storeId: z.string(),
  partitionKey: cookiePartitionKeySchema.optional(),
});

const cookieDetailsSchema = z.object({
  url: z.string(),
  name: z.string(),
  storeId: z.string().optional(),
  partitionKey: cookiePartitionKeySchema.optional(),
});

export const getCookieInputSchema = cookieDetailsSchema;
export const getCookieOutputSchema = z.object({
  cookie: cookieSchema.nullable(),
  name: z.string(),
  url: z.string(),
});
export type GetCookieInput = z.infer<typeof getCookieInputSchema>;
export type GetCookieOutput = z.infer<typeof getCookieOutputSchema>;

export const getAllCookiesInputSchema = z.object({
  url: z.string().optional(),
  domain: z.string().optional(),
  name: z.string().optional(),
  path: z.string().optional(),
  secure: z.boolean().optional(),
  session: z.boolean().optional(),
  storeId: z.string().optional(),
  partitionKey: cookiePartitionKeySchema.optional(),
});
export const getAllCookiesOutputSchema = z.object({
  count: z.number(),
  cookies: z.array(cookieSchema),
});
export type GetAllCookiesInput = z.infer<typeof getAllCookiesInputSchema>;
export type GetAllCookiesOutput = z.infer<typeof getAllCookiesOutputSchema>;

export const getAllCookieStoresInputSchema = emptyInputSchema;
export const getAllCookieStoresOutputSchema = z.object({
  count: z.number(),
  cookieStores: z.array(z.object({ id: z.string(), tabIds: z.array(z.number()) })),
});
export type GetAllCookieStoresInput = z.infer<typeof getAllCookieStoresInputSchema>;
export type GetAllCookieStoresOutput = z.infer<typeof getAllCookieStoresOutputSchema>;

export const getPartitionKeyInputSchema = z.object({
  tabId: z.number().optional(),
  frameId: z.number().optional(),
  documentId: z.string().optional(),
});
export const getPartitionKeyOutputSchema = z.object({ partitionKey: cookiePartitionKeySchema });
export type GetPartitionKeyInput = z.infer<typeof getPartitionKeyInputSchema>;
export type GetPartitionKeyOutput = z.infer<typeof getPartitionKeyOutputSchema>;

export const setCookieInputSchema = z.object({
  url: z.string(),
  name: z.string().optional(),
  value: z.string().optional(),
  domain: z.string().optional(),
  path: z.string().optional(),
  secure: z.boolean().optional(),
  httpOnly: z.boolean().optional(),
  sameSite: z.enum(['no_restriction', 'lax', 'strict', 'unspecified']).optional(),
  expirationDate: z.number().optional(),
  storeId: z.string().optional(),
  partitionKey: cookiePartitionKeySchema.optional(),
});
export const setCookieOutputSchema = z.object({ cookie: cookieSchema });
export type SetCookieInput = z.infer<typeof setCookieInputSchema>;
export type SetCookieOutput = z.infer<typeof setCookieOutputSchema>;

export const removeCookieInputSchema = cookieDetailsSchema;
export const removeCookieOutputSchema = z.object({
  removed: z.boolean(),
  name: z.string(),
  url: z.string(),
  storeId: z.string().optional(),
  partitionKey: cookiePartitionKeySchema.optional(),
});
export type RemoveCookieInput = z.infer<typeof removeCookieInputSchema>;
export type RemoveCookieOutput = z.infer<typeof removeCookieOutputSchema>;

const meta = (actionId: string, chromeApi: string) => ({
  extension: {
    groupId: 'cookies',
    actionId,
    chromeApi,
    permissions: ['cookies'],
    hostPermissions: ['<all_urls>'],
  },
});

export const cookieContracts = {
  getCookie: contract({
    name: 'extension_tool_get_cookie',
    title: 'Get cookie',
    description: 'Retrieve one cookie by URL and name.',
    inputSchema: getCookieInputSchema,
    outputSchema: getCookieOutputSchema,
    annotations: { readOnlyHint: true, idempotentHint: true },
    _meta: meta('getCookie', 'chrome.cookies.get'),
  }),
  getAllCookies: contract({
    name: 'extension_tool_get_all_cookies',
    title: 'Get all cookies',
    description: 'Retrieve cookies matching the supplied filter.',
    inputSchema: getAllCookiesInputSchema,
    outputSchema: getAllCookiesOutputSchema,
    annotations: { readOnlyHint: true, idempotentHint: true },
    _meta: meta('getAllCookies', 'chrome.cookies.getAll'),
  }),
  getAllCookieStores: contract({
    name: 'extension_tool_get_all_cookie_stores',
    title: 'Get all cookie stores',
    description: 'List cookie stores in the current profile.',
    inputSchema: getAllCookieStoresInputSchema,
    outputSchema: getAllCookieStoresOutputSchema,
    annotations: { readOnlyHint: true, idempotentHint: true },
    _meta: meta('getAllCookieStores', 'chrome.cookies.getAllCookieStores'),
  }),
  getPartitionKey: contract({
    name: 'extension_tool_get_partition_key',
    title: 'Get cookie partition key',
    description: 'Get the cookie partition key for a frame or document.',
    inputSchema: getPartitionKeyInputSchema,
    outputSchema: getPartitionKeyOutputSchema,
    annotations: { readOnlyHint: true, idempotentHint: true },
    _meta: meta('getPartitionKey', 'chrome.cookies.getPartitionKey'),
  }),
  setCookie: contract({
    name: 'extension_tool_set_cookie',
    title: 'Set cookie',
    description: 'Create or overwrite a cookie.',
    inputSchema: setCookieInputSchema,
    outputSchema: setCookieOutputSchema,
    annotations: { idempotentHint: true, openWorldHint: true },
    _meta: meta('setCookie', 'chrome.cookies.set'),
  }),
  removeCookie: contract({
    name: 'extension_tool_remove_cookie',
    title: 'Remove cookie',
    description: 'Remove one cookie by URL and name.',
    inputSchema: removeCookieInputSchema,
    outputSchema: removeCookieOutputSchema,
    annotations: { destructiveHint: true, idempotentHint: true, openWorldHint: true },
    _meta: meta('removeCookie', 'chrome.cookies.remove'),
  }),
} as const;

export const cookiesContracts = Object.values(cookieContracts);
