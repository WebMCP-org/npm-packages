import { SelectorGenerator } from './selectors';
import {
  ElementContext,
  ElementInteraction,
  ExtractedElement,
  ExtractionOptions,
  FilterOptions,
} from './types';

export class DOMTraversal {
  private static INTERACTIVE_SELECTORS = [
    'button',
    'a[href]',
    'input:not([type="hidden"])',
    'textarea',
    'select',
    '[role="button"]',
    '[onclick]',
    '[contenteditable="true"]',
    'summary',
    '[tabindex]:not([tabindex="-1"])',
  ];

  private static SEMANTIC_SELECTORS = [
    'h1',
    'h2',
    'h3',
    'h4',
    'h5',
    'h6',
    'article',
    'section',
    'nav',
    'aside',
    'main',
    'header',
    'footer',
    'form',
    'table',
    'ul',
    'ol',
    'img[alt]',
    'figure',
    'video',
    'audio',
    '[role="navigation"]',
    '[role="main"]',
    '[role="complementary"]',
    '[role="contentinfo"]',
  ];

  /**
   * Check if element is visible
   */
  static isVisible(element: Element, computedStyle?: CSSStyleDeclaration): boolean {
    const rect = element.getBoundingClientRect();
    const style = computedStyle || element.ownerDocument?.defaultView?.getComputedStyle(element);

    if (!style) return false;

    return !!(
      rect.width > 0 &&
      rect.height > 0 &&
      style.display !== 'none' &&
      style.visibility !== 'hidden' &&
      style.opacity !== '0' &&
      (element as HTMLElement).offsetParent !== null
    );
  }

