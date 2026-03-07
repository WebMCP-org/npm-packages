import type { RuntimeContractController, RuntimeContractOptions } from './core.js';

export interface ServerRuntimeContractHandle {
  remove?(): void;
  unregister?(): void;
}

export interface ServerRuntimeContractServer {
  registerTool(
    name: string,
    config: Record<string, unknown>,
    execute: (args: Record<string, unknown>) => Promise<unknown>
  ): ServerRuntimeContractHandle | void;
}

export declare function installServerRuntimeContract(
  server: ServerRuntimeContractServer,
  options?: RuntimeContractOptions
): RuntimeContractController;
