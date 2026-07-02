import { initializeWebMCPPolyfill } from '@mcp-b/webmcp-polyfill';

initializeWebMCPPolyfill();

document.modelContext.registerTool({
  name: 'get_page_title',
  description: 'Get the current page title',
  inputSchema: { type: 'object', properties: {} },
  async execute() {
    return {
      content: [{ type: 'text', text: document.title }],
    };
  },
});
