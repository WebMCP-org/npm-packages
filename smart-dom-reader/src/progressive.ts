import { ContentDetection } from './content-detection';
import type { SmartDOMReader as SmartDOMReaderClass } from './index';
import { SelectorGenerator } from './selectors';
import { DOMTraversal } from './traversal';
import {
  ContentExtractionOptions,
  ExtractedContent,
  ExtractionOptions,
  RegionInfo,
  SmartDOMResult,
  StructuralOverview,
} from './types';

type SmartDomReaderNamespace = typeof import('./index');
type SmartDomReaderCtor = new (options?: Partial<ExtractionOptions>) => SmartDOMReaderClass;

type SmartDomReaderWindow = Window & {
  SmartDOMReader?: SmartDomReaderCtor;
  SmartDOMReaderNamespace?: SmartDomReaderNamespace;
};

function resolveSmartDomReader(): SmartDomReaderCtor | undefined {
  if (typeof window !== 'undefined') {
    const globalWindow = window as Partial<SmartDomReaderWindow>;
    const direct = globalWindow.SmartDOMReader;
    if (typeof direct === 'function') {
      return direct;
    }

    const namespace = globalWindow.SmartDOMReaderNamespace;
    if (namespace && typeof namespace.SmartDOMReader === 'function') {
      return namespace.SmartDOMReader as SmartDomReaderCtor;
    }
  }

  try {
    if (typeof require === 'function') {
      const moduleExports = require('./index') as SmartDomReaderNamespace;
      if (moduleExports && typeof moduleExports.SmartDOMReader === 'function') {
        return moduleExports.SmartDOMReader as SmartDomReaderCtor;
      }

      if (moduleExports && typeof moduleExports.default === 'function') {
        return moduleExports.default as SmartDomReaderCtor;
      }
    }
  } catch {
    // Ignore resolution errors when require is unavailable (e.g. browser bundles)
  }

  return undefined;
}

export class ProgressiveExtractor {
  /**
   * Step 1: Extract high-level structural overview
   * This provides a "map" of the page for the AI to understand structure
   */
  static extractStructure(root: Document | Element): StructuralOverview {
    const regions: StructuralOverview['regions'] = {};

    // Find header (scoped to root)
    const header = root.querySelector('header, [role="banner"], .header, #header');
    if (header) {
      regions.header = this.analyzeRegion(header);
    }

    // Find navigation areas (scoped to root)
    const navs = root.querySelectorAll('nav, [role="navigation"], .nav, .navigation');
    if (navs.length > 0) {
      regions.navigation = Array.from(navs).map((nav) => this.analyzeRegion(nav));
    }

    // Find main content
    if (root instanceof Document) {
      const main = ContentDetection.findMainContent(root);
      if (main) {
        regions.main = this.analyzeRegion(main);
        // Find sections within main
        const sections = main.querySelectorAll('section, article, [role="region"]');
        if (sections.length > 0) {
          regions.sections = Array.from(sections)
            .filter((section) => !section.closest('nav, header, footer'))
            .map((section) => this.analyzeRegion(section));
        }
      }
    } else {
      // When scoped to an Element, treat the element itself as the main region
      regions.main = this.analyzeRegion(root);
      const sections = root.querySelectorAll('section, article, [role="region"]');
      if (sections.length > 0) {
        regions.sections = Array.from(sections)
          .filter((section) => !section.closest('nav, header, footer'))
          .map((section) => this.analyzeRegion(section));
      }
    }

    // Find sidebars (scoped)
    const sidebars = root.querySelectorAll('aside, [role="complementary"], .sidebar, #sidebar');
    if (sidebars.length > 0) {
      regions.sidebar = Array.from(sidebars).map((sidebar) => this.analyzeRegion(sidebar));
    }

    // Find footer (scoped)
    const footer = root.querySelector('footer, [role="contentinfo"], .footer, #footer');
    if (footer) {
      regions.footer = this.analyzeRegion(footer);
    }

    // Find modals/dialogs (scoped)
    const modals = root.querySelectorAll('[role="dialog"], .modal, .popup, .overlay');
    const visibleModals = Array.from(modals).filter((modal) => DOMTraversal.isVisible(modal));
    if (visibleModals.length > 0) {
      regions.modals = visibleModals.map((modal) => this.analyzeRegion(modal));
    }

    // Extract form information (scoped)
    const forms = this.extractFormOverview(root);

    // Calculate summary statistics (scoped)
    const summary = this.calculateSummary(root, regions, forms);

    // Generate AI-friendly suggestions
    const suggestions = this.generateSuggestions(regions, summary);

    return { regions, forms, summary, suggestions };
  }

