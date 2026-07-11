// load-webmcp.js
// Lazily loads @mcp-b/global after the page is idle so it never blocks rendering.
// Included via docs.json scripts array.

(() => {
  const load = () => {
    const script = document.createElement('script');
    script.src = 'https://unpkg.com/@mcp-b/global@latest/dist/index.iife.js';
    script.async = true;
    script.onload = () => {
      registerDocsTools();
      window.dispatchEvent(new CustomEvent('webmcp-loaded'));
    };
    document.head.appendChild(script);
  };

  if (typeof requestIdleCallback === 'function') {
    requestIdleCallback(load);
  } else {
    setTimeout(load, 0);
  }

  function registerDocsTools() {
    const context = document.modelContext;
    if (!context) return;

    context.registerTool({
      name: 'read_current_docs_page',
      title: 'Read current documentation page',
      description:
        'Read the title, URL, headings, text, and links from the current WebMCP documentation page.',
      inputSchema: {
        type: 'object',
        properties: {},
        additionalProperties: false,
      },
      annotations: {
        readOnlyHint: true,
      },
      execute: async () => {
        const article = document.querySelector('main');
        const text = article?.innerText?.trim() || document.body.innerText.trim();
        const links = Array.from((article || document).querySelectorAll('a[href]'))
          .slice(0, 80)
          .map((link) => ({
            label: link.textContent?.trim() || link.getAttribute('aria-label') || '',
            url: new URL(link.href, window.location.href).href,
          }))
          .filter((link) => link.label);

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                title: document.title,
                url: window.location.href,
                text: text.slice(0, 30000),
                links,
              }),
            },
          ],
        };
      },
    });
  }
})();
