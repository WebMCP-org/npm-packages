// Registers a live WebMCP tool on the landing page.
// Uses document.modelContext directly (provided by @mcp-b/global IIFE).

export const LiveLandingTool = () => {
  const { useState, useEffect } = React;
  const [isRegistered, setIsRegistered] = useState(false);
  const [callCount, setCallCount] = useState(0);

  useEffect(() => {
    const TOOL_NAME = 'get_docs_info';

    const register = () => {
      if (!document.modelContext) return;

      // Unregister first in case of re-render or hot reload
      try {
        document.modelContext.unregisterTool(TOOL_NAME);
      } catch (e) {}

      document.modelContext.registerTool({
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
        execute: (args) => {
          setCallCount((c) => c + 1);

          const includeHeadings = args.include_headings !== false;
          const includeLinks = args.include_links === true;

          const info = {
            title: document.title,
            url: location.href,
            description:
              document.querySelector('meta[name="description"]')?.getAttribute('content') || null,
            headingCount: document.querySelectorAll('h1, h2, h3').length,
            linkCount: document.querySelectorAll('a[href]').length,
          };

          if (includeHeadings) {
            info.headings = Array.from(document.querySelectorAll('h1, h2, h3')).map((h) => ({
              level: Number.parseInt(h.tagName[1]),
              text: h.textContent.trim(),
            }));
          }

          if (includeLinks) {
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
      });

      setIsRegistered(true);
    };

    if (document.modelContext) {
      register();
    } else {
      window.addEventListener('webmcp-loaded', register);
    }

    return () => {
      window.removeEventListener('webmcp-loaded', register);
      try {
        document.modelContext?.unregisterTool(TOOL_NAME);
      } catch (e) {}
    };
  }, []);

  return (
    <span
      className="not-prose"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.5rem',
        fontSize: '0.8rem',
      }}
    >
      <span
        style={{
          width: '0.5rem',
          height: '0.5rem',
          borderRadius: '50%',
          backgroundColor: isRegistered ? '#22c55e' : '#eab308',
          display: 'inline-block',
          animation: isRegistered ? 'none' : 'pulse 1.5s infinite',
        }}
      />
      <span style={{ opacity: 0.7 }}>
        {isRegistered
          ? `get_docs_info is live${callCount > 0 ? ` (${callCount} call${callCount === 1 ? '' : 's'})` : ''}`
          : 'Loading...'}
      </span>
    </span>
  );
};
