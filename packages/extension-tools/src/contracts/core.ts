import {
  toWebMcpInputSchema,
  type InputSchema,
  type Tool,
  type ToolAnnotations,
} from '@mcp-b/webmcp-ts-sdk';
import type { z } from 'zod';

export const EXTENSION_TOOLS_META_KEY = 'mcp-b/extension-tools' as const;
export const EXTENSION_TOOLS_PACKAGE_NAME = '@mcp-b/extension-tools' as const;
export const EXTENSION_TOOLS_VERSION_FAMILY = '2.x' as const;

export type ExtensionToolKind =
  | 'browser-page-gateway'
  | 'chrome-api'
  | 'extension-utility'
  | 'userscript-materialization';

export type ExtensionRuntimeContext =
  | 'bgsw'
  | 'content-script'
  | 'devtools'
  | 'mixed'
  | 'offscreen';

export type ExtensionToolEffect = 'delete' | 'execute' | 'mutate' | 'navigate' | 'read';
export type ExtensionToolRiskLevel = 'low' | 'medium' | 'high';
export type ExtensionToolInputSchema = InputSchema;
export type ExtensionToolOutputSchema = NonNullable<Tool['outputSchema']>;

export const GENERIC_EXTENSION_TOOL_OUTPUT_SCHEMA = {
  type: 'object',
} as const satisfies ExtensionToolOutputSchema;

export interface ExtensionToolMeta {
  packageName: typeof EXTENSION_TOOLS_PACKAGE_NAME;
  versionFamily: typeof EXTENSION_TOOLS_VERSION_FAMILY;
  kind: ExtensionToolKind;
  groupId: string;
  actionId: string;
  chromeApi: string;
  requiredPermissions: readonly string[];
  optionalPermissions: readonly string[];
  manifestVersion: 3;
  minChromeVersion?: string;
  runtimeContext: readonly ExtensionRuntimeContext[];
  hostPermissionsRequired: boolean;
  activeTabRequired: boolean;
  tabIdRequired: boolean;
  frameIdSupported: boolean;
  originRequired: boolean;
  urlRequired: boolean;
  userGestureRequired: boolean;
  effect: ExtensionToolEffect;
  riskLevel: ExtensionToolRiskLevel;
}

export interface ExtensionToolGroupContract {
  id: string;
  title: string;
  description: string;
  chromeApi: string;
  requiredPermissions: readonly string[];
  optionalPermissions?: readonly string[];
}

export interface ExtensionToolContract<
  TName extends string = string,
  TGroupId extends string = string,
  TActionId extends string = string,
  TInputSchema extends z.AnyZodObject = z.AnyZodObject,
> {
  name: TName;
  title: string;
  description: string;
  inputSchema: ExtensionToolInputSchema;
  outputSchema?: ExtensionToolOutputSchema;
  annotations: ToolAnnotations;
  _meta: {
    [EXTENSION_TOOLS_META_KEY]: ExtensionToolMeta & {
      groupId: TGroupId;
      actionId: TActionId;
    };
  };
  groupId: TGroupId;
  actionId: TActionId;
  zodInputSchema: TInputSchema;
}

export interface DefineExtensionToolContractOptions<
  TName extends string,
  TGroupId extends string,
  TActionId extends string,
  TInputSchema extends z.AnyZodObject,
> {
  name: TName;
  title: string;
  description: string;
  group: ExtensionToolGroupContract & { id: TGroupId };
  actionId: TActionId;
  inputSchema: TInputSchema;
  outputSchema?: ExtensionToolOutputSchema;
  annotations: ToolAnnotations;
  meta: Omit<
    ExtensionToolMeta,
    | 'actionId'
    | 'chromeApi'
    | 'groupId'
    | 'manifestVersion'
    | 'optionalPermissions'
    | 'packageName'
    | 'requiredPermissions'
    | 'versionFamily'
  > &
    Partial<Pick<ExtensionToolMeta, 'optionalPermissions' | 'requiredPermissions'>>;
}

export function defineExtensionToolContract<
  const TName extends string,
  const TGroupId extends string,
  const TActionId extends string,
  const TInputSchema extends z.AnyZodObject,
>(
  options: DefineExtensionToolContractOptions<TName, TGroupId, TActionId, TInputSchema>
): ExtensionToolContract<TName, TGroupId, TActionId, TInputSchema> {
  return {
    name: options.name,
    title: options.title,
    description: options.description,
    inputSchema: toWebMcpInputSchema(options.inputSchema),
    ...(options.outputSchema ? { outputSchema: options.outputSchema } : {}),
    annotations: {
      title: options.title,
      ...options.annotations,
    },
    _meta: {
      [EXTENSION_TOOLS_META_KEY]: {
        packageName: EXTENSION_TOOLS_PACKAGE_NAME,
        versionFamily: EXTENSION_TOOLS_VERSION_FAMILY,
        kind: options.meta.kind,
        groupId: options.group.id,
        actionId: options.actionId,
        chromeApi: options.group.chromeApi,
        requiredPermissions: options.meta.requiredPermissions ?? options.group.requiredPermissions,
        optionalPermissions:
          options.meta.optionalPermissions ?? options.group.optionalPermissions ?? [],
        manifestVersion: 3,
        ...(options.meta.minChromeVersion
          ? { minChromeVersion: options.meta.minChromeVersion }
          : {}),
        runtimeContext: options.meta.runtimeContext,
        hostPermissionsRequired: options.meta.hostPermissionsRequired,
        activeTabRequired: options.meta.activeTabRequired,
        tabIdRequired: options.meta.tabIdRequired,
        frameIdSupported: options.meta.frameIdSupported,
        originRequired: options.meta.originRequired,
        urlRequired: options.meta.urlRequired,
        userGestureRequired: options.meta.userGestureRequired,
        effect: options.meta.effect,
        riskLevel: options.meta.riskLevel,
      },
    },
    groupId: options.group.id,
    actionId: options.actionId,
    zodInputSchema: options.inputSchema,
  };
}

export type InferExtensionToolInput<TContract> =
  TContract extends ExtensionToolContract<string, string, string, infer TSchema>
    ? z.infer<TSchema>
    : never;
