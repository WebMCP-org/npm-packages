import type { ToolInputSchema } from '@mcp-b/webmcp-polyfill/schema';
import type { PromptDescriptor, ResourceDescriptor } from '@mcp-b/webmcp-ts-sdk';
import type { MaybePromise } from '@mcp-b/webmcp-types';

export type ReactWebMCPInputSchema = ToolInputSchema;

type PromptResult = Awaited<ReturnType<PromptDescriptor['get']>>;

export type WebMCPPromptConfig = Pick<PromptDescriptor, 'name' | 'description'> & {
  argsSchema?: ReactWebMCPInputSchema;
  get: (args: Parameters<PromptDescriptor['get']>[0]) => MaybePromise<PromptResult>;
};

export interface WebMCPPromptReturn {
  isRegistered: boolean;
}

export type WebMCPResourceConfig = ResourceDescriptor;

export interface WebMCPResourceReturn {
  isRegistered: boolean;
}
