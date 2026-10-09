import type { WebMCP } from 'webmcp-types';
import type { InputSchema, WebMcpToolInput, WebMcpToolObjectInput } from './common.js';
import type { JsonSchemaForInference } from './json-schema.js';
import type { ToolDescriptor, ToolDescriptorFromSchema, ToolListItem } from './tool.js';

/** Options for tools exposed by descendant documents. */
export type ModelContextGetToolOptions = WebMCP.ModelContextGetToolOptions;

/** Tool metadata returned by `document.modelContext.getTools()`. */
export type RegisteredTool = WebMCP.RegisteredTool;

/** Options accepted by `ModelContext.registerTool()`. */
export type ModelContextRegisterToolOptions = WebMCP.ModelContextRegisterToolOptions;

type WidenedSchema<TSchema extends InputSchema> = string extends TSchema['type'] ? unknown : never;

/** The upstream WebMCP browser contract. */
export type ModelContext = WebMCP.ModelContext;

/** Non-standard methods exposed by MCP-B runtimes. */
export interface ModelContextExtensions {
  registerTool<
    const TInputSchema extends JsonSchemaForInference,
    const TOutputSchema extends JsonSchemaForInference | undefined = undefined,
    TName extends string = string,
  >(
    tool: ToolDescriptorFromSchema<TInputSchema, TOutputSchema, TName>,
    options?: ModelContextRegisterToolOptions
  ): Promise<void>;

  registerTool<
    TInputSchema extends InputSchema,
    TArgs extends WebMcpToolInput = WebMcpToolInput,
    TName extends string = string,
  >(
    tool: ToolDescriptor<TArgs, unknown, TName> & {
      inputSchema: TInputSchema;
    } & WidenedSchema<TInputSchema>,
    options?: ModelContextRegisterToolOptions
  ): Promise<void>;

  registerTool<
    TArgs extends WebMcpToolInput = WebMcpToolObjectInput,
    TName extends string = string,
  >(
    tool: Omit<ToolDescriptor<TArgs, unknown, TName>, 'inputSchema'> & {
      inputSchema?: undefined;
    },
    options?: ModelContextRegisterToolOptions
  ): Promise<void>;

  listTools(): ToolListItem[];
}

export type ModelContextWithExtensions = Omit<ModelContext, 'registerTool'> &
  ModelContextExtensions;
