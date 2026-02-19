import { initializeWebMCPPolyfill } from '@mcp-b/webmcp-polyfill';

initializeWebMCPPolyfill();

navigator.modelContext.registerTool({
  name: 'get_status',
  description: 'Returns app status',
  inputSchema: {
    type: 'object',
    properties: {},
  },
  execute: async () => ({
    content: [{ type: 'text', text: 'Vanilla app is running' }],
  }),
});

document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <p>WebMCP tool "get_status" registered.</p>
`;
