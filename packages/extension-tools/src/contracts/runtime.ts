import { z } from 'zod';
import { contract, emptyInputSchema, jsonValueSchema, messageResultSchema } from './shared';

export const runtimeConnectInputSchema = z.object({
  extensionId: z.string().optional(),
  name: z.string().optional(),
  includeTlsChannelId: z.boolean().optional(),
});
export const runtimeConnectOutputSchema = z.object({
  portName: z.string(),
  extensionId: z.string(),
});
export type RuntimeConnectInput = z.infer<typeof runtimeConnectInputSchema>;
export type RuntimeConnectOutput = z.infer<typeof runtimeConnectOutputSchema>;

export const runtimeConnectNativeInputSchema = z.object({ application: z.string() });
export type RuntimeConnectNativeInput = z.infer<typeof runtimeConnectNativeInputSchema>;

export const runtimeGetContextsInputSchema = z.object({
  contextTypes: z
    .array(
      z.enum(['TAB', 'POPUP', 'BACKGROUND', 'OFFSCREEN_DOCUMENT', 'SIDE_PANEL', 'DEVELOPER_TOOLS'])
    )
    .optional(),
  contextIds: z.array(z.string()).optional(),
  tabIds: z.array(z.number()).optional(),
  windowIds: z.array(z.number()).optional(),
  frameIds: z.array(z.number()).optional(),
  documentIds: z.array(z.string()).optional(),
  documentUrls: z.array(z.string()).optional(),
  documentOrigins: z.array(z.string()).optional(),
  incognito: z.boolean().optional(),
});
export const runtimeContextsOutputSchema = z.object({
  count: z.number(),
  contexts: z.array(
    z.object({
      contextId: z.string(),
      contextType: z.string(),
      documentId: z.string().optional(),
      documentOrigin: z.string().optional(),
      documentUrl: z.string().optional(),
      frameId: z.number().optional(),
      incognito: z.boolean(),
      tabId: z.number().optional(),
      windowId: z.number().optional(),
    })
  ),
});
export type RuntimeGetContextsInput = z.infer<typeof runtimeGetContextsInputSchema>;
export type RuntimeGetContextsOutput = z.infer<typeof runtimeContextsOutputSchema>;

export const runtimeManifestOutputSchema = z.object({
  manifest: z.record(z.string(), jsonValueSchema),
  name: z.string(),
  version: z.string(),
  manifestVersion: z.number(),
  description: z.string().optional(),
  permissions: z.array(z.string()),
  hostPermissions: z.array(z.string()),
});
export type RuntimeGetManifestInput = z.infer<typeof emptyInputSchema>;
export type RuntimeGetManifestOutput = z.infer<typeof runtimeManifestOutputSchema>;

export const runtimePackageDirectoryOutputSchema = z.object({
  name: z.string(),
  fullPath: z.string(),
  isDirectory: z.boolean(),
  isFile: z.boolean(),
});
export type RuntimeGetPackageDirectoryEntryInput = z.infer<typeof emptyInputSchema>;
export type RuntimeGetPackageDirectoryEntryOutput = z.infer<
  typeof runtimePackageDirectoryOutputSchema
>;

export const runtimePlatformInfoOutputSchema = z.object({
  os: z.string(),
  arch: z.string(),
  nacl_arch: z.string(),
});
export type RuntimeGetPlatformInfoInput = z.infer<typeof emptyInputSchema>;
export type RuntimeGetPlatformInfoOutput = z.infer<typeof runtimePlatformInfoOutputSchema>;

export const runtimeGetUrlInputSchema = z.object({ path: z.string() });
export const runtimeGetUrlOutputSchema = z.object({
  relativePath: z.string(),
  fullUrl: z.string(),
});
export type RuntimeGetUrlInput = z.infer<typeof runtimeGetUrlInputSchema>;
export type RuntimeGetUrlOutput = z.infer<typeof runtimeGetUrlOutputSchema>;

export const runtimeRestartAfterDelayInputSchema = z.object({ seconds: z.number() });
export type RuntimeRestartAfterDelayInput = z.infer<typeof runtimeRestartAfterDelayInputSchema>;

