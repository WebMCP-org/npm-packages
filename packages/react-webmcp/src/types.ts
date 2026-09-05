import type { ToolInputSchema } from '@mcp-b/webmcp-polyfill/schema';
import type { PromptDescriptor, ResourceDescriptor } from '@mcp-b/webmcp-ts-sdk';
import type {
  InferJsonSchema,
  InputSchema,
  JsonSchemaForInference,
  MaybePromise,
  ToolAnnotations,
} from '@mcp-b/webmcp-types';
import type {
  ToolExecuteFunction as CoreToolExecuteFunction,
  WebMCPConfig as CoreWebMCPConfig,
  WebMCPReturn as CoreWebMCPReturn,
} from 'usewebmcp';

/** Infers MCP-B structured output from its JSON Schema. */
export type InferOutput<T extends JsonSchemaForInference | undefined = undefined> = [T] extends [
  undefined,
]
  ? unknown
  : T extends JsonSchemaForInference
    ? InferJsonSchema<T>
    : unknown;

/** Core hook configuration with opt-in MCP metadata. */
export interface WebMCPConfig<
  TInput extends ToolInputSchema = InputSchema,
  TOutput extends JsonSchemaForInference | undefined = undefined,
> extends Omit<CoreWebMCPConfig<TInput, InferOutput<TOutput>>, 'annotations'> {
  outputSchema?: TOutput;
  annotations?: ToolAnnotations;
}

export type ToolExecuteFunction<
  TInput extends ToolInputSchema = InputSchema,
  TOutput extends JsonSchemaForInference | undefined = undefined,
> = CoreToolExecuteFunction<TInput, InferOutput<TOutput>>;
export type WebMCPReturn<
  TOutput extends JsonSchemaForInference | undefined = undefined,
  TInput extends ToolInputSchema = InputSchema,
> = CoreWebMCPReturn<TInput, InferOutput<TOutput>>;

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

export type WebMCPPromptConfig = Pick<PromptDescriptor, 'name' | 'description'> &
  Pick<WebMCPConfig, 'enabled'> & {
    argsSchema?: ToolInputSchema;
    get: (
      args: Parameters<PromptDescriptor['get']>[0]
    ) => MaybePromise<Awaited<ReturnType<PromptDescriptor['get']>>>;
  };

export interface WebMCPPromptReturn {
  isRegistered: boolean;
}

export type WebMCPResourceConfig = ResourceDescriptor & Pick<WebMCPConfig, 'enabled'>;

export type WebMCPResourceReturn = WebMCPPromptReturn;
