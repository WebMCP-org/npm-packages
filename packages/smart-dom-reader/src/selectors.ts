import type { ElementSelector, ElementSelectorCandidate } from './types';

export class SelectorGenerator {
  /**
   * Generate multiple selector strategies for an element
   */
  static generateSelectors(element: Element): ElementSelector {
    const doc = element.ownerDocument || document;
    const candidates: ElementSelectorCandidate[] = [];

    // 1) Unique ID
    if (element.id && SelectorGenerator.isUniqueId(element.id, doc)) {
      candidates.push({ type: 'id', value: `#${CSS.escape(element.id)}`, score: 100 });
    }

    // 2) data-testid variants
    const testId = SelectorGenerator.getDataTestId(element);
    if (testId) {
      const v = `[data-testid="${CSS.escape(testId)}"]`;
      candidates.push({
        type: 'data-testid',
        value: v,
        score: 90 + (SelectorGenerator.isUniqueSelectorSafe(v, doc) ? 5 : 0),
      });
    }

    // 3) role + aria-label
    const role = element.getAttribute('role');
    const aria = element.getAttribute('aria-label');
    if (role && aria) {
      const v = `[role="${CSS.escape(role)}"][aria-label="${CSS.escape(aria)}"]`;
      candidates.push({
        type: 'role-aria',
        value: v,
        score: 85 + (SelectorGenerator.isUniqueSelectorSafe(v, doc) ? 5 : 0),
      });
    }

    // 4) name attribute (useful for inputs)
    const nameAttr = element.getAttribute('name');
    if (nameAttr) {
      const v = `[name="${CSS.escape(nameAttr)}"]`;
      candidates.push({
        type: 'name',
        value: v,
        score: 78 + (SelectorGenerator.isUniqueSelectorSafe(v, doc) ? 5 : 0),
      });
    }

    // 5) Class-based CSS path (try to avoid structural :nth-child when possible)
    const pathCss = SelectorGenerator.generateCSSSelector(element, doc);
    const structuralPenalty = (pathCss.match(/:nth-child\(/g) || []).length * 10;
    const classBonus = pathCss.includes('.') ? 8 : 0;
    const pathScore = Math.max(0, 70 + classBonus - structuralPenalty);
    candidates.push({ type: 'class-path', value: pathCss, score: pathScore });

    // 6) XPath (fallback)
    const xpath = SelectorGenerator.generateXPath(element, doc);
    candidates.push({ type: 'xpath', value: xpath, score: 40 });

    // 7) Text-based (only for hints)
    const textBased = SelectorGenerator.generateTextBasedSelector(element);
    if (textBased) candidates.push({ type: 'text', value: textBased, score: 30 });

    // Rank candidates by score (desc)
    candidates.sort((a, b) => b.score - a.score);

    const bestCss =
      candidates.find((c) => c.type !== 'xpath' && c.type !== 'text')?.value || pathCss;

    const selector: ElementSelector = {
      css: bestCss,
      xpath,
      candidates,
    };

    if (textBased) selector.textBased = textBased;
    if (testId) selector.dataTestId = testId;
    if (aria) selector.ariaLabel = aria;

    return selector;
  }

  /**
   * Generate a unique CSS selector for an element
   */
  private static generateCSSSelector(element: Element, doc: Document): string {
    // If element has a unique ID, use it
    if (element.id && SelectorGenerator.isUniqueId(element.id, doc)) {
      return `#${CSS.escape(element.id)}`;
    }

    // Try data-testid or data-test-id
    const testId = SelectorGenerator.getDataTestId(element);
    if (testId) {
      return `[data-testid="${CSS.escape(testId)}"]`;
    }

    // Build a path from the element to the root
    const path: string[] = [];
    let current: Element | null = element;

    while (current && current.nodeType === Node.ELEMENT_NODE) {
      let selector = current.nodeName.toLowerCase();

      if (current.id && SelectorGenerator.isUniqueId(current.id, doc)) {
        selector = `#${CSS.escape(current.id)}`;
        path.unshift(selector);
        break;
      }

      // Add classes if they exist and are meaningful
      const classes = SelectorGenerator.getMeaningfulClasses(current);
      if (classes.length > 0) {
        selector += `.${classes.map((c) => CSS.escape(c)).join('.')}`;
      }

      // Add position if needed for uniqueness
      const siblings = current.parentElement?.children;
      if (siblings && siblings.length > 1) {
        const index = Array.from(siblings).indexOf(current);
        if (index > 0 || !SelectorGenerator.isUniqueSelector(selector, current.parentElement!)) {
          selector += `:nth-child(${index + 1})`;
        }
      }

      path.unshift(selector);
      current = current.parentElement;
    }

    // Optimize the path
    return SelectorGenerator.optimizePath(path, element, doc);
  }

  /**
   * Generate XPath for an element
   */
  private static generateXPath(element: Element, doc: Document): string {
    if (element.id && SelectorGenerator.isUniqueId(element.id, doc)) {
      return `//*[@id="${element.id}"]`;
    }

    const path: string[] = [];
    let current: Element | null = element;

    while (current && current.nodeType === Node.ELEMENT_NODE) {
      const tagName = current.nodeName.toLowerCase();

      if (current.id && SelectorGenerator.isUniqueId(current.id, doc)) {
        path.unshift(`//*[@id="${current.id}"]`);
        break;
      }

      let xpath = tagName;

      // Add index if there are siblings with same tag
      const siblings = current.parentElement?.children;
      if (siblings) {
        const sameTagSiblings = Array.from(siblings).filter(
          (s) => s.nodeName.toLowerCase() === tagName
        );
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
  private static generateTextBasedSelector(element: Element): string | undefined {
    const text = element.textContent?.trim();
    if (!text || text.length > 50) return undefined;

    const tag = element.nodeName.toLowerCase();
    if (['button', 'a', 'label'].includes(tag)) {
      // Escape special characters in text
      const escapedText = text.replace(/['"\\]/g, '\\$&');
      return `${tag}:contains("${escapedText}")`;
    }

    return undefined;
  }

  /**
   * Get data-testid or similar attributes
   */
  private static getDataTestId(element: Element): string | undefined {
    return (
      element.getAttribute('data-testid') ||
      element.getAttribute('data-test-id') ||
      element.getAttribute('data-test') ||
      element.getAttribute('data-cy') ||
      undefined
    );
  }

  /**
   * Check if an ID is unique in the document
   */
  private static isUniqueId(id: string, doc: Document): boolean {
    return doc.querySelectorAll(`#${CSS.escape(id)}`).length === 1;
  }

  /**
   * Check if a selector is unique within a container
   */
  private static isUniqueSelector(selector: string, container: Element): boolean {
    try {
      return container.querySelectorAll(selector).length === 1;
    } catch {
      return false;
    }
  }

  private static isUniqueSelectorSafe(selector: string, doc: Document): boolean {
    try {
      return doc.querySelectorAll(selector).length === 1;
    } catch {
      return false;
    }
  }

  /**
   * Get meaningful classes (filtering out utility classes)
   */
  private static getMeaningfulClasses(element: Element): string[] {
    const classes = Array.from(element.classList);

    // Filter out common utility classes
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
        // Keep semantic classes
        if (cls.length < 3) return false;
        return !utilityPatterns.some((pattern) => pattern.test(cls));
      })
      .slice(0, 2); // Limit to 2 most meaningful classes
  }

  /**
   * Optimize the selector path by removing unnecessary parts
   */
  private static optimizePath(path: string[], element: Element, doc: Document): string {
    // Try progressively shorter paths
    for (let i = 0; i < path.length - 1; i++) {
      const shortPath = path.slice(i).join(' > ');
      try {
        const matches = doc.querySelectorAll(shortPath);
        if (matches.length === 1 && matches[0] === element) {
          return shortPath;
        }
      } catch {
        // Invalid selector, continue
      }
    }

    return path.join(' > ');
  }

  /**
   * Get a human-readable path description
   */
  static getContextPath(element: Element): string[] {
    const path: string[] = [];
    let current: Element | null = element;
    let depth = 0;
    const maxDepth = 5;

    while (current && current !== element.ownerDocument?.body && depth < maxDepth) {
      const tag = current.nodeName.toLowerCase();
      let descriptor = tag;

      // Add semantic information
      if (current.id) {
        descriptor = `${tag}#${current.id}`;
      } else if (current.className && typeof current.className === 'string') {
        const firstClass = current.className.split(' ')[0];
        if (firstClass) {
          descriptor = `${tag}.${firstClass}`;
        }
      }

      // Add role information
      const role = current.getAttribute('role');
      if (role) {
        descriptor += `[role="${role}"]`;
      }

      path.unshift(descriptor);
      current = current.parentElement;
      depth++;
    }

    return path;
  }
}
