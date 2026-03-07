import {
  createRuntimeContractController,
  createRuntimeContractState,
  createServerToolDefinitions,
  DYNAMIC_TOOL_NAME,
} from './core.js';

function removeHandle(handle) {
  if (!handle) {
    return;
  }

  if (typeof handle.remove === 'function') {
    handle.remove();
    return;
  }

  if (typeof handle.unregister === 'function') {
    handle.unregister();
  }
}

function registerServerTool(server, tool) {
  if (server.registerTool.length <= 1) {
    return server.registerTool({
      name: tool.name,
      description: tool.config.description,
      inputSchema: tool.config.inputSchema,
      ...(tool.config.annotations ? { annotations: tool.config.annotations } : {}),
      ...(tool.outputSchema ? { outputSchema: tool.outputSchema } : {}),
      execute: tool.execute,
    });
  }

  return server.registerTool(tool.name, tool.config, tool.execute);
}

export function installServerRuntimeContract(server, options = {}) {
  if (!server || typeof server.registerTool !== 'function') {
    throw new Error('A server with registerTool(...) is required for the server runtime contract');
  }

  const state = createRuntimeContractState();
  const definitions = createServerToolDefinitions(state, options);
  const dynamicToolName = options.dynamicToolName ?? DYNAMIC_TOOL_NAME;

  for (const tool of definitions.baseTools) {
    registerServerTool(server, tool);
  }

  state.ready = true;

  return createRuntimeContractController(
    state,
    () => {
      if (state.dynamicHandle) {
        return false;
      }
      const tool = definitions.createDynamicTool();
      state.dynamicHandle = registerServerTool(server, tool);
      return true;
    },
    (name = dynamicToolName) => {
      if (name !== dynamicToolName || !state.dynamicHandle) {
        return false;
      }
      removeHandle(state.dynamicHandle);
      state.dynamicHandle = null;
      return true;
    }
  );
}
