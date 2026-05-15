import { z } from 'zod';
import { contract, messageResultSchema } from './shared';

export const injectionResultSchema = z.object({
  frameId: z.number(),
  documentId: z.string().optional(),
  result: z.unknown().optional(),
  error: z.string().optional(),
});

export const executeScriptInputSchema = z.object({
  tabId: z.number().optional(),
  code: z.string(),
  allFrames: z.boolean().optional(),
  world: z.enum(['MAIN', 'ISOLATED']).optional(),
});
export const executeScriptOutputSchema = z.object({
  injectionCount: z.number(),
  results: z.array(injectionResultSchema),
});
export type ExecuteScriptInput = z.infer<typeof executeScriptInputSchema>;
export type ExecuteScriptOutput = z.infer<typeof executeScriptOutputSchema>;

export const executeUserScriptInputSchema = z.object({
  tabId: z.number().optional(),
  code: z.string(),
  allFrames: z.boolean().optional(),
  world: z.enum(['USER_SCRIPT', 'MAIN']).optional(),
});
export const executeUserScriptOutputSchema = executeScriptOutputSchema;
export type ExecuteUserScriptInput = z.infer<typeof executeUserScriptInputSchema>;
export type ExecuteUserScriptOutput = z.infer<typeof executeUserScriptOutputSchema>;

export const cssInjectionInputSchema = z.object({
  tabId: z.number().optional(),
  css: z.string(),
  allFrames: z.boolean().optional(),
});
export type CssInjectionInput = z.infer<typeof cssInjectionInputSchema>;

const meta = (actionId: string, chromeApi: string, permissions: string[]) => ({
  extension: {
    groupId: 'scripting',
    actionId,
    chromeApi,
    permissions,
    hostPermissions: ['<all_urls>'],
    requiresActiveTab: true as const,
    risk: 'high' as const,
  },
});

export const scriptingContracts = {
  executeScript: contract({
    name: 'extension_tool_execute_script',
    title: 'Execute script',
    description: 'Execute JavaScript in a tab with chrome.scripting.',
    inputSchema: executeScriptInputSchema,
    outputSchema: executeScriptOutputSchema,
    annotations: { openWorldHint: true },
    _meta: meta('executeScript', 'chrome.scripting.executeScript', ['scripting', 'tabs']),
  }),
  executeUserScript: contract({
    name: 'extension_tool_execute_user_script',
    title: 'Execute user script',
    description: 'Execute JavaScript through chrome.userScripts when the browser allows it.',
    inputSchema: executeUserScriptInputSchema,
    outputSchema: executeUserScriptOutputSchema,
    annotations: { openWorldHint: true },
    _meta: meta('executeUserScript', 'chrome.userScripts.execute', [
      'scripting',
      'userScripts',
      'tabs',
    ]),
  }),
  insertCSS: contract({
    name: 'extension_tool_insert_css',
    title: 'Insert CSS',
    description: 'Insert CSS into a tab.',
    inputSchema: cssInjectionInputSchema,
    outputSchema: messageResultSchema,
    annotations: { idempotentHint: true, openWorldHint: true },
    _meta: meta('insertCSS', 'chrome.scripting.insertCSS', ['scripting', 'tabs']),
  }),
  removeCSS: contract({
    name: 'extension_tool_remove_css',
    title: 'Remove CSS',
    description: 'Remove previously inserted CSS from a tab.',
    inputSchema: cssInjectionInputSchema,
    outputSchema: messageResultSchema,
    annotations: { idempotentHint: true, openWorldHint: true },
    _meta: meta('removeCSS', 'chrome.scripting.removeCSS', ['scripting', 'tabs']),
  }),
} as const;

export const scriptingContractList = Object.values(scriptingContracts);
