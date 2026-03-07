import type { RuntimeContractController, RuntimeContractOptions } from './core.js';

export interface BrowserRuntimeContractModelContext {
  provideContext(value: unknown): void;
  registerTool(tool: unknown): { unregister?: () => void } | void;
  unregisterTool?(name: string): void;
}

export declare function installBrowserRuntimeContract(
  modelContext: BrowserRuntimeContractModelContext,
  options?: RuntimeContractOptions
): RuntimeContractController;
