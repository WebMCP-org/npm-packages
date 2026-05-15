import { z } from 'zod';
import { contract, emptyInputSchema, messageResultSchema } from './shared';

const downloadDangerSchema = z.enum([
  'file',
  'url',
  'content',
  'uncommon',
  'host',
  'unwanted',
  'safe',
  'accepted',
]);
const downloadStateSchema = z.enum(['in_progress', 'interrupted', 'complete']);

export const downloadItemSchema = z.object({
  id: z.number(),
  url: z.string(),
  finalUrl: z.string().optional(),
  filename: z.string(),
  incognito: z.boolean(),
  danger: z.string(),
  mime: z.string(),
  startTime: z.string(),
  endTime: z.string().optional(),
  estimatedEndTime: z.string().optional(),
  state: z.string(),
  paused: z.boolean(),
  canResume: z.boolean(),
  error: z.string().optional(),
  bytesReceived: z.number(),
  totalBytes: z.number(),
  fileSize: z.number(),
  exists: z.boolean().optional(),
  byExtensionId: z.string().optional(),
  byExtensionName: z.string().optional(),
});

export const downloadFileInputSchema = z.object({
  url: z.string().url(),
  filename: z.string().optional(),
  saveAs: z.boolean().optional(),
  method: z.enum(['GET', 'POST']).optional(),
  headers: z.array(z.object({ name: z.string(), value: z.string() })).optional(),
  body: z.string().optional(),
  conflictAction: z.enum(['uniquify', 'overwrite', 'prompt']).optional(),
});
export const downloadFileOutputSchema = z.object({
  downloadId: z.number(),
  url: z.string(),
  filename: z.string(),
});
export type DownloadFileInput = z.infer<typeof downloadFileInputSchema>;
export type DownloadFileOutput = z.infer<typeof downloadFileOutputSchema>;

export const downloadQueryInputSchema = z.object({
  id: z.number().optional(),
  url: z.string().optional(),
  urlRegex: z.string().optional(),
  filename: z.string().optional(),
  filenameRegex: z.string().optional(),
  query: z.array(z.string()).optional(),
  state: downloadStateSchema.optional(),
  danger: downloadDangerSchema.optional(),
  mime: z.string().optional(),
  startTime: z.string().optional(),
  endTime: z.string().optional(),
  startedAfter: z.string().optional(),
  startedBefore: z.string().optional(),
  endedAfter: z.string().optional(),
  endedBefore: z.string().optional(),
  totalBytesGreater: z.number().optional(),
  totalBytesLess: z.number().optional(),
  exists: z.boolean().optional(),
  limit: z.number().optional(),
  orderBy: z.array(z.string()).optional(),
});
export const searchDownloadsOutputSchema = z.object({
  count: z.number(),
  downloads: z.array(downloadItemSchema),
});
export type SearchDownloadsInput = z.infer<typeof downloadQueryInputSchema>;
export type SearchDownloadsOutput = z.infer<typeof searchDownloadsOutputSchema>;

export const downloadIdInputSchema = z.object({ downloadId: z.number() });
export type DownloadIdInput = z.infer<typeof downloadIdInputSchema>;

export const getFileIconInputSchema = z.object({
  downloadId: z.number(),
  size: z.union([z.literal(16), z.literal(32)]).optional(),
});
export const getFileIconOutputSchema = z.object({
  downloadId: z.number(),
  iconURL: z.string().nullable(),
  size: z.number(),
});
export type GetFileIconInput = z.infer<typeof getFileIconInputSchema>;
export type GetFileIconOutput = z.infer<typeof getFileIconOutputSchema>;

export const eraseDownloadsInputSchema = downloadQueryInputSchema.omit({
  query: true,
  startTime: true,
  endTime: true,
  totalBytesGreater: true,
  totalBytesLess: true,
  exists: true,
  orderBy: true,
});
export const eraseDownloadsOutputSchema = z.object({
  erasedCount: z.number(),
  erasedIds: z.array(z.number()),
  filesDeleted: z.literal(false),
});
export type EraseDownloadsInput = z.infer<typeof eraseDownloadsInputSchema>;
export type EraseDownloadsOutput = z.infer<typeof eraseDownloadsOutputSchema>;

export const setUiOptionsInputSchema = z.object({ enabled: z.boolean() });
export type SetUiOptionsInput = z.infer<typeof setUiOptionsInputSchema>;

const meta = (actionId: string, chromeApi: string) => ({
  extension: { groupId: 'downloads', actionId, chromeApi, permissions: ['downloads'] },
});

