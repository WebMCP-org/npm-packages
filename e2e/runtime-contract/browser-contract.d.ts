import type { RuntimeContractController, RuntimeContractOptions } from './core.js';

// biome-ignore lint/suspicious/noConfusingVoidType: void is needed to match registerTool's return type
type BrowserRuntimeContractRegisterResult = void | { unregister?: () => void };

export interface BrowserRuntimeContractModelContext {
  provideContext(value: unknown): void;
  registerTool(tool: unknown): BrowserRuntimeContractRegisterResult;
  unregisterTool?(name: string): void;
}

export declare function installBrowserRuntimeContract(
  modelContext: BrowserRuntimeContractModelContext,
  options?: RuntimeContractOptions
): RuntimeContractController;
