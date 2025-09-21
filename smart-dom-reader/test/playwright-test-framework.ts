/**
 * Playwright Testing Framework for Smart DOM Reader
 * Simulates Chrome Extension script injection and messaging patterns
 */

import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Test framework that simulates Chrome extension behavior
 */
export class SmartDOMReaderTestFramework {
  private libraryCode: string | null = null;

  constructor() {
    this.loadLibraryCode();
  }

  /**
   * Load the built library code
   */
  private loadLibraryCode(): void {
    try {
      const distPath = join(__dirname, '../dist/index.js');
      this.libraryCode = readFileSync(distPath, 'utf-8');
      console.log('✅ Library code loaded successfully');
    } catch (error) {
      console.error('❌ Failed to load library. Run "pnpm build" first.');
      this.libraryCode = null;
    }
  }

  /**
   * Simulates chrome.scripting.executeScript injection pattern
   */
  createInjectionScript(params: any = {}): string {
    return `
      // Simulate Chrome extension script injection
      (function(params) {
        try {
          // Step 1: Inject the library (simulating content script injection)
          ${this.libraryCode || this.getFallbackLibrary()}

          // Step 2: Execute with params (simulating message passing)
          const executeExtraction = () => {
            try {
              const { SmartDOMReader, ProgressiveExtractor, SelectorGenerator } = window;

              // Parse extraction params
              const {
                mode = 'interactive',
                selector = null,
                frameSelector = null,
                options = {}
              } = params;

              // Handle iframe selection if specified
              let targetDoc = document;
              let targetElement = document.body;

              if (frameSelector) {
                const iframe = document.querySelector(frameSelector);
                if (iframe && iframe.contentDocument) {
                  targetDoc = iframe.contentDocument;
                  targetElement = targetDoc.body;
                }
              }

              if (selector) {
                targetElement = targetDoc.querySelector(selector) || targetElement;
              }

              // Perform extraction based on mode
              let result;
              switch(params.action) {
                case 'extractStructure':
                  result = ProgressiveExtractor.extractStructure(targetDoc);
                  break;

                case 'extractRegion':
                  result = ProgressiveExtractor.extractRegion(
                    selector || 'body',
                    targetDoc,
                    options
                  );
                  break;

                case 'extractContent':
                  result = ProgressiveExtractor.extractContent(
                    selector || 'body',
                    targetDoc,
                    options
                  );
                  break;

                case 'extractInteractive':
                  result = SmartDOMReader.extractInteractive(targetDoc, options);
                  break;

                case 'extractFull':
                  result = SmartDOMReader.extractFull(targetDoc, options);
                  break;

                default:
                  // Default extraction
                  const reader = new SmartDOMReader({ ...options, mode });
                  result = reader.extract(targetElement, options);
              }

              // Simulate Chrome extension response
              return {
                success: true,
                tabId: params.tabId || 'test',
                frameId: params.frameId || 0,
                timestamp: Date.now(),
                result: result
              };

            } catch (error) {
              return {
                success: false,
                error: error.message,
                stack: error.stack,
                params: params
              };
            }
          };

          return executeExtraction();

        } catch (error) {
          return {
            success: false,
            error: 'Library injection failed: ' + error.message
          };
        }
      })(${JSON.stringify(params)});
    `;
  }

  /**
   * Get fallback library for when the built version isn't available
   */
  private getFallbackLibrary(): string {
    return `
      // Fallback minimal implementation for testing
      window.SmartDOMReader = class SmartDOMReader {
        constructor(options = {}) {
          this.options = options;
        }

        extract(rootElement = document, runtimeOptions = {}) {
          const options = { ...this.options, ...runtimeOptions };
          return this.constructor.extractInteractive(rootElement, options);
        }

        static extractInteractive(doc, options = {}) {
          const buttons = Array.from(doc.querySelectorAll('button, [role="button"], input[type="button"], input[type="submit"]'));
          const links = Array.from(doc.querySelectorAll('a[href]'));
          const inputs = Array.from(doc.querySelectorAll('input:not([type="button"]):not([type="submit"]), textarea, select'));
          const forms = Array.from(doc.querySelectorAll('form'));

          return {
            mode: 'interactive',
            timestamp: Date.now(),
            page: {
              url: doc.location?.href || '',
              title: doc.title || ''
            },
            landmarks: {
              forms: forms.map(f => f.id || 'form')
            },
            interactive: {
              buttons: buttons.map(el => ({
                text: el.textContent?.trim() || el.value || '',
                tag: el.tagName.toLowerCase(),
                selector: {
                  css: el.id ? '#' + el.id : '.' + (el.className?.split(' ')[0] || el.tagName.toLowerCase())
                }
              })),
              links: links.map(el => ({
                text: el.textContent?.trim() || '',
                href: el.href,
                tag: 'a',
                selector: {
                  css: el.id ? '#' + el.id : 'a'
                }
              })),
              inputs: inputs.map(el => ({
                text: el.value || el.placeholder || '',
                type: el.type || 'text',
                name: el.name || '',
                tag: el.tagName.toLowerCase(),
                selector: {
                  css: el.id ? '#' + el.id : el.name ? '[name="' + el.name + '"]' : el.tagName.toLowerCase()
                }
              })),
              forms: forms.map(form => ({
                selector: form.id ? '#' + form.id : 'form',
                action: form.action || null,
                method: form.method || 'get'
              }))
            }
          };
        }

        static extractFull(doc, options = {}) {
          const interactive = this.extractInteractive(doc, options);
          const headings = Array.from(doc.querySelectorAll('h1, h2, h3, h4, h5, h6'));
          const paragraphs = Array.from(doc.querySelectorAll('p'));

          return {
            ...interactive,
            mode: 'full',
            semantic: {
              headings: headings.map(el => ({
                level: parseInt(el.tagName[1]),
                text: el.textContent?.trim() || '',
                tag: el.tagName.toLowerCase()
              })),
              paragraphs: paragraphs.map(el => ({
                text: el.textContent?.trim() || ''
              }))
            }
          };
        }
      };

      window.ProgressiveExtractor = class ProgressiveExtractor {
        static extractStructure(doc) {
          const forms = Array.from(doc.querySelectorAll('form'));
          const main = doc.querySelector('main, [role="main"], article, .content, #content');

          return {
            regions: {
              main: main ? { selector: this.getSelector(main) } : null
            },
            forms: forms.map(f => ({
              selector: this.getSelector(f),
              inputCount: f.querySelectorAll('input, textarea, select').length
            })),
            summary: {
              totalInteractive: doc.querySelectorAll('button, a, input, textarea, select').length,
              totalForms: forms.length,
              mainContentSelector: main ? this.getSelector(main) : null
            },
            suggestions: []
          };
        }

        static extractRegion(selector, doc, options = {}) {
          const element = doc.querySelector(selector);
          if (!element) return null;
          return window.SmartDOMReader.extractInteractive(element, options);
        }

        static extractContent(selector, doc, options = {}) {
          const element = doc.querySelector(selector);
          if (!element) return null;

          return {
            selector,
            text: {
              paragraphs: Array.from(element.querySelectorAll('p')).map(p => p.textContent?.trim() || ''),
              headings: Array.from(element.querySelectorAll('h1, h2, h3, h4, h5, h6')).map(h => ({
                level: parseInt(h.tagName[1]),
                text: h.textContent?.trim() || ''
              }))
            },
            metadata: {
              wordCount: element.textContent?.trim().split(/\\s+/).length || 0,
              hasInteractive: element.querySelectorAll('button, a, input').length > 0
            }
          };
        }

        static getSelector(element) {
          return element.id ? '#' + element.id :
                 element.className ? '.' + element.className.split(' ')[0] :
                 element.tagName.toLowerCase();
        }
      };

      window.SelectorGenerator = window.SelectorGenerator || {};
    `;
  }

