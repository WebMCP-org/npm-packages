import '@mcp-b/global';

import { TabClientTransport } from '@mcp-b/transports';
import { normalizeToolResponse } from '@mcp-b/webmcp-polyfill/schema';
import type { MCPIframeElement } from '@mcp-b/mcp-iframe/element';
import type { BrowserMcpServer } from '@mcp-b/webmcp-ts-sdk';
import { Client, UriTemplate, type Variables } from '@modelcontextprotocol/client';

const useCustomTag = new URLSearchParams(location.search).has('custom');
const tagName = useCustomTag ? 'custom-mcp-iframe' : 'mcp-iframe';

if (useCustomTag) {
  const { registerMCPIframeElement } = await import('@mcp-b/mcp-iframe/element');
  registerMCPIframeElement(tagName);
} else {
  await import('@mcp-b/mcp-iframe');
}

const modelContext = document.modelContext as BrowserMcpServer;
const mcpClient = new Client(
  { name: 'mcp-iframe-e2e-client', version: '1.0.0' },
  { versionNegotiation: { mode: 'auto' } }
);
const mcpClientReady = mcpClient.connect(new TabClientTransport({ targetOrigin: location.origin }));
const mcpIframe = document.createElement(tagName) as MCPIframeElement;
mcpIframe.id = 'child-iframe';
mcpIframe.setAttribute('src', '/iframe-child.html');
mcpIframe.setAttribute('width', '640');
document.body.appendChild(mcpIframe);

mcpIframe.addEventListener('mcp-iframe-ready', (event) => {
  document.body.dataset.status = 'ready';
  document.body.dataset.tools = String(event.detail.tools.length);
});
mcpIframe.addEventListener('mcp-iframe-error', (event) => {
  document.body.dataset.status = 'error';
  document.body.dataset.error = String(event.detail.error);
});

async function callTool(name: string, args: Record<string, unknown>) {
  const tool = (await modelContext.getTools()).find(
    (candidate) => candidate.name === `${mcpIframe.itemPrefix}${name}`
  );
  if (!tool) throw new Error(`Tool not found: ${name}`);
  const result = await modelContext.executeTool(tool, JSON.stringify(args));
  if (result === null) throw new Error('Tool execution was interrupted');
  return normalizeToolResponse(JSON.parse(result));
}

async function readResource(uri: string) {
  await mcpClientReady;
  return mcpClient.readResource({ uri });
}

async function readResourceTemplate(template: string, variables: Variables) {
  return readResource(new UriTemplate(template).expand(variables));
}

async function setDynamicItems(enabled: boolean): Promise<void> {
  const child = mcpIframe.iframe?.contentWindow?.iframeChild;
  if (!child) throw new Error('Iframe child API is unavailable');
  await child.setDynamicItems(enabled);
}

async function stopChildRuntime(): Promise<void> {
  const child = mcpIframe.iframe?.contentWindow?.iframeChild;
  if (!child) throw new Error('Iframe child API is unavailable');
  await child.stopRuntime();
}

declare global {
  interface Window {
    mcpIframeHost: {
      getMcpIframe: () => MCPIframeElement;
      callTool: typeof callTool;
      readResource: typeof readResource;
      readResourceTemplate: typeof readResourceTemplate;
      getPrompt: (name: string, args: Record<string, string>) => Promise<unknown>;
      getParentTool: (name: string) => Promise<unknown>;
      setDynamicItems: typeof setDynamicItems;
      stopChildRuntime: typeof stopChildRuntime;
    };
  }
}

window.mcpIframeHost = {
  getMcpIframe: () => mcpIframe,
  callTool,
  readResource,
  readResourceTemplate,
  getPrompt: async (name, args) => {
    await mcpClientReady;
    return mcpClient.getPrompt({ name: `${mcpIframe.itemPrefix}${name}`, arguments: args });
  },
  getParentTool: async (name) =>
    (await modelContext.getTools()).find((tool) => tool.name === `${mcpIframe.itemPrefix}${name}`),
  setDynamicItems,
  stopChildRuntime,
};