export const runtimeRequestUpdateCheckOutputSchema = z.object({
  status: z.string(),
  version: z.string().optional(),
});
export type RuntimeRequestUpdateCheckInput = z.infer<typeof emptyInputSchema>;
export type RuntimeRequestUpdateCheckOutput = z.infer<typeof runtimeRequestUpdateCheckOutputSchema>;

export const runtimeSendMessageInputSchema = z.object({
  message: jsonValueSchema,
  extensionId: z.string().optional(),
  includeTlsChannelId: z.boolean().optional(),
});
export const runtimeSendMessageOutputSchema = z.object({
  messageSent: jsonValueSchema,
  response: jsonValueSchema.optional(),
  extensionId: z.string(),
});
export type RuntimeSendMessageInput = z.infer<typeof runtimeSendMessageInputSchema>;
export type RuntimeSendMessageOutput = z.infer<typeof runtimeSendMessageOutputSchema>;

export const runtimeSendNativeMessageInputSchema = z.object({
  application: z.string(),
  message: jsonValueSchema,
});
export const runtimeSendNativeMessageOutputSchema = z.object({
  application: z.string(),
  messageSent: jsonValueSchema,
  response: jsonValueSchema.optional(),
});
export type RuntimeSendNativeMessageInput = z.infer<typeof runtimeSendNativeMessageInputSchema>;
export type RuntimeSendNativeMessageOutput = z.infer<typeof runtimeSendNativeMessageOutputSchema>;

export const runtimeSetUninstallUrlInputSchema = z.object({ url: z.string().max(1023) });
export type RuntimeSetUninstallUrlInput = z.infer<typeof runtimeSetUninstallUrlInputSchema>;

const meta = (actionId: string, chromeApi: string, permissions: string[] = []) => ({
  extension: { groupId: 'runtime', actionId, chromeApi, permissions },
});
const high = (actionId: string, chromeApi: string, permissions: string[] = []) => ({
  extension: {
    groupId: 'runtime',
    actionId,
    chromeApi,
    permissions,
    risk: 'high' as const,
    modelFacing: false as const,
  },
});

