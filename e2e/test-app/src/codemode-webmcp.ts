import '@mcp-b/global';
import { IframeSandboxExecutor } from '@mcp-b/codemode';
import { createCodeToolFromModelContextTesting } from '@mcp-b/codemode/webmcp';
import type {
  ModelContextTesting,
  ModelContextTestingPolyfillExtensions,
  ToolResponse,
} from '@mcp-b/webmcp-types';

type ExtendedModelContextTesting = ModelContextTesting &
  Partial<ModelContextTestingPolyfillExtensions>;
type StructuredContent = Record<string, string | number | boolean | null>;

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
const toolsEl = requireElement<HTMLPreElement>('codemode-tools');
const descriptionEl = requireElement<HTMLPreElement>('codemode-description');
const resultEl = requireElement<HTMLPreElement>('codemode-result');
const callsEl = requireElement<HTMLPreElement>('codemode-calls');

async function bootstrap() {
  const modelContext = navigator.modelContext;
  const modelContextTesting = navigator.modelContextTesting as
    | ExtendedModelContextTesting
    | undefined;

  if (!modelContext) {
    throw new Error('navigator.modelContext is unavailable');
  }

  if (!modelContextTesting) {
    throw new Error('navigator.modelContextTesting is unavailable');
  }

  modelContextTesting.reset?.();

  const recordedCalls: Array<{
    toolName: string;
    arguments: Record<string, unknown>;
  }> = [];

  modelContext.registerTool({
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
      const total = args.a + args.b;
      return createTextResponse(String(total), { total });
    },
  });

  modelContext.registerTool({
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
      const message = `Hello, ${args.name}!`;
      return createTextResponse(message, { message });
    },
  });

  const listedTools = modelContextTesting.listTools();
  toolsEl.textContent = JSON.stringify(listedTools, null, 2);
  toolsEl.dataset.count = String(listedTools.length);

  const instrumentedTesting: Pick<ModelContextTesting, 'listTools' | 'executeTool'> = {
    listTools: () => modelContextTesting.listTools(),
    executeTool: async (toolName, inputArgsJson, options) => {
      let parsedArgs: Record<string, unknown> = {};
      try {
        parsedArgs = JSON.parse(inputArgsJson) as Record<string, unknown>;
      } catch {
        parsedArgs = {};
      }

      recordedCalls.push({
        toolName,
        arguments: parsedArgs,
      });

      return modelContextTesting.executeTool(toolName, inputArgsJson, options);
    },
  };

  const codemode = createCodeToolFromModelContextTesting({
    modelContextTesting: instrumentedTesting,
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
        total: sum.structuredContent?.total ?? null,
        greeting: greeting.structuredContent?.message ?? null
      };
    }`,
  });

  resultEl.textContent = JSON.stringify(execution, null, 2);
  resultEl.dataset.status = 'ready';

  callsEl.textContent = JSON.stringify(recordedCalls, null, 2);
  callsEl.dataset.count = String(recordedCalls.length);

  setStatus('Codemode executed against navigator.modelContextTesting', 'ready');
}

setStatus('Booting codemode...', 'booting');
resultEl.dataset.status = 'pending';

void bootstrap().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  resultEl.textContent = message;
  resultEl.dataset.status = 'error';
  callsEl.textContent = '[]';
  callsEl.dataset.count = '0';
  setStatus(message, 'error');
});
