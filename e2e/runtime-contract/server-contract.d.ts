import type { RuntimeContractController, RuntimeContractOptions } from './core.js';

export interface ServerRuntimeContractHandle {
  remove?(): void;
  unregister?(): void;
}

export interface ServerRuntimeContractTool {
  name: string;
  [key: string]: unknown;
}

export interface ServerRuntimeContractServer {
  registerTool(...args: unknown[]): ServerRuntimeContractHandle | undefined;
  unregisterTool?(...args: unknown[]): void;
}

export declare function installServerRuntimeContract(
  server: ServerRuntimeContractServer,
  options?: RuntimeContractOptions
): RuntimeContractController;
