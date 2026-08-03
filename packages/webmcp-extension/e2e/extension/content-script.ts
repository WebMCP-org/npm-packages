import { connectWebMCPClient } from '@mcp-b/webmcp-extension/content-script';
import type { CallToolResult, Client } from '@modelcontextprotocol/client';

async function waitForDocument(): Promise<void> {
  if (document.readyState !== 'loading') return;
  await new Promise<void>((resolve) => {
    document.addEventListener('DOMContentLoaded', () => resolve(), { once: true });
  });
}

async function waitForPageTools(): Promise<void> {
  await waitForDocument();
  await new Promise<void>((resolve, reject) => {
    const check = () => {
      const { dataset } = document.documentElement;
      if (!dataset.webmcpPageReady && !dataset.webmcpPageError) return;
      observer.disconnect();
      if (dataset.webmcpPageError) reject(new Error(dataset.webmcpPageError));
      else resolve();
    };
    const observer = new MutationObserver(check);
    observer.observe(document.documentElement, { attributes: true });
    check();
  });
}

function readText(result: CallToolResult, toolName: string): string {
  const text = result.content.find((item) => item.type === 'text');
  if (!text || text.type !== 'text') throw new Error(`${toolName} returned no text`);
  return text.text;
}

async function callChildToolsWhenNative(client: Client): Promise<void> {
  const frame = document.querySelector('iframe');
  if (!frame) throw new Error('Child frame was not found');

  const deadline = performance.now() + 5_000;
  let childDataset: DOMStringMap | undefined;
  while (performance.now() < deadline) {
    childDataset = frame.contentDocument?.documentElement?.dataset;
    if (childDataset?.webmcpChildError) throw new Error(childDataset.webmcpChildError);
    if (childDataset?.webmcpChildReady) break;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  if (!childDataset?.webmcpChildReady) throw new Error('Child frame did not become ready');

  const mode = childDataset.webmcpChildMode;
  if (!mode) throw new Error('Child frame did not report its WebMCP mode');
  if (mode !== 'native') return;

  const childToolNames = ['extension_child_declarative', 'extension_child_script'];
  let toolNames: string[] = [];
  const toolDeadline = performance.now() + 5_000;
  while (performance.now() < toolDeadline) {
    toolNames = (await client.listTools()).tools.map(({ name }) => name);
    if (childToolNames.every((name) => toolNames.includes(name))) break;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  if (!childToolNames.every((name) => toolNames.includes(name))) {
    throw new Error('Native child-frame tools were not exposed to the extension client');
  }

  const scriptResult = await client.callTool({
    name: 'extension_child_script',
    arguments: { value: window.location.pathname },
  });
  document.documentElement.dataset.webmcpExtensionChildScriptResult = readText(
    scriptResult,
    'extension_child_script'
  );

  const declarativeResult = await client.callTool({
    name: 'extension_child_declarative',
    arguments: { value: window.location.pathname },
  });
  document.documentElement.dataset.webmcpExtensionChildDeclarativeResult = readText(
    declarativeResult,
    'extension_child_declarative'
  );
}

async function run(): Promise<void> {
  await waitForPageTools();
  document.documentElement.dataset.webmcpIsolatedWorld = String(
    !Reflect.has(window, '__webmcpPageWorld')
  );
  let sawDynamicTool = false;
  let resolveDynamicRemoval!: () => void;
  let rejectDynamicRemoval!: (reason: unknown) => void;
  const dynamicRemoval = new Promise<void>((resolve, reject) => {
    resolveDynamicRemoval = resolve;
    rejectDynamicRemoval = reject;
  });
  const client = await connectWebMCPClient(undefined, {
    listChanged: {
      tools: {
        debounceMs: 0,
        onChanged(error, tools) {
          if (error) {
            rejectDynamicRemoval(error);
            return;
          }
          const hasDynamicTool = Boolean(tools?.some(({ name }) => name === 'extension_dynamic'));
          if (hasDynamicTool) {
            sawDynamicTool = true;
            document.documentElement.dataset.webmcpExtensionSawDynamic = 'true';
          } else if (sawDynamicTool) {
            document.documentElement.dataset.webmcpExtensionSawDynamicRemoval = 'true';
            resolveDynamicRemoval();
          }
        },
      },
    },
  });

  await callChildToolsWhenNative(client);

  window.addEventListener('pageshow', (event) => {
    if (!event.persisted) return;
    void client
      .callTool({ name: 'extension_echo', arguments: { value: 'bfcache' } })
      .then((result) => {
        document.documentElement.dataset.webmcpExtensionBfcacheResult = readText(
          result,
          'extension_echo'
        );
        document.documentElement.dataset.webmcpExtensionBfcacheRestored = 'true';
      })
      .catch((error: unknown) => {
        document.documentElement.dataset.webmcpExtensionError =
          error instanceof Error ? error.message : String(error);
      });
  });

  const result = await client.callTool({
    name: 'extension_echo',
    arguments: { value: window.location.pathname },
  });
  document.documentElement.dataset.webmcpExtensionResult = readText(result, 'extension_echo');

  const declarativeResult = await client.callTool({
    name: 'extension_declarative',
    arguments: { value: window.location.pathname },
  });
  document.documentElement.dataset.webmcpExtensionDeclarativeResult = readText(
    declarativeResult,
    'extension_declarative'
  );

  const failure = await client.callTool({ name: 'extension_fail', arguments: {} });
  if (!failure.isError) throw new Error('extension_fail unexpectedly succeeded');
  document.documentElement.dataset.webmcpExtensionFailure = readText(failure, 'extension_fail');

  await client.callTool({
    name: 'extension_set_dynamic',
    arguments: { enabled: true },
  });
  const dynamicResult = await client.callTool({
    name: 'extension_dynamic',
    arguments: { value: window.location.pathname },
  });
  document.documentElement.dataset.webmcpExtensionDynamicResult = readText(
    dynamicResult,
    'extension_dynamic'
  );
  await client.callTool({
    name: 'extension_set_dynamic',
    arguments: { enabled: false },
  });
  await dynamicRemoval;

  const { tools } = await client.listTools();
  document.documentElement.dataset.webmcpExtensionTools = tools
    .map(({ name }) => name)
    .sort()
    .join(',');
  document.documentElement.dataset.webmcpExtensionReady = 'true';
}

void run().catch((error) => {
  document.documentElement.dataset.webmcpExtensionError =
    error instanceof Error ? error.message : String(error);
});
