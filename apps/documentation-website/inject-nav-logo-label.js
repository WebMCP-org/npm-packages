// inject-nav-logo-label.js
// Small, idempotent script to insert a visible "MCP-B" label next to the active logo image.
// Place this file in your site root and include it in the HTML (e.g., <script src="/inject-nav-logo-label.js" defer></script>).

(() => {
  function insertLabel() {
    try {
      // Find anchors that contain a nav-logo image (the pattern from your markup)
      const anchors = Array.from(document.querySelectorAll('a')).filter((a) =>
        a.querySelector('img.nav-logo')
      );

      anchors.forEach((a) => {
        // If a manual label already exists, skip
        if (a.querySelector('.nav-logo-label')) return;

        // Determine which img is currently visible (Tailwind pattern: .dark:hidden and hidden .dark:block)
        const imgs = Array.from(a.querySelectorAll('img.nav-logo'));
        const visibleImg =
          imgs.find((img) => {
            // offsetParent is null for display:none; also check computed style as a fallback
            if (img.offsetParent !== null) return true;
            const cs = window.getComputedStyle(img);
            return cs && cs.display !== 'none' && cs.visibility !== 'hidden' && cs.opacity !== '0';
          }) || imgs[0];

        // If there's no image, skip
        if (!visibleImg) return;

        // Create label element
        const span = document.createElement('span');
        span.className = 'nav-logo-label';
        span.textContent = 'MCP-B';

        // Basic styling to match the CSS approach; users can override in their CSS
        span.style.display = 'inline-block';
        span.style.fontSize = '1rem';
        span.style.fontWeight = '600';
        span.style.lineHeight = '1';

        // Styling/colour is handled via CSS (and the injected protective stylesheet below).
        // Keep only minimal inline layout styles to avoid layout shifts.
        span.style.display = 'inline-block';
        span.style.fontSize = '1rem';
        span.style.fontWeight = '600';
        span.style.lineHeight = '1';

        // Insert as the last child of the anchor so it won't be affected by image-specific sibling rules
        a.appendChild(span);
      });
    } catch (e) {
      // Don't crash the page if something unexpected happens
      if (window.console && console.error) console.error('inject-nav-logo-label error', e);
    }
  }

  // Run on DOMContentLoaded and also on load (to handle late hydration) and on tiny delay
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(insertLabel, 10));
  } else {
    setTimeout(insertLabel, 10);
  }

  // Also observe for dynamic changes (e.g., SPA navigation or hydration)
  let debounceTimer;
  const observer = new MutationObserver(() => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(insertLabel, 200);
  });

  observer.observe(document.documentElement || document.body, { childList: true, subtree: true });
})();

// Inject a small stylesheet to strongly protect the label from being hidden by theme CSS.
// This is intentionally scoped and minimal. It will be added once.
(function ensureLabelStyle() {
  try {
    if (document.getElementById('nav-logo-label-protect-style')) return;
    const css = `
      /* Keep nav logo label visible across themes */
      a > .nav-logo-label, .nav-logo-label {
        display: inline-block !important;
        opacity: 1 !important;
        visibility: visible !important;
        pointer-events: none !important;
      }
      /* In dark mode prefer a light color; in light mode prefer a dark color. */
      html.dark a > .nav-logo-label, html.dark .nav-logo-label {
        color: #e6e6e6 !important;
      }
      html:not(.dark) a > .nav-logo-label, html:not(.dark) .nav-logo-label {
        color: #0b0b0b !important;
      }
    `;
    const style = document.createElement('style');
    style.id = 'nav-logo-label-protect-style';
    style.textContent = css;
    (document.head || document.documentElement).appendChild(style);
  } catch (e) {
    /* ignore */
  }
})();
