import type { CallToolResult, TextContent } from '@modelcontextprotocol/server';
import type { InputSchema, JsonObject } from '@mcp-b/webmcp-ts-sdk';

const BASE_TOOL_NAMES = ['echo', 'sum', 'always_fail'] as const;
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
    arguments: structuredClone(args),
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
          const message = typeof args.message === 'string' ? args.message : '';
          recordInvocation(state, 'echo', args);
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
          const a = Number(args.a ?? 0);
          const b = Number(args.b ?? 0);
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
          const reason =
            typeof args.reason === 'string' && args.reason.length > 0
              ? args.reason
              : 'runtime failure';
          recordInvocation(state, 'always_fail', args);
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
          const value = typeof args.value === 'string' ? args.value : '';
          recordInvocation(state, dynamicToolName, args);
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
