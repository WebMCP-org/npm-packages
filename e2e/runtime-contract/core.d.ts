export interface RuntimeInvocationRecord {
  name: string;
  arguments: Record<string, unknown>;
}

export interface RuntimeContractController {
  isReady(): boolean;
  registerDynamicTool(): boolean;
  unregisterDynamicTool(name?: string): boolean;
  readInvocations(): RuntimeInvocationRecord[];
  resetInvocations(): void;
}

export interface RuntimeContractOptions {
  runtimeLabel?: string;
  dynamicToolName?: string;
  registrationMode?: 'context' | 'dynamic';
}

export interface BrowserRuntimeContractToolDescriptor {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  execute(args: Record<string, unknown>): Promise<unknown>;
}

export interface BrowserRuntimeContractDescriptors {
  baseTools: BrowserRuntimeContractToolDescriptor[];
  createDynamicTool(): BrowserRuntimeContractToolDescriptor;
}

export interface ServerRuntimeContractDefinition {
  name: string;
  config: Record<string, unknown>;
  execute(args: Record<string, unknown>): Promise<unknown>;
}

export interface ServerRuntimeContractDefinitions {
  baseTools: ServerRuntimeContractDefinition[];
  createDynamicTool(): ServerRuntimeContractDefinition;
}

export declare const BASE_TOOL_NAMES: string[];
export declare const DYNAMIC_TOOL_NAME: string;
export declare function getCanonicalToolNames(includeDynamic?: boolean): string[];
export declare function firstTextContent(
  result: { content?: Array<{ type?: string; text?: string }> } | null | undefined
): string;
export declare function createRuntimeContractState(): {
  ready: boolean;
  invocations: RuntimeInvocationRecord[];
  dynamicHandle: unknown;
};
export declare function createBrowserToolDescriptors(
  state: ReturnType<typeof createRuntimeContractState>,
  options?: RuntimeContractOptions
): BrowserRuntimeContractDescriptors;
export declare function createServerToolDefinitions(
  state: ReturnType<typeof createRuntimeContractState>,
  options?: RuntimeContractOptions
): ServerRuntimeContractDefinitions;
export declare function createRuntimeContractController(
  state: ReturnType<typeof createRuntimeContractState>,
  registerDynamicTool: () => boolean,
  unregisterDynamicTool: (name?: string) => boolean
): RuntimeContractController;
