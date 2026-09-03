//#region src/content-detection.ts
var ContentDetection = class ContentDetection {
  /**
   * Find the main content area of a page
   * Inspired by dom-to-semantic-markdown's approach
   */
  static findMainContent(doc) {
    const mainElement = doc.querySelector('main, [role="main"]');
    if (mainElement) return mainElement;
    if (!doc.body) return doc.documentElement;
    return ContentDetection.detectMainContent(doc.body);
  }
  /**
   * Detect main content using scoring algorithm
   */
  static detectMainContent(rootElement) {
    const candidates = [];
    ContentDetection.collectCandidates(rootElement, candidates, 15);
    if (candidates.length === 0) return rootElement;
    candidates.sort(
      (a, b) =>
        ContentDetection.calculateContentScore(b) - ContentDetection.calculateContentScore(a)
    );
    let bestCandidate = candidates[0];
    for (let i = 1; i < candidates.length; i++) {
      const candidate = candidates[i];
      if (
        !candidates.some((other, j) => j !== i && other.contains(candidate)) &&
        ContentDetection.calculateContentScore(candidate) >
          ContentDetection.calculateContentScore(bestCandidate)
      )
        bestCandidate = candidate;
    }
    return bestCandidate;
  }
  /**
   * Collect content candidates
   */
  static collectCandidates(element, candidates, minScore) {
    if (ContentDetection.calculateContentScore(element) >= minScore) candidates.push(element);
    Array.from(element.children).forEach((child) => {
      ContentDetection.collectCandidates(child, candidates, minScore);
    });
  }
  /**
   * Calculate content score for an element
   */
  static calculateContentScore(element) {
    let score = 0;
    const semanticClasses = [
      'article',
      'content',
      'main-container',
      'main',
      'main-content',
      'post',
      'entry',
    ];
    const semanticIds = ['content', 'main', 'article', 'post', 'entry'];
    semanticClasses.forEach((cls) => {
      if (element.classList.contains(cls)) score += 10;
    });
    semanticIds.forEach((id) => {
      if (element.id?.toLowerCase().includes(id)) score += 10;
    });
    const tag = element.tagName.toLowerCase();
    if (['article', 'main', 'section'].includes(tag)) score += 8;
    const paragraphs = element.getElementsByTagName('p').length;
    score += Math.min(paragraphs * 2, 10);
    const headings = element.querySelectorAll('h1, h2, h3').length;
    score += Math.min(headings * 3, 9);
    const textLength = element.textContent?.trim().length || 0;
    if (textLength > 300) score += Math.min(Math.floor(textLength / 300) * 2, 10);
    const linkDensity = ContentDetection.calculateLinkDensity(element);
    if (linkDensity < 0.3) score += 5;
    else if (linkDensity > 0.5) score -= 5;
    if (
      element.hasAttribute('data-main') ||
      element.hasAttribute('data-content') ||
      element.hasAttribute('itemprop')
    )
      score += 8;
    const role = element.getAttribute('role');
    if (role === 'main' || role === 'article') score += 10;
    if (
      element.matches(
        'aside, nav, header, footer, .sidebar, .navigation, .menu, .ad, .advertisement'
      )
    )
      score -= 10;
    if (element.getElementsByTagName('form').length > 2) score -= 5;
    return Math.max(0, score);
  }
  /**
   * Calculate link density in an element
   */
  static calculateLinkDensity(element) {
    const links = element.getElementsByTagName('a');
    let linkTextLength = 0;
    for (const link of Array.from(links)) linkTextLength += link.textContent?.length || 0;
    const totalTextLength = element.textContent?.length || 1;
    return linkTextLength / totalTextLength;
  }
  /**
   * Check if an element is likely navigation
   */
  static isNavigation(element) {
    if (element.tagName.toLowerCase() === 'nav' || element.getAttribute('role') === 'navigation')
      return true;
    const navPatterns = [/nav/i, /menu/i, /sidebar/i, /toolbar/i];
    const classesAndId = `${element.className} ${element.id}`.toLowerCase();
    return navPatterns.some((pattern) => pattern.test(classesAndId));
  }
  /**
   * Check if element is likely supplementary content
   */
  static isSupplementary(element) {
    if (
      element.tagName.toLowerCase() === 'aside' ||
      element.getAttribute('role') === 'complementary'
    )
      return true;
    const supplementaryPatterns = [/sidebar/i, /widget/i, /related/i, /advertisement/i, /social/i];
    const classesAndId = `${element.className} ${element.id}`.toLowerCase();
    return supplementaryPatterns.some((pattern) => pattern.test(classesAndId));
  }
  /**
   * Detect page landmarks
   */
  static detectLandmarks(doc) {
    const landmarks = {
      navigation: [],
      main: [],
      complementary: [],
      contentinfo: [],
      banner: [],
      search: [],
      form: [],
      region: [],
    };
    for (const [landmark, selector] of Object.entries({
      navigation: 'nav, [role="navigation"]',
      main: 'main, [role="main"]',
      complementary: 'aside, [role="complementary"]',
      contentinfo: 'footer, [role="contentinfo"]',
      banner: 'header, [role="banner"]',
      search: '[role="search"]',
      form: 'form[aria-label], form[aria-labelledby], [role="form"]',
      region: 'section[aria-label], section[aria-labelledby], [role="region"]',
    })) {
      const elements = doc.querySelectorAll(selector);
      landmarks[landmark] = Array.from(elements);
    }
    return landmarks;
  }
};
//#endregion
//#region src/markdown-formatter.ts
function truncate(text, len) {
  const t = (text ?? '').trim();
  if (!len || t.length <= len) return t;
  const keywords = [
    'login',
    'log in',
    'sign in',
    'sign up',
    'submit',
    'search',
    'filter',
    'add to cart',
    'next',
    'continue',
  ];
  const lower = t.toLowerCase();
  const hit = keywords
    .map((k) => ({
      k,
      i: lower.indexOf(k),
    }))
    .find((x) => x.i > -1);
  const head = Math.max(0, Math.floor(len * 0.66));
  if (hit && hit.i > head) {
    const tailWindow = Math.max(12, len - head - 5);
    const start = Math.max(0, hit.i - Math.floor(tailWindow / 2));
    const end = Math.min(t.length, start + tailWindow);
    return `${t.slice(0, head).trimEnd()} … ${t.slice(start, end).trim()}…`;
  }
  const slice = t.slice(0, len);
  const lastSpace = slice.lastIndexOf(' ');
  return `${lastSpace > 32 ? slice.slice(0, lastSpace) : slice}…`;
}
function bestSelector(el) {
  return el.selector?.css || '';
}
function hashId(input) {
  let h = 5381;
  for (let i = 0; i < input.length; i++) h = (h * 33) ^ input.charCodeAt(i);
  return `sec-${(h >>> 0).toString(36)}`;
}
function iconForRegion(key) {
  switch (key) {
    case 'header':
      return '🧭';
    case 'navigation':
      return '📑';
    case 'main':
      return '📄';
    case 'sections':
      return '🗂️';
    case 'sidebar':
      return '📚';
    case 'footer':
      return '🔻';
    case 'modals':
      return '💬';
    default:
      return '🔹';
  }
}
function elementLine(el, opts) {
  const txt = truncate(el.text || el.attributes?.ariaLabel, opts?.maxTextLength ?? 80);
  const sel = bestSelector(el);
  const tag = el.tag.toLowerCase();
  const action = el.interaction?.submit
    ? 'submit'
    : el.interaction?.click
      ? 'click'
      : el.interaction?.change
        ? 'change'
        : void 0;
  const actionText = action ? ` (${action})` : '';
  return `- ${tag.toUpperCase()}: ${txt || '(no text)'} → \`${sel}\`${actionText}`;
}
function selectorQualitySummary(inter) {
  const all = [];
  all.push(...inter.buttons.map((e) => e.selector?.css || ''));
  all.push(...inter.links.map((e) => e.selector?.css || ''));
  all.push(...inter.inputs.map((e) => e.selector?.css || ''));
  all.push(...inter.clickable.map((e) => e.selector?.css || ''));
  const total = all.length || 1;
  const idCount = all.filter((s) => s.startsWith('#')).length;
  const testIdCount = all.filter((s) => /\[data-testid=/.test(s)).length;
  const nthCount = all.filter((s) => /:nth-child\(/.test(s)).length;
  const stable = idCount + testIdCount;
  return `Selector quality: ${Math.round((stable / total) * 100)}% stable (ID/data-testid), ${Math.round((nthCount / total) * 100)}% structural (:nth-child)`;
}
function renderInteractive(inter, opts) {
  const parts = [];
  const limit = (arr) =>
    typeof opts?.maxElements === 'number' ? arr.slice(0, opts.maxElements) : arr;
  if (inter.buttons.length) {
    parts.push('Buttons:');
    for (const el of limit(inter.buttons)) parts.push(elementLine(el, opts));
  }
  if (inter.links.length) {
    parts.push('Links:');
    for (const el of limit(inter.links)) parts.push(elementLine(el, opts));
  }
  if (inter.inputs.length) {
    parts.push('Inputs:');
    for (const el of limit(inter.inputs)) parts.push(elementLine(el, opts));
  }
  if (inter.clickable.length) {
    parts.push('Other Clickable:');
    for (const el of limit(inter.clickable)) parts.push(elementLine(el, opts));
  }
  if (inter.forms.length) {
    parts.push('Forms:');
    for (const f of limit(inter.forms))
      parts.push(`- FORM: action=${f.action ?? '-'} method=${f.method ?? '-'} → \`${f.selector}\``);
  }
  return parts.join('\n');
}
function renderRegionInfo(region) {
  const icon = iconForRegion('region');
  const id = hashId(`${region.selector}|${region.label ?? ''}|${region.role ?? ''}`);
  const label = region.label ? ` ${region.label}` : '';
  const stats = [];
  if (region.buttonCount) stats.push(`${region.buttonCount} buttons`);
  if (region.linkCount) stats.push(`${region.linkCount} links`);
  if (region.inputCount) stats.push(`${region.inputCount} inputs`);
  if (region.textPreview) stats.push(`“${truncate(region.textPreview, 80)}”`);
  const statsLine = stats.length ? ` — ${stats.join(', ')}` : '';
  return `${icon} ${label} → \`${region.selector}\` [${id}]${statsLine}`;
}
function wrapXml(body, meta, type = 'section') {
  return `<page ${[meta?.title ? `title="${escapeXml(meta.title)}"` : null, meta?.url ? `url="${escapeXml(meta.url)}"` : null].filter(Boolean).join(' ')}>\n  <${type}><![CDATA[\n${body}\n]]></${type}>\n</page>`;
}
function escapeXml(s) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
var MarkdownFormatter = class {
  static structure(overview, _opts = {}, meta) {
    const lines = [];
    lines.push('# Page Outline');
    if (meta?.title || meta?.url) {
      lines.push(`Title: ${meta?.title ?? ''}`.trim());
      lines.push(`URL: ${meta?.url ?? ''}`.trim());
    }
    lines.push('');
    const regions = overview.regions;
    const entries = [
      ['header', regions.header],
      ['navigation', regions.navigation],
      ['main', regions.main],
      ['sections', regions.sections],
      ['sidebar', regions.sidebar],
      ['footer', regions.footer],
      ['modals', regions.modals],
    ];
    for (const [key, value] of entries) {
      if (!value) continue;
      const icon = iconForRegion(key);
      if (Array.isArray(value)) {
        if (!value.length) continue;
        lines.push(`## ${icon} ${capitalize(key)}`);
        for (const region of value) lines.push(renderRegionInfo(region));
      } else {
        lines.push(`## ${icon} ${capitalize(key)}`);
        lines.push(renderRegionInfo(value));
      }
      lines.push('');
    }
    if (overview.suggestions?.length) {
      lines.push('## Suggestions');
      for (const s of overview.suggestions) lines.push(`- ${s}`);
      lines.push('');
    }
    lines.push(
      'Next: choose a region (by selector or [sectionId]) and call dom_extract_region for actionable details.'
    );
    return wrapXml(lines.join('\n'), meta, 'outline');
  }
  static region(result, opts = {}, meta) {
    const lines = [];
    lines.push('# Region Details');
    if (meta?.title || meta?.url) {
      lines.push(`Title: ${meta?.title ?? ''}`.trim());
      lines.push(`URL: ${meta?.url ?? ''}`.trim());
    }
    lines.push('');
    const inter = result.interactive;
    if (result.page) {
      const ps = [
        result.page.hasErrors ? 'errors: yes' : 'errors: no',
        result.page.isLoading ? 'loading: yes' : 'loading: no',
        result.page.hasModals ? 'modals: yes' : 'modals: no',
      ];
      lines.push(`Page state: ${ps.join(', ')}`);
    }
    const summary = [];
    const count = (arr) => (arr ? arr.length : 0);
    summary.push(`${count(inter.buttons)} buttons`);
    summary.push(`${count(inter.links)} links`);
    summary.push(`${count(inter.inputs)} inputs`);
    if (inter.forms?.length) summary.push(`${count(inter.forms)} forms`);
    lines.push(`Summary: ${summary.join(', ')}`);
    lines.push(selectorQualitySummary(inter));
    lines.push('');
    lines.push(renderInteractive(inter, opts));
    lines.push('');
    lines.push(
      'Next: write a script using the most stable selectors above. If selectors look unstable, rerun dom_extract_region with higher detail or call dom_extract_content for text context.'
    );
    return wrapXml(lines.join('\n'), meta, 'section');
  }
  static content(content, opts = {}, meta) {
    const lines = [];
    lines.push('# Content');
    lines.push(`Selector: \`${content.selector}\``);
    lines.push('');
    if (content.text.headings?.length) {
      lines.push('Headings:');
      for (const h of content.text.headings)
        lines.push(`- H${h.level}: ${truncate(h.text, opts.maxTextLength ?? 120)}`);
      lines.push('');
    }
    if (content.text.paragraphs?.length) {
      const limit =
        typeof opts.maxElements === 'number' ? opts.maxElements : content.text.paragraphs.length;
      lines.push('Paragraphs:');
      for (const p of content.text.paragraphs.slice(0, limit))
        lines.push(`- ${truncate(p, opts.maxTextLength ?? 200)}`);
      lines.push('');
    }
    if (content.text.lists?.length) {
      lines.push('Lists:');
      for (const list of content.text.lists) {
        lines.push(`- ${list.type.toUpperCase()}:`);
        const limit = typeof opts.maxElements === 'number' ? opts.maxElements : list.items.length;
        for (const item of list.items.slice(0, limit))
          lines.push(`  - ${truncate(item, opts.maxTextLength ?? 120)}`);
      }
      lines.push('');
    }
    if (content.tables?.length) {
      lines.push('Tables:');
      for (const t of content.tables) {
        lines.push(`- Headers: ${t.headers.join(' | ')}`);
        const limit = typeof opts.maxElements === 'number' ? opts.maxElements : t.rows.length;
        for (const row of t.rows.slice(0, limit)) lines.push(`  - ${row.join(' | ')}`);
      }
      lines.push('');
    }
    if (content.media?.length) {
      lines.push('Media:');
      const limit = typeof opts.maxElements === 'number' ? opts.maxElements : content.media.length;
      for (const m of content.media.slice(0, limit))
        lines.push(`- ${m.type.toUpperCase()}: ${m.alt ?? ''} ${m.src ? `→ ${m.src}` : ''}`.trim());
      lines.push('');
    }
    lines.push(
      'Next: if text is insufficient for targeting, call dom_extract_region for interactive selectors.'
    );
    return wrapXml(lines.join('\n'), meta, 'content');
  }
};
function capitalize(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
//#endregion
//#region src/selectors.ts
const TEST_ID_ATTRIBUTES = ['data-testid', 'data-test-id', 'data-test', 'data-cy'];
var SelectorGenerator = class SelectorGenerator {
  /**
   * Generate multiple selector strategies for an element
   */
  static generateSelectors(element) {
    const root = SelectorGenerator.getSelectorRoot(element);
    const candidates = [];
    if (element.id && SelectorGenerator.isUniqueId(element.id, element, root))
      candidates.push({
        type: 'id',
        value: `#${CSS.escape(element.id)}`,
        score: 100,
      });
    const testId = SelectorGenerator.getDataTestAttribute(element);
    if (testId) {
      const v = `[${testId.attribute}="${CSS.escape(testId.value)}"]`;
      candidates.push({
        type: 'data-testid',
        value: v,
        score: 90 + (SelectorGenerator.isUniqueSelectorForElement(v, element, root) ? 5 : 0),
      });
    }
    const role = element.getAttribute('role');
    const aria = element.getAttribute('aria-label');
    if (role && aria) {
      const v = `[role="${CSS.escape(role)}"][aria-label="${CSS.escape(aria)}"]`;
      candidates.push({
        type: 'role-aria',
        value: v,
        score: 85 + (SelectorGenerator.isUniqueSelectorForElement(v, element, root) ? 5 : 0),
      });
    }
    const nameAttr = element.getAttribute('name');
    if (nameAttr) {
      const v = `[name="${CSS.escape(nameAttr)}"]`;
      candidates.push({
        type: 'name',
        value: v,
        score: 78 + (SelectorGenerator.isUniqueSelectorForElement(v, element, root) ? 5 : 0),
      });
    }
    const pathCss = SelectorGenerator.generateCSSSelector(element, root);
    const structuralPenalty = (pathCss.match(/:nth-child\(/g) || []).length * 10;
    const classBonus = pathCss.includes('.') ? 8 : 0;
    const pathScore = Math.max(0, 70 + classBonus - structuralPenalty);
    candidates.push({
      type: 'class-path',
      value: pathCss,
      score: pathScore,
    });
    const xpath = SelectorGenerator.generateXPath(element, root);
    candidates.push({
      type: 'xpath',
      value: xpath,
      score: 40,
    });
    const textBased = SelectorGenerator.generateTextBasedSelector(element);
    if (textBased)
      candidates.push({
        type: 'text',
        value: textBased,
        score: 30,
      });
    candidates.sort((a, b) => b.score - a.score);
    const selector = {
      css:
        candidates.find(
          (candidate) =>
            candidate.type !== 'xpath' &&
            candidate.type !== 'text' &&
            SelectorGenerator.isUniqueSelectorForElement(candidate.value, element, root)
        )?.value ?? pathCss,
      xpath,
      candidates,
    };
    if (textBased) selector.textBased = textBased;
    if (testId) selector.dataTestId = testId.value;
    if (aria) selector.ariaLabel = aria;
    return selector;
  }
  /**
   * Generate a unique CSS selector for an element
   */
  static generateCSSSelector(element, root) {
    if (element.id && SelectorGenerator.isUniqueId(element.id, element, root))
      return `#${CSS.escape(element.id)}`;
    const testId = SelectorGenerator.getDataTestAttribute(element);
    if (testId) {
      const selector = `[${testId.attribute}="${CSS.escape(testId.value)}"]`;
      if (SelectorGenerator.isUniqueSelectorForElement(selector, element, root)) return selector;
    }
    const path = [];
    let current = element;
    while (current && current.nodeType === Node.ELEMENT_NODE) {
      let selector = current.nodeName.toLowerCase();
      if (current.id && SelectorGenerator.isUniqueId(current.id, current, root)) {
        selector = `#${CSS.escape(current.id)}`;
        path.unshift(selector);
        break;
      }
      const classes = SelectorGenerator.getMeaningfulClasses(current);
      if (classes.length > 0) selector += `.${classes.map((c) => CSS.escape(c)).join('.')}`;
      const parent = SelectorGenerator.getSelectorParent(current);
      const siblings = SelectorGenerator.getElementChildren(parent);
      if (siblings.length > 1) {
        const index = siblings.indexOf(current);
        if (index >= 0) selector += `:nth-child(${index + 1})`;
      }
      path.unshift(selector);
      current = current.parentElement;
    }
    return SelectorGenerator.optimizePath(path, element, root);
  }
  /**
   * Generate XPath for an element
   */
  static generateXPath(element, root) {
    if (element.id && SelectorGenerator.isUniqueId(element.id, element, root))
      return `//*[@id="${element.id}"]`;
    const path = [];
    let current = element;
    while (current && current.nodeType === Node.ELEMENT_NODE) {
      const tagName = current.nodeName.toLowerCase();
      if (current.id && SelectorGenerator.isUniqueId(current.id, current, root)) {
        path.unshift(`//*[@id="${current.id}"]`);
        break;
      }
      let xpath = tagName;
      const siblings = SelectorGenerator.getElementChildren(
        SelectorGenerator.getSelectorParent(current)
      );
      if (siblings.length > 0) {
        const sameTagSiblings = siblings.filter((s) => s.nodeName.toLowerCase() === tagName);
        if (sameTagSiblings.length > 1) {
          const index = sameTagSiblings.indexOf(current) + 1;
          xpath += `[${index}]`;
        }
      }
      path.unshift(xpath);
      current = current.parentElement;
    }
    return `//${path.join('/')}`;
  }
  /**
   * Generate a text-based selector for buttons and links
   */
  static generateTextBasedSelector(element) {
    const text = element.textContent?.trim();
    if (!text || text.length > 50) return void 0;
    const tag = element.nodeName.toLowerCase();
    if (['button', 'a', 'label'].includes(tag))
      return `${tag}:contains("${text.replace(/['"\\]/g, '\\$&')}")`;
  }
  /**
   * Get data-testid or similar attributes
   */
  static getDataTestAttribute(element) {
    for (const attribute of TEST_ID_ATTRIBUTES) {
      const value = element.getAttribute(attribute);
      if (value)
        return {
          attribute,
          value,
        };
    }
  }
  /**
   * Get the document or shadow root that owns the element's selector scope
   */
  static getSelectorRoot(element) {
    const root = element.getRootNode();
    if (root.nodeType === Node.DOCUMENT_NODE || root.nodeType === Node.DOCUMENT_FRAGMENT_NODE)
      return root;
    return element.ownerDocument || document;
  }
  /**
   * Check if an ID uniquely identifies the element in its selector scope
   */
  static isUniqueId(id, element, root) {
    return SelectorGenerator.isUniqueSelectorForElement(`#${CSS.escape(id)}`, element, root);
  }
  /**
   * Parent used for sibling position: Element, Document, or ShadowRoot.
   * parentElement is null when the parent is a ShadowRoot.
   */
  static getSelectorParent(element) {
    const parent = element.parentNode;
    if (!parent) return null;
    if (parent.nodeType === Node.ELEMENT_NODE) return parent;
    if (parent.nodeType === Node.DOCUMENT_NODE || parent.nodeType === Node.DOCUMENT_FRAGMENT_NODE)
      return parent;
    return null;
  }
  static getElementChildren(parent) {
    if (!parent) return [];
    return Array.from(parent.children);
  }
  static isUniqueSelectorForElement(selector, element, root) {
    try {
      const matches = root.querySelectorAll(selector);
      return matches.length === 1 && matches[0] === element;
    } catch {
      return false;
    }
  }
  /**
   * Get meaningful classes (filtering out utility classes)
   */
  static getMeaningfulClasses(element) {
    const classes = Array.from(element.classList);
    const utilityPatterns = [
      /^(p|m|w|h|text|bg|border|flex|grid|col|row)-/,
      /^(xs|sm|md|lg|xl|2xl):/,
      /^(hover|focus|active|disabled|checked):/,
      /^js-/,
      /^is-/,
      /^has-/,
    ];
    return classes
      .filter((cls) => {
        if (cls.length < 3) return false;
        return !utilityPatterns.some((pattern) => pattern.test(cls));
      })
      .slice(0, 2);
  }
  /**
   * Optimize the selector path by removing unnecessary parts.
   * If a descendant-only path collides (direct child vs nested same tag),
   * fall back to `:host >` (shadow) or `:scope >` (document) so the match
   * is a child of the selector root. `:scope >` is empty inside ShadowRoot.
   */
  static optimizePath(path, element, root) {
    const joined = path.join(' > ');
    const childPrefix = root.nodeType === Node.DOCUMENT_FRAGMENT_NODE ? ':host > ' : ':scope > ';
    const attempts = [];
    if (SelectorGenerator.getSelectorParent(element) === root)
      attempts.push(`${childPrefix}${joined}`);
    for (let i = 0; i < path.length; i++) attempts.push(path.slice(i).join(' > '));
    for (let i = 0; i < path.length; i++)
      attempts.push(`${childPrefix}${path.slice(i).join(' > ')}`);
    for (const candidate of attempts)
      if (SelectorGenerator.isUniqueSelectorForElement(candidate, element, root)) return candidate;
    return path.join(' > ');
  }
  /**
   * Get a human-readable path description
   */
  static getContextPath(element) {
    const path = [];
    let current = element;
    let depth = 0;
    const maxDepth = 5;
    while (current && current !== element.ownerDocument?.body && depth < maxDepth) {
      const tag = current.nodeName.toLowerCase();
      let descriptor = tag;
      if (current.id) descriptor = `${tag}#${current.id}`;
      else if (current.className && typeof current.className === 'string') {
        const firstClass = current.className.split(' ')[0];
        if (firstClass) descriptor = `${tag}.${firstClass}`;
      }
      const role = current.getAttribute('role');
      if (role) descriptor += `[role="${role}"]`;
      path.unshift(descriptor);
      current = current.parentElement;
      depth++;
    }
    return path;
  }
};
//#endregion
//#region src/traversal.ts
var DOMTraversal = class DOMTraversal {
  /**
   * Check if element is visible
   */
  static isVisible(element, computedStyle) {
    const rect = element.getBoundingClientRect();
    const style = computedStyle || element.ownerDocument?.defaultView?.getComputedStyle(element);
    if (!style) return false;
    return !!(
      rect.width > 0 &&
      rect.height > 0 &&
      style.display !== 'none' &&
      style.visibility !== 'hidden' &&
      style.opacity !== '0'
    );
  }
  /**
   * Check if element is in viewport
   */
  static isInViewport(element, viewport) {
    const rect = element.getBoundingClientRect();
    const view = viewport || {
      width: element.ownerDocument?.defaultView?.innerWidth || 0,
      height: element.ownerDocument?.defaultView?.innerHeight || 0,
    };
    return rect.top < view.height && rect.bottom > 0 && rect.left < view.width && rect.right > 0;
  }
  /**
   * Check if element passes filter criteria
   */
  static passesFilter(element, filter) {
    if (!filter) return true;
    const htmlElement = element;
    if (filter.excludeSelectors?.length) {
      for (const selector of filter.excludeSelectors) if (element.matches(selector)) return false;
    }
    if (filter.includeSelectors?.length) {
      let matches = false;
      for (const selector of filter.includeSelectors)
        if (element.matches(selector)) {
          matches = true;
          break;
        }
      if (!matches) return false;
    }
    if (filter.tags?.length && !filter.tags.includes(element.tagName.toLowerCase())) return false;
    const textContent = htmlElement.textContent?.toLowerCase() || '';
    if (filter.textContains?.length) {
      let hasText = false;
      for (const text of filter.textContains)
        if (textContent.includes(text.toLowerCase())) {
          hasText = true;
          break;
        }
      if (!hasText) return false;
    }
    if (filter.textMatches?.length) {
      let matches = false;
      for (const pattern of filter.textMatches)
        if (pattern.test(textContent)) {
          matches = true;
          break;
        }
      if (!matches) return false;
    }
    if (filter.hasAttributes?.length) {
      for (const attr of filter.hasAttributes) if (!element.hasAttribute(attr)) return false;
    }
    if (filter.attributeValues)
      for (const [attr, value] of Object.entries(filter.attributeValues)) {
        const attrValue = element.getAttribute(attr);
        if (!attrValue) return false;
        if (typeof value === 'string') {
          if (attrValue !== value) return false;
        } else if (value instanceof RegExp) {
          if (!value.test(attrValue)) return false;
        }
      }
    if (filter.withinSelectors?.length) {
      let isWithin = false;
      for (const selector of filter.withinSelectors)
        if (element.closest(selector)) {
          isWithin = true;
          break;
        }
      if (!isWithin) return false;
    }
    if (filter.interactionTypes?.length) {
      const interaction = DOMTraversal.getInteractionInfo(element);
      let hasInteraction = false;
      for (const type of filter.interactionTypes)
        if (interaction[type]) {
          hasInteraction = true;
          break;
        }
      if (!hasInteraction) return false;
    }
    if (filter.nearText) {
      const parent = element.parentElement;
      if (!parent || !parent.textContent?.toLowerCase().includes(filter.nearText.toLowerCase()))
        return false;
    }
    return true;
  }
  /**
   * Extract element information
   */
  static extractElement(element, options, depth = 0) {
    if (options.maxDepth && depth > options.maxDepth) return null;
    if (!options.includeHidden && !DOMTraversal.isVisible(element)) return null;
    if (options.viewportOnly && !DOMTraversal.isInViewport(element)) return null;
    if (!DOMTraversal.passesFilter(element, options.filter)) return null;
    const htmlElement = element;
    const extracted = {
      tag: element.tagName.toLowerCase(),
      text: DOMTraversal.getElementText(element, options),
      selector: SelectorGenerator.generateSelectors(element),
      attributes: DOMTraversal.getRelevantAttributes(element, options),
      context: DOMTraversal.getElementContext(element),
      interaction: DOMTraversal.getInteractionInfo(element),
    };
    if (options.mode === 'full' && DOMTraversal.isSemanticContainer(element)) {
      const children = [];
      if (options.includeShadowDOM && htmlElement.shadowRoot) {
        const shadowChildren = DOMTraversal.extractChildren(
          htmlElement.shadowRoot,
          options,
          depth + 1
        );
        children.push(...shadowChildren);
      }
      const regularChildren = DOMTraversal.extractChildren(element, options, depth + 1);
      children.push(...regularChildren);
      if (children.length > 0) extracted.children = children;
    }
    return extracted;
  }
  /**
   * Extract children elements
   */
  static extractChildren(container, options, depth) {
    const children = [];
    const elements = container.querySelectorAll('*');
    for (const child of Array.from(elements)) {
      if (DOMTraversal.hasExtractedAncestor(child, elements)) continue;
      const extracted = DOMTraversal.extractElement(child, options, depth);
      if (extracted) children.push(extracted);
    }
    return children;
  }
  /**
   * Check if element has an ancestor that was already extracted
   */
  static hasExtractedAncestor(element, extractedElements) {
    let parent = element.parentElement;
    while (parent) {
      if (Array.from(extractedElements).includes(parent)) return true;
      parent = parent.parentElement;
    }
    return false;
  }
  /**
   * Get relevant attributes for an element
   */
  static getRelevantAttributes(element, options) {
    const relevant = [
      'id',
      'class',
      'name',
      'type',
      'value',
      'placeholder',
      'href',
      'src',
      'alt',
      'title',
      'action',
      'method',
      'aria-label',
      'aria-describedby',
      'aria-controls',
      'role',
      'disabled',
      'readonly',
      'required',
      'checked',
      'min',
      'max',
      'pattern',
      'step',
      'autocomplete',
      'data-testid',
      'data-test',
      'data-cy',
    ];
    const attributes = {};
    const attrTruncate = options.attributeTruncateLength ?? 100;
    const dataAttrTruncate = options.dataAttributeTruncateLength ?? 50;
    for (const attr of relevant) {
      const value = element.getAttribute(attr);
      if (value)
        attributes[attr] =
          value.length > attrTruncate ? `${value.substring(0, attrTruncate)}...` : value;
    }
    for (const attr of element.attributes)
      if (attr.name.startsWith('data-') && !relevant.includes(attr.name))
        attributes[attr.name] =
          attr.value.length > dataAttrTruncate
            ? `${attr.value.substring(0, dataAttrTruncate)}...`
            : attr.value;
    return attributes;
  }
  /**
   * Get element context information
   */
  static getElementContext(element) {
    const context = { parentChain: SelectorGenerator.getContextPath(element) };
    const form = element.closest('form');
    if (form) context.nearestForm = SelectorGenerator.generateSelectors(form).css;
    const section = element.closest('section, [role="region"]');
    if (section) context.nearestSection = SelectorGenerator.generateSelectors(section).css;
    const main = element.closest('main, [role="main"]');
    if (main) context.nearestMain = SelectorGenerator.generateSelectors(main).css;
    const nav = element.closest('nav, [role="navigation"]');
    if (nav) context.nearestNav = SelectorGenerator.generateSelectors(nav).css;
    return context;
  }
  /**
   * Get interaction information for an element (compact format)
   */
  static getInteractionInfo(element) {
    const htmlElement = element;
    const interaction = {};
    if (
      htmlElement.onclick ||
      element.getAttribute('onclick') ||
      element.matches('button, a[href], [role="button"], [tabindex]:not([tabindex="-1"])')
    )
      interaction.click = true;
    if (
      htmlElement.onchange ||
      element.getAttribute('onchange') ||
      element.matches('input, select, textarea')
    )
      interaction.change = true;
    if (htmlElement.onsubmit || element.getAttribute('onsubmit') || element.matches('form'))
      interaction.submit = true;
    if (element.matches('a[href], button[type="submit"]')) interaction.nav = true;
    if (
      htmlElement.hasAttribute('disabled') ||
      htmlElement.getAttribute('aria-disabled') === 'true'
    )
      interaction.disabled = true;
    if (!DOMTraversal.isVisible(element)) interaction.hidden = true;
    const ariaRole = element.getAttribute('role');
    if (ariaRole) interaction.role = ariaRole;
    if (element.matches('input, textarea, select, button')) {
      const form = element.form || element.closest('form');
      if (form) interaction.form = SelectorGenerator.generateSelectors(form).css;
    }
    return interaction;
  }
  /**
   * Get text content of an element (limited length)
   */
  static getElementText(element, options) {
    if (element.matches('input, textarea')) {
      const input = element;
      return input.value || input.placeholder || '';
    }
    if (element.matches('img')) return element.alt || '';
    const text = element.textContent?.trim() || '';
    const maxLength = options?.textTruncateLength;
    if (maxLength && text.length > maxLength) return `${text.substring(0, maxLength)}...`;
    return text;
  }
  /**
   * Check if element is a semantic container
   */
  static isSemanticContainer(element) {
    return element.matches(
      'article, section, nav, aside, main, header, footer, form, table, ul, ol, dl, figure, details, dialog, [role="region"], [role="navigation"], [role="main"], [role="complementary"]'
    );
  }
};
//#endregion
//#region src/smart-dom-reader.ts
/**
 * Smart DOM Reader - Full Extraction Approach
 *
 * This class provides complete DOM extraction in a single pass.
 * Use this when you need all information upfront and have sufficient
 * token budget for processing the complete output.
 *
 * Features:
 * - Single-pass extraction of all elements
 * - Two modes: 'interactive' (UI elements) or 'full' (includes content)
 * - Efficient for automation and testing scenarios
 * - Returns complete structured data immediately
 */
var SmartDOMReader = class SmartDOMReader {
  options;
  constructor(options = {}) {
    this.options = {
      mode: options.mode || 'interactive',
      maxDepth: options.maxDepth || 5,
      includeHidden: options.includeHidden || false,
      includeShadowDOM: options.includeShadowDOM ?? true,
      includeIframes: options.includeIframes || false,
      viewportOnly: options.viewportOnly || false,
      mainContentOnly: options.mainContentOnly || false,
      customSelectors: options.customSelectors || [],
      ...(options.attributeTruncateLength !== void 0 && {
        attributeTruncateLength: options.attributeTruncateLength,
      }),
      ...(options.dataAttributeTruncateLength !== void 0 && {
        dataAttributeTruncateLength: options.dataAttributeTruncateLength,
      }),
      ...(options.textTruncateLength !== void 0 && {
        textTruncateLength: options.textTruncateLength,
      }),
      ...(options.filter !== void 0 && { filter: options.filter }),
    };
  }
  /**
   * Main extraction method - extracts all data in one pass
   * @param rootElement The document or element to extract from
   * @param runtimeOptions Options to override constructor options
   */
  extract(rootElement = document, runtimeOptions) {
    const startTime = Date.now();
    const doc = rootElement instanceof Document ? rootElement : rootElement.ownerDocument;
    const options = {
      ...this.options,
      ...runtimeOptions,
    };
    let container = rootElement instanceof Document ? doc : rootElement;
    if (options.mainContentOnly && rootElement instanceof Document)
      container = ContentDetection.findMainContent(doc);
    const pageState = this.extractPageState(doc);
    const landmarks = this.extractLandmarks(doc);
    const interactive = this.extractInteractiveElements(container, options);
    const result = {
      mode: options.mode,
      timestamp: startTime,
      page: pageState,
      landmarks,
      interactive,
    };
    if (options.mode === 'full') {
      const semantic = this.extractSemanticElements(container, options);
      const metadata = this.extractMetadata(doc, container, options);
      return {
        ...result,
        semantic,
        metadata,
      };
    }
    return result;
  }
  /**
   * Extract page state information
   */
  extractPageState(doc) {
    const hasFocus = this.getFocusedElement(doc);
    return {
      url: doc.location?.href || '',
      title: doc.title || '',
      hasErrors: this.detectErrors(doc),
      isLoading: this.detectLoading(doc),
      hasModals: this.detectModals(doc),
      ...(hasFocus !== void 0 && { hasFocus }),
    };
  }
  /**
   * Extract page landmarks
   */
  extractLandmarks(doc) {
    const detected = ContentDetection.detectLandmarks(doc);
    return {
      navigation: this.elementsToSelectors(detected.navigation || []),
      main: this.elementsToSelectors(detected.main || []),
      forms: this.elementsToSelectors(detected.form || []),
      headers: this.elementsToSelectors(detected.banner || []),
      footers: this.elementsToSelectors(detected.contentinfo || []),
      articles: this.elementsToSelectors(detected.region || []),
      sections: this.elementsToSelectors(detected.region || []),
    };
  }
  /**
   * Convert elements to selector strings
   */
  elementsToSelectors(elements) {
    return elements.map((el) => SelectorGenerator.generateSelectors(el).css);
  }
  querySelectorAll(container, selector, includeShadowDOM) {
    const matches = [...container.querySelectorAll(selector)];
    if (!includeShadowDOM) return matches;
    for (const element of container.querySelectorAll('*'))
      if (element.shadowRoot)
        matches.push(...this.querySelectorAll(element.shadowRoot, selector, true));
    return matches;
  }
  /**
   * Extract interactive elements
   */
  extractInteractiveElements(container, options) {
    const buttons = [];
    const links = [];
    const inputs = [];
    const clickable = [];
    this.querySelectorAll(
      container,
      'button, [role="button"], input[type="button"], input[type="submit"]',
      options.includeShadowDOM
    ).forEach((el) => {
      if (this.shouldIncludeElement(el, options)) {
        const extracted = DOMTraversal.extractElement(el, options);
        if (extracted) buttons.push(extracted);
      }
    });
    this.querySelectorAll(container, 'a[href]', options.includeShadowDOM).forEach((el) => {
      if (this.shouldIncludeElement(el, options)) {
        const extracted = DOMTraversal.extractElement(el, options);
        if (extracted) links.push(extracted);
      }
    });
    this.querySelectorAll(
      container,
      'input:not([type="button"]):not([type="submit"]), textarea, select',
      options.includeShadowDOM
    ).forEach((el) => {
      if (this.shouldIncludeElement(el, options)) {
        const extracted = DOMTraversal.extractElement(el, options);
        if (extracted) inputs.push(extracted);
      }
    });
    if (options.customSelectors)
      options.customSelectors.forEach((selector) => {
        this.querySelectorAll(container, selector, options.includeShadowDOM).forEach((el) => {
          if (this.shouldIncludeElement(el, options)) {
            const extracted = DOMTraversal.extractElement(el, options);
            if (extracted) clickable.push(extracted);
          }
        });
      });
    return {
      buttons,
      links,
      inputs,
      forms: this.extractForms(container, options),
      clickable,
    };
  }
  /**
   * Extract form information
   */
  extractForms(container, options) {
    const forms = [];
    this.querySelectorAll(container, 'form', options.includeShadowDOM).forEach((form) => {
      if (!this.shouldIncludeElement(form, options)) return;
      const formInputs = [];
      const formButtons = [];
      this.querySelectorAll(
        form,
        'input:not([type="button"]):not([type="submit"]), textarea, select',
        options.includeShadowDOM
      ).forEach((input) => {
        const extracted = DOMTraversal.extractElement(input, options);
        if (extracted) formInputs.push(extracted);
      });
      this.querySelectorAll(
        form,
        'button, input[type="button"], input[type="submit"]',
        options.includeShadowDOM
      ).forEach((button) => {
        const extracted = DOMTraversal.extractElement(button, options);
        if (extracted) formButtons.push(extracted);
      });
      const action = form.getAttribute('action');
      const method = form.getAttribute('method');
      const formInfo = {
        selector: SelectorGenerator.generateSelectors(form).css,
        inputs: formInputs,
        buttons: formButtons,
      };
      if (action) formInfo.action = action;
      if (method) formInfo.method = method;
      forms.push(formInfo);
    });
    return forms;
  }
  /**
   * Extract semantic elements (full mode only)
   */
  extractSemanticElements(container, options) {
    const headings = [];
    const images = [];
    const tables = [];
    const lists = [];
    const articles = [];
    this.querySelectorAll(container, 'h1, h2, h3, h4, h5, h6', options.includeShadowDOM).forEach(
      (el) => {
        if (this.shouldIncludeElement(el, options)) {
          const extracted = DOMTraversal.extractElement(el, options);
          if (extracted) headings.push(extracted);
        }
      }
    );
    this.querySelectorAll(container, 'img', options.includeShadowDOM).forEach((el) => {
      if (this.shouldIncludeElement(el, options)) {
        const extracted = DOMTraversal.extractElement(el, options);
        if (extracted) images.push(extracted);
      }
    });
    this.querySelectorAll(container, 'table', options.includeShadowDOM).forEach((el) => {
      if (this.shouldIncludeElement(el, options)) {
        const extracted = DOMTraversal.extractElement(el, options);
        if (extracted) tables.push(extracted);
      }
    });
    this.querySelectorAll(container, 'ul, ol', options.includeShadowDOM).forEach((el) => {
      if (this.shouldIncludeElement(el, options)) {
        const extracted = DOMTraversal.extractElement(el, options);
        if (extracted) lists.push(extracted);
      }
    });
    this.querySelectorAll(container, 'article, [role="article"]', options.includeShadowDOM).forEach(
      (el) => {
        if (this.shouldIncludeElement(el, options)) {
          const extracted = DOMTraversal.extractElement(el, options);
          if (extracted) articles.push(extracted);
        }
      }
    );
    return {
      headings,
      images,
      tables,
      lists,
      articles,
    };
  }
  /**
   * Extract metadata
   */
  extractMetadata(doc, container, options) {
    const allElements = this.querySelectorAll(container, '*', options.includeShadowDOM);
    const extractedElements = this.querySelectorAll(
      container,
      'button, a, input, textarea, select, h1, h2, h3, h4, h5, h6, img, table, ul, ol, article',
      options.includeShadowDOM
    ).length;
    const metadata = {
      totalElements: allElements.length,
      extractedElements,
    };
    if (options.mainContentOnly && container instanceof Element)
      metadata.mainContent = SelectorGenerator.generateSelectors(container).css;
    const language = doc.documentElement.getAttribute('lang');
    if (language) metadata.language = language;
    return metadata;
  }
  /**
   * Check if element should be included based on options
   */
  shouldIncludeElement(element, options) {
    if (!options.includeHidden && !DOMTraversal.isVisible(element)) return false;
    if (options.viewportOnly && !DOMTraversal.isInViewport(element)) return false;
    if (options.filter && !DOMTraversal.passesFilter(element, options.filter)) return false;
    return true;
  }
  /**
   * Detect errors on the page
   */
  detectErrors(doc) {
    return ['.error', '.alert-danger', '[role="alert"]', '.error-message'].some((sel) => {
      const element = doc.querySelector(sel);
      return element ? DOMTraversal.isVisible(element) : false;
    });
  }
  /**
   * Detect if page is loading
   */
  detectLoading(doc) {
    return ['.loading', '.spinner', '[aria-busy="true"]', '.loader'].some((sel) => {
      const element = doc.querySelector(sel);
      return element ? DOMTraversal.isVisible(element) : false;
    });
  }
  /**
   * Detect modal dialogs
   */
  detectModals(doc) {
    return ['[role="dialog"]', '.modal', '.popup', '.overlay'].some((sel) => {
      const element = doc.querySelector(sel);
      return element ? DOMTraversal.isVisible(element) : false;
    });
  }
  /**
   * Get currently focused element
   */
  getFocusedElement(doc) {
    const focused = doc.activeElement;
    if (focused && focused !== doc.body) return SelectorGenerator.generateSelectors(focused).css;
  }
  /**
   * Quick extraction for interactive elements only
   * @param doc The document to extract from
   * @param options Extraction options
   */
  static extractInteractive(doc, options = {}) {
    return new SmartDOMReader({
      ...options,
      mode: 'interactive',
    }).extract(doc);
  }
  /**
   * Quick extraction for full content
   * @param doc The document to extract from
   * @param options Extraction options
   */
  static extractFull(doc, options = {}) {
    return new SmartDOMReader({
      ...options,
      mode: 'full',
    }).extract(doc);
  }
  /**
   * Extract from a specific element
   * @param element The element to extract from
   * @param mode The extraction mode
   * @param options Additional options
   */
  static extractFromElement(element, mode = 'interactive', options = {}) {
    return new SmartDOMReader({
      ...options,
      mode,
    }).extract(element);
  }
};
//#endregion
//#region src/progressive.ts
var ProgressiveExtractor = class ProgressiveExtractor {
  /**
   * Step 1: Extract high-level structural overview
   * This provides a "map" of the page for the AI to understand structure
   */
  static extractStructure(root) {
    const regions = {};
    const header = root.querySelector('header, [role="banner"], .header, #header');
    if (header) regions.header = ProgressiveExtractor.analyzeRegion(header);
    const navs = root.querySelectorAll('nav, [role="navigation"], .nav, .navigation');
    if (navs.length > 0)
      regions.navigation = Array.from(navs).map((nav) => ProgressiveExtractor.analyzeRegion(nav));
    if (root instanceof Document) {
      const main = ContentDetection.findMainContent(root);
      if (main) {
        regions.main = ProgressiveExtractor.analyzeRegion(main);
        const sections = main.querySelectorAll('section, article, [role="region"]');
        if (sections.length > 0)
          regions.sections = Array.from(sections)
            .filter((section) => !section.closest('nav, header, footer'))
            .map((section) => ProgressiveExtractor.analyzeRegion(section));
      }
    } else {
      regions.main = ProgressiveExtractor.analyzeRegion(root);
      const sections = root.querySelectorAll('section, article, [role="region"]');
      if (sections.length > 0)
        regions.sections = Array.from(sections)
          .filter((section) => !section.closest('nav, header, footer'))
          .map((section) => ProgressiveExtractor.analyzeRegion(section));
    }
    const sidebars = root.querySelectorAll('aside, [role="complementary"], .sidebar, #sidebar');
    if (sidebars.length > 0)
      regions.sidebar = Array.from(sidebars).map((sidebar) =>
        ProgressiveExtractor.analyzeRegion(sidebar)
      );
    const footer = root.querySelector('footer, [role="contentinfo"], .footer, #footer');
    if (footer) regions.footer = ProgressiveExtractor.analyzeRegion(footer);
    const modals = root.querySelectorAll('[role="dialog"], .modal, .popup, .overlay');
    const visibleModals = Array.from(modals).filter((modal) => DOMTraversal.isVisible(modal));
    if (visibleModals.length > 0)
      regions.modals = visibleModals.map((modal) => ProgressiveExtractor.analyzeRegion(modal));
    const forms = ProgressiveExtractor.extractFormOverview(root);
    const summary = ProgressiveExtractor.calculateSummary(root, regions, forms);
    return {
      regions,
      forms,
      summary,
      suggestions: ProgressiveExtractor.generateSuggestions(regions, summary),
    };
  }
  /**
   * Step 2: Extract detailed information from a specific region
   */
  static extractRegion(selector, doc, options = {}) {
    const element = doc.querySelector(selector);
    if (!element) return null;
    return new SmartDOMReader(options).extract(element, options);
  }
  /**
   * Step 3: Extract readable content from a region
   */
  static extractContent(selector, doc, options = {}) {
    const element = doc.querySelector(selector);
    if (!element) return null;
    const result = {
      selector,
      text: {},
      metadata: {
        wordCount: 0,
        hasInteractive: false,
      },
    };
    if (options.includeHeadings !== false) {
      const headings = element.querySelectorAll('h1, h2, h3, h4, h5, h6');
      result.text.headings = Array.from(headings).map((h) => ({
        level: Number.parseInt(h.tagName[1], 10),
        text: ProgressiveExtractor.getTextContent(h, options.maxTextLength),
      }));
    }
    const paragraphs = element.querySelectorAll('p');
    if (paragraphs.length > 0)
      result.text.paragraphs = Array.from(paragraphs)
        .map((p) => ProgressiveExtractor.getTextContent(p, options.maxTextLength))
        .filter((text) => text.length > 0);
    if (options.includeLists !== false) {
      const lists = element.querySelectorAll('ul, ol');
      result.text.lists = Array.from(lists).map((list) => ({
        type: list.tagName.toLowerCase(),
        items: Array.from(list.querySelectorAll('li')).map((li) =>
          ProgressiveExtractor.getTextContent(li, options.maxTextLength)
        ),
      }));
    }
    if (options.includeTables !== false) {
      const tables = element.querySelectorAll('table');
      result.tables = Array.from(tables).map((table) => {
        return {
          headers: Array.from(table.querySelectorAll('th')).map((th) =>
            ProgressiveExtractor.getTextContent(th)
          ),
          rows: Array.from(table.querySelectorAll('tr'))
            .filter((tr) => tr.querySelector('td'))
            .map((tr) =>
              Array.from(tr.querySelectorAll('td')).map((td) =>
                ProgressiveExtractor.getTextContent(td)
              )
            ),
        };
      });
    }
    if (options.includeMedia !== false) {
      const images = element.querySelectorAll('img');
      const videos = element.querySelectorAll('video');
      const audios = element.querySelectorAll('audio');
      result.media = [
        ...Array.from(images).map((img) => {
          const item = { type: 'img' };
          const alt = img.getAttribute('alt');
          const src = img.getAttribute('src');
          if (alt) item.alt = alt;
          if (src) item.src = src;
          return item;
        }),
        ...Array.from(videos).map((video) => {
          const item = { type: 'video' };
          const src = video.getAttribute('src');
          if (src) item.src = src;
          return item;
        }),
        ...Array.from(audios).map((audio) => {
          const item = { type: 'audio' };
          const src = audio.getAttribute('src');
          if (src) item.src = src;
          return item;
        }),
      ];
    }
    const allText = element.textContent || '';
    result.metadata.wordCount = allText.trim().split(/\s+/).length;
    result.metadata.hasInteractive =
      element.querySelectorAll('button, a, input, textarea, select').length > 0;
    return result;
  }
  /**
   * Analyze a region and extract summary information
   */
  static analyzeRegion(element) {
    const selector = SelectorGenerator.generateSelectors(element).css;
    const buttons = element.querySelectorAll('button, [role="button"]');
    const links = element.querySelectorAll('a[href]');
    const inputs = element.querySelectorAll('input, textarea, select');
    const forms = element.querySelectorAll('form');
    const lists = element.querySelectorAll('ul, ol');
    const tables = element.querySelectorAll('table');
    const media = element.querySelectorAll('img, video, audio');
    const interactiveCount = buttons.length + links.length + inputs.length;
    let label;
    const ariaLabel = element.getAttribute('aria-label');
    if (ariaLabel) label = ariaLabel;
    else if (element.getAttribute('aria-labelledby')) {
      const labelId = element.getAttribute('aria-labelledby');
      if (labelId) {
        const labelElement = element.ownerDocument?.getElementById(labelId);
        if (labelElement) label = labelElement.textContent?.trim();
      }
    } else {
      const heading = element.querySelector('h1, h2, h3');
      if (heading) label = heading.textContent?.trim();
    }
    const textContent = element.textContent?.trim() || '';
    const textPreview =
      textContent.length > 50 ? `${textContent.substring(0, 50)}...` : textContent;
    const regionInfo = {
      selector,
      interactiveCount,
      hasForm: forms.length > 0,
      hasList: lists.length > 0,
      hasTable: tables.length > 0,
      hasMedia: media.length > 0,
    };
    if (label) regionInfo.label = label;
    const role = element.getAttribute('role');
    if (role) regionInfo.role = role;
    if (buttons.length > 0) regionInfo.buttonCount = buttons.length;
    if (links.length > 0) regionInfo.linkCount = links.length;
    if (inputs.length > 0) regionInfo.inputCount = inputs.length;
    if (textPreview.length > 0) regionInfo.textPreview = textPreview;
    return regionInfo;
  }
  /**
   * Extract overview of forms on the page
   */
  static extractFormOverview(root) {
    const forms = root.querySelectorAll('form');
    return Array.from(forms).map((form) => {
      const inputs = form.querySelectorAll('input, textarea, select');
      const selector = SelectorGenerator.generateSelectors(form).css;
      let location = 'unknown';
      if (form.closest('header, [role="banner"]')) location = 'header';
      else if (form.closest('nav, [role="navigation"]')) location = 'navigation';
      else if (form.closest('main, [role="main"]')) location = 'main';
      else if (form.closest('aside, [role="complementary"]')) location = 'sidebar';
      else if (form.closest('footer, [role="contentinfo"]')) location = 'footer';
      let purpose;
      const formId = form.getAttribute('id')?.toLowerCase();
      const formClass = form.getAttribute('class')?.toLowerCase();
      const formAction = form.getAttribute('action')?.toLowerCase();
      const hasEmail = form.querySelector('input[type="email"]');
      const hasPassword = form.querySelector('input[type="password"]');
      if (
        form.querySelector('input[type="search"]') ||
        formId?.includes('search') ||
        formClass?.includes('search')
      )
        purpose = 'search';
      else if (hasPassword && hasEmail) purpose = 'login';
      else if (hasPassword) purpose = 'authentication';
      else if (formId?.includes('contact') || formClass?.includes('contact')) purpose = 'contact';
      else if (formId?.includes('subscribe') || formClass?.includes('subscribe'))
        purpose = 'subscription';
      else if (formAction?.includes('checkout') || formClass?.includes('checkout'))
        purpose = 'checkout';
      const formOverview = {
        selector,
        location,
        inputCount: inputs.length,
      };
      if (purpose) formOverview.purpose = purpose;
      return formOverview;
    });
  }
  /**
   * Calculate summary statistics
   */
  static calculateSummary(root, regions, forms) {
    const allInteractive = root.querySelectorAll('button, a[href], input, textarea, select');
    const allSections = root.querySelectorAll('section, article, [role="region"]');
    const hasModals = (regions.modals?.length || 0) > 0;
    const hasErrors = ['.error', '.alert-danger', '[role="alert"]'].some((sel) => {
      const element = root.querySelector(sel);
      return element ? DOMTraversal.isVisible(element) : false;
    });
    const isLoading = ['.loading', '.spinner', '[aria-busy="true"]'].some((sel) => {
      const element = root.querySelector(sel);
      return element ? DOMTraversal.isVisible(element) : false;
    });
    const summary = {
      totalInteractive: allInteractive.length,
      totalForms: forms.length,
      totalSections: allSections.length,
      hasModals,
      hasErrors,
      isLoading,
    };
    const mainContentSelector = regions.main?.selector;
    if (mainContentSelector) summary.mainContentSelector = mainContentSelector;
    return summary;
  }
  /**
   * Generate AI-friendly suggestions
   */
  static generateSuggestions(regions, summary) {
    const suggestions = [];
    if (summary.hasErrors)
      suggestions.push('Page has error indicators - check error messages before interacting');
    if (summary.isLoading)
      suggestions.push('Page appears to be loading - wait or check loading state');
    if (summary.hasModals)
      suggestions.push('Modal/dialog is open - may need to interact with or close it first');
    if (regions.main && regions.main.interactiveCount > 10)
      suggestions.push(
        `Main content has ${regions.main.interactiveCount} interactive elements - consider filtering`
      );
    if (summary.totalForms > 0) suggestions.push(`Found ${summary.totalForms} form(s) on the page`);
    if (!regions.main)
      suggestions.push('No clear main content area detected - may need to explore regions');
    return suggestions;
  }
  /**
   * Get text content with optional truncation
   */
  static getTextContent(element, maxLength) {
    const text = element.textContent?.trim() || '';
    if (maxLength && text.length > maxLength) return `${text.substring(0, maxLength)}...`;
    return text;
  }
};
//#endregion
export {
  ContentDetection,
  MarkdownFormatter,
  ProgressiveExtractor,
  SelectorGenerator,
  SmartDOMReader,
  SmartDOMReader as default,
};

//# sourceMappingURL=index.mjs.map
