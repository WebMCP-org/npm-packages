import { z } from 'zod';
import { contract, emptyInputSchema, messageResultSchema } from './shared';
import { executeScriptOutputSchema } from './scripting';

const scriptSourceSchema = z
  .object({ code: z.string().optional(), file: z.string().optional() })
  .refine((source) => (source.code === undefined) !== (source.file === undefined), {
    message: 'Exactly one of code or file must be specified for each script source',
  });

export const userScriptSchema = z.object({
  id: z.string(),
  matches: z.array(z.string()).optional(),
  js: z.array(scriptSourceSchema).optional(),
  allFrames: z.boolean().optional(),
  excludeMatches: z.array(z.string()).optional(),
  includeGlobs: z.array(z.string()).optional(),
  excludeGlobs: z.array(z.string()).optional(),
  runAt: z.enum(['document_start', 'document_end', 'document_idle']).optional(),
  world: z.enum(['MAIN', 'USER_SCRIPT']).optional(),
  worldId: z.string().optional(),
});

export const registerUserScriptsInputSchema = z.object({
  scripts: z.array(
    userScriptSchema.extend({
      matches: z.array(z.string()),
      id: z.string().refine((id) => !id.startsWith('_'), 'Script ID cannot start with underscore'),
    })
  ),
});
export const updateUserScriptsInputSchema = z.object({ scripts: z.array(userScriptSchema) });
export const userScriptMutationOutputSchema = z.object({
  count: z.number(),
  scriptIds: z.array(z.string()),
});
export type RegisterUserScriptsInput = z.infer<typeof registerUserScriptsInputSchema>;
export type RegisterUserScriptsOutput = z.infer<typeof userScriptMutationOutputSchema>;
export type UpdateUserScriptsInput = z.infer<typeof updateUserScriptsInputSchema>;
export type UpdateUserScriptsOutput = z.infer<typeof userScriptMutationOutputSchema>;

export const userScriptFilterInputSchema = z.object({ ids: z.array(z.string()).optional() });
export const getUserScriptsOutputSchema = z.object({
  count: z.number(),
  scripts: z.array(
    z.object({
      id: z.string(),
      matches: z.array(z.string()).optional(),
      allFrames: z.boolean().optional(),
      excludeMatches: z.array(z.string()).optional(),
      includeGlobs: z.array(z.string()).optional(),
      excludeGlobs: z.array(z.string()).optional(),
      runAt: z.string().optional(),
      world: z.string().optional(),
      worldId: z.string().optional(),
      jsSourcesCount: z.number(),
    })
  ),
});
export type GetUserScriptsInput = z.infer<typeof userScriptFilterInputSchema>;
export type GetUserScriptsOutput = z.infer<typeof getUserScriptsOutputSchema>;

export const unregisterUserScriptsOutputSchema = z.object({
  count: z.number(),
  scriptIds: z.array(z.string()),
});
export type UnregisterUserScriptsInput = z.infer<typeof userScriptFilterInputSchema>;
export type UnregisterUserScriptsOutput = z.infer<typeof unregisterUserScriptsOutputSchema>;

export const configureWorldInputSchema = z.object({
  csp: z.string().optional(),
  messaging: z.boolean().optional(),
  worldId: z.string().optional(),
});
export const worldConfigurationOutputSchema = z.object({
  worldId: z.string(),
  csp: z.string().optional(),
  messaging: z.boolean().optional(),
});
export type ConfigureWorldInput = z.infer<typeof configureWorldInputSchema>;
export type ConfigureWorldOutput = z.infer<typeof worldConfigurationOutputSchema>;

export const getWorldConfigurationsOutputSchema = z.object({
  count: z.number(),
  worlds: z.array(worldConfigurationOutputSchema),
});
export type GetWorldConfigurationsInput = z.infer<typeof emptyInputSchema>;
export type GetWorldConfigurationsOutput = z.infer<typeof getWorldConfigurationsOutputSchema>;

export const resetWorldConfigurationInputSchema = z.object({ worldId: z.string().optional() });
export type ResetWorldConfigurationInput = z.infer<typeof resetWorldConfigurationInputSchema>;

