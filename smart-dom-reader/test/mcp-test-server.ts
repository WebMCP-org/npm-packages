#!/usr/bin/env node

/**
 * Simple MCP Test Server for Smart DOM Reader
 *
 * Simulates how agents inject scripts and extract DOM data
 * Uses Playwright to inject scripts and return results
 */

import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { Browser, chromium, Page } from 'playwright';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Simple MCP-like server for testing DOM extraction
 */
class DOMExtractionTestServer {
  private browser: Browser | null = null;
  private page: Page | null = null;
  private libraryCode: string;

  constructor() {
    // Load the built library
    try {
      this.libraryCode = readFileSync(join(__dirname, '../dist/index.js'), 'utf-8');
      console.log('✅ Library loaded successfully');
    } catch (error) {
      console.error('⚠️ Could not load built library, using fallback');
      this.libraryCode = this.getFallbackLibrary();
    }
  }

  /**
   * Initialize browser
   */
  async init() {
    this.browser = await chromium.launch({
      headless: false, // Set to true for CI
      devtools: true,
    });
    this.page = await this.browser.newPage();
    console.log('🌐 Browser initialized');
  }

  /**
   * Navigate to a URL
   */
  async navigate(url: string) {
    if (!this.page) throw new Error('Browser not initialized');
    await this.page.goto(url);
    console.log(`📍 Navigated to: ${url}`);
  }

  /**
   * Main tool: Extract DOM structure (Step 1)
   * Similar to dom_extract_structure in Chrome extension
   */
  async extractStructure(params: { selector?: string } = {}) {
    if (!this.page) throw new Error('Browser not initialized');

    const result = await this.page.evaluate(
      (params) => {
        // This would be injected by the library
        const { libraryCode, selector } = params;

        // Inject library
        eval(libraryCode);

        // Execute extraction
        const ProgressiveExtractor = (window as any).ProgressiveExtractor;
        if (!ProgressiveExtractor) {
          return { error: 'ProgressiveExtractor not found' };
        }

        return ProgressiveExtractor.extractStructure(
          selector ? document.querySelector(selector) || document : document
        );
      },
      {
        libraryCode: this.libraryCode,
        ...params,
      }
    );

    return result;
  }

  /**
   * Extract specific region (Step 2)
   * Similar to dom_extract_region
   */
  async extractRegion(params: {
    selector: string;
    options?: {
      mode?: 'interactive' | 'full';
      includeHidden?: boolean;
      maxDepth?: number;
    };
  }) {
    if (!this.page) throw new Error('Browser not initialized');

    const result = await this.page.evaluate(
      (params) => {
        const { libraryCode, selector, options } = params;

        // Inject library
        eval(libraryCode);

        const ProgressiveExtractor = (window as any).ProgressiveExtractor;
        if (!ProgressiveExtractor) {
          return { error: 'ProgressiveExtractor not found' };
        }

        return ProgressiveExtractor.extractRegion(selector, document, options || {});
      },
      {
        libraryCode: this.libraryCode,
        ...params,
      }
    );

    return result;
  }

  /**
   * Extract content from region (Step 3)
   * Similar to dom_extract_content
   */
  async extractContent(params: {
    selector: string;
    options?: {
      includeHeadings?: boolean;
      includeLists?: boolean;
      includeMedia?: boolean;
      maxTextLength?: number;
    };
  }) {
    if (!this.page) throw new Error('Browser not initialized');

    const result = await this.page.evaluate(
      (params) => {
        const { libraryCode, selector, options } = params;

        // Inject library
        eval(libraryCode);

        const ProgressiveExtractor = (window as any).ProgressiveExtractor;
        if (!ProgressiveExtractor) {
          return { error: 'ProgressiveExtractor not found' };
        }

        return ProgressiveExtractor.extractContent(selector, document, options || {});
      },
      {
        libraryCode: this.libraryCode,
        ...params,
      }
    );

    return result;
  }

