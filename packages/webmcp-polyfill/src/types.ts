import type {
  ModelContext as BaseModelContext,
  ModelContextInput as BaseModelContextInput,
  ToolCallEvent as BaseToolCallEvent,
  CallToolResult,
  ElicitationParams,
  ElicitationResult,
  InputSchema,
  RegistrationHandle,
  ToolAnnotations,
  ToolDescriptor,
  ToolExecutionContext,
  ToolListItem,
  ToolResponse,
} from '@mcp-b/types';

export type {
  CallToolResult,
  ElicitationParams,
  ElicitationResult,
  InputSchema,
  RegistrationHandle,
  ToolAnnotations,
  ToolDescriptor,
  ToolExecutionContext,
  ToolListItem,
  ToolResponse,
};

export type ModelContext = BaseModelContext;
export type ModelContextInput = BaseModelContextInput;
export type ToolCallEvent = BaseToolCallEvent;

/**
 * Validation issue shape used by the internal JSON Schema validator.
 */
export interface ValidationIssue {
  path: Array<string | number>;
  message: string;
}

/**
 * Validation result shape returned by runtime validators.
 */
export type SchemaValidationResult =
  | { success: true; data: unknown }
  | { success: false; error: { issues: ValidationIssue[] } };

/**
 * Internal validator contract used for runtime validation.
 */
export interface SchemaValidator {
  safeParse: (data: unknown) => SchemaValidationResult;
}

/**
 * Internal validated tool descriptor.
 */
export interface ValidatedToolDescriptor {
  name: string;
  description: string;
  inputSchema: InputSchema;
  outputSchema?: InputSchema;
  annotations?: ToolAnnotations;
  execute: (args: Record<string, unknown>, context: ToolExecutionContext) => Promise<ToolResponse>;
  inputValidator: SchemaValidator;
  outputValidator?: SchemaValidator;
}

/**
 * Public testing API tool info shape.
 */
export type ToolInfo = ToolListItem;

/**
 * Recorded tool call metadata for testing helpers.
 */
export interface ToolCallRecord {
  toolName: string;
  arguments: Record<string, unknown>;
  timestamp: number;
}

/**
 * Initialization options for the core polyfill runtime.
 */
export interface WebModelContextInitOptions {
  /**
   * Whether auto-initialization should run when importing the package entrypoint.
   * Defaults to true.
   */
  autoInitialize?: boolean;
}

/**
 * Testing API exposed on navigator.modelContextTesting in polyfill mode.
 */
export interface ModelContextTesting {
  executeTool(toolName: string, inputArgsJson: string): Promise<unknown>;
  listTools(): ToolInfo[];
  registerToolsChangedCallback(callback: () => void): void;

  // Polyfill-only testing extensions
  getToolCalls(): ToolCallRecord[];
  clearToolCalls(): void;
  setMockToolResponse(toolName: string, response: ToolResponse): void;
  clearMockToolResponse(toolName: string): void;
  clearAllMockToolResponses(): void;
  getRegisteredTools(): ToolInfo[];
  reset(): void;
}

declare global {
  interface Navigator {
    modelContext: ModelContext;
    modelContextTesting?: ModelContextTesting;
  }

  interface Window {
    __webModelContextOptions?: WebModelContextInitOptions;
  }
}
