import { ContentDetection } from './content-detection';
import { SelectorGenerator } from './selectors';
import { DOMTraversal } from './traversal';
import {
  ExtractedElement,
  ExtractionMode,
  ExtractionOptions,
  FormInfo,
  PageLandmarks,
  PageState,
  SmartDOMResult,
} from './types';

export type {
  ExtractContentArgs,
  ExtractFullArgs,
  ExtractInteractiveArgs,
  ExtractionArgs,
  ExtractionMethod,
  ExtractionResult,
  ExtractRegionArgs,
  ExtractStructureArgs,
} from './bundle-types';
// Re-export modules for external use
export { ContentDetection } from './content-detection';
export { type MarkdownFormatOptions, MarkdownFormatter } from './markdown-formatter';
export { ProgressiveExtractor } from './progressive';
export { SelectorGenerator } from './selectors';
export * from './types';

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
export class SmartDOMReader {
  private options: ExtractionOptions;

  constructor(options: Partial<ExtractionOptions> = {}) {
    this.options = {
      mode: options.mode || 'interactive',
      maxDepth: options.maxDepth || 5,
      includeHidden: options.includeHidden || false,
      includeShadowDOM: options.includeShadowDOM || true,
      includeIframes: options.includeIframes || false,
      viewportOnly: options.viewportOnly || false,
      mainContentOnly: options.mainContentOnly || false,
      customSelectors: options.customSelectors || [],
      attributeTruncateLength: options.attributeTruncateLength,
      dataAttributeTruncateLength: options.dataAttributeTruncateLength,
      textTruncateLength: options.textTruncateLength,
      filter: options.filter,
    };
  }

  /**
   * Main extraction method - extracts all data in one pass
   * @param rootElement The document or element to extract from
   * @param runtimeOptions Options to override constructor options
   */
  extract(
    rootElement: Document | Element = document,
    runtimeOptions?: Partial<ExtractionOptions>
  ): SmartDOMResult {
    const startTime = Date.now();
    const doc = rootElement instanceof Document ? rootElement : rootElement.ownerDocument!;

    // Merge runtime options with constructor options
    const options: ExtractionOptions = { ...this.options, ...runtimeOptions };

    // Determine the container to search
    // IMPORTANT: Respect the provided rootElement when it's an Element.
    // Previous behavior incorrectly defaulted to the whole document, causing
    // region-scoped extractions to include page-wide data.
    let container: Element | Document =
      rootElement instanceof Document ? doc : (rootElement as Element);
    // Only override container with detected main content when starting from the document.
    if (options.mainContentOnly && rootElement instanceof Document) {
      container = ContentDetection.findMainContent(doc);
    }

    // Extract page state
    const pageState = this.extractPageState(doc);

    // Extract landmarks
    const landmarks = this.extractLandmarks(doc);

    // Extract interactive elements
    const interactive = this.extractInteractiveElements(container, options);

    // Build result
    const result: SmartDOMResult = {
      mode: options.mode,
      timestamp: startTime,
      page: pageState,
      landmarks,
      interactive,
    };

    // Add semantic elements in full mode
    if (options.mode === 'full') {
      result.semantic = this.extractSemanticElements(container, options);
      result.metadata = this.extractMetadata(doc, container, options);
    }

    return result;
  }

  /**
   * Extract page state information
   */
  private extractPageState(doc: Document): PageState {
    return {
      url: doc.location?.href || '',
      title: doc.title || '',
      hasErrors: this.detectErrors(doc),
      isLoading: this.detectLoading(doc),
      hasModals: this.detectModals(doc),
      hasFocus: this.getFocusedElement(doc),
    };
  }