  /**
   * Step 2: Extract detailed information from a specific region
   */
  static extractRegion(
    selector: string,
    doc: Document,
    options: Partial<ExtractionOptions> = {},
    smartDomReaderCtor?: SmartDomReaderCtor
  ): SmartDOMResult | null {
    const element = doc.querySelector(selector);
    if (!element) return null;

    const SmartDOMReaderCtor = smartDomReaderCtor ?? resolveSmartDomReader();
    if (!SmartDOMReaderCtor) {
      throw new Error(
        'SmartDOMReader is unavailable. Ensure the Smart DOM Reader module is loaded before calling extractRegion.'
      );
    }
    const reader = new SmartDOMReaderCtor(options);

    // Extract from the specific element/region
    return reader.extract(element, options);
  }

  /**
   * Step 3: Extract readable content from a region
   */
  static extractContent(
    selector: string,
    doc: Document,
    options: ContentExtractionOptions = {}
  ): ExtractedContent | null {
    const element = doc.querySelector(selector);
    if (!element) return null;

    const result: ExtractedContent = {
      selector,
      text: {},
      metadata: {
        wordCount: 0,
        hasInteractive: false,
      },
    };

    // Extract headings
    if (options.includeHeadings !== false) {
      const headings = element.querySelectorAll('h1, h2, h3, h4, h5, h6');
      result.text.headings = Array.from(headings).map((h) => ({
        level: parseInt(h.tagName[1]),
        text: this.getTextContent(h, options.maxTextLength),
      }));
    }

    // Extract paragraphs
    const paragraphs = element.querySelectorAll('p');
    if (paragraphs.length > 0) {
      result.text.paragraphs = Array.from(paragraphs)
        .map((p) => this.getTextContent(p, options.maxTextLength))
        .filter((text) => text.length > 0);
    }

    // Extract lists
    if (options.includeLists !== false) {
      const lists = element.querySelectorAll('ul, ol');
      result.text.lists = Array.from(lists).map((list) => ({
        type: list.tagName.toLowerCase() as 'ul' | 'ol',
        items: Array.from(list.querySelectorAll('li')).map((li) =>
          this.getTextContent(li, options.maxTextLength)
        ),
      }));
    }

    // Extract tables
    if (options.includeTables !== false) {
      const tables = element.querySelectorAll('table');
      result.tables = Array.from(tables).map((table) => {
        const headers = Array.from(table.querySelectorAll('th')).map((th) =>
          this.getTextContent(th)
        );
        const rows = Array.from(table.querySelectorAll('tr'))
          .filter((tr) => tr.querySelector('td'))
          .map((tr) => Array.from(tr.querySelectorAll('td')).map((td) => this.getTextContent(td)));
        return { headers, rows };
      });
    }

    // Extract media
    if (options.includeMedia !== false) {
      const images = element.querySelectorAll('img');
      const videos = element.querySelectorAll('video');
      const audios = element.querySelectorAll('audio');

      result.media = [
        ...Array.from(images).map((img) => ({
          type: 'img' as const,
          alt: img.getAttribute('alt') || undefined,
          src: img.getAttribute('src') || undefined,
        })),
        ...Array.from(videos).map((video) => ({
          type: 'video' as const,
          src: video.getAttribute('src') || undefined,
        })),
        ...Array.from(audios).map((audio) => ({
          type: 'audio' as const,
          src: audio.getAttribute('src') || undefined,
        })),
      ];
    }

    // Calculate metadata
    const allText = element.textContent || '';
    result.metadata.wordCount = allText.trim().split(/\s+/).length;
    result.metadata.hasInteractive =
      element.querySelectorAll('button, a, input, textarea, select').length > 0;

    return result;
  }

  /**
   * Analyze a region and extract summary information
   */
  private static analyzeRegion(element: Element): RegionInfo {
    const selector = SelectorGenerator.generateSelectors(element).css;
    const buttons = element.querySelectorAll('button, [role="button"]');
    const links = element.querySelectorAll('a[href]');
    const inputs = element.querySelectorAll('input, textarea, select');
    const forms = element.querySelectorAll('form');
    const lists = element.querySelectorAll('ul, ol');
    const tables = element.querySelectorAll('table');
    const media = element.querySelectorAll('img, video, audio');

    const interactiveCount = buttons.length + links.length + inputs.length;

    // Get label from aria-label, aria-labelledby, or heading
    let label: string | undefined;
    const ariaLabel = element.getAttribute('aria-label');
    if (ariaLabel) {
      label = ariaLabel;
    } else if (element.getAttribute('aria-labelledby')) {
      const labelId = element.getAttribute('aria-labelledby');
      if (labelId) {
        const labelElement = element.ownerDocument?.getElementById(labelId);
        if (labelElement) {
          label = labelElement.textContent?.trim();
        }
      }
    } else {
      const heading = element.querySelector('h1, h2, h3');
      if (heading) {
        label = heading.textContent?.trim();
      }
    }

    // Get text preview
    const textContent = element.textContent?.trim() || '';
    const textPreview =
      textContent.length > 50 ? textContent.substring(0, 50) + '...' : textContent;

    return {
      selector,
      label,
      role: element.getAttribute('role') || undefined,
      interactiveCount,
      hasForm: forms.length > 0,
      hasList: lists.length > 0,
      hasTable: tables.length > 0,
      hasMedia: media.length > 0,
      buttonCount: buttons.length > 0 ? buttons.length : undefined,
      linkCount: links.length > 0 ? links.length : undefined,
      inputCount: inputs.length > 0 ? inputs.length : undefined,
      textPreview: textPreview.length > 0 ? textPreview : undefined,
    };
  }

