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
  if (!modelContext || typeof modelContext.provideContext !== 'function') {
    throw new Error(
      'navigator.modelContext.provideContext is required for the browser runtime contract'
    );
  }

  const state = createRuntimeContractState();
  const descriptors = createBrowserToolDescriptors(state, options);
  const dynamicToolName = options.dynamicToolName ?? DYNAMIC_TOOL_NAME;
  const registrationMode = options.registrationMode ?? 'context';

  if (registrationMode === 'dynamic') {
    for (const tool of descriptors.baseTools) {
      modelContext.registerTool(tool);
    }
  } else {
    modelContext.provideContext({ tools: descriptors.baseTools });
  }
  state.ready = true;

  const controller = createRuntimeContractController(
    state,
    () => {
      if (state.dynamicHandle) {
        return false;
      }
      const registration = modelContext.registerTool(descriptors.createDynamicTool());
      state.dynamicHandle = registration ?? { name: dynamicToolName };
      return true;
    },
    (name = dynamicToolName) => {
      if (name !== dynamicToolName || !state.dynamicHandle) {
        return false;
      }

      if (typeof state.dynamicHandle.unregister === 'function') {
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
