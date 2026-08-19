import type { ToolInputSchema } from '@mcp-b/webmcp-polyfill/schema';
import type { PromptDescriptor, ResourceDescriptor } from '@mcp-b/webmcp-ts-sdk';
import type { MaybePromise } from '@mcp-b/webmcp-types';

export type {
  BrowserMcpServer as ModelContextProtocol,
  PromptDescriptor,
  ResourceDescriptor,
} from '@mcp-b/webmcp-ts-sdk';
export type { CallToolResult, ToolAnnotations, ToolDescriptor } from '@mcp-b/webmcp-types';

/** A single message returned by {@link WebMCPPromptConfig.get}. */
export type PromptMessage = Awaited<ReturnType<PromptDescriptor['get']>>['messages'][number];

/** A single entry returned by {@link WebMCPResourceConfig.read}. */
export type ResourceContents = Awaited<ReturnType<ResourceDescriptor['read']>>['contents'][number];

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

export type WebMCPResourceReturn = WebMCPPromptReturn;
