import type { RuntimeContractController, RuntimeContractOptions } from './core.js';

export interface BrowserRuntimeContractModelContext {
  registerTool(
    tool: unknown,
    options?: { signal?: AbortSignal }
  ): Promise<void> | void | { unregister?: () => void };
  unregisterTool?(name: string): void;
}

export declare function installBrowserRuntimeContract(
  modelContext: BrowserRuntimeContractModelContext,
  options?: RuntimeContractOptions
): Promise<RuntimeContractController>;
