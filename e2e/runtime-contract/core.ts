import type { CallToolResult, InputSchema, JsonObject, TextContent } from '@mcp-b/webmcp-types';

export const BASE_TOOL_NAMES = ['echo', 'sum', 'always_fail'] as const;
export const DYNAMIC_TOOL_NAME = 'dynamic_tool';

export interface RuntimeInvocationRecord {
  name: string;
  arguments: Record<string, unknown>;
}

export interface RuntimeContractController {
  isReady(): boolean;
  registerDynamicTool(): Promise<boolean>;
  unregisterDynamicTool(name?: string): Promise<boolean>;
  readInvocations(): Promise<RuntimeInvocationRecord[]>;
  resetInvocations(): Promise<void>;
}

export interface RuntimeContractOptions {
  runtimeLabel?: string;
  dynamicToolName?: string;
}

export interface RuntimeContractTool {
  name: string;
  description: string;
  inputSchema: InputSchema;
  execute(args: Record<string, unknown>): Promise<CallToolResult>;
}

export interface RuntimeContractTools {
  baseTools: RuntimeContractTool[];
  createDynamicTool(): RuntimeContractTool;
}

export interface RuntimeContractState {
  ready: boolean;
  invocations: RuntimeInvocationRecord[];
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeArguments(value: unknown): Record<string, unknown> {
  return isObjectRecord(value) ? structuredClone(value) : {};
}

function textResult(text: string, structuredContent?: JsonObject): CallToolResult {
  return {
    content: [{ type: 'text', text }],
    ...(structuredContent ? { structuredContent } : {}),
  };
}

function recordInvocation(
  state: RuntimeContractState,
  name: string,
  args: Record<string, unknown>
): void {
  state.invocations.push({
    name,
    arguments: normalizeArguments(args),
  });
}

export function getCanonicalToolNames(includeDynamic = false): string[] {
  return includeDynamic ? [...BASE_TOOL_NAMES, DYNAMIC_TOOL_NAME] : [...BASE_TOOL_NAMES];
}

export function firstTextContent(
  result: Pick<CallToolResult, 'content'> | null | undefined
): string {
  const firstText = result?.content.find((item): item is TextContent => item.type === 'text');
  return firstText?.text ?? '';
}

export function createRuntimeContractState(): RuntimeContractState {
  return {
    ready: false,
    invocations: [],
  };
}

export function createRuntimeContractTools(
  state: RuntimeContractState,
  options: RuntimeContractOptions = {}
): RuntimeContractTools {
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

export function createRuntimeContractController(
  state: RuntimeContractState,
  registerDynamicTool: () => Promise<boolean>,
  unregisterDynamicTool: (name?: string) => Promise<boolean>
): RuntimeContractController {
  return {
    isReady: () => state.ready,
    registerDynamicTool,
    unregisterDynamicTool,
    readInvocations: async () => structuredClone(state.invocations),
    resetInvocations: async () => {
      state.invocations.length = 0;
    },
  };
}