  /**
   * Extract page landmarks
   */
  private extractLandmarks(doc: Document): PageLandmarks {
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
  private elementsToSelectors(elements: Element[]): string[] {
    return elements.map((el) => SelectorGenerator.generateSelectors(el).css);
  }

  /**
   * Extract interactive elements
   */
  private extractInteractiveElements(
    container: Element | Document,
    options: ExtractionOptions
  ): SmartDOMResult['interactive'] {
    const buttons: ExtractedElement[] = [];
    const links: ExtractedElement[] = [];
    const inputs: ExtractedElement[] = [];
    const clickable: ExtractedElement[] = [];

    // Extract buttons
    const buttonElements = container.querySelectorAll(
      'button, [role="button"], input[type="button"], input[type="submit"]'
    );
    buttonElements.forEach((el) => {
      if (this.shouldIncludeElement(el, options)) {
        const extracted = DOMTraversal.extractElement(el, options);
        if (extracted) buttons.push(extracted);
      }
    });

    // Extract links
    const linkElements = container.querySelectorAll('a[href]');
    linkElements.forEach((el) => {
      if (this.shouldIncludeElement(el, options)) {
        const extracted = DOMTraversal.extractElement(el, options);
        if (extracted) links.push(extracted);
      }
    });

    // Extract form inputs
    const inputElements = container.querySelectorAll(
      'input:not([type="button"]):not([type="submit"]), textarea, select'
    );
    inputElements.forEach((el) => {
      if (this.shouldIncludeElement(el, options)) {
        const extracted = DOMTraversal.extractElement(el, options);
        if (extracted) inputs.push(extracted);
      }
    });

    // Extract custom selectors
    if (options.customSelectors) {
      options.customSelectors.forEach((selector) => {
        const elements = container.querySelectorAll(selector);
        elements.forEach((el) => {
          if (this.shouldIncludeElement(el, options)) {
            const extracted = DOMTraversal.extractElement(el, options);
            if (extracted) clickable.push(extracted);
          }
        });
      });
    }

    // Extract forms
    const forms = this.extractForms(container, options);

    return {
      buttons,
      links,
      inputs,
      forms,
      clickable,
    };
  }

  /**
   * Extract form information
   */
  private extractForms(container: Element | Document, options: ExtractionOptions): FormInfo[] {
    const forms: FormInfo[] = [];
    const formElements = container.querySelectorAll('form');

    formElements.forEach((form) => {
      if (!this.shouldIncludeElement(form, options)) return;

      const formInputs: ExtractedElement[] = [];
      const formButtons: ExtractedElement[] = [];

      // Extract form inputs
      const inputs = form.querySelectorAll(
        'input:not([type="button"]):not([type="submit"]), textarea, select'
      );
      inputs.forEach((input) => {
        const extracted = DOMTraversal.extractElement(input, options);
        if (extracted) formInputs.push(extracted);
      });

      // Extract form buttons
      const buttons = form.querySelectorAll('button, input[type="button"], input[type="submit"]');
      buttons.forEach((button) => {
        const extracted = DOMTraversal.extractElement(button, options);
        if (extracted) formButtons.push(extracted);
      });

      forms.push({
        selector: SelectorGenerator.generateSelectors(form).css,
        action: form.getAttribute('action') || undefined,
        method: form.getAttribute('method') || undefined,
        inputs: formInputs,
        buttons: formButtons,
      });
    });

    return forms;
  }

  /**
   * Extract semantic elements (full mode only)
   */
  private extractSemanticElements(
    container: Element | Document,
    options: ExtractionOptions
  ): SmartDOMResult['semantic'] {
    const headings: ExtractedElement[] = [];
    const images: ExtractedElement[] = [];
    const tables: ExtractedElement[] = [];
    const lists: ExtractedElement[] = [];
    const articles: ExtractedElement[] = [];

    // Extract headings
    container.querySelectorAll('h1, h2, h3, h4, h5, h6').forEach((el) => {
      if (this.shouldIncludeElement(el, options)) {
        const extracted = DOMTraversal.extractElement(el, options);
        if (extracted) headings.push(extracted);
      }
    });

    // Extract images
    container.querySelectorAll('img').forEach((el) => {
      if (this.shouldIncludeElement(el, options)) {
        const extracted = DOMTraversal.extractElement(el, options);
        if (extracted) images.push(extracted);
      }
    });

    // Extract tables
    container.querySelectorAll('table').forEach((el) => {
      if (this.shouldIncludeElement(el, options)) {
        const extracted = DOMTraversal.extractElement(el, options);
        if (extracted) tables.push(extracted);
      }
    });

    // Extract lists
    container.querySelectorAll('ul, ol').forEach((el) => {
      if (this.shouldIncludeElement(el, options)) {
        const extracted = DOMTraversal.extractElement(el, options);
        if (extracted) lists.push(extracted);
      }
    });

    // Extract articles
    container.querySelectorAll('article, [role="article"]').forEach((el) => {
      if (this.shouldIncludeElement(el, options)) {
        const extracted = DOMTraversal.extractElement(el, options);
        if (extracted) articles.push(extracted);
      }
    });

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
  private extractMetadata(
    doc: Document,
    container: Element | Document,
    options: ExtractionOptions
  ): SmartDOMResult['metadata'] {
    const allElements = container.querySelectorAll('*');
    const extractedElements = container.querySelectorAll(
      'button, a, input, textarea, select, h1, h2, h3, h4, h5, h6, img, table, ul, ol, article'
    ).length;

    return {
      totalElements: allElements.length,
      extractedElements,
      mainContent:
        options.mainContentOnly && container instanceof Element
          ? SelectorGenerator.generateSelectors(container).css
          : undefined,
      language: doc.documentElement.getAttribute('lang') || undefined,
    };
  }

  /**
   * Check if element should be included based on options
   */
  private shouldIncludeElement(element: Element, options: ExtractionOptions): boolean {
    // Check visibility
    if (!options.includeHidden && !DOMTraversal.isVisible(element)) {
      return false;
    }

    // Check viewport
    if (options.viewportOnly && !DOMTraversal.isInViewport(element)) {
      return false;
    }

    // Check custom filter
    if (options.filter && !DOMTraversal.passesFilter(element, options.filter)) {
      return false;
    }

    return true;
  }

  /**
   * Detect errors on the page
   */
  private detectErrors(doc: Document): boolean {
    const errorSelectors = ['.error', '.alert-danger', '[role="alert"]', '.error-message'];
    return errorSelectors.some((sel) => {
      const element = doc.querySelector(sel);
      return element ? DOMTraversal.isVisible(element) : false;
    });
  }

  /**
   * Detect if page is loading
   */
  private detectLoading(doc: Document): boolean {
    const loadingSelectors = ['.loading', '.spinner', '[aria-busy="true"]', '.loader'];
    return loadingSelectors.some((sel) => {
      const element = doc.querySelector(sel);
      return element ? DOMTraversal.isVisible(element) : false;
    });
  }

  /**
   * Detect modal dialogs
   */
  private detectModals(doc: Document): boolean {
    const modalSelectors = ['[role="dialog"]', '.modal', '.popup', '.overlay'];
    return modalSelectors.some((sel) => {
      const element = doc.querySelector(sel);
      return element ? DOMTraversal.isVisible(element) : false;
    });
  }

  /**
   * Get currently focused element
   */
  private getFocusedElement(doc: Document): string | undefined {
    const focused = doc.activeElement;
    if (focused && focused !== doc.body) {
      return SelectorGenerator.generateSelectors(focused).css;
    }
    return undefined;
  }

  // ===== Static convenience methods =====

  /**
   * Quick extraction for interactive elements only
   * @param doc The document to extract from
   * @param options Extraction options
   */
  static extractInteractive(
    doc: Document,
    options: Partial<ExtractionOptions> = {}
  ): SmartDOMResult {
    const reader = new SmartDOMReader({
      ...options,
      mode: 'interactive',
    });
    return reader.extract(doc);
  }

  /**
   * Quick extraction for full content
   * @param doc The document to extract from
   * @param options Extraction options
   */
  static extractFull(doc: Document, options: Partial<ExtractionOptions> = {}): SmartDOMResult {
    const reader = new SmartDOMReader({
      ...options,
      mode: 'full',
    });
    return reader.extract(doc);
  }

  /**
   * Extract from a specific element
   * @param element The element to extract from
   * @param mode The extraction mode
   * @param options Additional options
   */
  static extractFromElement(
    element: Element,
    mode: ExtractionMode = 'interactive',
    options: Partial<ExtractionOptions> = {}
  ): SmartDOMResult {
    const reader = new SmartDOMReader({
      ...options,
      mode,
    });
    return reader.extract(element);
  }
}

/**
 * Default export for convenience - full extraction approach
 */
export default SmartDOMReader;
