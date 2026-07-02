import { z } from 'zod';

import {
  type ExtensionToolGroupContract,
  type ToolAnnotations,
  type ZodExtensionToolContract,
} from './core';

export const USER_SCRIPTS_GROUP_CONTRACT = {
  id: 'userScripts',
  title: 'User Scripts',
  description:
    'Chrome userScripts API actions for registering, updating, unregistering, listing, and one-time executing user scripts.',
  chromeApi: 'userScripts',
  requiredPermissions: ['userScripts'],
  optionalPermissions: [],
} as const satisfies ExtensionToolGroupContract;

export const USER_SCRIPTS_ACTION_IDS = [
  'register',
  'getScripts',
  'update',
  'unregister',
  'execute',
] as const;

const SCRIPT_SOURCE_SCHEMA = z
  .object({
    code: z.string().optional().describe('JavaScript code to inject'),
    file: z
      .string()
      .optional()
      .describe('Path to a JavaScript file relative to the extension root directory'),
  })
  .refine((source) => (source.code !== undefined) !== (source.file !== undefined), {
    message: 'Exactly one of code or file must be specified for each script source',
  });

const RUN_AT_SCHEMA = z
  .enum(['document_start', 'document_end', 'document_idle'])
  .describe('When to inject the script (default: document_idle)');

const WORLD_SCHEMA = z
  .enum(['MAIN', 'USER_SCRIPT'])
  .describe('JavaScript execution environment (default: USER_SCRIPT)');

const SCRIPT_ID_SCHEMA = z
  .string()
  .min(1)
  .refine((id) => !id.startsWith('_'), {
    message: 'Script ID must not start with underscore (reserved prefix)',
  })
  .describe('The ID of the user script. Must not start with underscore');

const REGISTERED_SCRIPT_FIELDS = {
  js: z.array(SCRIPT_SOURCE_SCHEMA).optional().describe('List of script sources to inject'),
  allFrames: z.boolean().optional().describe('Whether to inject into all frames (default: false)'),
  excludeMatches: z.array(z.string()).optional().describe('Pages to exclude from injection'),
  includeGlobs: z.array(z.string()).optional().describe('Wildcard patterns for pages to include'),
  excludeGlobs: z.array(z.string()).optional().describe('Wildcard patterns for pages to exclude'),
  runAt: RUN_AT_SCHEMA.optional(),
  world: WORLD_SCHEMA.optional(),
  worldId: z.string().optional().describe('User script world ID to execute in'),
} as const;

export const USER_SCRIPTS_REGISTER_INPUT_SCHEMA = z.object({
  scripts: z
    .array(
      z.object({
        id: SCRIPT_ID_SCHEMA,
        matches: z
          .array(z.string())
          .describe('Match patterns for pages this script will be injected into'),
        ...REGISTERED_SCRIPT_FIELDS,
      })
    )
    .min(1)
    .describe('Array of user scripts to register'),
});

export const USER_SCRIPTS_UPDATE_INPUT_SCHEMA = z.object({
  scripts: z
    .array(
      z.object({
        id: SCRIPT_ID_SCHEMA,
        matches: z
          .array(z.string())
          .optional()
          .describe('Match patterns for pages this script will be injected into'),
        ...REGISTERED_SCRIPT_FIELDS,
      })
    )
    .min(1)
    .describe('Array of user scripts to update'),
});

export const USER_SCRIPTS_GET_SCRIPTS_INPUT_SCHEMA = z.object({
  ids: z.array(z.string()).optional().describe('Filter to only return scripts with these IDs'),
});

export const USER_SCRIPTS_UNREGISTER_INPUT_SCHEMA = z.object({
  ids: z
    .array(z.string())
    .optional()
    .describe(
      'Filter to only unregister scripts with these IDs. If not specified, all scripts are unregistered'
    ),
});

export const USER_SCRIPTS_EXECUTE_INPUT_SCHEMA = z.object({
  target: z
    .object({
      tabId: z.number().describe('The ID of the tab to inject into'),
      frameIds: z.array(z.number()).optional().describe('IDs of specific frames to inject into'),
      documentIds: z
        .array(z.string())
        .optional()
        .describe('IDs of specific documents to inject into'),
      allFrames: z
        .boolean()
        .optional()
        .describe('Whether to inject into all frames (default: false)'),
    })
    .describe('Target specification for injection'),
  js: z.array(SCRIPT_SOURCE_SCHEMA).min(1).describe('List of script sources to inject'),
  world: WORLD_SCHEMA.optional(),
  worldId: z.string().optional().describe('User script world ID to execute in'),
  injectImmediately: z
    .boolean()
    .optional()
    .describe('Whether to inject immediately without waiting (default: false)'),
});

export const USER_SCRIPTS_MUTATE_OUTPUT_SCHEMA = z.object({
  scriptIds: z.array(z.string()),
});

