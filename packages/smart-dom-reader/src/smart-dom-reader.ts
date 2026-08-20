import { ContentDetection } from './content-detection';
import { SelectorGenerator } from './selectors';
import { DOMTraversal } from './traversal';
import type {
  ExtractedElement,
  ExtractionMode,
  ExtractionOptions,
  FormInfo,
  PageLandmarks,
  PageState,
  SmartDOMResult,
} from './types';

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
      includeShadowDOM: options.includeShadowDOM ?? true,
      includeIframes: options.includeIframes || false,
      viewportOnly: options.viewportOnly || false,
      mainContentOnly: options.mainContentOnly || false,
      customSelectors: options.customSelectors || [],
      ...(options.attributeTruncateLength !== undefined && {
        attributeTruncateLength: options.attributeTruncateLength,
      }),
      ...(options.dataAttributeTruncateLength !== undefined && {
        dataAttributeTruncateLength: options.dataAttributeTruncateLength,
      }),
      ...(options.textTruncateLength !== undefined && {
        textTruncateLength: options.textTruncateLength,
      }),
      ...(options.filter !== undefined && { filter: options.filter }),
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
    const rootIsDocument = DOMTraversal.isDocument(rootElement);
    const doc = rootIsDocument ? rootElement : rootElement.ownerDocument!;

    // Merge runtime options with constructor options
    const options: ExtractionOptions = { ...this.options, ...runtimeOptions };

    // Determine the container to search
    // IMPORTANT: Respect the provided rootElement when it's an Element.
    // Previous behavior incorrectly defaulted to the whole document, causing
    // region-scoped extractions to include page-wide data.
    let container: Element | Document = rootIsDocument ? doc : rootElement;
    // Only override container with detected main content when starting from the document.
    if (options.mainContentOnly && rootIsDocument) {
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
  private extractPageState(doc: Document): PageState {
    const hasFocus = this.getFocusedElement(doc);
    return {
      url: doc.location?.href || '',
      title: doc.title || '',
      hasErrors: this.detectErrors(doc),
      isLoading: this.detectLoading(doc),
      hasModals: this.detectModals(doc),
      ...(hasFocus !== undefined && { hasFocus }),
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

  private querySelectorAll(
    container: Document | Element | ShadowRoot,
    selector: string,
    includeShadowDOM?: boolean
  ): Element[] {
    const matches = [...container.querySelectorAll(selector)];
    if (!includeShadowDOM) return matches;

    for (const element of container.querySelectorAll('*')) {
      if (element.shadowRoot) {
        matches.push(...this.querySelectorAll(element.shadowRoot, selector, true));
      }
    }
    return matches;
  }

  /**
   * Extract every element matching a selector.
   *
   * DOMTraversal.extractElement already applies the visibility, viewport and
   * filter guards, so pre-filtering here would just repeat its
   * getBoundingClientRect/getComputedStyle work for every element.
   */
  private extractAll(
    container: Element | Document,
    selector: string,
    options: ExtractionOptions
  ): ExtractedElement[] {
    const extracted: ExtractedElement[] = [];
    for (const el of this.querySelectorAll(container, selector, options.includeShadowDOM)) {
      const element = DOMTraversal.extractElement(el, options);
      if (element) extracted.push(element);
    }
    return extracted;
  }

  /**
   * Extract interactive elements
   */
  private extractInteractiveElements(
    container: Element | Document,
    options: ExtractionOptions
  ): SmartDOMResult['interactive'] {
    const clickable: ExtractedElement[] = [];
    for (const selector of options.customSelectors ?? []) {
      clickable.push(...this.extractAll(container, selector, options));
    }

    return {
      buttons: this.extractAll(
        container,
        'button, [role="button"], input[type="button"], input[type="submit"]',
        options
      ),
      links: this.extractAll(container, 'a[href]', options),
      inputs: this.extractAll(
        container,
        'input:not([type="button"]):not([type="submit"]), textarea, select',
        options
      ),
      forms: this.extractForms(container, options),
      clickable,
    };
  }

  /**
   * Extract form information
   */
  private extractForms(container: Element | Document, options: ExtractionOptions): FormInfo[] {
    const forms: FormInfo[] = [];
    const formElements = this.querySelectorAll(container, 'form', options.includeShadowDOM);

    formElements.forEach((form) => {
      // The form itself never reaches extractElement, so it needs the guard here.
      if (!this.shouldIncludeElement(form, options)) return;

      const action = form.getAttribute('action');
      const method = form.getAttribute('method');
      const formInfo: FormInfo = {
        selector: SelectorGenerator.generateSelectors(form).css,
        inputs: this.extractAll(
          form,
          'input:not([type="button"]):not([type="submit"]), textarea, select',
          options
        ),
        buttons: this.extractAll(
          form,
          'button, input[type="button"], input[type="submit"]',
          options
        ),
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
  private extractSemanticElements(
    container: Element | Document,
    options: ExtractionOptions
  ): NonNullable<SmartDOMResult['semantic']> {
    return {
      headings: this.extractAll(container, 'h1, h2, h3, h4, h5, h6', options),
      images: this.extractAll(container, 'img', options),
      tables: this.extractAll(container, 'table', options),
      lists: this.extractAll(container, 'ul, ol', options),
      articles: this.extractAll(container, 'article, [role="article"]', options),
    };
  }

  /**
   * Extract metadata
   */
  private extractMetadata(
    doc: Document,
    container: Element | Document,
    options: ExtractionOptions
  ): NonNullable<SmartDOMResult['metadata']> {
    const allElements = this.querySelectorAll(container, '*', options.includeShadowDOM);
    const extractedElements = this.querySelectorAll(
      container,
      'button, a, input, textarea, select, h1, h2, h3, h4, h5, h6, img, table, ul, ol, article',
      options.includeShadowDOM
    ).length;

    const metadata: NonNullable<SmartDOMResult['metadata']> = {
      totalElements: allElements.length,
      extractedElements,
    };

    if (options.mainContentOnly && !DOMTraversal.isDocument(container)) {
      metadata.mainContent = SelectorGenerator.generateSelectors(container).css;
    }

    const language = doc.documentElement.getAttribute('lang');
    if (language) {
      metadata.language = language;
    }

    return metadata;
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
    options: Omit<ExtractionOptions, 'mode'> = {}
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
  static extractFull(doc: Document, options: Omit<ExtractionOptions, 'mode'> = {}): SmartDOMResult {
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
    options: Omit<ExtractionOptions, 'mode'> = {}
  ): SmartDOMResult {
    const reader = new SmartDOMReader({
      ...options,
      mode,
    });
    return reader.extract(element);
  }
}
