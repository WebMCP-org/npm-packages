import type { CallToolResult, TextContent, fromJsonSchema } from '@modelcontextprotocol/server';
import type { JsonObject, JsonValue, WebMCP } from '@mcp-b/webmcp-ts-sdk';

type RuntimeContractInput = Parameters<WebMCP.ToolExecuteCallback>[0];
export type RuntimeToolArguments =
  | { a: number; b: number }
  | { value: string }
  | { reason: string };

const BASE_TOOL_NAMES = ['echo', 'sum', 'always_fail'] as const;
export const DYNAMIC_TOOL_NAME = 'dynamic_tool';

export interface RuntimeInvocationRecord {
  name: string;
  arguments: JsonObject;
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

export interface RuntimeContractTool extends Omit<
  WebMCP.ModelContextTool,
  'inputSchema' | 'execute'
> {
  inputSchema: Parameters<typeof fromJsonSchema>[0];
  execute: (
    input: RuntimeContractInput,
    options?: WebMCP.ToolExecuteCallbackOptions
  ) => Promise<CallToolResult>;
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
  const result: CallToolResult = { content: [{ type: 'text', text }] };
  if (structuredContent) result.structuredContent = structuredContent;
  return result;
}

function isJsonValue(value: unknown): value is JsonValue {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(isJsonValue);
  return typeof value === 'object' && Object.values(value).every(isJsonValue);
}

function isJsonObject(value: unknown): value is JsonObject {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    Object.values(value).every(isJsonValue)
  );
}

function toJsonObject(args: RuntimeContractInput): JsonObject {
  const serialized = JSON.stringify(args);
  if (serialized === undefined) {
    throw new TypeError('Tool arguments must be JSON serializable');
  }

  const parsed: unknown = JSON.parse(serialized);
  if (!isJsonObject(parsed)) {
    throw new TypeError('Tool arguments must be a JSON object');
  }
  return parsed;
}

function recordInvocation(
  state: RuntimeContractState,
  name: string,
  args: RuntimeContractInput
): void {
  state.invocations.push({
    name,
    arguments: toJsonObject(args),
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