  /**
   * Quick interactive extraction
   */
  async extractInteractive(params: { selector?: string; options?: any } = {}) {
    if (!this.page) throw new Error('Browser not initialized');

    const result = await this.page.evaluate(
      (params) => {
        const { libraryCode, selector, options } = params;

        // Inject library
        eval(libraryCode);

        const SmartDOMReader = (window as any).SmartDOMReader;
        if (!SmartDOMReader) {
          return { error: 'SmartDOMReader not found' };
        }

        const target = selector ? document.querySelector(selector) || document : document;

        return SmartDOMReader.extractInteractive(target, options || {});
      },
      {
        libraryCode: this.libraryCode,
        ...params,
      }
    );

    return result;
  }

  /**
   * Cleanup
   */
  async close() {
    if (this.browser) {
      await this.browser.close();
      console.log('👋 Browser closed');
    }
  }

  /**
   * Get fallback library for testing
   */
  private getFallbackLibrary(): string {
    return `
      // Minimal fallback implementation
      window.SmartDOMReader = {
        extractInteractive: (doc, options) => {
          const buttons = Array.from(doc.querySelectorAll('button'));
          const links = Array.from(doc.querySelectorAll('a[href]'));
          const inputs = Array.from(doc.querySelectorAll('input, textarea, select'));

          return {
            interactive: {
              buttons: buttons.map(b => ({ text: b.textContent })),
              links: links.map(l => ({ text: l.textContent, href: l.href })),
              inputs: inputs.map(i => ({ type: i.type, name: i.name }))
            }
          };
        }
      };

      window.ProgressiveExtractor = {
        extractStructure: (doc) => ({
          regions: { main: { selector: 'body' } },
          summary: { totalInteractive: doc.querySelectorAll('button, a, input').length },
          suggestions: []
        }),
        extractRegion: (selector, doc, options) => {
          const el = doc.querySelector(selector);
          return el ? window.SmartDOMReader.extractInteractive(el, options) : null;
        },
        extractContent: (selector, doc, options) => ({
          text: { paragraphs: [] },
          metadata: { wordCount: 0 }
        })
      };
    `;
  }
}

/**
 * Example test flow - mimics how an agent would use it
 */
async function runAgentSimulation() {
  const server = new DOMExtractionTestServer();

  try {
    await server.init();

    // Test on your local test page with YouTube content
    const testPagePath = `file://${join(__dirname, 'test-page.html')}`;
    await server.navigate(testPagePath);

    // Or test on a real website
    // await server.navigate('https://github.com/microsoft/playwright');

    console.log('\n🤖 Simulating Agent Interaction');
    console.log('=================================\n');

    // Step 1: Agent asks for page structure
    console.log('Step 1: Get page structure');
    const structure = await server.extractStructure();
    console.log('Regions found:', Object.keys(structure.regions || {}));
    console.log('Total interactive elements:', structure.summary?.totalInteractive);
    console.log('Suggestions:', structure.suggestions);

    // Step 2: Agent decides to explore main content
    if (structure.summary?.mainContentSelector) {
      console.log('\nStep 2: Extract main region details');
      const mainRegion = await server.extractRegion({
        selector: structure.summary.mainContentSelector,
        options: { mode: 'interactive' },
      });

      if (!mainRegion.error) {
        console.log('Buttons in main:', mainRegion.interactive?.buttons?.length || 0);
        console.log('Links in main:', mainRegion.interactive?.links?.length || 0);
        console.log('Forms in main:', mainRegion.interactive?.forms?.length || 0);
      }
    }

    // Step 3: Agent wants specific content
    console.log('\nStep 3: Extract content from body');
    const content = await server.extractContent({
      selector: 'body',
      options: {
        includeHeadings: true,
        includeLists: true,
        maxTextLength: 100,
      },
    });
    console.log('Word count:', content.metadata?.wordCount);
    console.log('Has interactive:', content.metadata?.hasInteractive);

    // Quick test of interactive extraction
    console.log('\nQuick Interactive Test:');
    const interactive = await server.extractInteractive();
    console.log('Total buttons:', interactive.interactive?.buttons?.length || 0);
    console.log('Total links:', interactive.interactive?.links?.length || 0);
    console.log('Total inputs:', interactive.interactive?.inputs?.length || 0);
  } catch (error) {
    console.error('Test failed:', error);
  } finally {
    await server.close();
  }
}

// Export for use in other tests
export { DOMExtractionTestServer };

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runAgentSimulation().catch(console.error);
}
