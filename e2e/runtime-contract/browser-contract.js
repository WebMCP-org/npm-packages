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

function isRegistrationHandle(value) {
  return Boolean(value) && typeof value === 'object' && typeof value.unregister === 'function';
}

async function settleRegistration(result) {
  if (isRegistrationHandle(result)) {
    return result;
  }
  await result;
  return undefined;
}

export async function installBrowserRuntimeContract(modelContext, options = {}) {
  if (!modelContext || typeof modelContext.registerTool !== 'function') {
    throw new Error(
      'document.modelContext.registerTool is required for the browser runtime contract'
    );
  }

  const state = createRuntimeContractState();
  const descriptors = createBrowserToolDescriptors(state, options);
  const dynamicToolName = options.dynamicToolName ?? DYNAMIC_TOOL_NAME;
  const dynamicRegistrations = new Map();

  async function registerTool(tool) {
    const controller = new AbortController();
    const result = modelContext.registerTool(tool, { signal: controller.signal });
    const registration = await settleRegistration(result);
    return { controller, registration };
  }

  for (const tool of descriptors.baseTools) {
    await registerTool(tool);
  }
  state.ready = true;

  const controller = createRuntimeContractController(
    state,
    async () => {
      if (state.dynamicHandle) {
        return false;
      }
      const registration = registerTool(descriptors.createDynamicTool());
      const settledRegistration = await registration;
      dynamicRegistrations.set(dynamicToolName, settledRegistration);
      state.dynamicHandle = settledRegistration.registration ?? { name: dynamicToolName };
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