export const downloadContracts = {
  download: contract({
    name: 'extension_tool_download_file',
    title: 'Download file',
    description: 'Start a browser download.',
    inputSchema: downloadFileInputSchema,
    outputSchema: downloadFileOutputSchema,
    annotations: { openWorldHint: true },
    _meta: meta('download', 'chrome.downloads.download'),
  }),
  search: contract({
    name: 'extension_tool_search_downloads',
    title: 'Search downloads',
    description: 'Search browser download history.',
    inputSchema: downloadQueryInputSchema,
    outputSchema: searchDownloadsOutputSchema,
    annotations: { readOnlyHint: true, idempotentHint: true },
    _meta: meta('search', 'chrome.downloads.search'),
  }),
  pause: contract({
    name: 'extension_tool_pause_download',
    title: 'Pause download',
    description: 'Pause a download.',
    inputSchema: downloadIdInputSchema,
    outputSchema: messageResultSchema,
    annotations: { idempotentHint: true },
    _meta: meta('pause', 'chrome.downloads.pause'),
  }),
  resume: contract({
    name: 'extension_tool_resume_download',
    title: 'Resume download',
    description: 'Resume a paused download.',
    inputSchema: downloadIdInputSchema,
    outputSchema: messageResultSchema,
    annotations: { idempotentHint: true },
    _meta: meta('resume', 'chrome.downloads.resume'),
  }),
  cancel: contract({
    name: 'extension_tool_cancel_download',
    title: 'Cancel download',
    description: 'Cancel a download.',
    inputSchema: downloadIdInputSchema,
    outputSchema: messageResultSchema,
    annotations: { destructiveHint: true, idempotentHint: true },
    _meta: meta('cancel', 'chrome.downloads.cancel'),
  }),
  getFileIcon: contract({
    name: 'extension_tool_get_file_icon',
    title: 'Get file icon',
    description: 'Get an icon URL for a downloaded file.',
    inputSchema: getFileIconInputSchema,
    outputSchema: getFileIconOutputSchema,
    annotations: { readOnlyHint: true, idempotentHint: true },
    _meta: meta('getFileIcon', 'chrome.downloads.getFileIcon'),
  }),
  open: contract({
    name: 'extension_tool_open_download',
    title: 'Open download',
    description: 'Open a completed downloaded file.',
    inputSchema: downloadIdInputSchema,
    outputSchema: messageResultSchema,
    annotations: { openWorldHint: true },
    _meta: meta('open', 'chrome.downloads.open'),
  }),
  show: contract({
    name: 'extension_tool_show_download',
    title: 'Show download',
    description: 'Show a downloaded file in the platform file manager.',
    inputSchema: downloadIdInputSchema,
    outputSchema: messageResultSchema,
    annotations: { readOnlyHint: true, openWorldHint: true },
    _meta: meta('show', 'chrome.downloads.show'),
  }),
  showDefaultFolder: contract({
    name: 'extension_tool_show_default_folder',
    title: 'Show default download folder',
    description: 'Show the default download folder.',
    inputSchema: emptyInputSchema,
    outputSchema: messageResultSchema,
    annotations: { readOnlyHint: true, openWorldHint: true },
    _meta: meta('showDefaultFolder', 'chrome.downloads.showDefaultFolder'),
  }),
  erase: contract({
    name: 'extension_tool_erase_downloads',
    title: 'Erase download history',
    description: 'Erase matching downloads from history without deleting files.',
    inputSchema: eraseDownloadsInputSchema,
    outputSchema: eraseDownloadsOutputSchema,
    annotations: { destructiveHint: true, idempotentHint: true },
    _meta: meta('erase', 'chrome.downloads.erase'),
  }),
  removeFile: contract({
    name: 'extension_tool_remove_file',
    title: 'Remove downloaded file',
    description: 'Delete a downloaded file without erasing history.',
    inputSchema: downloadIdInputSchema,
    outputSchema: messageResultSchema,
    annotations: { destructiveHint: true, idempotentHint: true },
    _meta: meta('removeFile', 'chrome.downloads.removeFile'),
  }),
  acceptDanger: contract({
    name: 'extension_tool_accept_danger',
    title: 'Accept dangerous download',
    description: 'Prompt to accept a dangerous download.',
    inputSchema: downloadIdInputSchema,
    outputSchema: messageResultSchema,
    annotations: { openWorldHint: true },
    _meta: meta('acceptDanger', 'chrome.downloads.acceptDanger'),
  }),
  setUiOptions: contract({
    name: 'extension_tool_set_ui_options',
    title: 'Set download UI options',
    description: 'Enable or disable browser download UI.',
    inputSchema: setUiOptionsInputSchema,
    outputSchema: messageResultSchema,
    annotations: { idempotentHint: true },
    _meta: meta('setUiOptions', 'chrome.downloads.setUiOptions'),
  }),
} as const;

export const downloadsContracts = Object.values(downloadContracts);
