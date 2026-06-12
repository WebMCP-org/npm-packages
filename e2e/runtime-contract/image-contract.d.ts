import type { RuntimeContractController, RuntimeInvocationRecord } from './core.js';

export interface ImageRuntimeContractOptions {
  runtimeLabel?: string;
}

export interface ImageRuntimeContractToolDescriptor {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  execute(args: Record<string, unknown>): Promise<unknown>;
}

export interface ImageRuntimeContractDescriptors {
  baseTools: ImageRuntimeContractToolDescriptor[];
}

export interface ImageRuntimeContractModelContext {
  registerTool(tool: unknown, options?: { signal?: AbortSignal }): void;
}

export declare const IMAGE_TEXT_SMOKE_TOOL_NAME: string;
export declare const GET_SERIALIZED_PNG_TOOL_NAME: string;
export declare const GET_BLOB_PNG_TOOL_NAME: string;
export declare const GET_CANVAS_PNG_TOOL_NAME: string;
export declare const GET_CANVAS_UNSUPPORTED_MIME_TYPE_TOOL_NAME: string;
export declare const GET_IMAGE_ELEMENT_PNG_TOOL_NAME: string;
export declare const DESCRIBE_INPUT_IMAGE_TOOL_NAME: string;
export declare const GET_UNSUPPORTED_IMAGE_SOURCE_TOOL_NAME: string;
export declare const GET_BLOB_WITHOUT_MIME_TYPE_TOOL_NAME: string;
export declare const GET_SERIALIZED_WITHOUT_MIME_TYPE_TOOL_NAME: string;
export declare const ONE_BY_ONE_PNG_BASE64: string;
export declare function createImageContractState(): {
  ready: boolean;
  invocations: RuntimeInvocationRecord[];
};
export declare function createImageToolDescriptors(
  state: ReturnType<typeof createImageContractState>,
  options?: ImageRuntimeContractOptions
): ImageRuntimeContractDescriptors;
export declare function installBrowserImageRuntimeContract(
  modelContext: ImageRuntimeContractModelContext,
  options?: ImageRuntimeContractOptions
): Promise<RuntimeContractController>;
