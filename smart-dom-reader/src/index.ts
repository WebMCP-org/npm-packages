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

export { ContentDetection } from './content-detection';
export { ProgressiveExtractor } from './progressive';
export { SelectorGenerator } from './selectors';
export * from './types';

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
   * Main extraction method
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
    let container: Element | Document = doc;
    if (options.mainContentOnly) {
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
    const landmarkElements = ContentDetection.detectLandmarks(doc);

    return {
      navigation: landmarkElements.navigation.map(
        (el) => SelectorGenerator.generateSelectors(el).css
      ),
      main: landmarkElements.main.map((el) => SelectorGenerator.generateSelectors(el).css),
      forms: Array.from(doc.querySelectorAll('form')).map(
        (el) => SelectorGenerator.generateSelectors(el).css
      ),
      headers: Array.from(doc.querySelectorAll('header, [role="banner"]')).map(
        (el) => SelectorGenerator.generateSelectors(el).css
      ),
      footers: Array.from(doc.querySelectorAll('footer, [role="contentinfo"]')).map(
        (el) => SelectorGenerator.generateSelectors(el).css
      ),
      articles: Array.from(doc.querySelectorAll('article')).map(
        (el) => SelectorGenerator.generateSelectors(el).css
      ),
      sections: Array.from(
        doc.querySelectorAll('section[aria-label], section[aria-labelledby]')
      ).map((el) => SelectorGenerator.generateSelectors(el).css),
    };
  }

  /**
   * Extract interactive elements
   */
  private extractInteractiveElements(container: Element | Document, options: ExtractionOptions) {
    const elements = DOMTraversal.getInteractiveElements(container, options);

    // Categorize elements
    const buttons: ExtractedElement[] = [];
    const links: ExtractedElement[] = [];
    const inputs: ExtractedElement[] = [];
    const clickable: ExtractedElement[] = [];

    for (const element of elements) {
      const tag = element.tag;

      if (tag === 'button' || element.attributes.role === 'button') {
        buttons.push(element);
      } else if (tag === 'a' && element.attributes.href) {
        links.push(element);
      } else if (['input', 'textarea', 'select'].includes(tag)) {
        inputs.push(element);
      } else if (element.interaction.click) {
        clickable.push(element);
      }
    }

    // Extract forms
    const forms = this.extractForms(container, options);

    return { buttons, links, inputs, forms, clickable };
  }

  /**
   * Extract form information
   */
  private extractForms(container: Element | Document, options: ExtractionOptions): FormInfo[] {
    const forms: FormInfo[] = [];
    const formElements = container.querySelectorAll('form');

    for (const form of Array.from(formElements)) {
      const formInputs = form.querySelectorAll('input:not([type="hidden"]), textarea, select');
      const formButtons = form.querySelectorAll(
        'button, input[type="submit"], input[type="button"]'
      );

      const formInfo: FormInfo = {
        selector: SelectorGenerator.generateSelectors(form).css,
        action: form.getAttribute('action') || undefined,
        method: form.getAttribute('method') || undefined,
        inputs: [],
        buttons: [],
      };

      // Extract form inputs
      for (const input of Array.from(formInputs)) {
        const extracted = DOMTraversal.extractElement(input, options);
        if (extracted) {
          formInfo.inputs.push(extracted);
        }
      }

      // Extract form buttons
      for (const button of Array.from(formButtons)) {
        const extracted = DOMTraversal.extractElement(button, options);
        if (extracted) {
          formInfo.buttons.push(extracted);
        }
      }

      forms.push(formInfo);
    }

    return forms;
  }

  /**
   * Extract semantic elements (full mode)
   */
  private extractSemanticElements(container: Element | Document, options: ExtractionOptions) {
    const elements = DOMTraversal.getSemanticElements(container, options);

    const headings: ExtractedElement[] = [];
    const images: ExtractedElement[] = [];
    const tables: ExtractedElement[] = [];
    const lists: ExtractedElement[] = [];
    const articles: ExtractedElement[] = [];

    for (const element of elements) {
      const tag = element.tag;

      if (/^h[1-6]$/.test(tag)) {
        headings.push(element);
      } else if (tag === 'img') {
        images.push(element);
      } else if (tag === 'table') {
        tables.push(element);
      } else if (['ul', 'ol', 'dl'].includes(tag)) {
        lists.push(element);
      } else if (tag === 'article') {
        articles.push(element);
      }
    }

    return { headings, images, tables, lists, articles };
  }

  /**
   * Extract metadata
   */
  private extractMetadata(
    doc: Document,
    container: Element | Document,
    options: ExtractionOptions
  ) {
    const allElements = container.querySelectorAll('*');
    const mainContent = options.mainContentOnly ? container : ContentDetection.findMainContent(doc);

    return {
      totalElements: allElements.length,
      extractedElements: this.countExtractedElements(),
      mainContent: SelectorGenerator.generateSelectors(mainContent as Element).css,
      language: doc.documentElement.lang || undefined,
    };
  }

  /**
   * Detect if page has errors
   */
  private detectErrors(doc: Document): boolean {
    // Check for common error indicators
    const errorSelectors = [
      '.error',
      '.alert-danger',
      '.alert-error',
      '[role="alert"]',
      '.validation-error',
      '.form-error',
      '.field-error',
    ];

    for (const selector of errorSelectors) {
      const errorElement = doc.querySelector(selector);
      if (errorElement && DOMTraversal.isVisible(errorElement)) {
        return true;
      }
    }

    // Check for error text patterns
    const bodyText = doc.body?.textContent?.toLowerCase() || '';
    const errorPatterns = ['error occurred', 'something went wrong', 'unable to process'];

    return errorPatterns.some((pattern) => bodyText.includes(pattern));
  }

  /**
   * Detect if page is loading
   */
  private detectLoading(doc: Document): boolean {
    // Check for loading indicators
    const loadingSelectors = [
      '.loading',
      '.spinner',
      '.loader',
      '[aria-busy="true"]',
      '.skeleton',
      '.placeholder-loading',
    ];

    for (const selector of loadingSelectors) {
      const loadingElement = doc.querySelector(selector);
      if (loadingElement && DOMTraversal.isVisible(loadingElement)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Detect if page has modals
   */
  private detectModals(doc: Document): boolean {
    // Check for modal indicators
    const modalSelectors = [
      '.modal.show',
      '.modal.open',
      '.modal.active',
      '[role="dialog"][aria-hidden="false"]',
      '.overlay:not([hidden])',
      '.popup:not([hidden])',
    ];

    for (const selector of modalSelectors) {
      const modalElement = doc.querySelector(selector);
      if (modalElement && DOMTraversal.isVisible(modalElement)) {
        return true;
      }
    }

    // Check if body has modal-open class
    return doc.body?.classList.contains('modal-open') || false;
  }

  /**
   * Get currently focused element
   */
  private getFocusedElement(doc: Document): string | undefined {
    const focused = doc.activeElement;
    if (focused && focused !== doc.body && focused !== doc.documentElement) {
      return SelectorGenerator.generateSelectors(focused).css;
    }
    return undefined;
  }

  /**
   * Count extracted elements (for metadata)
   */
  private countExtractedElements(): number {
    // This would be tracked during extraction
    // For now, return 0 as placeholder
    return 0;
  }

  /**
   * Quick extraction method for interactive elements only
   */
  static extractInteractive(options: Partial<ExtractionOptions> = {}): SmartDOMResult {
    const reader = new SmartDOMReader({
      ...options,
      mode: 'interactive',
    });
    return reader.extract();
  }

  /**
   * Full extraction method
   */
  static extractFull(options: Partial<ExtractionOptions> = {}): SmartDOMResult {
    const reader = new SmartDOMReader({
      ...options,
      mode: 'full',
    });
    return reader.extract();
  }

  /**
   * Extract from a specific element
   */
  static extractFromElement(
    element: Element,
    mode: ExtractionMode = 'interactive'
  ): ExtractedElement | null {
    const options: ExtractionOptions = {
      mode,
      maxDepth: 3,
      includeHidden: false,
      includeShadowDOM: true,
      includeIframes: false,
      viewportOnly: false,
      mainContentOnly: false,
    };

    return DOMTraversal.extractElement(element, options);
  }

  /**
   * Progressive extraction: Step 1 - Get structural overview
   */
  static getStructure() {
    const { ProgressiveExtractor } = require('./progressive');
    return ProgressiveExtractor.extractStructure();
  }

  /**
   * Progressive extraction: Step 2 - Extract specific region
   */
  static getRegion(selector: string, options: Partial<ExtractionOptions> = {}) {
    const { ProgressiveExtractor } = require('./progressive');
    return ProgressiveExtractor.extractRegion(selector, options);
  }

  /**
   * Progressive extraction: Step 3 - Read content from region
   */
  static readContent(selector: string, options: any = {}) {
    const { ProgressiveExtractor } = require('./progressive');
    return ProgressiveExtractor.extractContent(selector, options);
  }
}
