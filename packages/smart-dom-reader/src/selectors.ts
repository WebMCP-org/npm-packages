import type { ElementSelector, ElementSelectorCandidate } from './types';

const TEST_ID_ATTRIBUTES = ['data-testid', 'data-test-id', 'data-test', 'data-cy'] as const;

interface TestIdAttribute {
  attribute: (typeof TEST_ID_ATTRIBUTES)[number];
  value: string;
}

type SelectorRoot = Document | DocumentFragment;

export class SelectorGenerator {
  /**
   * Generate multiple selector strategies for an element
   */
  static generateSelectors(element: Element): ElementSelector {
    const root = SelectorGenerator.getSelectorRoot(element);
    const candidates: ElementSelectorCandidate[] = [];

    // 1) Unique ID
    if (element.id && SelectorGenerator.isUniqueId(element.id, element, root)) {
      candidates.push({ type: 'id', value: `#${CSS.escape(element.id)}`, score: 100 });
    }

    // 2) data-testid variants
    const testId = SelectorGenerator.getDataTestAttribute(element);
    if (testId) {
      const v = `[${testId.attribute}="${CSS.escape(testId.value)}"]`;
      candidates.push({
        type: 'data-testid',
        value: v,
        score: 90 + (SelectorGenerator.isUniqueSelectorForElement(v, element, root) ? 5 : 0),
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
        score: 85 + (SelectorGenerator.isUniqueSelectorForElement(v, element, root) ? 5 : 0),
      });
    }

    // 4) name attribute (useful for inputs)
    const nameAttr = element.getAttribute('name');
    if (nameAttr) {
      const v = `[name="${CSS.escape(nameAttr)}"]`;
      candidates.push({
        type: 'name',
        value: v,
        score: 78 + (SelectorGenerator.isUniqueSelectorForElement(v, element, root) ? 5 : 0),
      });
    }

    // 5) Class-based CSS path (try to avoid structural :nth-child when possible)
    const pathCss = SelectorGenerator.generateCSSSelector(element, root);
    const structuralPenalty = (pathCss.match(/:nth-child\(/g) || []).length * 10;
    const classBonus = pathCss.includes('.') ? 8 : 0;
    const pathScore = Math.max(0, 70 + classBonus - structuralPenalty);
    candidates.push({ type: 'class-path', value: pathCss, score: pathScore });

    // 6) XPath (fallback)
    const xpath = SelectorGenerator.generateXPath(element, root);
    candidates.push({ type: 'xpath', value: xpath, score: 40 });

    // 7) Text-based (only for hints)
    const textBased = SelectorGenerator.generateTextBasedSelector(element);
    if (textBased) candidates.push({ type: 'text', value: textBased, score: 30 });

    // Rank candidates by score (desc)
    candidates.sort((a, b) => b.score - a.score);

    const bestCss =
      candidates.find(
        (candidate) =>
          candidate.type !== 'xpath' &&
          candidate.type !== 'text' &&
          SelectorGenerator.isUniqueSelectorForElement(candidate.value, element, root)
      )?.value ?? pathCss;

    const selector: ElementSelector = {
      css: bestCss,
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
  private static generateCSSSelector(element: Element, root: SelectorRoot): string {
    // If element has a unique ID, use it
    if (element.id && SelectorGenerator.isUniqueId(element.id, element, root)) {
      return `#${CSS.escape(element.id)}`;
    }

    // Try data-testid or data-test-id
    const testId = SelectorGenerator.getDataTestAttribute(element);
    if (testId) {
      const selector = `[${testId.attribute}="${CSS.escape(testId.value)}"]`;
      if (SelectorGenerator.isUniqueSelectorForElement(selector, element, root)) {
        return selector;
      }
    }

    // Build a path from the element to the root
    const path: string[] = [];
    let current: Element | null = element;

    while (current && current.nodeType === Node.ELEMENT_NODE) {
      let selector = current.nodeName.toLowerCase();

      if (current.id && SelectorGenerator.isUniqueId(current.id, current, root)) {
        selector = `#${CSS.escape(current.id)}`;
        path.unshift(selector);
        break;
      }

      // Add classes if they exist and are meaningful
      const classes = SelectorGenerator.getMeaningfulClasses(current);
      if (classes.length > 0) {
        selector += `.${classes.map((c) => CSS.escape(c)).join('.')}`;
      }

      // Sibling index uses parentNode so ShadowRoot children are counted.
      // Always pin nth-child when there are element siblings: uniqueness in
      // the parent is not enough (a nested same-tag node can share the leaf).
      const parent = SelectorGenerator.getSelectorParent(current);
      const siblings = SelectorGenerator.getElementChildren(parent);
      if (siblings.length > 1) {
        const index = siblings.indexOf(current);
        if (index >= 0) {
          selector += `:nth-child(${index + 1})`;
        }
      }

      path.unshift(selector);
      current = current.parentElement;
    }

    // Optimize the path
    return SelectorGenerator.optimizePath(path, element, root);
  }

  /**
   * Generate XPath for an element
   */
  private static generateXPath(element: Element, root: SelectorRoot): string {
    if (element.id && SelectorGenerator.isUniqueId(element.id, element, root)) {
      return `//*[@id="${element.id}"]`;
    }

    const path: string[] = [];
    let current: Element | null = element;

    while (current && current.nodeType === Node.ELEMENT_NODE) {
      const tagName = current.nodeName.toLowerCase();

      if (current.id && SelectorGenerator.isUniqueId(current.id, current, root)) {
        path.unshift(`//*[@id="${current.id}"]`);
        break;
      }

      let xpath = tagName;

      // Add index if there are siblings with same tag (including ShadowRoot children)
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
  private static getDataTestAttribute(element: Element): TestIdAttribute | undefined {
    for (const attribute of TEST_ID_ATTRIBUTES) {
      const value = element.getAttribute(attribute);
      if (value) return { attribute, value };
    }
    return undefined;
  }

  /**
   * Get the document or shadow root that owns the element's selector scope
   */
  private static getSelectorRoot(element: Element): SelectorRoot {
    const root = element.getRootNode();
    if (root.nodeType === Node.DOCUMENT_NODE || root.nodeType === Node.DOCUMENT_FRAGMENT_NODE) {
      return root as SelectorRoot;
    }
    return element.ownerDocument || document;
  }

  /**
   * Check if an ID uniquely identifies the element in its selector scope
   */
  private static isUniqueId(id: string, element: Element, root: SelectorRoot): boolean {
    return SelectorGenerator.isUniqueSelectorForElement(`#${CSS.escape(id)}`, element, root);
  }

  /**
   * Parent used for sibling position: Element, Document, or ShadowRoot.
   * parentElement is null when the parent is a ShadowRoot.
   */
  private static getSelectorParent(element: Element): SelectorRoot | Element | null {
    const parent = element.parentNode;
    if (!parent) return null;
    if (parent.nodeType === Node.ELEMENT_NODE) return parent as Element;
    if (parent.nodeType === Node.DOCUMENT_NODE || parent.nodeType === Node.DOCUMENT_FRAGMENT_NODE) {
      return parent as SelectorRoot;
    }
    return null;
  }

  private static getElementChildren(parent: SelectorRoot | Element | null): Element[] {
    if (!parent) return [];
    return Array.from(parent.children);
  }

  private static isUniqueSelectorForElement(
    selector: string,
    element: Element,
    root: SelectorRoot
  ): boolean {
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
   * Optimize the selector path by removing unnecessary parts.
   * If a descendant-only path collides (direct child vs nested same tag),
   * fall back to `:host >` (shadow) or `:scope >` (document) so the match
   * is a child of the selector root. `:scope >` is empty inside ShadowRoot.
   */
  private static optimizePath(path: string[], element: Element, root: SelectorRoot): string {
    const joined = path.join(' > ');
    const childPrefix = root.nodeType === Node.DOCUMENT_FRAGMENT_NODE ? ':host > ' : ':scope > ';
    const attempts: string[] = [];
    if (SelectorGenerator.getSelectorParent(element) === root) {
      attempts.push(`${childPrefix}${joined}`);
    }
    for (let i = 0; i < path.length; i++) {
      attempts.push(path.slice(i).join(' > '));
    }
    for (let i = 0; i < path.length; i++) {
      attempts.push(`${childPrefix}${path.slice(i).join(' > ')}`);
    }

    for (const candidate of attempts) {
      if (SelectorGenerator.isUniqueSelectorForElement(candidate, element, root)) {
        return candidate;
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
