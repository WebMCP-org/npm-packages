import { z } from 'zod';

export type ExtensionToolMeta = {
  groupId: string;
  actionId: string;
  chromeApi: string;
  permissions: string[];
  hostPermissions?: string[];
  requiresActiveTab?: true;
  modelFacing?: false;
  risk?: 'high';
};

export type NormalizedExtensionToolMeta = ExtensionToolMeta & {
  modelFacing: boolean;
  risk: 'default' | 'high';
};

export type ChromeApiContract<
  TInput extends z.ZodObject = z.ZodObject,
  TOutput extends z.ZodObject | undefined = z.ZodObject | undefined,
> = {
  name: string;
  title: string;
  description: string;
  inputSchema: TInput;
  outputSchema?: TOutput;
  annotations: {
    readOnlyHint?: boolean;
    destructiveHint?: boolean;
    idempotentHint?: boolean;
    openWorldHint?: boolean;
  };
  _meta: {
    extension: ExtensionToolMeta;
  };
};

export const emptyInputSchema = z.object({});

export const jsonValueSchema: z.ZodType<unknown> = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(jsonValueSchema),
    z.record(z.string(), jsonValueSchema),
  ])
);

export const messageResultSchema = z.object({
  ok: z.boolean(),
  message: z.string(),
});

export type MessageResult = z.infer<typeof messageResultSchema>;

export function contract<
  TInput extends z.ZodObject,
  TOutput extends z.ZodObject | undefined = undefined,
>(value: ChromeApiContract<TInput, TOutput>): ChromeApiContract<TInput, TOutput> {
  return value;
}

export function normalizeExtensionToolMeta(meta: ExtensionToolMeta): NormalizedExtensionToolMeta {
  return {
    ...meta,
    modelFacing: meta.modelFacing ?? true,
    risk: meta.risk ?? 'default',
  };
}
