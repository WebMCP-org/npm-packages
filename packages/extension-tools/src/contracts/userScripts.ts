import { z } from 'zod';
import { contract, emptyInputSchema, messageResultSchema } from './shared';

const scriptSourceSchema = z
  .object({ code: z.string().optional(), file: z.string().optional() })
  .refine((source) => (source.code === undefined) !== (source.file === undefined), {
    message: 'Exactly one of code or file must be specified for each script source',
  });

const scriptSourcesSchema = z.array(scriptSourceSchema).nonempty();
const userScriptIdSchema = z
  .string()
  .refine((id) => !id.startsWith('_'), 'Script ID cannot start with underscore');
const worldIdSchema = z
  .string()
  .refine((worldId) => !worldId.startsWith('_'), 'World ID cannot start with underscore');
const executionWorldSchema = z.enum(['MAIN', 'USER_SCRIPT']);
const runAtSchema = z.enum(['document_start', 'document_end', 'document_idle']);

function ensureWorldIdAllowed(input: { world?: string; worldId?: string }) {
  return input.worldId === undefined || input.world === undefined || input.world === 'USER_SCRIPT';
}

const userScriptObjectSchema = z.object({
  id: userScriptIdSchema,
  matches: z.array(z.string()).optional(),
  js: scriptSourcesSchema.optional(),
  allFrames: z.boolean().optional(),
  excludeMatches: z.array(z.string()).optional(),
  includeGlobs: z.array(z.string()).optional(),
  excludeGlobs: z.array(z.string()).optional(),
  runAt: runAtSchema.optional(),
  world: executionWorldSchema.optional(),
  worldId: worldIdSchema.optional(),
});

export const userScriptSchema = userScriptObjectSchema.refine(ensureWorldIdAllowed, {
  message: 'worldId is only valid when world is omitted or USER_SCRIPT',
});

