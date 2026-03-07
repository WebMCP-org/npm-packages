export const BASE_TOOL_NAMES = ['echo', 'sum', 'always_fail'];
export const DYNAMIC_TOOL_NAME = 'dynamic_tool';

function structuredCloneFallback(value) {
  return JSON.parse(JSON.stringify(value ?? null));
}

function normalizeArguments(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }
  return structuredCloneFallback(value);
}

function textResult(text, structuredContent) {
  return {
    content: [{ type: 'text', text }],
    ...(structuredContent ? { structuredContent } : {}),
  };
}

function recordInvocation(state, name, args) {
  state.invocations.push({
    name,
    arguments: normalizeArguments(args),
  });
}

export function getCanonicalToolNames(includeDynamic = false) {
  return includeDynamic ? [...BASE_TOOL_NAMES, DYNAMIC_TOOL_NAME] : [...BASE_TOOL_NAMES];
}

export function firstTextContent(result) {
  if (!result || typeof result !== 'object' || !Array.isArray(result.content)) {
    return '';
  }

  const firstText = result.content.find((item) => item && item.type === 'text');
  return typeof firstText?.text === 'string' ? firstText.text : '';
}

export function createRuntimeContractState() {
  return {
    ready: false,
    invocations: [],
    dynamicHandle: null,
  };
}

export function createBrowserToolDescriptors(state, options = {}) {
  const runtimeLabel = options.runtimeLabel ?? 'browser';
  const dynamicToolName = options.dynamicToolName ?? DYNAMIC_TOOL_NAME;

  return {
    baseTools: [
      {
        name: 'echo',
        description: 'Echo a string value back to the caller.',
        inputSchema: {
          type: 'object',
          properties: {
            message: { type: 'string' },
          },
          required: ['message'],
        },
        async execute(args) {
          const normalized = normalizeArguments(args);
          const message = typeof normalized.message === 'string' ? normalized.message : '';
          recordInvocation(state, 'echo', normalized);
          return textResult(`echo:${message}`, {
            message,
            runtime: runtimeLabel,
          });
        },
      },
      {
        name: 'sum',
        description: 'Add two numbers.',
        inputSchema: {
          type: 'object',
          properties: {
            a: { type: 'number' },
            b: { type: 'number' },
          },
          required: ['a', 'b'],
        },
        async execute(args) {
          const normalized = normalizeArguments(args);
          const a = Number(normalized.a ?? 0);
          const b = Number(normalized.b ?? 0);
          const sum = a + b;
          recordInvocation(state, 'sum', { a, b });
          return textResult(`sum:${sum}`, {
            a,
            b,
            sum,
            runtime: runtimeLabel,
          });
        },
      },
      {
        name: 'always_fail',
        description: 'Throw a runtime error every time it is invoked.',
        inputSchema: {
          type: 'object',
          properties: {
            reason: { type: 'string' },
          },
        },
        async execute(args) {
          const normalized = normalizeArguments(args);
          const reason =
            typeof normalized.reason === 'string' && normalized.reason.length > 0
              ? normalized.reason
              : 'runtime failure';
          recordInvocation(state, 'always_fail', normalized);
          throw new Error(`always_fail:${reason}`);
        },
      },
    ],
    createDynamicTool() {
      return {
        name: dynamicToolName,
        description: 'A dynamically registered contract tool.',
        inputSchema: {
          type: 'object',
          properties: {
            value: { type: 'string' },
          },
          required: ['value'],
        },
        async execute(args) {
          const normalized = normalizeArguments(args);
          const value = typeof normalized.value === 'string' ? normalized.value : '';
          recordInvocation(state, dynamicToolName, normalized);
          return textResult(`dynamic:${value}`, {
            value,
            runtime: runtimeLabel,
          });
        },
      };
    },
  };
}

export function createServerToolDefinitions(state, options = {}) {
  const runtimeLabel = options.runtimeLabel ?? 'server';
  const dynamicToolName = options.dynamicToolName ?? DYNAMIC_TOOL_NAME;

  return {
    baseTools: [
      {
        name: 'echo',
        config: {
          description: 'Echo a string value back to the caller.',
          inputSchema: {
            type: 'object',
            properties: {
              message: { type: 'string' },
            },
            required: ['message'],
          },
        },
        async execute(args) {
          const normalized = normalizeArguments(args);
          const message = typeof normalized.message === 'string' ? normalized.message : '';
          recordInvocation(state, 'echo', normalized);
          return textResult(`echo:${message}`, {
            message,
            runtime: runtimeLabel,
          });
        },
      },
      {
        name: 'sum',
        config: {
          description: 'Add two numbers.',
          inputSchema: {
            type: 'object',
            properties: {
              a: { type: 'number' },
              b: { type: 'number' },
            },
            required: ['a', 'b'],
          },
        },
        async execute(args) {
          const normalized = normalizeArguments(args);
          const a = Number(normalized.a ?? 0);
          const b = Number(normalized.b ?? 0);
          const sum = a + b;
          recordInvocation(state, 'sum', { a, b });
          return textResult(`sum:${sum}`, {
            a,
            b,
            sum,
            runtime: runtimeLabel,
          });
        },
      },
      {
        name: 'always_fail',
        config: {
          description: 'Throw a runtime error every time it is invoked.',
          inputSchema: {
            type: 'object',
            properties: {
              reason: { type: 'string' },
            },
          },
        },
        async execute(args) {
          const normalized = normalizeArguments(args);
          const reason =
            typeof normalized.reason === 'string' && normalized.reason.length > 0
              ? normalized.reason
              : 'runtime failure';
          recordInvocation(state, 'always_fail', normalized);
          throw new Error(`always_fail:${reason}`);
        },
      },
    ],
    createDynamicTool() {
      return {
        name: dynamicToolName,
        config: {
          description: 'A dynamically registered contract tool.',
          inputSchema: {
            type: 'object',
            properties: {
              value: { type: 'string' },
            },
            required: ['value'],
          },
        },
        async execute(args) {
          const normalized = normalizeArguments(args);
          const value = typeof normalized.value === 'string' ? normalized.value : '';
          recordInvocation(state, dynamicToolName, normalized);
          return textResult(`dynamic:${value}`, {
            value,
            runtime: runtimeLabel,
          });
        },
      };
    },
  };
}

export function createRuntimeContractController(state, registerDynamicTool, unregisterDynamicTool) {
  return {
    isReady() {
      return state.ready;
    },
    registerDynamicTool() {
      return registerDynamicTool();
    },
    unregisterDynamicTool(name = DYNAMIC_TOOL_NAME) {
      return unregisterDynamicTool(name);
    },
    readInvocations() {
      return structuredCloneFallback(state.invocations);
    },
    resetInvocations() {
      state.invocations.length = 0;
    },
  };
}
