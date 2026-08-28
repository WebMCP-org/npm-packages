(() => {
  const LOADED_EVENT = 'webmcp-loaded';
  const STATUS_ID = 'live-landing-tool';
  const TOOL_NAME = 'get_docs_info';

  let callCount = 0;
  let marker;
  let registration;

  const setRegistered = () => {
    const dot = marker?.querySelector('[data-status-dot]');
    const label = marker?.querySelector('[data-status-label]');

    if (dot instanceof HTMLElement) {
      dot.style.backgroundColor = '#22c55e';
      dot.style.animation = 'none';
    }

    if (label) {
      const calls = callCount > 0 ? ` (${callCount} call${callCount === 1 ? '' : 's'})` : '';
      label.textContent = `${TOOL_NAME} is live${calls}`;
    }
  };

  const register = async () => {
    if (!marker || !document.modelContext || registration) return;

    const activeRegistration = new AbortController();
    registration = activeRegistration;

    try {
      await Promise.resolve().then(() =>
        document.modelContext.registerTool(
          {
            name: TOOL_NAME,
            description:
              'Returns information about the current WebMCP documentation page: title, URL, headings, link count, and navigation structure.',
            inputSchema: {
              type: 'object',
              properties: {
                include_headings: {
                  type: 'boolean',
                  description: 'Include the list of section headings (default: true)',
                },
                include_links: {
                  type: 'boolean',
                  description: 'Include outbound link URLs (default: false)',
                },
              },
            },
            execute: (args = {}) => {
              callCount += 1;
              setRegistered();

              const info = {
                title: document.title,
                url: location.href,
                description:
                  document.querySelector('meta[name="description"]')?.getAttribute('content') ||
                  null,
                headingCount: document.querySelectorAll('h1, h2, h3').length,
                linkCount: document.querySelectorAll('a[href]').length,
              };

              if (args.include_headings !== false) {
                info.headings = Array.from(document.querySelectorAll('h1, h2, h3')).map((h) => ({
                  level: Number.parseInt(h.tagName[1]),
                  text: h.textContent.trim(),
                }));
              }

              if (args.include_links === true) {
                const seen = new Set();
                info.links = Array.from(document.querySelectorAll('a[href]'))
                  .map((a) => a.href)
                  .filter((href) => {
                    if (seen.has(href)) return false;
                    seen.add(href);
                    return true;
                  })
                  .slice(0, 50);
              }

              return {
                content: [{ type: 'text', text: JSON.stringify(info, null, 2) }],
              };
            },
          },
          { signal: activeRegistration.signal }
        )
      );

      if (!activeRegistration.signal.aborted) setRegistered();
    } catch (error) {
      if (!activeRegistration.signal.aborted) console.error(error);
    }
  };

  const syncLandingTool = () => {
    const nextMarker = document.getElementById(STATUS_ID);

    if (nextMarker !== marker) {
      registration?.abort();
      registration = undefined;
      marker = nextMarker;
      callCount = 0;
    }

    if (marker && document.modelContext && !registration) {
      void register();
    }
  };

  new MutationObserver(syncLandingTool).observe(document.documentElement, {
    childList: true,
    subtree: true,
  });
  window.addEventListener(LOADED_EVENT, syncLandingTool);
  syncLandingTool();

  const load = () => {
    const script = document.createElement('script');
    script.src = 'https://unpkg.com/@mcp-b/global@latest/dist/index.iife.js';
    script.async = true;
    script.onload = () => {
      window.dispatchEvent(new CustomEvent(LOADED_EVENT));
    };
    document.head.appendChild(script);
  };

  if (typeof requestIdleCallback === 'function') {
    requestIdleCallback(load);
  } else {
    setTimeout(load, 0);
  }
})();