export const registerUserScriptsInputSchema = z.object({
  scripts: z.array(
    userScriptObjectSchema
      .extend({
        matches: z.array(z.string()).nonempty(),
        js: scriptSourcesSchema,
      })
      .refine(ensureWorldIdAllowed, {
        message: 'worldId is only valid when world is omitted or USER_SCRIPT',
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
  worldId: worldIdSchema.optional(),
});
export const worldConfigurationOutputSchema = z.object({
  worldId: z.string().optional(),
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

export const resetWorldConfigurationInputSchema = z.object({ worldId: worldIdSchema.optional() });
export type ResetWorldConfigurationInput = z.infer<typeof resetWorldConfigurationInputSchema>;

const injectionTargetSchema = z
  .object({
    tabId: z.number(),
    frameIds: z.array(z.number()).optional(),
    documentIds: z.array(z.string()).optional(),
    allFrames: z.boolean().optional(),
  })
  .refine((target) => !(target.allFrames === true && target.frameIds !== undefined), {
    message: 'allFrames cannot be true when frameIds is specified',
  })
  .refine((target) => !(target.documentIds !== undefined && target.frameIds !== undefined), {
    message: 'documentIds cannot be specified with frameIds',
  });

export const userScriptExecuteInputSchema = z
  .object({
    target: injectionTargetSchema,
    js: scriptSourcesSchema,
    world: executionWorldSchema.optional(),
    worldId: worldIdSchema.optional(),
    injectImmediately: z.boolean().optional(),
  })
  .refine(ensureWorldIdAllowed, {
    message: 'worldId is only valid when world is omitted or USER_SCRIPT',
  });
export const userScriptInjectionResultSchema = z.object({
  documentId: z.string(),
  frameId: z.number(),
  result: z.unknown().optional(),
  error: z.string().optional(),
});
export const userScriptExecuteOutputSchema = z.object({
  injectionCount: z.number(),
  results: z.array(userScriptInjectionResultSchema),
});
export type UserScriptExecuteInput = z.infer<typeof userScriptExecuteInputSchema>;
export type UserScriptExecuteOutput = z.infer<typeof userScriptExecuteOutputSchema>;

const baseMeta = (
  actionId: string,
  chromeApi: string,
  options: {
    hostPermissions?: string[];
    requiresActiveTab?: true;
    risk?: 'high';
    modelFacing?: false;
  } = {}
) => ({
  extension: {
    groupId: 'userScripts',
    actionId,
    chromeApi,
    permissions: ['userScripts'],
    ...options,
  },
});
const injectionMeta = (actionId: string, chromeApi: string) =>
  baseMeta(actionId, chromeApi, {
    hostPermissions: ['<all_urls>'],
    requiresActiveTab: true,
    risk: 'high',
  });
const dynamicScriptMeta = (actionId: string, chromeApi: string) =>
  baseMeta(actionId, chromeApi, {
    hostPermissions: ['<all_urls>'],
    risk: 'high',
  });

export const userScriptContracts = {
  register: contract({
    name: 'extension_tool_register_user_scripts',
    title: 'Register user scripts',
    description: 'Register dynamic user scripts.',
    inputSchema: registerUserScriptsInputSchema,
    outputSchema: userScriptMutationOutputSchema,
    annotations: { openWorldHint: true },
    _meta: dynamicScriptMeta('register', 'chrome.userScripts.register'),
  }),
  getScripts: contract({
    name: 'extension_tool_get_user_scripts',
    title: 'Get user scripts',
    description: 'List dynamic user scripts registered by this extension.',
    inputSchema: userScriptFilterInputSchema,
    outputSchema: getUserScriptsOutputSchema,
    annotations: { readOnlyHint: true, idempotentHint: true },
    _meta: baseMeta('getScripts', 'chrome.userScripts.getScripts'),
  }),
  update: contract({
    name: 'extension_tool_update_user_scripts',
    title: 'Update user scripts',
    description: 'Update dynamic user scripts.',
    inputSchema: updateUserScriptsInputSchema,
    outputSchema: userScriptMutationOutputSchema,
    annotations: { openWorldHint: true },
    _meta: dynamicScriptMeta('update', 'chrome.userScripts.update'),
  }),
  unregister: contract({
    name: 'extension_tool_unregister_user_scripts',
    title: 'Unregister user scripts',
    description: 'Unregister dynamic user scripts.',
    inputSchema: userScriptFilterInputSchema,
    outputSchema: unregisterUserScriptsOutputSchema,
    annotations: { destructiveHint: true, idempotentHint: true },
    _meta: baseMeta('unregister', 'chrome.userScripts.unregister'),
  }),
  configureWorld: contract({
    name: 'extension_tool_configure_user_script_world',
    title: 'Configure user script world',
    description: 'Configure the USER_SCRIPT world.',
    inputSchema: configureWorldInputSchema,
    outputSchema: worldConfigurationOutputSchema,
    annotations: { idempotentHint: true },
    _meta: baseMeta('configureWorld', 'chrome.userScripts.configureWorld', { risk: 'high' }),
  }),
  getWorldConfigurations: contract({
    name: 'extension_tool_get_world_configurations',
    title: 'Get world configurations',
    description: 'List user script world configurations.',
    inputSchema: emptyInputSchema,
    outputSchema: getWorldConfigurationsOutputSchema,
    annotations: { readOnlyHint: true, idempotentHint: true },
    _meta: baseMeta('getWorldConfigurations', 'chrome.userScripts.getWorldConfigurations'),
  }),
  resetWorldConfiguration: contract({
    name: 'extension_tool_reset_world_configuration',
    title: 'Reset world configuration',
    description: 'Reset a user script world configuration.',
    inputSchema: resetWorldConfigurationInputSchema,
    outputSchema: messageResultSchema,
    annotations: { idempotentHint: true },
    _meta: baseMeta('resetWorldConfiguration', 'chrome.userScripts.resetWorldConfiguration', {
      risk: 'high',
    }),
  }),
  execute: contract({
    name: 'extension_tool_execute_user_script',
    title: 'Execute user script',
    description: 'Inject a user script into a target context.',
    inputSchema: userScriptExecuteInputSchema,
    outputSchema: userScriptExecuteOutputSchema,
    annotations: { openWorldHint: true },
    _meta: injectionMeta('execute', 'chrome.userScripts.execute'),
  }),
} as const;

export const userScriptsContracts = Object.values(userScriptContracts);