export const USER_SCRIPTS_GET_SCRIPTS_OUTPUT_SCHEMA = z.object({
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

export const USER_SCRIPTS_EXECUTE_OUTPUT_SCHEMA = z.object({
  injectionCount: z.number(),
  results: z.array(
    z.object({
      frameId: z.number(),
      documentId: z.string().optional(),
      error: z.string().optional(),
      result: z.unknown().optional(),
    })
  ),
});

export type UserScriptsRegisterInput = z.infer<typeof USER_SCRIPTS_REGISTER_INPUT_SCHEMA>;
export type UserScriptsUpdateInput = z.infer<typeof USER_SCRIPTS_UPDATE_INPUT_SCHEMA>;
export type UserScriptsGetScriptsInput = z.infer<typeof USER_SCRIPTS_GET_SCRIPTS_INPUT_SCHEMA>;
export type UserScriptsUnregisterInput = z.infer<typeof USER_SCRIPTS_UNREGISTER_INPUT_SCHEMA>;
export type UserScriptsExecuteInput = z.infer<typeof USER_SCRIPTS_EXECUTE_INPUT_SCHEMA>;
export type UserScriptsGetScriptsOutput = z.infer<typeof USER_SCRIPTS_GET_SCRIPTS_OUTPUT_SCHEMA>;
export type UserScriptsExecuteOutput = z.infer<typeof USER_SCRIPTS_EXECUTE_OUTPUT_SCHEMA>;

const USER_SCRIPTS_PERMISSIONS = ['userScripts'] as const;

function defineUserScriptsTool<
  const TName extends string,
  const TActionId extends (typeof USER_SCRIPTS_ACTION_IDS)[number],
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
}): ZodExtensionToolContract<TName, 'userScripts', TActionId, TInputSchema, TOutputSchema> {
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
        groupId: 'userScripts',
        actionId: options.actionId,
        chromeApi: USER_SCRIPTS_GROUP_CONTRACT.chromeApi,
        permissions: USER_SCRIPTS_PERMISSIONS,
      },
    },
    groupId: 'userScripts',
    actionId: options.actionId,
    zodInputSchema: options.inputSchema,
    ...(options.outputSchema ? { zodOutputSchema: options.outputSchema } : {}),
  };
}

export const USER_SCRIPTS_TOOL_CONTRACTS = {
  register: defineUserScriptsTool({
    actionId: 'register',
    name: 'extension_tool_register_user_scripts',
    title: 'Register User Scripts',
    description:
      'Register one or more user scripts for this extension. Registrations persist across browser sessions and inject into pages matching the match patterns.',
    inputSchema: USER_SCRIPTS_REGISTER_INPUT_SCHEMA,
    outputSchema: USER_SCRIPTS_MUTATE_OUTPUT_SCHEMA,
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
  }),
  getScripts: defineUserScriptsTool({
    actionId: 'getScripts',
    name: 'extension_tool_get_user_scripts',
    title: 'Get User Scripts',
    description:
      'Get all dynamically-registered user scripts for this extension. Script source code is summarized as a count, not returned.',
    inputSchema: USER_SCRIPTS_GET_SCRIPTS_INPUT_SCHEMA,
    outputSchema: USER_SCRIPTS_GET_SCRIPTS_OUTPUT_SCHEMA,
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  }),
  update: defineUserScriptsTool({
    actionId: 'update',
    name: 'extension_tool_update_user_scripts',
    title: 'Update User Scripts',
    description:
      'Update one or more registered user scripts. Only properties specified in each script object are updated.',
    inputSchema: USER_SCRIPTS_UPDATE_INPUT_SCHEMA,
    outputSchema: USER_SCRIPTS_MUTATE_OUTPUT_SCHEMA,
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
  }),
  unregister: defineUserScriptsTool({
    actionId: 'unregister',
    name: 'extension_tool_unregister_user_scripts',
    title: 'Unregister User Scripts',
    description:
      'Unregister dynamically-registered user scripts for this extension. Without ids, unregisters all user scripts.',
    inputSchema: USER_SCRIPTS_UNREGISTER_INPUT_SCHEMA,
    outputSchema: USER_SCRIPTS_MUTATE_OUTPUT_SCHEMA,
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  }),
  execute: defineUserScriptsTool({
    actionId: 'execute',
    name: 'extension_tool_execute_user_script',
    title: 'Execute User Script',
    description:
      'Inject a script into a target tab one time (Chrome 135+). If the script evaluates to a promise, the browser waits for it and returns the resulting value.',
    inputSchema: USER_SCRIPTS_EXECUTE_INPUT_SCHEMA,
    outputSchema: USER_SCRIPTS_EXECUTE_OUTPUT_SCHEMA,
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
  }),
} as const;

export type UserScriptsActionId = keyof typeof USER_SCRIPTS_TOOL_CONTRACTS;
export type UserScriptsToolName = (typeof USER_SCRIPTS_TOOL_CONTRACTS)[UserScriptsActionId]['name'];
