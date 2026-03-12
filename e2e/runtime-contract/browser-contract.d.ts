import type { RuntimeContractController, RuntimeContractOptions } from './core.js';

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
