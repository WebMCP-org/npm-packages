import type { StandardJSONSchemaV1, StandardSchemaV1 } from '@standard-schema/spec';
import type { ToolInputSchema } from '@mcp-b/webmcp-ts-sdk/schema';
import type {
  InferJsonSchema,
  InputSchema,
  JsonSchemaForInference,
  MaybePromise,
  ToolAnnotations,
  PromptDescriptor,
  ResourceDescriptor,
} from '@mcp-b/webmcp-ts-sdk';
import type {
  InferToolInput as CoreInferToolInput,
  WebMCPConfig as CoreWebMCPConfig,
  WebMCPReturn as CoreWebMCPReturn,
  WebMCP,
} from 'usewebmcp';

/** Infers MCP-B structured output from its JSON Schema. */
export type InferOutput<T extends JsonSchemaForInference | undefined = undefined> = [T] extends [
  undefined,
]
  ? unknown
  : T extends JsonSchemaForInference
    ? InferJsonSchema<T>
    : unknown;

export type InferToolInput<T extends ToolInputSchema> = T extends StandardJSONSchemaV1
  ? StandardJSONSchemaV1.InferInput<T>
  : CoreInferToolInput<Exclude<T, StandardJSONSchemaV1>>;

export type InferValidatedToolInput<T extends ToolInputSchema> = T extends StandardSchemaV1
  ? StandardSchemaV1.InferOutput<T>
  : InferToolInput<T>;

/** Core hook configuration with opt-in MCP metadata. */
export interface WebMCPConfig<
  TInput extends ToolInputSchema = InputSchema,
  TOutput extends JsonSchemaForInference | undefined = undefined,
> extends Omit<
  CoreWebMCPConfig<InputSchema, InferOutput<TOutput>>,
  'annotations' | 'execute' | 'inputSchema'
> {
  inputSchema?: TInput;
  execute: ToolExecuteFunction<TInput, TOutput>;
  outputSchema?: TOutput;
  annotations?: ToolAnnotations;
  formatOutput?: (result: InferOutput<TOutput>) => MaybePromise<unknown>;
  formatError?: (error: Error) => MaybePromise<unknown>;
}

export type ToolExecuteFunction<
  TInput extends ToolInputSchema = InputSchema,
  TOutput extends JsonSchemaForInference | undefined = undefined,
> = (
  input: InferValidatedToolInput<TInput>,
  options: WebMCP.ToolExecuteCallbackOptions
) => MaybePromise<InferOutput<TOutput>>;
export type WebMCPReturn<
  TOutput extends JsonSchemaForInference | undefined = undefined,
  TInput extends ToolInputSchema = InputSchema,
> = Omit<CoreWebMCPReturn<InputSchema, InferOutput<TOutput>>, 'execute'> & {
  execute: (
    input: InferToolInput<TInput>,
    options?: WebMCP.ToolExecuteCallbackOptions
  ) => Promise<InferOutput<TOutput>>;
};

export type {
  BrowserMcpServer as ModelContextProtocol,
  PromptDescriptor,
  ResourceDescriptor,
} from '@mcp-b/webmcp-ts-sdk';
export type { CallToolResult, ToolAnnotations, ToolDescriptor } from '@mcp-b/webmcp-ts-sdk';

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
