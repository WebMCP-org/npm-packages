import type { ToolInputSchema } from '@mcp-b/webmcp-polyfill/schema';
import type { PromptDescriptor, ResourceDescriptor } from '@mcp-b/webmcp-ts-sdk';
import type { MaybePromise } from '@mcp-b/webmcp-types';

export type WebMCPPromptConfig = Pick<PromptDescriptor, 'name' | 'description'> & {
  argsSchema?: ToolInputSchema;
  get: (
    args: Parameters<PromptDescriptor['get']>[0]
  ) => MaybePromise<Awaited<ReturnType<PromptDescriptor['get']>>>;
};

export interface WebMCPPromptReturn {
  isRegistered: boolean;
}

export type WebMCPResourceConfig = ResourceDescriptor;

export interface WebMCPResourceReturn {
  isRegistered: boolean;
}