export const runtimeContracts = {
  connect: contract({
    name: 'extension_tool_runtime_connect',
    title: 'Runtime connect',
    description: 'Open a runtime Port.',
    inputSchema: runtimeConnectInputSchema,
    outputSchema: runtimeConnectOutputSchema,
    annotations: { idempotentHint: true },
    _meta: meta('connect', 'chrome.runtime.connect'),
  }),
  connectNative: contract({
    name: 'extension_tool_runtime_connect_native',
    title: 'Runtime connect native',
    description: 'Open a native messaging Port.',
    inputSchema: runtimeConnectNativeInputSchema,
    outputSchema: runtimeConnectOutputSchema,
    annotations: { openWorldHint: true },
    _meta: high('connectNative', 'chrome.runtime.connectNative', ['nativeMessaging']),
  }),
  getContexts: contract({
    name: 'extension_tool_runtime_get_contexts',
    title: 'Runtime get contexts',
    description: 'Fetch active extension contexts.',
    inputSchema: runtimeGetContextsInputSchema,
    outputSchema: runtimeContextsOutputSchema,
    annotations: { readOnlyHint: true, idempotentHint: true },
    _meta: meta('getContexts', 'chrome.runtime.getContexts'),
  }),
  getManifest: contract({
    name: 'extension_tool_runtime_get_manifest',
    title: 'Runtime get manifest',
    description: 'Get extension manifest data.',
    inputSchema: emptyInputSchema,
    outputSchema: runtimeManifestOutputSchema,
    annotations: { readOnlyHint: true, idempotentHint: true },
    _meta: meta('getManifest', 'chrome.runtime.getManifest'),
  }),
  getPackageDirectoryEntry: contract({
    name: 'extension_tool_runtime_get_package_directory_entry',
    title: 'Runtime get package directory entry',
    description: 'Get package DirectoryEntry details.',
    inputSchema: emptyInputSchema,
    outputSchema: runtimePackageDirectoryOutputSchema,
    annotations: { readOnlyHint: true, idempotentHint: true },
    _meta: meta('getPackageDirectoryEntry', 'chrome.runtime.getPackageDirectoryEntry'),
  }),
  getPlatformInfo: contract({
    name: 'extension_tool_runtime_get_platform_info',
    title: 'Runtime get platform info',
    description: 'Get browser platform information.',
    inputSchema: emptyInputSchema,
    outputSchema: runtimePlatformInfoOutputSchema,
    annotations: { readOnlyHint: true, idempotentHint: true },
    _meta: meta('getPlatformInfo', 'chrome.runtime.getPlatformInfo'),
  }),
  getURL: contract({
    name: 'extension_tool_runtime_get_url',
    title: 'Runtime get URL',
    description: 'Resolve an extension resource URL.',
    inputSchema: runtimeGetUrlInputSchema,
    outputSchema: runtimeGetUrlOutputSchema,
    annotations: { readOnlyHint: true, idempotentHint: true },
    _meta: meta('getURL', 'chrome.runtime.getURL'),
  }),
  openOptionsPage: contract({
    name: 'extension_tool_runtime_open_options_page',
    title: 'Runtime open options page',
    description: 'Open the extension options page.',
    inputSchema: emptyInputSchema,
    outputSchema: messageResultSchema,
    annotations: { openWorldHint: true },
    _meta: meta('openOptionsPage', 'chrome.runtime.openOptionsPage'),
  }),
  reload: contract({
    name: 'extension_tool_runtime_reload',
    title: 'Runtime reload',
    description: 'Reload the extension.',
    inputSchema: emptyInputSchema,
    outputSchema: messageResultSchema,
    annotations: { destructiveHint: true },
    _meta: high('reload', 'chrome.runtime.reload'),
  }),
  requestUpdateCheck: contract({
    name: 'extension_tool_runtime_request_update_check',
    title: 'Runtime request update check',
    description: 'Request an extension update check.',
    inputSchema: emptyInputSchema,
    outputSchema: runtimeRequestUpdateCheckOutputSchema,
    annotations: { readOnlyHint: true },
    _meta: meta('requestUpdateCheck', 'chrome.runtime.requestUpdateCheck'),
  }),
  restart: contract({
    name: 'extension_tool_runtime_restart',
    title: 'Runtime restart',
    description: 'Restart ChromeOS in kiosk mode.',
    inputSchema: emptyInputSchema,
    outputSchema: messageResultSchema,
    annotations: { destructiveHint: true },
    _meta: high('restart', 'chrome.runtime.restart'),
  }),
  restartAfterDelay: contract({
    name: 'extension_tool_runtime_restart_after_delay',
    title: 'Runtime restart after delay',
    description: 'Schedule ChromeOS restart in kiosk mode.',
    inputSchema: runtimeRestartAfterDelayInputSchema,
    outputSchema: messageResultSchema,
    annotations: { destructiveHint: true },
    _meta: high('restartAfterDelay', 'chrome.runtime.restartAfterDelay'),
  }),
  sendMessage: contract({
    name: 'extension_tool_runtime_send_message',
    title: 'Runtime send message',
    description: 'Send a runtime message.',
    inputSchema: runtimeSendMessageInputSchema,
    outputSchema: runtimeSendMessageOutputSchema,
    annotations: { openWorldHint: true },
    _meta: meta('sendMessage', 'chrome.runtime.sendMessage'),
  }),
  sendNativeMessage: contract({
    name: 'extension_tool_runtime_send_native_message',
    title: 'Runtime send native message',
    description: 'Send a native messaging request.',
    inputSchema: runtimeSendNativeMessageInputSchema,
    outputSchema: runtimeSendNativeMessageOutputSchema,
    annotations: { openWorldHint: true },
    _meta: high('sendNativeMessage', 'chrome.runtime.sendNativeMessage', ['nativeMessaging']),
  }),
  setUninstallURL: contract({
    name: 'extension_tool_runtime_set_uninstall_url',
    title: 'Runtime set uninstall URL',
    description: 'Set the uninstall URL.',
    inputSchema: runtimeSetUninstallUrlInputSchema,
    outputSchema: messageResultSchema,
    annotations: { idempotentHint: true, openWorldHint: true },
    _meta: high('setUninstallURL', 'chrome.runtime.setUninstallURL'),
  }),
} as const;

export const runtimeContractList = Object.values(runtimeContracts);