export const userScriptExecuteInputSchema = z.object({
  target: z.object({
    tabId: z.number(),
    frameIds: z.array(z.number()).optional(),
    documentIds: z.array(z.string()).optional(),
    allFrames: z.boolean().optional(),
  }),
  js: z.array(scriptSourceSchema),
  world: z.enum(['MAIN', 'USER_SCRIPT']).optional(),
  worldId: z.string().optional(),
  injectImmediately: z.boolean().optional(),
});
export const userScriptExecuteOutputSchema = executeScriptOutputSchema;
export type UserScriptExecuteInput = z.infer<typeof userScriptExecuteInputSchema>;
export type UserScriptExecuteOutput = z.infer<typeof userScriptExecuteOutputSchema>;

const meta = (actionId: string, chromeApi: string, modelFacing = true) => ({
  extension: {
    groupId: 'userScripts',
    actionId,
    chromeApi,
    permissions: ['userScripts'],
    hostPermissions: ['<all_urls>'],
    requiresActiveTab: true as const,
    risk: 'high' as const,
    ...(modelFacing ? {} : { modelFacing: false as const }),
  },
});

export const userScriptContracts = {
  register: contract({
    name: 'extension_tool_register_user_scripts',
    title: 'Register user scripts',
    description: 'Register dynamic user scripts.',
    inputSchema: registerUserScriptsInputSchema,
    outputSchema: userScriptMutationOutputSchema,
    annotations: { openWorldHint: true },
    _meta: meta('register', 'chrome.userScripts.register'),
  }),
  getScripts: contract({
    name: 'extension_tool_get_user_scripts',
    title: 'Get user scripts',
    description: 'List dynamic user scripts registered by this extension.',
    inputSchema: userScriptFilterInputSchema,
    outputSchema: getUserScriptsOutputSchema,
    annotations: { readOnlyHint: true, idempotentHint: true },
    _meta: meta('getScripts', 'chrome.userScripts.getScripts'),
  }),
  update: contract({
    name: 'extension_tool_update_user_scripts',
    title: 'Update user scripts',
    description: 'Update dynamic user scripts.',
    inputSchema: updateUserScriptsInputSchema,
    outputSchema: userScriptMutationOutputSchema,
    annotations: { openWorldHint: true },
    _meta: meta('update', 'chrome.userScripts.update'),
  }),
  unregister: contract({
    name: 'extension_tool_unregister_user_scripts',
    title: 'Unregister user scripts',
    description: 'Unregister dynamic user scripts.',
    inputSchema: userScriptFilterInputSchema,
    outputSchema: unregisterUserScriptsOutputSchema,
    annotations: { destructiveHint: true, idempotentHint: true },
    _meta: meta('unregister', 'chrome.userScripts.unregister'),
  }),
  configureWorld: contract({
    name: 'extension_tool_configure_user_script_world',
    title: 'Configure user script world',
    description: 'Configure the USER_SCRIPT world.',
    inputSchema: configureWorldInputSchema,
    outputSchema: worldConfigurationOutputSchema,
    annotations: { idempotentHint: true },
    _meta: meta('configureWorld', 'chrome.userScripts.configureWorld'),
  }),
  getWorldConfigurations: contract({
    name: 'extension_tool_get_world_configurations',
    title: 'Get world configurations',
    description: 'List user script world configurations.',
    inputSchema: emptyInputSchema,
    outputSchema: getWorldConfigurationsOutputSchema,
    annotations: { readOnlyHint: true, idempotentHint: true },
    _meta: meta('getWorldConfigurations', 'chrome.userScripts.getWorldConfigurations'),
  }),
  resetWorldConfiguration: contract({
    name: 'extension_tool_reset_world_configuration',
    title: 'Reset world configuration',
    description: 'Reset a user script world configuration.',
    inputSchema: resetWorldConfigurationInputSchema,
    outputSchema: messageResultSchema,
    annotations: { idempotentHint: true },
    _meta: meta('resetWorldConfiguration', 'chrome.userScripts.resetWorldConfiguration'),
  }),
  execute: contract({
    name: 'extension_tool_execute_user_script',
    title: 'Execute user script',
    description: 'Inject a user script into a target context.',
    inputSchema: userScriptExecuteInputSchema,
    outputSchema: userScriptExecuteOutputSchema,
    annotations: { openWorldHint: true },
    _meta: meta('execute', 'chrome.userScripts.execute'),
  }),
} as const;

export const userScriptsContracts = Object.values(userScriptContracts);