  /**
   * Check if element is in viewport
   */
  static isInViewport(element: Element, viewport?: { width: number; height: number }): boolean {
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
  static passesFilter(element: Element, filter: FilterOptions | undefined): boolean {
    if (!filter) return true;

    const htmlElement = element as HTMLElement;

    // Check exclude selectors first
    if (filter.excludeSelectors?.length) {
      for (const selector of filter.excludeSelectors) {
        if (element.matches(selector)) return false;
      }
    }

    // Check include selectors
    if (filter.includeSelectors?.length) {
      let matches = false;
      for (const selector of filter.includeSelectors) {
        if (element.matches(selector)) {
          matches = true;
          break;
        }
      }
      if (!matches) return false;
    }

    // Check tag filters
    if (filter.tags?.length && !filter.tags.includes(element.tagName.toLowerCase())) {
      return false;
    }

    // Check text content filters
    const textContent = htmlElement.textContent?.toLowerCase() || '';
    if (filter.textContains?.length) {
      let hasText = false;
      for (const text of filter.textContains) {
        if (textContent.includes(text.toLowerCase())) {
          hasText = true;
          break;
        }
      }
      if (!hasText) return false;
    }

    // Check text regex patterns
    if (filter.textMatches?.length) {
      let matches = false;
      for (const pattern of filter.textMatches) {
        if (pattern.test(textContent)) {
          matches = true;
          break;
        }
      }
      if (!matches) return false;
    }

    // Check required attributes
    if (filter.hasAttributes?.length) {
      for (const attr of filter.hasAttributes) {
        if (!element.hasAttribute(attr)) return false;
      }
    }

    // Check attribute values
    if (filter.attributeValues) {
      for (const [attr, value] of Object.entries(filter.attributeValues)) {
        const attrValue = element.getAttribute(attr);
        if (!attrValue) return false;

        if (typeof value === 'string') {
          if (attrValue !== value) return false;
        } else if (value instanceof RegExp) {
          if (!value.test(attrValue)) return false;
        }
      }
    }

    // Check within selectors
    if (filter.withinSelectors?.length) {
      let isWithin = false;
      for (const selector of filter.withinSelectors) {
        if (element.closest(selector)) {
          isWithin = true;
          break;
        }
      }
      if (!isWithin) return false;
    }

    // Check interaction types
    if (filter.interactionTypes?.length) {
      const interaction = this.getInteractionInfo(element);
      let hasInteraction = false;
      for (const type of filter.interactionTypes) {
        if (interaction[type]) {
          hasInteraction = true;
          break;
        }
      }
      if (!hasInteraction) return false;
    }

    // Check nearText
    if (filter.nearText) {
      const parent = element.parentElement;
      if (!parent || !parent.textContent?.toLowerCase().includes(filter.nearText.toLowerCase())) {
        return false;
      }
    }

    return true;
  }

  /**
   * Extract element information
   */
  static extractElement(
    element: Element,
    options: ExtractionOptions,
    depth: number = 0
  ): ExtractedElement | null {
    // Check depth limit
    if (options.maxDepth && depth > options.maxDepth) {
      return null;
    }

    // Check visibility
    if (!options.includeHidden && !this.isVisible(element)) {
      return null;
    }

    // Check viewport
    if (options.viewportOnly && !this.isInViewport(element)) {
      return null;
    }

    // Apply filters
    if (!this.passesFilter(element, options.filter)) {
      return null;
    }

    const htmlElement = element as HTMLElement;

    const extracted: ExtractedElement = {
      tag: element.tagName.toLowerCase(),
      text: this.getElementText(element, options),
      selector: SelectorGenerator.generateSelectors(element),
      attributes: this.getRelevantAttributes(element, options),
      context: this.getElementContext(element),
      interaction: this.getInteractionInfo(element),
      // bounds removed to save tokens
    };

    // Extract children for semantic elements in full mode
    if (options.mode === 'full' && this.isSemanticContainer(element)) {
      const children: ExtractedElement[] = [];

      // Handle shadow DOM
      if (options.includeShadowDOM && htmlElement.shadowRoot) {
        const shadowChildren = this.extractChildren(htmlElement.shadowRoot, options, depth + 1);
        children.push(...shadowChildren);
      }

      // Handle regular children
      const regularChildren = this.extractChildren(element, options, depth + 1);
      children.push(...regularChildren);

      if (children.length > 0) {
        extracted.children = children;
      }
    }

    return extracted;
  }

  /**
   * Extract children elements
   */
  private static extractChildren(
    container: Element | ShadowRoot,
    options: ExtractionOptions,
    depth: number
  ): ExtractedElement[] {
    const children: ExtractedElement[] = [];
    const elements = container.querySelectorAll('*');

    for (const child of Array.from(elements)) {
      // Skip if element is nested inside another extracted element
      if (this.hasExtractedAncestor(child, elements)) {
        continue;
      }

      const extracted = this.extractElement(child, options, depth);
      if (extracted) {
        children.push(extracted);
      }
    }

    return children;
  }

  /**
   * Check if element has an ancestor that was already extracted
   */
  private static hasExtractedAncestor(
    element: Element,
    extractedElements: NodeListOf<Element>
  ): boolean {
    let parent = element.parentElement;
    while (parent) {
      if (Array.from(extractedElements).includes(parent)) {
        return true;
      }
      parent = parent.parentElement;
    }
    return false;
  }

  /**
   * Get relevant attributes for an element
   */
  private static getRelevantAttributes(
    element: Element,
    options: ExtractionOptions
  ): Record<string, string> {
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

    const attributes: Record<string, string> = {};
    const attrTruncate = options.attributeTruncateLength ?? 100;
    const dataAttrTruncate = options.dataAttributeTruncateLength ?? 50;

    for (const attr of relevant) {
      const value = element.getAttribute(attr);
      if (value) {
        // Truncate long values based on options
        attributes[attr] =
          value.length > attrTruncate ? value.substring(0, attrTruncate) + '...' : value;
      }
    }

    // Include data attributes
    for (const attr of element.attributes) {
      if (attr.name.startsWith('data-') && !relevant.includes(attr.name)) {
        attributes[attr.name] =
          attr.value.length > dataAttrTruncate
            ? attr.value.substring(0, dataAttrTruncate) + '...'
            : attr.value;
      }
    }

    return attributes;
  }

  /**
   * Get element context information
   */
  private static getElementContext(element: Element): ElementContext {
    const context: ElementContext = {
      parentChain: SelectorGenerator.getContextPath(element),
    };

    // Find nearest semantic containers
    const form = element.closest('form');
    if (form) {
      context.nearestForm = SelectorGenerator.generateSelectors(form).css;
    }

    const section = element.closest('section, [role="region"]');
    if (section) {
      context.nearestSection = SelectorGenerator.generateSelectors(section).css;
    }

    const main = element.closest('main, [role="main"]');
    if (main) {
      context.nearestMain = SelectorGenerator.generateSelectors(main).css;
    }

    const nav = element.closest('nav, [role="navigation"]');
    if (nav) {
      context.nearestNav = SelectorGenerator.generateSelectors(nav).css;
    }

    return context;
  }

  /**
   * Get interaction information for an element (compact format)
   */
  private static getInteractionInfo(element: Element): ElementInteraction {
    const htmlElement = element as HTMLElement;
    const interaction: ElementInteraction = {};

    // Only include true values to reduce token usage
    const hasClickHandler = !!(
      htmlElement.onclick ||
      element.getAttribute('onclick') ||
      element.matches('button, a[href], [role="button"], [tabindex]:not([tabindex="-1"])')
    );
    if (hasClickHandler) interaction.click = true;

    const hasChangeHandler = !!(
      (htmlElement as HTMLInputElement).onchange ||
      element.getAttribute('onchange') ||
      element.matches('input, select, textarea')
    );
    if (hasChangeHandler) interaction.change = true;

    const hasSubmitHandler = !!(
      (htmlElement as HTMLFormElement).onsubmit ||
      element.getAttribute('onsubmit') ||
      element.matches('form')
    );
    if (hasSubmitHandler) interaction.submit = true;

    const triggersNavigation = element.matches('a[href], button[type="submit"]');
    if (triggersNavigation) interaction.nav = true;

    const isDisabled =
      htmlElement.hasAttribute('disabled') || htmlElement.getAttribute('aria-disabled') === 'true';
    if (isDisabled) interaction.disabled = true;

    const isHidden = !this.isVisible(element);
    if (isHidden) interaction.hidden = true;

    const ariaRole = element.getAttribute('role');
    if (ariaRole) interaction.role = ariaRole;

    // Check form association
    if (element.matches('input, textarea, select, button')) {
      const form = (element as HTMLInputElement).form || element.closest('form');
      if (form) {
        interaction.form = SelectorGenerator.generateSelectors(form).css;
      }
    }

    return interaction;
  }

  /**
   * Get text content of an element (limited length)
   */
  private static getElementText(element: Element, options?: ExtractionOptions): string {
    // For input elements, get value or placeholder
    if (element.matches('input, textarea')) {
      const input = element as HTMLInputElement;
      return input.value || input.placeholder || '';
    }

    // For images, get alt text
    if (element.matches('img')) {
      return (element as HTMLImageElement).alt || '';
    }

    // Get text content, but limit length based on options
    const text = element.textContent?.trim() || '';
    const maxLength = options?.textTruncateLength;

    if (maxLength && text.length > maxLength) {
      return text.substring(0, maxLength) + '...';
    }

    return text;
  }

  /**
   * Check if element is a semantic container
   */
  private static isSemanticContainer(element: Element): boolean {
    return element.matches(
      'article, section, nav, aside, main, header, footer, form, ' +
        'table, ul, ol, dl, figure, details, dialog, [role="region"], ' +
        '[role="navigation"], [role="main"], [role="complementary"]'
    );
  }

  /**
   * Get interactive elements
   */
  static getInteractiveElements(
    container: Element | Document = document,
    options: ExtractionOptions
  ): ExtractedElement[] {
    const elements: ExtractedElement[] = [];
    const selector = this.INTERACTIVE_SELECTORS.join(', ');
    const found = container.querySelectorAll(selector);

    for (const element of Array.from(found)) {
      const extracted = this.extractElement(element, options);
      if (extracted) {
        elements.push(extracted);
      }
    }

    // Add custom selectors if provided
    if (options.customSelectors) {
      for (const customSelector of options.customSelectors) {
        try {
          const customFound = container.querySelectorAll(customSelector);
          for (const element of Array.from(customFound)) {
            const extracted = this.extractElement(element, options);
            if (extracted) {
              elements.push(extracted);
            }
          }
        } catch (e) {
          console.warn(`Invalid custom selector: ${customSelector}`);
        }
      }
    }

    return elements;
  }

  /**
   * Get semantic elements (for full mode)
   */
  static getSemanticElements(
    container: Element | Document = document,
    options: ExtractionOptions
  ): ExtractedElement[] {
    const elements: ExtractedElement[] = [];
    const selector = this.SEMANTIC_SELECTORS.join(', ');
    const found = container.querySelectorAll(selector);

    for (const element of Array.from(found)) {
      const extracted = this.extractElement(element, options);
      if (extracted) {
        elements.push(extracted);
      }
    }

    return elements;
  }
}
