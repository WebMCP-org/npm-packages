if (new URLSearchParams(location.search).has('allow-tools-policy')) {
  Object.defineProperty(document, 'permissionsPolicy', {
    configurable: true,
    value: {
      features: () => ['tools'],
      allowsFeature: (feature: string) => feature === 'tools',
    },
  });
}
await import('@mcp-b/global');

import type { BrowserMcpServer, ResourceDescriptor } from '@mcp-b/webmcp-ts-sdk';
import type { RegistrationHandle } from '@mcp-b/webmcp-types';

const modelContext = document.modelContext as BrowserMcpServer;
const wait = (milliseconds: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

await modelContext.registerTool({
  name: 'calculate',
  title: 'Add numbers',
  description: 'Adds two numbers after an optional delay',
  annotations: { readOnlyHint: true },
  inputSchema: {
    type: 'object',
    properties: {
      a: { type: 'number' },
      b: { type: 'number' },
      delayMs: { type: 'number' },
    },
    required: ['a', 'b'],
  },
  async execute(args: Record<string, unknown>) {
    await wait(Number(args.delayMs ?? 0));
    return {
      content: [{ type: 'text', text: String(Number(args.a) + Number(args.b)) }],
    };
  },
});

modelContext.registerResource({
  uri: 'iframe://config',
  name: 'Iframe config',
  mimeType: 'application/json',
  async read() {
    return {
      contents: [
        {
          uri: 'iframe://config',
          text: JSON.stringify({ name: 'iframe-child', version: '1.0.0' }),
          mimeType: 'application/json',
        },
      ],
    };
  },
});

const echoTemplate = (uri: string, name: string): ResourceDescriptor => ({
  uri,
  name,
  async read(resolvedUri) {
    return { contents: [{ uri: resolvedUri.href, text: resolvedUri.href }] };
  },
});

modelContext.registerResource(echoTemplate('iframe://values/{value}', 'Value'));
modelContext.registerResource(echoTemplate('iframe://paths/{+path}', 'Path'));
modelContext.registerResource(echoTemplate('iframe://segments/{segments*}', 'Segments'));
modelContext.registerResource(echoTemplate('iframe://fragment{#value}', 'Fragment'));
modelContext.registerResource(echoTemplate('iframe://query{?q,lang}', 'Query'));

modelContext.registerPrompt({
  name: 'summarize',
  description: 'Create a summary prompt',
  argsSchema: {
    type: 'object',
    properties: { text: { type: 'string' } },
    required: ['text'],
  },
  async get(args) {
    return {
      messages: [
        {
          role: 'user',
          content: { type: 'text', text: `Summarize: ${args.text ?? ''}` },
        },
      ],
    };
  },
});

let dynamicTool: AbortController | undefined;
let dynamicResource: RegistrationHandle | undefined;
let dynamicPrompt: RegistrationHandle | undefined;

async function setDynamicItems(enabled: boolean): Promise<void> {
  if (!enabled) {
    dynamicTool?.abort();
    dynamicTool = undefined;
    dynamicResource?.unregister();
    dynamicResource = undefined;
    dynamicPrompt?.unregister();
    dynamicPrompt = undefined;
    return;
  }
  if (dynamicTool) return;

  dynamicTool = new AbortController();
  await modelContext.registerTool(
    {
      name: 'dynamic',
      description: 'Dynamically registered tool',
      inputSchema: { type: 'object', properties: {} },
      async execute() {
        return { content: [{ type: 'text', text: 'dynamic tool' }] };
      },
    },
    { signal: dynamicTool.signal }
  );
  dynamicResource = modelContext.registerResource({
    uri: 'iframe://dynamic',
    name: 'Dynamic resource',
    async read() {
      return { contents: [{ uri: 'iframe://dynamic', text: 'dynamic resource' }] };
    },
  });
  dynamicPrompt = modelContext.registerPrompt({
    name: 'dynamic',
    async get() {
      return {
        messages: [{ role: 'user', content: { type: 'text', text: 'dynamic prompt' } }],
      };
    },
  });
}

/** Two templates that share a uriTemplate collapse into a single parent wrapper URI. */
function addCollidingResources(): void {
  modelContext.registerResource(echoTemplate('iframe://collide/{value}', 'Collide A'));
  modelContext.registerResource(echoTemplate('iframe://collide/{value}', 'Collide B'));
}

declare global {
  interface Window {
    iframeChild: {
      addCollidingResources: typeof addCollidingResources;
      setDynamicItems: typeof setDynamicItems;
      stopRuntime: () => Promise<void>;
    };
  }
}

window.iframeChild = {
  addCollidingResources,
  setDynamicItems,
  stopRuntime: () => modelContext.close(),
};
