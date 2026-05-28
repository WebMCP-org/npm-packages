import {
  createBrowserToolDescriptors,
  createRuntimeContractController,
  createRuntimeContractState,
  DYNAMIC_TOOL_NAME,
} from './core.js';

function installHook(controller) {
  if (typeof window !== 'undefined') {
    window.__WEBMCP_E2E__ = controller;
  }
  globalThis.__WEBMCP_E2E__ = controller;
  return controller;
}

export function installBrowserRuntimeContract(modelContext, options = {}) {
  if (!modelContext || typeof modelContext.registerTool !== 'function') {
    throw new Error(
      'navigator.modelContext.registerTool is required for the browser runtime contract'
    );
  }

  const state = createRuntimeContractState();
  const descriptors = createBrowserToolDescriptors(state, options);
  const dynamicToolName = options.dynamicToolName ?? DYNAMIC_TOOL_NAME;
  const dynamicRegistrations = new Map();

  function registerTool(tool) {
    const controller = new AbortController();
    const registration = modelContext.registerTool(tool, { signal: controller.signal });
    return { controller, registration };
  }

  for (const tool of descriptors.baseTools) {
    registerTool(tool);
  }
  state.ready = true;

  const controller = createRuntimeContractController(
    state,
    () => {
      if (state.dynamicHandle) {
        return false;
      }
      const registration = registerTool(descriptors.createDynamicTool());
      dynamicRegistrations.set(dynamicToolName, registration);
      state.dynamicHandle = registration.registration ?? { name: dynamicToolName };
      return true;
    },
    (name = dynamicToolName) => {
      if (name !== dynamicToolName || !state.dynamicHandle) {
        return false;
      }

      const registration = dynamicRegistrations.get(dynamicToolName);
      if (registration) {
        registration.controller.abort();
        dynamicRegistrations.delete(dynamicToolName);
      } else if (typeof state.dynamicHandle.unregister === 'function') {
        state.dynamicHandle.unregister();
      } else if (typeof modelContext.unregisterTool === 'function') {
        modelContext.unregisterTool(dynamicToolName);
      }

      state.dynamicHandle = null;
      return true;
    }
  );

  return installHook(controller);
}
