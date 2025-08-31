export class ContentDetection {
  /**
   * Find the main content area of a page
   * Inspired by dom-to-semantic-markdown's approach
   */
  static findMainContent(document: Document): Element {
    // First, check for explicit main element
    const mainElement = document.querySelector('main, [role="main"]');
    if (mainElement) {
      return mainElement;
    }

    // If no explicit main, detect it
    if (!document.body) {
      return document.documentElement;
    }

    return this.detectMainContent(document.body);
  }

  /**
   * Detect main content using scoring algorithm
   */
  private static detectMainContent(rootElement: Element): Element {
    const candidates: Element[] = [];
    const minScore = 15;

    this.collectCandidates(rootElement, candidates, minScore);

    if (candidates.length === 0) {
      return rootElement;
    }

    // Sort by score
    candidates.sort((a, b) => this.calculateContentScore(b) - this.calculateContentScore(a));

    // Find best independent candidate
    let bestCandidate = candidates[0];
    for (let i = 1; i < candidates.length; i++) {
      // Check if this candidate is not contained in any other
      const isIndependent = !candidates.some(
        (other, j) => j !== i && other.contains(candidates[i])
      );

      if (
        isIndependent &&
        this.calculateContentScore(candidates[i]) > this.calculateContentScore(bestCandidate)
      ) {
        bestCandidate = candidates[i];
      }
    }

    return bestCandidate;
  }

  /**
   * Collect content candidates
   */
  private static collectCandidates(
    element: Element,
    candidates: Element[],
    minScore: number
  ): void {
    const score = this.calculateContentScore(element);
    if (score >= minScore) {
      candidates.push(element);
    }

    // Recursively check children
    Array.from(element.children).forEach((child) => {
      this.collectCandidates(child, candidates, minScore);
    });
  }

  /**
   * Calculate content score for an element
   */
  static calculateContentScore(element: Element): number {
    let score = 0;

    // High impact semantic indicators
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

    // Check classes
    semanticClasses.forEach((cls) => {
      if (element.classList.contains(cls)) {
        score += 10;
      }
    });

    // Check ID
    semanticIds.forEach((id) => {
      if (element.id && element.id.toLowerCase().includes(id)) {
        score += 10;
      }
    });

    // High value tags
    const tag = element.tagName.toLowerCase();
    const highValueTags = ['article', 'main', 'section'];
    if (highValueTags.includes(tag)) {
      score += 8;
    }

    // Paragraph density
    const paragraphs = element.getElementsByTagName('p').length;
    score += Math.min(paragraphs * 2, 10);

    // Heading presence
    const headings = element.querySelectorAll('h1, h2, h3').length;
    score += Math.min(headings * 3, 9);

    // Text content length
    const textLength = element.textContent?.trim().length || 0;
    if (textLength > 300) {
      score += Math.min(Math.floor(textLength / 300) * 2, 10);
    }

    // Link density (lower is better for content)
    const linkDensity = this.calculateLinkDensity(element);
    if (linkDensity < 0.3) {
      score += 5;
    } else if (linkDensity > 0.5) {
      score -= 5;
    }

    // Data attributes
    if (
      element.hasAttribute('data-main') ||
      element.hasAttribute('data-content') ||
      element.hasAttribute('itemprop')
    ) {
      score += 8;
    }

    // ARIA landmarks
    const role = element.getAttribute('role');
    if (role === 'main' || role === 'article') {
      score += 10;
    }

    // Penalize certain elements
    if (
      element.matches(
        'aside, nav, header, footer, .sidebar, .navigation, .menu, .ad, .advertisement'
      )
    ) {
      score -= 10;
    }

    // Check for form density (forms are usually not main content)
    const forms = element.getElementsByTagName('form').length;
    if (forms > 2) {
      score -= 5;
    }

    return Math.max(0, score);
  }

  /**
   * Calculate link density in an element
   */
  private static calculateLinkDensity(element: Element): number {
    const links = element.getElementsByTagName('a');
    let linkTextLength = 0;

    for (const link of Array.from(links)) {
      linkTextLength += link.textContent?.length || 0;
    }

    const totalTextLength = element.textContent?.length || 1;
    return linkTextLength / totalTextLength;
  }

  /**
   * Check if an element is likely navigation
   */
  static isNavigation(element: Element): boolean {
    const tag = element.tagName.toLowerCase();

    // Explicit navigation elements
    if (tag === 'nav' || element.getAttribute('role') === 'navigation') {
      return true;
    }

    // Check for navigation patterns
    const navPatterns = [/nav/i, /menu/i, /sidebar/i, /toolbar/i];

    const classesAndId = (element.className + ' ' + element.id).toLowerCase();
    return navPatterns.some((pattern) => pattern.test(classesAndId));
  }

  /**
   * Check if element is likely supplementary content
   */
  static isSupplementary(element: Element): boolean {
    const tag = element.tagName.toLowerCase();

    // Explicit supplementary elements
    if (tag === 'aside' || element.getAttribute('role') === 'complementary') {
      return true;
    }

    // Check for supplementary patterns
    const supplementaryPatterns = [/sidebar/i, /widget/i, /related/i, /advertisement/i, /social/i];

    const classesAndId = (element.className + ' ' + element.id).toLowerCase();
    return supplementaryPatterns.some((pattern) => pattern.test(classesAndId));
  }

  /**
   * Detect page landmarks
   */
  static detectLandmarks(document: Document): Record<string, Element[]> {
    const landmarks: Record<string, Element[]> = {
      navigation: [],
      main: [],
      complementary: [],
      contentinfo: [],
      banner: [],
      search: [],
      form: [],
      region: [],
    };

    // Find explicit landmarks
    const landmarkSelectors = {
      navigation: 'nav, [role="navigation"]',
      main: 'main, [role="main"]',
      complementary: 'aside, [role="complementary"]',
      contentinfo: 'footer, [role="contentinfo"]',
      banner: 'header, [role="banner"]',
      search: '[role="search"]',
      form: 'form[aria-label], form[aria-labelledby], [role="form"]',
      region: 'section[aria-label], section[aria-labelledby], [role="region"]',
    };

    for (const [landmark, selector] of Object.entries(landmarkSelectors)) {
      const elements = document.querySelectorAll(selector);
      landmarks[landmark] = Array.from(elements);
    }

    return landmarks;
  }
}
