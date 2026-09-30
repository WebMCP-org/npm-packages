import type { CallToolResult, InputSchema, WebMcpToolObjectInput } from './common.js';
import type {
  InferArgsFromInputSchema,
  InferJsonSchema,
  JsonSchemaForInference,
} from './json-schema.js';
import type { ToolAnnotations as McpToolAnnotations } from '@modelcontextprotocol/server';
import type { WebMCP } from 'webmcp-types';

/** MCP annotations plus the WebMCP tool annotations. */
export type ToolAnnotations = McpToolAnnotations & WebMCP.ToolAnnotations;

export type MaybePromise<T> = WebMCP.MaybePromise<T>;

/**
 * Tool dictionary accepted by the standard browser API.
 * @see https://webmachinelearning.github.io/webmcp/#dictdef-modelcontexttool
 */
export interface ModelContextTool<
  TArgs extends object = WebMcpToolObjectInput,
  TResult = unknown,
  TName extends string = string,
> extends Omit<WebMCP.ModelContextTool, 'name' | 'inputSchema' | 'execute'> {
  name: TName;
  inputSchema?: InputSchema | undefined;
  execute: (input: TArgs, options: WebMCP.ToolExecuteCallbackOptions) => MaybePromise<TResult>;
}

/** MCP-B tool dictionary with output metadata. */
export type ToolDescriptor<
  TArgs extends object = WebMcpToolObjectInput,
  TResult = unknown,
  TName extends string = string,
> = Omit<ModelContextTool<TArgs, TResult, TName>, 'annotations'> & {
  outputSchema?: JsonSchemaForInference;
  annotations?: ToolAnnotations;
};

/** MCP response with `structuredContent` inferred from an output schema. */
export type ToolResultFromOutputSchema<
  TOutputSchema extends JsonSchemaForInference | undefined = undefined,
> = [TOutputSchema] extends [undefined]
  ? CallToolResult
  : TOutputSchema extends JsonSchemaForInference
    ? Omit<CallToolResult, 'structuredContent'> & {
        structuredContent: InferJsonSchema<TOutputSchema>;
      }
    : never;

type ExecuteResult<TOutputSchema extends JsonSchemaForInference | undefined> = [
  TOutputSchema,
] extends [undefined]
  ? unknown
  : TOutputSchema extends JsonSchemaForInference
    ? InferJsonSchema<TOutputSchema> | ToolResultFromOutputSchema<TOutputSchema>
    : never;

/** Tool dictionary with input and output inferred from JSON Schema literals. */
export type ToolDescriptorFromSchema<
  TInputSchema extends InputSchema,
  TOutputSchema extends JsonSchemaForInference | undefined = undefined,
  TName extends string = string,
> = Omit<
  ToolDescriptor<InferArgsFromInputSchema<TInputSchema>, ExecuteResult<TOutputSchema>, TName>,
  'inputSchema' | 'outputSchema'
> & {
  inputSchema: TInputSchema;
} & ([TOutputSchema] extends [undefined]
    ? { outputSchema?: undefined }
    : { outputSchema: TOutputSchema });

/** Tool metadata returned by the MCP-B `listTools()` extension. */
export type ToolListItem<TName extends string = string> = Omit<
  ToolDescriptor<WebMcpToolObjectInput, unknown, TName>,
  'execute' | 'inputSchema'
> & {
  inputSchema: InputSchema;
};
