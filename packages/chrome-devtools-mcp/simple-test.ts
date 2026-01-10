/// Simple test tool for any page
interface PageInfo {
  title: string;
  url: string;
  headings: string[];
}

navigator.modelContext.registerTool({
  name: 'get_page_info',
  description: 'Get basic information about the current page',
  inputSchema: {
    type: 'object',
    properties: {},
  },
  handler: async () => {
    const headings = Array.from(document.querySelectorAll('h1, h2, h3'))
      .map(h => h.textContent?.trim() || '')
      .filter(Boolean);

    const info: PageInfo = {
      title: document.title,
      url: window.location.href,
      headings,
    };

    return info;
  },
});

navigator.modelContext.registerTool({
  name: 'count_elements',
  description: 'Count elements matching a CSS selector',
  inputSchema: {
    type: 'object',
    properties: {
      selector: {
        type: 'string',
        description: 'CSS selector to count',
      },
    },
    required: ['selector'],
  },
  handler: async (params: { selector: string }) => {
    const count = document.querySelectorAll(params.selector).length;
    return { selector: params.selector, count };
  },
});
