// load-webmcp.js
// Lazily loads @mcp-b/global after the page is idle so it never blocks rendering.
// Included via docs.json scripts array.

(() => {
  const load = () => {
    const script = document.createElement('script');
    script.src = 'https://unpkg.com/@mcp-b/global@latest/dist/index.iife.js';
    script.async = true;
    script.onload = () => {
      window.dispatchEvent(new CustomEvent('webmcp-loaded'));
    };
    document.head.appendChild(script);
  };

  if (typeof requestIdleCallback === 'function') {
    requestIdleCallback(load);
  } else {
    setTimeout(load, 0);
  }
})();
