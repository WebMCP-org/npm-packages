import type { InputSchema, WebMcpToolInput } from './common.js';
import type { JsonSchemaForInference } from './json-schema.js';
import type {
  ModelContextTool,
  ModelContextToolFromSchema,
  ToolDescriptor,
  ToolDescriptorFromSchema,
  ToolListItem,
  WebMcpToolAnnotations,
} from './tool.js';

/** Options for tools exposed by descendant documents. */
export interface ModelContextGetToolOptions {
  fromOrigins?: string[];
}

/** Tool metadata returned by `document.modelContext.getTools()`. */
export interface RegisteredTool {
  name: string;
  /**
   * Present on every tool Chrome and `@mcp-b/webmcp-polyfill` return today --
   * the spec defaults it to the empty string when a tool registers no title.
   * Kept optional deliberately: webmcp#224 proposes dropping that default and
   * omitting the member instead. Read it as `tool.title || tool.name`: today the
   * spec default makes it an empty string, which `??` does not fall through.
   */
  title?: string;
  description: string;
  /**
   * A JSON Schema object since webmcp#241, rolling out from Chrome 154.0.8013
   * (cross-document tools first). Chrome 149-153 -- most of the Origin Trial
   * population -- and 154's same-document tools still return the serialized
   * JSON string the change replaced. Consumers that support both generations
   * must branch on `typeof` and guard the parse of the string arm.
   */
  inputSchema?: InputSchema | string;
  window: Window;
  origin: string;
  /**
   * Absent when the tool registered no annotations -- both the spec and the
   * polyfill omit the member rather than emitting an empty object. Each hint
   * inside it is always populated, but the object itself is not guaranteed.
   */
  annotations?: WebMcpToolAnnotations;
}

export interface ChromeModelContextExecuteToolOptions {
  signal?: AbortSignal;
}

/** Experimental Chromium methods; feature-detect them before use. */
export interface ChromeModelContextExtensions {
  executeTool?(
    tool: RegisteredTool,
    inputArguments: string,
    options?: ChromeModelContextExecuteToolOptions
  ): Promise<string | null>;
}

/** @deprecated Metadata returned by `navigator.modelContextTesting`. */
export interface ModelContextTestingToolInfo {
  name: string;
  description: string;
  inputSchema?: string;
}

/** @deprecated Compatibility surface for Chromium's removed testing API. */
export interface ModelContextTesting extends EventTarget {
  listTools(): ModelContextTestingToolInfo[];
  executeTool(
    toolName: string,
    inputArgsJson: string,
    options?: ChromeModelContextExecuteToolOptions
  ): Promise<string | null>;
  ontoolchange: ((this: ModelContextTesting, event: Event) => unknown) | null;
}

/** Options accepted by `ModelContext.registerTool()`. */
export interface ModelContextRegisterToolOptions {
  signal?: AbortSignal;
  exposedTo?: string[];
}

type WidenedSchema<TSchema extends InputSchema> = string extends TSchema['type'] ? unknown : never;

/**
 * Standard `document.modelContext` API.
 * @see https://webmachinelearning.github.io/webmcp/#modelcontext
 */
export interface ModelContext extends EventTarget {
  registerTool<
    const TInputSchema extends JsonSchemaForInference,
    TResult = unknown,
    TName extends string = string,
  >(
    tool: ModelContextToolFromSchema<TInputSchema, TResult, TName>,
    options?: ModelContextRegisterToolOptions
  ): Promise<void>;

  registerTool<
    TInputSchema extends InputSchema,
    TArgs extends WebMcpToolInput = WebMcpToolInput,
    TResult = unknown,
    TName extends string = string,
  >(
    tool: ModelContextTool<TArgs, TResult, TName> & {
      inputSchema: TInputSchema;
    } & WidenedSchema<TInputSchema>,
    options?: ModelContextRegisterToolOptions
  ): Promise<void>;

  registerTool<
    TArgs extends WebMcpToolInput = Record<string, unknown>,
    TResult = unknown,
    TName extends string = string,
  >(
    tool: Omit<ModelContextTool<TArgs, TResult, TName>, 'inputSchema'> & {
      inputSchema?: undefined;
    },
    options?: ModelContextRegisterToolOptions
  ): Promise<void>;

  getTools(options?: ModelContextGetToolOptions): Promise<RegisteredTool[]>;
  ontoolchange: ((this: ModelContext, event: Event) => unknown) | null;
}

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
    TArgs extends WebMcpToolInput = Record<string, unknown>,
    TName extends string = string,
  >(
    tool: Omit<ToolDescriptor<TArgs, unknown, TName>, 'inputSchema'> & {
      inputSchema?: undefined;
    },
    options?: ModelContextRegisterToolOptions
  ): Promise<void>;

  listTools(): ToolListItem[];
}

export type ChromeModelContext = ModelContext & ChromeModelContextExtensions;
export type ModelContextWithExtensions = Omit<ModelContext, 'registerTool'> &
  ModelContextExtensions;
