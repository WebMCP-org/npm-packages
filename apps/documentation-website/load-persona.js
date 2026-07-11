// Installs Persona as a floating documentation assistant.
(() => {
  const apiUrl =
    window.location.hostname === 'localhost'
      ? 'http://localhost:8787/api/chat/dispatch'
      : '/api/chat/dispatch';

  // The installer only reads widget options from the nested `config` key;
  // top-level keys other than apiUrl/clientToken/flowId/agentId are ignored.
  window.siteAgentConfig = {
    apiUrl,
    config: {
      launcher: {
        enabled: true,
        position: 'bottom-right',
        title: 'Ask WebMCP Docs',
        subtitle: 'Questions and page tools',
      },
      copy: {
        welcomeTitle: 'Ask the WebMCP docs',
        welcomeSubtitle: 'I can answer questions using the entire documentation site.',
        inputPlaceholder: 'Ask about WebMCP…',
      },
      colorScheme: 'auto',
      suggestionChips: [
        'Summarize this page',
        'What can I build with WebMCP?',
        'Which runtime should I use?',
      ],
      webmcp: {
        enabled: true,
        allowlist: ['read_current_docs_page', 'list_docs_pages', 'search_docs', 'read_docs_page'],
        // The approval payload has no `annotations`, so gate by tool name.
        // All four docs tools are read-only.
        autoApprove: ({ toolName }) =>
          ['read_current_docs_page', 'list_docs_pages', 'search_docs', 'read_docs_page'].includes(
            toolName
          ),
      },
      errorMessage: 'The docs assistant is unavailable right now. Please try again shortly.',
    },
  };

  const script = document.createElement('script');
  script.src = 'https://unpkg.com/@runtypelabs/persona@4.6.0/dist/install.global.js';
  script.async = true;
  document.head.appendChild(script);
})();
