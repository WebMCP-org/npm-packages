import '@mcp-b/global';
import { IframeSandboxExecutor } from '@mcp-b/codemode';
import { createCodeToolFromModelContext } from '@mcp-b/codemode/webmcp';
import type { ChromeModelContextExtensions, ToolResponse } from '@mcp-b/webmcp-types';

type ExecutableModelContext = Pick<Document['modelContext'], 'getTools' | 'registerTool'> & {
  executeTool: NonNullable<ChromeModelContextExtensions['executeTool']>;
  __isWebMCPPolyfill?: boolean;
};
type NativeContextWindow = Window & {
  __WEBMCP_RAW_DOCUMENT_MODEL_CONTEXT__?: ExecutableModelContext;
};
type StructuredContent = Record<string, string | number | boolean | null>;
type RuntimeMode = 'native' | 'polyfill';

function requireElement<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) {
    throw new Error(`Required DOM element not found: ${id}`);
  }
  return element as T;
}

function setStatus(message: string, status: 'booting' | 'ready' | 'error') {
  statusEl.textContent = message;
  statusEl.className = `status ${status === 'booting' ? '' : status}`.trim();
  statusEl.dataset.status = status;
}

function createTextResponse(text: string, structuredContent?: StructuredContent): ToolResponse {
  return {
    content: [{ type: 'text', text }],
    ...(structuredContent ? { structuredContent } : {}),
  };
}

const statusEl = requireElement<HTMLDivElement>('codemode-status');
const runtimeEl = requireElement<HTMLPreElement>('codemode-runtime');
const toolsEl = requireElement<HTMLPreElement>('codemode-tools');
const descriptionEl = requireElement<HTMLPreElement>('codemode-description');
const resultEl = requireElement<HTMLPreElement>('codemode-result');
const callsEl = requireElement<HTMLPreElement>('codemode-calls');

function detectRuntimeMode(
  modelContext: ExecutableModelContext,
  capturedNative: boolean
): RuntimeMode {
  return capturedNative && modelContext.__isWebMCPPolyfill !== true ? 'native' : 'polyfill';
}

async function bootstrap() {
  const nativeModelContext = (window as NativeContextWindow).__WEBMCP_RAW_DOCUMENT_MODEL_CONTEXT__;
  const modelContext =
    nativeModelContext ?? (document.modelContext as unknown as ExecutableModelContext);

  if (
    !modelContext ||
    typeof modelContext.getTools !== 'function' ||
    typeof modelContext.registerTool !== 'function'
  ) {
    throw new Error('document.modelContext is unavailable');
  }

  if (typeof modelContext.executeTool !== 'function') {
    throw new Error('document.modelContext.executeTool is unavailable');
  }

  const runtimeMode = detectRuntimeMode(modelContext, nativeModelContext !== undefined);
  runtimeEl.textContent = runtimeMode;
  runtimeEl.dataset.runtime = runtimeMode;
  statusEl.dataset.runtime = runtimeMode;

  const recordedCalls: Array<{
    toolName: string;
    arguments: Record<string, unknown>;
  }> = [];

  await modelContext.registerTool({
    name: 'sumNumbers',
    description: 'Add two numbers together',
    inputSchema: {
      type: 'object',
      properties: {
        a: { type: 'number', description: 'First number' },
        b: { type: 'number', description: 'Second number' },
      },
      required: ['a', 'b'],
    },
    async execute(args: { a: number; b: number }) {
      recordedCalls.push({ toolName: 'sumNumbers', arguments: args });
      const total = args.a + args.b;
      return createTextResponse(String(total), { total });
    },
  });

  await modelContext.registerTool({
    name: 'greetPerson',
    description: 'Create a greeting for a person',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Person to greet' },
      },
      required: ['name'],
    },
    async execute(args: { name: string }) {
      recordedCalls.push({ toolName: 'greetPerson', arguments: args });
      const message = `Hello, ${args.name}!`;
      return createTextResponse(message, { message });
    },
  });

  const toolNames = new Set(['sumNumbers', 'greetPerson']);
  const listedTools = (await modelContext.getTools()).filter((tool) => toolNames.has(tool.name));
  const displayedTools = listedTools.map(({ name, description, inputSchema }) => ({
    name,
    description,
    ...(inputSchema === undefined ? {} : { inputSchema }),
  }));
  toolsEl.textContent = JSON.stringify(displayedTools, null, 2);
  toolsEl.dataset.count = String(displayedTools.length);

  const codemode = await createCodeToolFromModelContext({
    modelContext,
    executor: new IframeSandboxExecutor(),
  });

  descriptionEl.textContent = codemode.description ?? '';

  const execution = await (
    codemode as { execute: (input: { code: string }) => Promise<unknown> }
  ).execute({
    code: `async () => {
      const sum = await codemode.sumNumbers({ a: 7, b: 5 });
      const greeting = await codemode.greetPerson({ name: "WebMCP" });
      return {
        total: sum.total ?? null,
        greeting: greeting.message ?? null
      };
    }`,
  });

  resultEl.textContent = JSON.stringify(execution, null, 2);
  resultEl.dataset.status = 'ready';

  callsEl.textContent = JSON.stringify(recordedCalls, null, 2);
  callsEl.dataset.count = String(recordedCalls.length);

  setStatus(`Codemode executed against document.modelContext (${runtimeMode})`, 'ready');
}

setStatus('Booting codemode...', 'booting');
runtimeEl.textContent = 'unknown';
runtimeEl.dataset.runtime = 'unknown';
resultEl.dataset.status = 'pending';

void bootstrap().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  resultEl.textContent = message;
  resultEl.dataset.status = 'error';
  runtimeEl.textContent = 'error';
  runtimeEl.dataset.runtime = 'error';
  callsEl.textContent = '[]';
  callsEl.dataset.count = '0';
  setStatus(message, 'error');
});
