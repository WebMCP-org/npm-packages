Smart DOM Reader MCP — Agent Playbook
====================================

This server returns XML‑wrapped Markdown, optimized for LLMs. Always follow the golden path to minimize tokens and maximize reliability.

Contract
--------
- Output envelope: one `<page>` element with attributes and a single section tag containing Markdown in CDATA.
  - Outline: `<page title="..." url="..."><outline><![CDATA[ ... ]]></outline></page>`
  - Region: `<page ...><section><![CDATA[ ... ]]></section></page>`
  - Content: `<page ...><content><![CDATA[ ... ]]></content></page>`
- Every Markdown block ends with a “Next:” instruction telling you the recommended next tool.

Golden Path
-----------
1) Connect and navigate
   - browser_connect → `{ headless: false }`
   - browser_navigate → `{ url: "https://example.com" }`

2) Get the page outline (start here)
   - dom_extract_structure → `{ detail?: 'summary'|'region'|'deep', maxTextLength?, maxElements? }`
   - Read the outline and pick a target selector (or section label) to drill down.

3) Drill into a region for actionable selectors
   - dom_extract_region → `{ selector, options?: { detail?, maxTextLength?, maxElements?, mode?, maxDepth? } }`
   - Use the “best” selectors it lists to write your script.
   - If selectors look unstable, rerun with higher `detail` or different caps (e.g., `maxElements`).

4) Fetch readable text when needed
   - dom_extract_content → `{ selector, options?: { includeHeadings?, includeLists?, includeMedia?, detail?, maxTextLength?, maxElements? } }`
   - Use this for comprehension; return to region extraction for selectors.

5) Optional utilities
   - dom_extract_interactive → Quick listing of controls without content
   - browser_screenshot → `{ path?, fullPage? }`
   - browser_close → `{}`

Best Practices
--------------
- Always call dom_extract_structure first on new pages.
- Prefer specific selectors over `body` to reduce tokens.
- Keep outputs short using `maxElements` and `maxTextLength`; increase only when needed.
- Write scripts against “best” selectors; if unstable, re‑extract with higher `detail`.
- Close the browser when done.

Example Flow
------------
1. browser_connect → `{ headless: false }`
2. browser_navigate → `{ url: "https://www.youtube.com" }`
3. dom_extract_structure → `{ detail: 'summary', maxElements: 8 }`
4. Choose a sidebar/nav selector from the outline
5. dom_extract_region → `{ selector: "#masthead", options: { detail: 'region', maxElements: 12 } }`
6. Write a script using the returned selectors
7. If selectors look brittle, dom_extract_region again with `{ detail: 'deep' }`
8. browser_close → `{}`

Notes
-----
- All outputs are text (XML‑wrapped Markdown). There is no JSON response.
- The server depends on the embedded browser bundle and the library dist build.