  /**
   * Generate test configuration for different scenarios
   */
  generateTestConfig(scenario: string): any {
    const configs: Record<string, any> = {
      'basic-interactive': {
        action: 'extractInteractive',
        mode: 'interactive',
        options: {},
      },
      'full-extraction': {
        action: 'extractFull',
        mode: 'full',
        options: {},
      },
      'progressive-structure': {
        action: 'extractStructure',
        options: {},
      },
      'progressive-region': {
        action: 'extractRegion',
        selector: 'main, article, [role="main"], .content',
        options: { mode: 'interactive' },
      },
      'progressive-content': {
        action: 'extractContent',
        selector: 'main, article, [role="main"], .content',
        options: {
          includeHeadings: true,
          includeLists: true,
          includeMedia: true,
        },
      },
      'form-extraction': {
        action: 'extractInteractive',
        selector: 'form',
        options: {
          mode: 'interactive',
        },
      },
      'iframe-extraction': {
        action: 'extractInteractive',
        frameSelector: 'iframe',
        options: {},
      },
      'viewport-only': {
        action: 'extractInteractive',
        options: {
          viewportOnly: true,
        },
      },
      'hidden-elements': {
        action: 'extractInteractive',
        options: {
          includeHidden: true,
        },
      },
      'custom-selectors': {
        action: 'extractInteractive',
        options: {
          customSelectors: ['[data-testid]', '[data-test]', '[data-cy]', '[data-qa]'],
        },
      },
    };

    return configs[scenario] || configs['basic-interactive'];
  }

  /**
   * Format results for display
   */
  formatResults(results: any): string {
    if (!results.success) {
      return `❌ Extraction Failed\nError: ${results.error}\n${results.stack || ''}`;
    }

    const output: string[] = ['✅ Extraction Successful\n'];
    const data = results.result;

    if (data.page) {
      output.push('📄 Page Info:');
      output.push(`  URL: ${data.page.url}`);
      output.push(`  Title: ${data.page.title}`);
      output.push('');
    }

    if (data.interactive) {
      output.push('🎯 Interactive Elements:');
      output.push(`  Buttons: ${data.interactive.buttons?.length || 0}`);
      output.push(`  Links: ${data.interactive.links?.length || 0}`);
      output.push(`  Inputs: ${data.interactive.inputs?.length || 0}`);
      output.push(`  Forms: ${data.interactive.forms?.length || 0}`);
      output.push('');
    }

    if (data.semantic) {
      output.push('📝 Semantic Elements:');
      output.push(`  Headings: ${data.semantic.headings?.length || 0}`);
      output.push(`  Paragraphs: ${data.semantic.paragraphs?.length || 0}`);
      output.push(`  Images: ${data.semantic.images?.length || 0}`);
      output.push('');
    }

    if (data.summary) {
      output.push('📊 Summary:');
      Object.entries(data.summary).forEach(([key, value]) => {
        output.push(`  ${key}: ${value}`);
      });
      output.push('');
    }

    if (data.suggestions?.length > 0) {
      output.push('💡 Suggestions:');
      data.suggestions.forEach((suggestion: string) => {
        output.push(`  • ${suggestion}`);
      });
    }

    return output.join('\n');
  }
}

// Export for use in tests
export default SmartDOMReaderTestFramework;