  /**
   * Extract overview of forms on the page
   */
  private static extractFormOverview(root: Document | Element): StructuralOverview['forms'] {
    const forms = root.querySelectorAll('form');
    return Array.from(forms).map((form) => {
      const inputs = form.querySelectorAll('input, textarea, select');
      const selector = SelectorGenerator.generateSelectors(form).css;

      // Determine which region the form is in
      let location = 'unknown';
      if (form.closest('header, [role="banner"]')) {
        location = 'header';
      } else if (form.closest('nav, [role="navigation"]')) {
        location = 'navigation';
      } else if (form.closest('main, [role="main"]')) {
        location = 'main';
      } else if (form.closest('aside, [role="complementary"]')) {
        location = 'sidebar';
      } else if (form.closest('footer, [role="contentinfo"]')) {
        location = 'footer';
      }

      // Infer purpose from form attributes and content
      let purpose: string | undefined;
      const formId = form.getAttribute('id')?.toLowerCase();
      const formClass = form.getAttribute('class')?.toLowerCase();
      const formAction = form.getAttribute('action')?.toLowerCase();
      const hasEmail = form.querySelector('input[type="email"]');
      const hasPassword = form.querySelector('input[type="password"]');
      const hasSearch = form.querySelector('input[type="search"]');

      if (hasSearch || formId?.includes('search') || formClass?.includes('search')) {
        purpose = 'search';
      } else if (hasPassword && hasEmail) {
        purpose = 'login';
      } else if (hasPassword) {
        purpose = 'authentication';
      } else if (formId?.includes('contact') || formClass?.includes('contact')) {
        purpose = 'contact';
      } else if (formId?.includes('subscribe') || formClass?.includes('subscribe')) {
        purpose = 'subscription';
      } else if (formAction?.includes('checkout') || formClass?.includes('checkout')) {
        purpose = 'checkout';
      }

      return {
        selector,
        location,
        inputCount: inputs.length,
        purpose,
      };
    });
  }

  /**
   * Calculate summary statistics
   */
  private static calculateSummary(
    root: Document | Element,
    regions: StructuralOverview['regions'],
    forms: StructuralOverview['forms']
  ): StructuralOverview['summary'] {
    const allInteractive = root.querySelectorAll('button, a[href], input, textarea, select');
    const allSections = root.querySelectorAll('section, article, [role="region"]');
    const hasModals = (regions.modals?.length || 0) > 0;

    // Check for errors
    const errorSelectors = ['.error', '.alert-danger', '[role="alert"]'];
    const hasErrors = errorSelectors.some((sel) => {
      const element = root.querySelector(sel);
      return element ? DOMTraversal.isVisible(element) : false;
    });

    // Check for loading
    const loadingSelectors = ['.loading', '.spinner', '[aria-busy="true"]'];
    const isLoading = loadingSelectors.some((sel) => {
      const element = root.querySelector(sel);
      return element ? DOMTraversal.isVisible(element) : false;
    });

    const mainContentSelector = regions.main?.selector;

    return {
      totalInteractive: allInteractive.length,
      totalForms: forms.length,
      totalSections: allSections.length,
      hasModals,
      hasErrors,
      isLoading,
      mainContentSelector,
    };
  }

  /**
   * Generate AI-friendly suggestions
   */
  private static generateSuggestions(
    regions: StructuralOverview['regions'],
    summary: StructuralOverview['summary']
  ): string[] {
    const suggestions: string[] = [];

    if (summary.hasErrors) {
      suggestions.push('Page has error indicators - check error messages before interacting');
    }

    if (summary.isLoading) {
      suggestions.push('Page appears to be loading - wait or check loading state');
    }

    if (summary.hasModals) {
      suggestions.push('Modal/dialog is open - may need to interact with or close it first');
    }

    if (regions.main && regions.main.interactiveCount > 10) {
      suggestions.push(
        `Main content has ${regions.main.interactiveCount} interactive elements - consider filtering`
      );
    }

    if (summary.totalForms > 0) {
      suggestions.push(`Found ${summary.totalForms} form(s) on the page`);
    }

    if (!regions.main) {
      suggestions.push('No clear main content area detected - may need to explore regions');
    }

    return suggestions;
  }

  /**
   * Get text content with optional truncation
   */
  private static getTextContent(element: Element, maxLength?: number): string {
    const text = element.textContent?.trim() || '';
    if (maxLength && text.length > maxLength) {
      return text.substring(0, maxLength) + '...';
    }
    return text;
  }
}
