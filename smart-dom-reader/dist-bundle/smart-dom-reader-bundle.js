var SmartDOMReaderBundle = (function (exports) {
  class ContentDetection {
    /**
     * Find the main content area of a page
     * Inspired by dom-to-semantic-markdown's approach
     */
    static findMainContent(doc) {
      const mainElement = doc.querySelector('main, [role="main"]');
      if (mainElement) {
        return mainElement;
      }
      if (!doc.body) {
        return doc.documentElement;
      }
      return this.detectMainContent(doc.body);
    }
    /**
     * Detect main content using scoring algorithm
     */
    static detectMainContent(rootElement) {
      const candidates = [];
      const minScore = 15;
      this.collectCandidates(rootElement, candidates, minScore);
      if (candidates.length === 0) {
        return rootElement;
      }
      candidates.sort((a, b) => this.calculateContentScore(b) - this.calculateContentScore(a));
      let bestCandidate = candidates[0];
      for (let i = 1; i < candidates.length; i++) {
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
    static collectCandidates(element, candidates, minScore) {
      const score = this.calculateContentScore(element);
      if (score >= minScore) {
        candidates.push(element);
      }
      Array.from(element.children).forEach((child) => {
        this.collectCandidates(child, candidates, minScore);
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
        if (element.classList.contains(cls)) {
          score += 10;
        }
      });
      semanticIds.forEach((id) => {
        if (element.id && element.id.toLowerCase().includes(id)) {
          score += 10;
        }
      });
      const tag = element.tagName.toLowerCase();
      const highValueTags = ['article', 'main', 'section'];
      if (highValueTags.includes(tag)) {
        score += 8;
      }
      const paragraphs = element.getElementsByTagName('p').length;
      score += Math.min(paragraphs * 2, 10);
      const headings = element.querySelectorAll('h1, h2, h3').length;
      score += Math.min(headings * 3, 9);
      const textLength = element.textContent?.trim().length || 0;
      if (textLength > 300) {
        score += Math.min(Math.floor(textLength / 300) * 2, 10);
      }
      const linkDensity = this.calculateLinkDensity(element);
      if (linkDensity < 0.3) {
        score += 5;
      } else if (linkDensity > 0.5) {
        score -= 5;
      }
      if (
        element.hasAttribute('data-main') ||
        element.hasAttribute('data-content') ||
        element.hasAttribute('itemprop')
      ) {
        score += 8;
      }
      const role = element.getAttribute('role');
      if (role === 'main' || role === 'article') {
        score += 10;
      }
      if (
        element.matches(
          'aside, nav, header, footer, .sidebar, .navigation, .menu, .ad, .advertisement'
        )
      ) {
        score -= 10;
      }
      const forms = element.getElementsByTagName('form').length;
      if (forms > 2) {
        score -= 5;
      }
      return Math.max(0, score);
    }
    /**
     * Calculate link density in an element
     */
    static calculateLinkDensity(element) {
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
    static isNavigation(element) {
      const tag = element.tagName.toLowerCase();
      if (tag === 'nav' || element.getAttribute('role') === 'navigation') {
        return true;
      }
      const navPatterns = [/nav/i, /menu/i, /sidebar/i, /toolbar/i];
      const classesAndId = (element.className + ' ' + element.id).toLowerCase();
      return navPatterns.some((pattern) => pattern.test(classesAndId));
    }
    /**
     * Check if element is likely supplementary content
     */
    static isSupplementary(element) {
      const tag = element.tagName.toLowerCase();
      if (tag === 'aside' || element.getAttribute('role') === 'complementary') {
        return true;
      }
      const supplementaryPatterns = [
        /sidebar/i,
        /widget/i,
        /related/i,
        /advertisement/i,
        /social/i,
      ];
      const classesAndId = (element.className + ' ' + element.id).toLowerCase();
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
        const elements = doc.querySelectorAll(selector);
        landmarks[landmark] = Array.from(elements);
      }
      return landmarks;
    }
  }
  class SelectorGenerator {
    /**
     * Generate multiple selector strategies for an element
     */
    static generateSelectors(element) {
      const doc = element.ownerDocument || document;
      const candidates = [];
      if (element.id && this.isUniqueId(element.id, doc)) {
        candidates.push({ type: 'id', value: `#${CSS.escape(element.id)}`, score: 100 });
      }
      const testId = this.getDataTestId(element);
      if (testId) {
        const v = `[data-testid="${CSS.escape(testId)}"]`;
        candidates.push({
          type: 'data-testid',
          value: v,
          score: 90 + (this.isUniqueSelectorSafe(v, doc) ? 5 : 0),
        });
      }
      const role = element.getAttribute('role');
      const aria = element.getAttribute('aria-label');
      if (role && aria) {
        const v = `[role="${CSS.escape(role)}"][aria-label="${CSS.escape(aria)}"]`;
        candidates.push({
          type: 'role-aria',
          value: v,
          score: 85 + (this.isUniqueSelectorSafe(v, doc) ? 5 : 0),
        });
      }
      const nameAttr = element.getAttribute('name');
      if (nameAttr) {
        const v = `[name="${CSS.escape(nameAttr)}"]`;
        candidates.push({
          type: 'name',
          value: v,
          score: 78 + (this.isUniqueSelectorSafe(v, doc) ? 5 : 0),
        });
      }
      const pathCss = this.generateCSSSelector(element, doc);
      const structuralPenalty = (pathCss.match(/:nth-child\(/g) || []).length * 10;
      const classBonus = pathCss.includes('.') ? 8 : 0;
      const pathScore = Math.max(0, 70 + classBonus - structuralPenalty);
      candidates.push({ type: 'class-path', value: pathCss, score: pathScore });
      const xpath = this.generateXPath(element, doc);
      candidates.push({ type: 'xpath', value: xpath, score: 40 });
      const textBased = this.generateTextBasedSelector(element);
      if (textBased) candidates.push({ type: 'text', value: textBased, score: 30 });
      candidates.sort((a, b) => b.score - a.score);
      const bestCss =
        candidates.find((c) => c.type !== 'xpath' && c.type !== 'text')?.value || pathCss;
      return {
        css: bestCss,
        xpath,
        textBased,
        dataTestId: testId || void 0,
        ariaLabel: aria || void 0,
        candidates,
      };
    }
    /**
     * Generate a unique CSS selector for an element
     */
    static generateCSSSelector(element, doc) {
      if (element.id && this.isUniqueId(element.id, doc)) {
        return `#${CSS.escape(element.id)}`;
      }
      const testId = this.getDataTestId(element);
      if (testId) {
        return `[data-testid="${CSS.escape(testId)}"]`;
      }
      const path = [];
      let current = element;
      while (current && current.nodeType === Node.ELEMENT_NODE) {
        let selector = current.nodeName.toLowerCase();
        if (current.id && this.isUniqueId(current.id, doc)) {
          selector = `#${CSS.escape(current.id)}`;
          path.unshift(selector);
          break;
        }
        const classes = this.getMeaningfulClasses(current);
        if (classes.length > 0) {
          selector += '.' + classes.map((c) => CSS.escape(c)).join('.');
        }
        const siblings = current.parentElement?.children;
        if (siblings && siblings.length > 1) {
          const index = Array.from(siblings).indexOf(current);
          if (index > 0 || !this.isUniqueSelector(selector, current.parentElement)) {
            selector += `:nth-child(${index + 1})`;
          }
        }
        path.unshift(selector);
        current = current.parentElement;
      }
      return this.optimizePath(path, element, doc);
    }
    /**
     * Generate XPath for an element
     */
    static generateXPath(element, doc) {
      if (element.id && this.isUniqueId(element.id, doc)) {
        return `//*[@id="${element.id}"]`;
      }
      const path = [];
      let current = element;
      while (current && current.nodeType === Node.ELEMENT_NODE) {
        const tagName = current.nodeName.toLowerCase();
        if (current.id && this.isUniqueId(current.id, doc)) {
          path.unshift(`//*[@id="${current.id}"]`);
          break;
        }
        let xpath = tagName;
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
      return '//' + path.join('/');
    }
    /**
     * Generate a text-based selector for buttons and links
     */
    static generateTextBasedSelector(element) {
      const text = element.textContent?.trim();
      if (!text || text.length > 50) return void 0;
      const tag = element.nodeName.toLowerCase();
      if (['button', 'a', 'label'].includes(tag)) {
        const escapedText = text.replace(/['"\\]/g, '\\$&');
        return `${tag}:contains("${escapedText}")`;
      }
      return void 0;
    }
    /**
     * Get data-testid or similar attributes
     */
    static getDataTestId(element) {
      return (
        element.getAttribute('data-testid') ||
        element.getAttribute('data-test-id') ||
        element.getAttribute('data-test') ||
        element.getAttribute('data-cy') ||
        void 0
      );
    }
    /**
     * Check if an ID is unique in the document
     */
    static isUniqueId(id, doc) {
      return doc.querySelectorAll(`#${CSS.escape(id)}`).length === 1;
    }
    /**
     * Check if a selector is unique within a container
     */
    static isUniqueSelector(selector, container) {
      try {
        return container.querySelectorAll(selector).length === 1;
      } catch {
        return false;
      }
    }
    static isUniqueSelectorSafe(selector, doc) {
      try {
        return doc.querySelectorAll(selector).length === 1;
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
     * Optimize the selector path by removing unnecessary parts
     */
    static optimizePath(path, element, doc) {
      for (let i = 0; i < path.length - 1; i++) {
        const shortPath = path.slice(i).join(' > ');
        try {
          const matches = doc.querySelectorAll(shortPath);
          if (matches.length === 1 && matches[0] === element) {
            return shortPath;
          }
        } catch {}
      }
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
        if (current.id) {
          descriptor = `${tag}#${current.id}`;
        } else if (current.className && typeof current.className === 'string') {
          const firstClass = current.className.split(' ')[0];
          if (firstClass) {
            descriptor = `${tag}.${firstClass}`;
          }
        }
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
  class DOMTraversal {
    static INTERACTIVE_SELECTORS = [
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
    static SEMANTIC_SELECTORS = [
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
    static isVisible(element, computedStyle) {
      const rect = element.getBoundingClientRect();
      const style = computedStyle || element.ownerDocument?.defaultView?.getComputedStyle(element);
      if (!style) return false;
      return !!(
        rect.width > 0 &&
        rect.height > 0 &&
        style.display !== 'none' &&
        style.visibility !== 'hidden' &&
        style.opacity !== '0' &&
        element.offsetParent !== null
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
        for (const selector of filter.excludeSelectors) {
          if (element.matches(selector)) return false;
        }
      }
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
      if (filter.tags?.length && !filter.tags.includes(element.tagName.toLowerCase())) {
        return false;
      }
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
      if (filter.hasAttributes?.length) {
        for (const attr of filter.hasAttributes) {
          if (!element.hasAttribute(attr)) return false;
        }
      }
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
    static extractElement(element, options, depth = 0) {
      if (options.maxDepth && depth > options.maxDepth) {
        return null;
      }
      if (!options.includeHidden && !this.isVisible(element)) {
        return null;
      }
      if (options.viewportOnly && !this.isInViewport(element)) {
        return null;
      }
      if (!this.passesFilter(element, options.filter)) {
        return null;
      }
      const htmlElement = element;
      const extracted = {
        tag: element.tagName.toLowerCase(),
        text: this.getElementText(element, options),
        selector: SelectorGenerator.generateSelectors(element),
        attributes: this.getRelevantAttributes(element, options),
        context: this.getElementContext(element),
        interaction: this.getInteractionInfo(element),
        // bounds removed to save tokens
      };
      if (options.mode === 'full' && this.isSemanticContainer(element)) {
        const children = [];
        if (options.includeShadowDOM && htmlElement.shadowRoot) {
          const shadowChildren = this.extractChildren(htmlElement.shadowRoot, options, depth + 1);
          children.push(...shadowChildren);
        }
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
    static extractChildren(container, options, depth) {
      const children = [];
      const elements = container.querySelectorAll('*');
      for (const child of Array.from(elements)) {
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
    static hasExtractedAncestor(element, extractedElements) {
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
        if (value) {
          attributes[attr] =
            value.length > attrTruncate ? value.substring(0, attrTruncate) + '...' : value;
        }
      }
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
    static getElementContext(element) {
      const context = {
        parentChain: SelectorGenerator.getContextPath(element),
      };
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
    static getInteractionInfo(element) {
      const htmlElement = element;
      const interaction = {};
      const hasClickHandler = !!(
        htmlElement.onclick ||
        element.getAttribute('onclick') ||
        element.matches('button, a[href], [role="button"], [tabindex]:not([tabindex="-1"])')
      );
      if (hasClickHandler) interaction.click = true;
      const hasChangeHandler = !!(
        htmlElement.onchange ||
        element.getAttribute('onchange') ||
        element.matches('input, select, textarea')
      );
      if (hasChangeHandler) interaction.change = true;
      const hasSubmitHandler = !!(
        htmlElement.onsubmit ||
        element.getAttribute('onsubmit') ||
        element.matches('form')
      );
      if (hasSubmitHandler) interaction.submit = true;
      const triggersNavigation = element.matches('a[href], button[type="submit"]');
      if (triggersNavigation) interaction.nav = true;
      const isDisabled =
        htmlElement.hasAttribute('disabled') ||
        htmlElement.getAttribute('aria-disabled') === 'true';
      if (isDisabled) interaction.disabled = true;
      const isHidden = !this.isVisible(element);
      if (isHidden) interaction.hidden = true;
      const ariaRole = element.getAttribute('role');
      if (ariaRole) interaction.role = ariaRole;
      if (element.matches('input, textarea, select, button')) {
        const form = element.form || element.closest('form');
        if (form) {
          interaction.form = SelectorGenerator.generateSelectors(form).css;
        }
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
      if (element.matches('img')) {
        return element.alt || '';
      }
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
    static isSemanticContainer(element) {
      return element.matches(
        'article, section, nav, aside, main, header, footer, form, table, ul, ol, dl, figure, details, dialog, [role="region"], [role="navigation"], [role="main"], [role="complementary"]'
      );
    }
    /**
     * Get interactive elements
     */
    static getInteractiveElements(container = document, options) {
      const elements = [];
      const selector = this.INTERACTIVE_SELECTORS.join(', ');
      const found = container.querySelectorAll(selector);
      for (const element of Array.from(found)) {
        const extracted = this.extractElement(element, options);
        if (extracted) {
          elements.push(extracted);
        }
      }
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
    static getSemanticElements(container = document, options) {
      const elements = [];
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
    const hit = keywords.map((k) => ({ k, i: lower.indexOf(k) })).find((x) => x.i > -1);
    const head = Math.max(0, Math.floor(len * 0.66));
    if (hit && hit.i > head) {
      const tailWindow = Math.max(12, len - head - 5);
      const start = Math.max(0, hit.i - Math.floor(tailWindow / 2));
      const end = Math.min(t.length, start + tailWindow);
      return t.slice(0, head).trimEnd() + ' … ' + t.slice(start, end).trim() + '…';
    }
    const slice = t.slice(0, len);
    const lastSpace = slice.lastIndexOf(' ');
    return (lastSpace > 32 ? slice.slice(0, lastSpace) : slice) + '…';
  }
  function bestSelector(el) {
    return el.selector?.css || '';
  }
  function hashId(input) {
    let h = 5381;
    for (let i = 0; i < input.length; i++) h = (h * 33) ^ input.charCodeAt(i);
    return 'sec-' + (h >>> 0).toString(36);
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
    const stablePct = Math.round((stable / total) * 100);
    const nthPct = Math.round((nthCount / total) * 100);
    return `Selector quality: ${stablePct}% stable (ID/data-testid), ${nthPct}% structural (:nth-child)`;
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
      for (const f of limit(inter.forms)) {
        parts.push(
          `- FORM: action=${f.action ?? '-'} method=${f.method ?? '-'} → \`${f.selector}\``
        );
      }
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
    const attrs = [
      meta?.title ? `title="${escapeXml(meta.title)}"` : null,
      meta?.url ? `url="${escapeXml(meta.url)}"` : null,
    ]
      .filter(Boolean)
      .join(' ');
    return `<page ${attrs}>
  <${type}><![CDATA[
${body}
]]></${type}>
</page>`;
  }
  function escapeXml(s) {
    return s
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
  class MarkdownFormatter {
    static structure(overview, _opts = {}, meta) {
      const lines = [];
      lines.push(`# Page Outline`);
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
      const body = lines.join('\n');
      return wrapXml(body, meta, 'outline');
    }
    static region(result, opts = {}, meta) {
      const lines = [];
      lines.push(`# Region Details`);
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
      const body = lines.join('\n');
      return wrapXml(body, meta, 'section');
    }
    static content(content, opts = {}, meta) {
      const lines = [];
      lines.push(`# Content`);
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
        const limit =
          typeof opts.maxElements === 'number' ? opts.maxElements : content.media.length;
        for (const m of content.media.slice(0, limit)) {
          lines.push(
            `- ${m.type.toUpperCase()}: ${m.alt ?? ''} ${m.src ? `→ ${m.src}` : ''}`.trim()
          );
        }
        lines.push('');
      }
      lines.push(
        'Next: if text is insufficient for targeting, call dom_extract_region for interactive selectors.'
      );
      const body = lines.join('\n');
      return wrapXml(body, meta, 'content');
    }
  }
  function capitalize(s) {
    return s.charAt(0).toUpperCase() + s.slice(1);
  }
  function resolveSmartDomReader() {
    if (typeof window !== 'undefined') {
      const globalWindow = window;
      const direct = globalWindow.SmartDOMReader;
      if (typeof direct === 'function') {
        return direct;
      }
      const namespace = globalWindow.SmartDOMReaderNamespace;
      if (namespace && typeof namespace.SmartDOMReader === 'function') {
        return namespace.SmartDOMReader;
      }
    }
    try {
      if (typeof require === 'function') {
        const moduleExports = require('./index');
        if (moduleExports && typeof moduleExports.SmartDOMReader === 'function') {
          return moduleExports.SmartDOMReader;
        }
        if (moduleExports && typeof moduleExports.default === 'function') {
          return moduleExports.default;
        }
      }
    } catch {}
    return void 0;
  }
  class ProgressiveExtractor {
    /**
     * Step 1: Extract high-level structural overview
     * This provides a "map" of the page for the AI to understand structure
     */
    static extractStructure(root) {
      const regions = {};
      const header = root.querySelector('header, [role="banner"], .header, #header');
      if (header) {
        regions.header = this.analyzeRegion(header);
      }
      const navs = root.querySelectorAll('nav, [role="navigation"], .nav, .navigation');
      if (navs.length > 0) {
        regions.navigation = Array.from(navs).map((nav) => this.analyzeRegion(nav));
      }
      if (root instanceof Document) {
        const main = ContentDetection.findMainContent(root);
        if (main) {
          regions.main = this.analyzeRegion(main);
          const sections = main.querySelectorAll('section, article, [role="region"]');
          if (sections.length > 0) {
            regions.sections = Array.from(sections)
              .filter((section) => !section.closest('nav, header, footer'))
              .map((section) => this.analyzeRegion(section));
          }
        }
      } else {
        regions.main = this.analyzeRegion(root);
        const sections = root.querySelectorAll('section, article, [role="region"]');
        if (sections.length > 0) {
          regions.sections = Array.from(sections)
            .filter((section) => !section.closest('nav, header, footer'))
            .map((section) => this.analyzeRegion(section));
        }
      }
      const sidebars = root.querySelectorAll('aside, [role="complementary"], .sidebar, #sidebar');
      if (sidebars.length > 0) {
        regions.sidebar = Array.from(sidebars).map((sidebar) => this.analyzeRegion(sidebar));
      }
      const footer = root.querySelector('footer, [role="contentinfo"], .footer, #footer');
      if (footer) {
        regions.footer = this.analyzeRegion(footer);
      }
      const modals = root.querySelectorAll('[role="dialog"], .modal, .popup, .overlay');
      const visibleModals = Array.from(modals).filter((modal) => DOMTraversal.isVisible(modal));
      if (visibleModals.length > 0) {
        regions.modals = visibleModals.map((modal) => this.analyzeRegion(modal));
      }
      const forms = this.extractFormOverview(root);
      const summary = this.calculateSummary(root, regions, forms);
      const suggestions = this.generateSuggestions(regions, summary);
      return { regions, forms, summary, suggestions };
    }
    /**
     * Step 2: Extract detailed information from a specific region
     */
    static extractRegion(selector, doc, options = {}, smartDomReaderCtor) {
      const element = doc.querySelector(selector);
      if (!element) return null;
      const SmartDOMReaderCtor = smartDomReaderCtor ?? resolveSmartDomReader();
      if (!SmartDOMReaderCtor) {
        throw new Error(
          'SmartDOMReader is unavailable. Ensure the Smart DOM Reader module is loaded before calling extractRegion.'
        );
      }
      const reader = new SmartDOMReaderCtor(options);
      return reader.extract(element, options);
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
          level: parseInt(h.tagName[1]),
          text: this.getTextContent(h, options.maxTextLength),
        }));
      }
      const paragraphs = element.querySelectorAll('p');
      if (paragraphs.length > 0) {
        result.text.paragraphs = Array.from(paragraphs)
          .map((p) => this.getTextContent(p, options.maxTextLength))
          .filter((text) => text.length > 0);
      }
      if (options.includeLists !== false) {
        const lists = element.querySelectorAll('ul, ol');
        result.text.lists = Array.from(lists).map((list) => ({
          type: list.tagName.toLowerCase(),
          items: Array.from(list.querySelectorAll('li')).map((li) =>
            this.getTextContent(li, options.maxTextLength)
          ),
        }));
      }
      if (options.includeTables !== false) {
        const tables = element.querySelectorAll('table');
        result.tables = Array.from(tables).map((table) => {
          const headers = Array.from(table.querySelectorAll('th')).map((th) =>
            this.getTextContent(th)
          );
          const rows = Array.from(table.querySelectorAll('tr'))
            .filter((tr) => tr.querySelector('td'))
            .map((tr) =>
              Array.from(tr.querySelectorAll('td')).map((td) => this.getTextContent(td))
            );
          return { headers, rows };
        });
      }
      if (options.includeMedia !== false) {
        const images = element.querySelectorAll('img');
        const videos = element.querySelectorAll('video');
        const audios = element.querySelectorAll('audio');
        result.media = [
          ...Array.from(images).map((img) => ({
            type: 'img',
            alt: img.getAttribute('alt') || void 0,
            src: img.getAttribute('src') || void 0,
          })),
          ...Array.from(videos).map((video) => ({
            type: 'video',
            src: video.getAttribute('src') || void 0,
          })),
          ...Array.from(audios).map((audio) => ({
            type: 'audio',
            src: audio.getAttribute('src') || void 0,
          })),
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
      const textContent = element.textContent?.trim() || '';
      const textPreview =
        textContent.length > 50 ? textContent.substring(0, 50) + '...' : textContent;
      return {
        selector,
        label,
        role: element.getAttribute('role') || void 0,
        interactiveCount,
        hasForm: forms.length > 0,
        hasList: lists.length > 0,
        hasTable: tables.length > 0,
        hasMedia: media.length > 0,
        buttonCount: buttons.length > 0 ? buttons.length : void 0,
        linkCount: links.length > 0 ? links.length : void 0,
        inputCount: inputs.length > 0 ? inputs.length : void 0,
        textPreview: textPreview.length > 0 ? textPreview : void 0,
      };
    }
    /**
     * Extract overview of forms on the page
     */
    static extractFormOverview(root) {
      const forms = root.querySelectorAll('form');
      return Array.from(forms).map((form) => {
        const inputs = form.querySelectorAll('input, textarea, select');
        const selector = SelectorGenerator.generateSelectors(form).css;
        let location2 = 'unknown';
        if (form.closest('header, [role="banner"]')) {
          location2 = 'header';
        } else if (form.closest('nav, [role="navigation"]')) {
          location2 = 'navigation';
        } else if (form.closest('main, [role="main"]')) {
          location2 = 'main';
        } else if (form.closest('aside, [role="complementary"]')) {
          location2 = 'sidebar';
        } else if (form.closest('footer, [role="contentinfo"]')) {
          location2 = 'footer';
        }
        let purpose;
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
          location: location2,
          inputCount: inputs.length,
          purpose,
        };
      });
    }
    /**
     * Calculate summary statistics
     */
    static calculateSummary(root, regions, forms) {
      const allInteractive = root.querySelectorAll('button, a[href], input, textarea, select');
      const allSections = root.querySelectorAll('section, article, [role="region"]');
      const hasModals = (regions.modals?.length || 0) > 0;
      const errorSelectors = ['.error', '.alert-danger', '[role="alert"]'];
      const hasErrors = errorSelectors.some((sel) => {
        const element = root.querySelector(sel);
        return element ? DOMTraversal.isVisible(element) : false;
      });
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
    static generateSuggestions(regions, summary) {
      const suggestions = [];
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
    static getTextContent(element, maxLength) {
      const text = element.textContent?.trim() || '';
      if (maxLength && text.length > maxLength) {
        return text.substring(0, maxLength) + '...';
      }
      return text;
    }
  }
  class SmartDOMReader {
    options;
    constructor(options = {}) {
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
    extract(rootElement = document, runtimeOptions) {
      const startTime = Date.now();
      const doc = rootElement instanceof Document ? rootElement : rootElement.ownerDocument;
      const options = { ...this.options, ...runtimeOptions };
      let container = rootElement instanceof Document ? doc : rootElement;
      if (options.mainContentOnly && rootElement instanceof Document) {
        container = ContentDetection.findMainContent(doc);
      }
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
        result.semantic = this.extractSemanticElements(container, options);
        result.metadata = this.extractMetadata(doc, container, options);
      }
      return result;
    }
    /**
     * Extract page state information
     */
    extractPageState(doc) {
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
    /**
     * Extract interactive elements
     */
    extractInteractiveElements(container, options) {
      const buttons = [];
      const links = [];
      const inputs = [];
      const clickable = [];
      const buttonElements = container.querySelectorAll(
        'button, [role="button"], input[type="button"], input[type="submit"]'
      );
      buttonElements.forEach((el) => {
        if (this.shouldIncludeElement(el, options)) {
          const extracted = DOMTraversal.extractElement(el, options);
          if (extracted) buttons.push(extracted);
        }
      });
      const linkElements = container.querySelectorAll('a[href]');
      linkElements.forEach((el) => {
        if (this.shouldIncludeElement(el, options)) {
          const extracted = DOMTraversal.extractElement(el, options);
          if (extracted) links.push(extracted);
        }
      });
      const inputElements = container.querySelectorAll(
        'input:not([type="button"]):not([type="submit"]), textarea, select'
      );
      inputElements.forEach((el) => {
        if (this.shouldIncludeElement(el, options)) {
          const extracted = DOMTraversal.extractElement(el, options);
          if (extracted) inputs.push(extracted);
        }
      });
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
    extractForms(container, options) {
      const forms = [];
      const formElements = container.querySelectorAll('form');
      formElements.forEach((form) => {
        if (!this.shouldIncludeElement(form, options)) return;
        const formInputs = [];
        const formButtons = [];
        const inputs = form.querySelectorAll(
          'input:not([type="button"]):not([type="submit"]), textarea, select'
        );
        inputs.forEach((input) => {
          const extracted = DOMTraversal.extractElement(input, options);
          if (extracted) formInputs.push(extracted);
        });
        const buttons = form.querySelectorAll('button, input[type="button"], input[type="submit"]');
        buttons.forEach((button) => {
          const extracted = DOMTraversal.extractElement(button, options);
          if (extracted) formButtons.push(extracted);
        });
        forms.push({
          selector: SelectorGenerator.generateSelectors(form).css,
          action: form.getAttribute('action') || void 0,
          method: form.getAttribute('method') || void 0,
          inputs: formInputs,
          buttons: formButtons,
        });
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
      container.querySelectorAll('h1, h2, h3, h4, h5, h6').forEach((el) => {
        if (this.shouldIncludeElement(el, options)) {
          const extracted = DOMTraversal.extractElement(el, options);
          if (extracted) headings.push(extracted);
        }
      });
      container.querySelectorAll('img').forEach((el) => {
        if (this.shouldIncludeElement(el, options)) {
          const extracted = DOMTraversal.extractElement(el, options);
          if (extracted) images.push(extracted);
        }
      });
      container.querySelectorAll('table').forEach((el) => {
        if (this.shouldIncludeElement(el, options)) {
          const extracted = DOMTraversal.extractElement(el, options);
          if (extracted) tables.push(extracted);
        }
      });
      container.querySelectorAll('ul, ol').forEach((el) => {
        if (this.shouldIncludeElement(el, options)) {
          const extracted = DOMTraversal.extractElement(el, options);
          if (extracted) lists.push(extracted);
        }
      });
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
    extractMetadata(doc, container, options) {
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
            : void 0,
        language: doc.documentElement.getAttribute('lang') || void 0,
      };
    }
    /**
     * Check if element should be included based on options
     */
    shouldIncludeElement(element, options) {
      if (!options.includeHidden && !DOMTraversal.isVisible(element)) {
        return false;
      }
      if (options.viewportOnly && !DOMTraversal.isInViewport(element)) {
        return false;
      }
      if (options.filter && !DOMTraversal.passesFilter(element, options.filter)) {
        return false;
      }
      return true;
    }
    /**
     * Detect errors on the page
     */
    detectErrors(doc) {
      const errorSelectors = ['.error', '.alert-danger', '[role="alert"]', '.error-message'];
      return errorSelectors.some((sel) => {
        const element = doc.querySelector(sel);
        return element ? DOMTraversal.isVisible(element) : false;
      });
    }
    /**
     * Detect if page is loading
     */
    detectLoading(doc) {
      const loadingSelectors = ['.loading', '.spinner', '[aria-busy="true"]', '.loader'];
      return loadingSelectors.some((sel) => {
        const element = doc.querySelector(sel);
        return element ? DOMTraversal.isVisible(element) : false;
      });
    }
    /**
     * Detect modal dialogs
     */
    detectModals(doc) {
      const modalSelectors = ['[role="dialog"]', '.modal', '.popup', '.overlay'];
      return modalSelectors.some((sel) => {
        const element = doc.querySelector(sel);
        return element ? DOMTraversal.isVisible(element) : false;
      });
    }
    /**
     * Get currently focused element
     */
    getFocusedElement(doc) {
      const focused = doc.activeElement;
      if (focused && focused !== doc.body) {
        return SelectorGenerator.generateSelectors(focused).css;
      }
      return void 0;
    }
    // ===== Static convenience methods =====
    /**
     * Quick extraction for interactive elements only
     * @param doc The document to extract from
     * @param options Extraction options
     */
    static extractInteractive(doc, options = {}) {
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
    static extractFull(doc, options = {}) {
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
    static extractFromElement(element, mode = 'interactive', options = {}) {
      const reader = new SmartDOMReader({
        ...options,
        mode,
      });
      return reader.extract(element);
    }
  }
  function executeExtraction(method, args) {
    try {
      let result;
      switch (method) {
        case 'extractStructure': {
          const structureArgs = args;
          const { selector, frameSelector, formatOptions } = structureArgs;
          let doc = document;
          if (frameSelector) {
            const iframe = document.querySelector(frameSelector);
            if (!iframe || !(iframe instanceof HTMLIFrameElement) || !iframe.contentDocument) {
              return { error: `Cannot access iframe: ${frameSelector}` };
            }
            doc = iframe.contentDocument;
          }
          const target = selector ? (doc.querySelector(selector) ?? doc) : doc;
          const overview = ProgressiveExtractor.extractStructure(target);
          const meta = { title: document.title, url: location.href };
          result = MarkdownFormatter.structure(
            overview,
            formatOptions ?? { detail: 'summary' },
            meta
          );
          break;
        }
        case 'extractRegion': {
          const regionArgs = args;
          const { selector, mode, frameSelector, options, formatOptions } = regionArgs;
          let doc = document;
          if (frameSelector) {
            const iframe = document.querySelector(frameSelector);
            if (!iframe || !(iframe instanceof HTMLIFrameElement) || !iframe.contentDocument) {
              return { error: `Cannot access iframe: ${frameSelector}` };
            }
            doc = iframe.contentDocument;
          }
          const extractOptions = {
            ...(options || {}),
            mode: mode || 'interactive',
          };
          const extractResult = ProgressiveExtractor.extractRegion(
            selector,
            doc,
            extractOptions,
            SmartDOMReader
          );
          if (!extractResult) {
            return { error: `No element found matching selector: ${selector}` };
          }
          const meta = { title: document.title, url: location.href };
          result = MarkdownFormatter.region(
            extractResult,
            formatOptions ?? { detail: 'region' },
            meta
          );
          break;
        }
        case 'extractContent': {
          const contentArgs = args;
          const { selector, frameSelector, options, formatOptions } = contentArgs;
          let doc = document;
          if (frameSelector) {
            const iframe = document.querySelector(frameSelector);
            if (!iframe || !(iframe instanceof HTMLIFrameElement) || !iframe.contentDocument) {
              return { error: `Cannot access iframe: ${frameSelector}` };
            }
            doc = iframe.contentDocument;
          }
          const extractOptions = options || {};
          const extractResult = ProgressiveExtractor.extractContent(selector, doc, extractOptions);
          if (!extractResult) {
            return { error: `No element found matching selector: ${selector}` };
          }
          const meta = { title: document.title, url: location.href };
          result = MarkdownFormatter.content(
            extractResult,
            formatOptions ?? { detail: 'region' },
            meta
          );
          break;
        }
        case 'extractInteractive': {
          const interactiveArgs = args;
          const { selector, frameSelector, options, formatOptions } = interactiveArgs;
          let doc = document;
          if (frameSelector) {
            const iframe = document.querySelector(frameSelector);
            if (!iframe || !(iframe instanceof HTMLIFrameElement) || !iframe.contentDocument) {
              return { error: `Cannot access iframe: ${frameSelector}` };
            }
            doc = iframe.contentDocument;
          }
          const extractResult = selector
            ? SmartDOMReader.extractFromElement(
                doc.querySelector(selector),
                'interactive',
                options || {}
              )
            : SmartDOMReader.extractInteractive(doc, options || {});
          const meta = { title: document.title, url: location.href };
          result = MarkdownFormatter.region(
            extractResult,
            formatOptions ?? { detail: 'region' },
            meta
          );
          break;
        }
        case 'extractFull': {
          const fullArgs = args;
          const { selector, frameSelector, options, formatOptions } = fullArgs;
          let doc = document;
          if (frameSelector) {
            const iframe = document.querySelector(frameSelector);
            if (!iframe || !(iframe instanceof HTMLIFrameElement) || !iframe.contentDocument) {
              return { error: `Cannot access iframe: ${frameSelector}` };
            }
            doc = iframe.contentDocument;
          }
          const extractResult = selector
            ? SmartDOMReader.extractFromElement(doc.querySelector(selector), 'full', options || {})
            : SmartDOMReader.extractFull(doc, options || {});
          const meta = { title: document.title, url: location.href };
          result = MarkdownFormatter.region(
            extractResult,
            formatOptions ?? { detail: 'deep' },
            meta
          );
          break;
        }
        default:
          return { error: `Unknown method: ${method}` };
      }
      return result;
    } catch (error) {
      return {
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
  const SmartDOMReaderBundle2 = { executeExtraction };
  exports.SmartDOMReaderBundle = SmartDOMReaderBundle2;
  exports.executeExtraction = executeExtraction;
  Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });
  return exports;
})({});
