import { installWebMCP } from '@mcp-b/webmcp-polyfill';

installWebMCP();

const context = document.modelContext;
if (!context) throw new Error('WebMCP is unavailable');

await context.registerTool({
  name: 'get_page_title',
  description: 'Get the current page title',
  inputSchema: { type: 'object', properties: {} },
  execute() {
    return { title: document.title };
  },
});
