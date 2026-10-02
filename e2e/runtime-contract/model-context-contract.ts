import type { WebMCP } from '@mcp-b/webmcp-ts-sdk';
import {
  createRuntimeContractController,
  createRuntimeContractState,
  createRuntimeContractTools,
  DYNAMIC_TOOL_NAME,
  type RuntimeContractController,
  type RuntimeContractOptions,
  type RuntimeContractTool,
} from './core.js';

export type RuntimeContractModelContext = Pick<WebMCP.ModelContext, 'registerTool'>;

declare global {
  interface Window {
    __WEBMCP_E2E__?: RuntimeContractController;
  }
}

export async function installModelContextRuntimeContract(
  modelContext: RuntimeContractModelContext,
  options: RuntimeContractOptions = {}
): Promise<RuntimeContractController> {
  const state = createRuntimeContractState();
  const tools = createRuntimeContractTools(state, options);
  const registrations = new Map<string, AbortController>();

  async function registerTool(tool: RuntimeContractTool): Promise<void> {
    const controller = new AbortController();
    registrations.set(tool.name, controller);

    try {
      await modelContext.registerTool(tool, { signal: controller.signal });
    } catch (error) {
      registrations.delete(tool.name);
      controller.abort();
      throw error;
    }
  }

  for (const tool of tools.baseTools) {
    await registerTool(tool);
  }
  state.ready = true;

  const controller = createRuntimeContractController(
    state,
    async () => {
      if (registrations.has(DYNAMIC_TOOL_NAME)) return false;
      await registerTool(tools.createDynamicTool());
      return true;
    },
    async (name = DYNAMIC_TOOL_NAME) => {
      const registration = registrations.get(name);
      if (name !== DYNAMIC_TOOL_NAME || !registration) return false;

      registration.abort();
      registrations.delete(name);
      return true;
    }
  );

  window.__WEBMCP_E2E__ = controller;
  return controller;
}
