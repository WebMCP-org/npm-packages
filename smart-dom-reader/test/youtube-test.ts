/**
 * YouTube Test Suite for Smart DOM Reader
 * Tests complex real-world DOM extraction scenarios
 */

export class YouTubeTestSuite {
  /**
   * Create test script for YouTube that simulates Chrome extension injection
   */
  static createYouTubeTestScript(testScenario: string = 'full') {
    return `
      (function() {
        // Inject Smart DOM Reader (simulating Chrome extension content script)
        ${this.getLibraryCode()}

        // Execute tests based on scenario
        const runTest = () => {
          const results = {
            scenario: '${testScenario}',
            timestamp: Date.now(),
            url: window.location.href,
            tests: {}
          };

          try {
            // Test 1: Basic Interactive Extraction
            console.log('🧪 Test 1: Extracting interactive elements...');
            const interactive = SmartDOMReader.extractInteractive(document);

            results.tests.interactive = {
              success: true,
              summary: {
                totalButtons: interactive.interactive.buttons.length,
                totalLinks: interactive.interactive.links.length,
                totalInputs: interactive.interactive.inputs.length,
                totalForms: interactive.interactive.forms.length
              },
              details: {
                // Sample of found elements
                sampleButtons: interactive.interactive.buttons.slice(0, 5).map(b => ({
                  text: b.text.substring(0, 50),
                  selector: b.selector.css
                })),
                sampleLinks: interactive.interactive.links.slice(0, 5).map(l => ({
                  text: l.text.substring(0, 50),
                  href: l.href
                }))
              }
            };

            // Test 2: Progressive Structure Extraction
            console.log('🧪 Test 2: Analyzing page structure...');
            const structure = ProgressiveExtractor.extractStructure(document);

            results.tests.structure = {
              success: true,
              regions: Object.keys(structure.regions),
              mainContent: structure.summary.mainContentSelector,
              totalInteractive: structure.summary.totalInteractive,
              suggestions: structure.suggestions
            };

            // Test 3: YouTube-specific elements
            console.log('🧪 Test 3: Finding YouTube-specific elements...');

            // Video player
            const videoPlayer = document.querySelector('video');
            const playerControls = document.querySelectorAll('.ytp-button, .ytp-play-button, .ytp-volume-slider');

            // Video metadata
            const videoTitle = document.querySelector('h1.ytd-video-primary-info-renderer, h1.title');
            const channelName = document.querySelector('#channel-name, .ytd-channel-name');
            const subscribeButton = document.querySelector('ytd-subscribe-button-renderer button, .subscribe-button');

            // Comments section
            const comments = document.querySelectorAll('ytd-comment-thread-renderer');
            const commentInput = document.querySelector('#contenteditable-root, #placeholder-area');

            // Recommendations
            const recommendations = document.querySelectorAll('ytd-compact-video-renderer, ytd-video-renderer');

            results.tests.youtubeElements = {
              success: true,
              player: {
                hasVideo: !!videoPlayer,
                controlsCount: playerControls.length,
                isPlaying: videoPlayer ? !videoPlayer.paused : false
              },
              metadata: {
                title: videoTitle?.textContent?.trim().substring(0, 100),
                channel: channelName?.textContent?.trim(),
                hasSubscribeButton: !!subscribeButton
              },
              engagement: {
                commentsCount: comments.length,
                hasCommentInput: !!commentInput,
                recommendationsCount: recommendations.length
              }
            };

            // Test 4: Search functionality
            console.log('🧪 Test 4: Testing search extraction...');
            const searchBox = document.querySelector('input#search, input[name="search_query"]');
            const searchButton = document.querySelector('#search-icon-legacy, button#search-button');

            results.tests.search = {
              success: true,
              hasSearchBox: !!searchBox,
              searchBoxSelector: searchBox ? SelectorGenerator.generateSelectors(searchBox).css : null,
              hasSearchButton: !!searchButton,
              searchButtonSelector: searchButton ? SelectorGenerator.generateSelectors(searchButton).css : null
            };

            // Test 5: Navigation elements
            console.log('🧪 Test 5: Extracting navigation...');
            const navItems = document.querySelectorAll('ytd-guide-entry-renderer, tp-yt-paper-item');
            const sidebar = document.querySelector('#guide-content, #sidebar');

            results.tests.navigation = {
              success: true,
              navItemsCount: navItems.length,
              hasSidebar: !!sidebar,
              sampleNavItems: Array.from(navItems).slice(0, 5).map(item =>
                item.textContent?.trim().substring(0, 30)
              )
            };

            // Test 6: Full extraction with filtering
            if ('${testScenario}' === 'full') {
              console.log('🧪 Test 6: Full extraction with semantic elements...');
              const fullExtract = SmartDOMReader.extractFull(document, {
                viewportOnly: true,
                mainContentOnly: false
              });

              results.tests.fullExtraction = {
                success: true,
                mode: fullExtract.mode,
                hasSemanticElements: !!fullExtract.semantic,
                semanticSummary: fullExtract.semantic ? {
                  headings: fullExtract.semantic.headings?.length || 0,
                  images: fullExtract.semantic.images?.length || 0,
                  lists: fullExtract.semantic.lists?.length || 0
                } : null,
                metadata: fullExtract.metadata
              };
            }

            // Test 7: Content extraction for video description
            console.log('🧪 Test 7: Extracting video description content...');
            const descriptionArea = document.querySelector('#description, .ytd-video-secondary-info-renderer');
            if (descriptionArea) {
              const content = ProgressiveExtractor.extractContent(
                '#description, .ytd-video-secondary-info-renderer',
                document,
                { includeHeadings: true, includeLists: true }
              );

              results.tests.contentExtraction = {
                success: true,
                wordCount: content?.metadata?.wordCount || 0,
                hasInteractive: content?.metadata?.hasInteractive || false,
                paragraphCount: content?.text?.paragraphs?.length || 0
              };
            }

            // Test 8: Complex selector generation
            console.log('🧪 Test 8: Testing selector generation...');
            const complexElements = [
              videoTitle,
              subscribeButton,
              searchBox,
              videoPlayer
            ].filter(el => el);

            results.tests.selectors = {
              success: true,
              elements: complexElements.map(el => {
                const selectors = SelectorGenerator.generateSelectors(el);
                return {
                  tag: el.tagName.toLowerCase(),
                  css: selectors.css,
                  xpath: selectors.xpath,
                  hasDataTestId: !!selectors.dataTestId,
                  hasAriaLabel: !!selectors.ariaLabel
                };
              })
            };

            // Test 9: Performance metrics
            console.log('🧪 Test 9: Performance metrics...');
            const startTime = performance.now();
            const perfTest = SmartDOMReader.extractInteractive(document, {
              maxDepth: 3,
              viewportOnly: true
            });
            const endTime = performance.now();

            results.tests.performance = {
              success: true,
              extractionTime: Math.round(endTime - startTime),
              totalElements: document.querySelectorAll('*').length,
              extractedElements: perfTest.interactive.buttons.length +
                                perfTest.interactive.links.length +
                                perfTest.interactive.inputs.length
            };

            return results;

          } catch (error) {
            return {
              ...results,
              error: error.message,
              stack: error.stack
            };
          }
        };

        // Execute and return results
        const testResults = runTest();

        // Display summary in console
        console.log('📊 YouTube Test Results Summary:');
        console.log('================================');
        Object.entries(testResults.tests).forEach(([testName, result]) => {
          console.log(\`\${result.success ? '✅' : '❌'} \${testName}\`);
          if (result.summary) {
            console.log('  ', result.summary);
          }
        });

        return testResults;
      })();
    `;
  }

  /**
   * Get the library code (simplified version for testing)
   */
  static getLibraryCode(): string {
    // This would be replaced with the actual built library code
    return `
      // Smart DOM Reader Library (injected)
      window.SmartDOMReader = class SmartDOMReader {
        static extractInteractive(doc, options = {}) {
          const buttons = Array.from(doc.querySelectorAll('button, [role="button"], input[type="button"], input[type="submit"], .yt-spec-button-shape-next'));
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
                text: (el.textContent?.trim() || el.value || el.getAttribute('aria-label') || '').substring(0, 100),
                tag: el.tagName.toLowerCase(),
                selector: {
                  css: el.id ? '#' + el.id : el.className ? '.' + el.className.split(' ')[0] : el.tagName.toLowerCase(),
                  xpath: '//' + el.tagName.toLowerCase() + (el.id ? '[@id="' + el.id + '"]' : ''),
                  ariaLabel: el.getAttribute('aria-label')
                },
                attributes: {
                  id: el.id,
                  className: el.className,
                  ariaLabel: el.getAttribute('aria-label')
                }
              })),
              links: links.map(el => ({
                text: (el.textContent?.trim() || '').substring(0, 100),
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
          const images = Array.from(doc.querySelectorAll('img'));
          const lists = Array.from(doc.querySelectorAll('ul, ol'));

          return {
            ...interactive,
            mode: 'full',
            semantic: {
              headings: headings.slice(0, 20).map(el => ({
                level: parseInt(el.tagName[1]),
                text: (el.textContent?.trim() || '').substring(0, 100),
                tag: el.tagName.toLowerCase()
              })),
              images: images.slice(0, 20).map(el => ({
                src: el.src,
                alt: el.alt || null
              })),
              lists: lists.length
            },
            metadata: {
              totalElements: doc.querySelectorAll('*').length,
              language: doc.documentElement.lang || null
            }
          };
        }
      };

      window.ProgressiveExtractor = class ProgressiveExtractor {
        static extractStructure(doc) {
          const main = doc.querySelector('ytd-app, #content, main, [role="main"]');
          const sidebar = doc.querySelector('#guide, #sidebar, aside');
          const header = doc.querySelector('#masthead, header');
          const player = doc.querySelector('#movie_player, .html5-video-player');

          return {
            regions: {
              main: main ? { selector: this.getSelector(main) } : null,
              sidebar: sidebar ? { selector: this.getSelector(sidebar) } : null,
              header: header ? { selector: this.getSelector(header) } : null,
              player: player ? { selector: this.getSelector(player) } : null
            },
            forms: Array.from(doc.querySelectorAll('form')).map(f => ({
              selector: this.getSelector(f)
            })),
            summary: {
              totalInteractive: doc.querySelectorAll('button, a, input, textarea, select').length,
              mainContentSelector: main ? this.getSelector(main) : null
            },
            suggestions: this.generateSuggestions(doc)
          };
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

        static generateSuggestions(doc) {
          const suggestions = [];

          if (doc.querySelector('video')) {
            suggestions.push('Video player detected - consider extracting player controls');
          }

          if (doc.querySelector('#comments, ytd-comments')) {
            suggestions.push('Comments section available - use progressive extraction for efficiency');
          }

          if (doc.querySelectorAll('ytd-video-renderer, ytd-compact-video-renderer').length > 10) {
            suggestions.push('Many video recommendations - consider viewport-only extraction');
          }

          return suggestions;
        }
      };

      window.SelectorGenerator = class SelectorGenerator {
        static generateSelectors(element) {
          return {
            css: element.id ? '#' + element.id :
                 element.className ? '.' + element.className.split(' ')[0] :
                 element.tagName.toLowerCase(),
            xpath: '//' + element.tagName.toLowerCase() +
                   (element.id ? '[@id="' + element.id + '"]' : ''),
            dataTestId: element.getAttribute('data-testid'),
            ariaLabel: element.getAttribute('aria-label')
          };
        }
      };
    `;
  }

  /**
   * Analyze test results and provide feedback
   */
  static analyzeResults(results: any): string {
    const analysis = [];

    analysis.push('📊 YouTube DOM Extraction Analysis');
    analysis.push('===================================\n');

    // Check interactive elements
    if (results.tests?.interactive) {
      const { summary } = results.tests.interactive;
      analysis.push('🎯 Interactive Elements:');
      analysis.push(`   Buttons: ${summary.totalButtons} found`);
      analysis.push(`   Links: ${summary.totalLinks} found`);
      analysis.push(`   Inputs: ${summary.totalInputs} found`);
      analysis.push(`   Forms: ${summary.totalForms} found`);

      if (summary.totalButtons < 10) {
        analysis.push(
          "   ⚠️  Low button count - may need to adjust selectors for YouTube's custom elements"
        );
      }
      analysis.push('');
    }

    // Check YouTube-specific elements
    if (results.tests?.youtubeElements) {
      const { player, metadata, engagement } = results.tests.youtubeElements;
      analysis.push('📺 YouTube-Specific Elements:');
      analysis.push(`   Video Player: ${player.hasVideo ? '✅ Found' : '❌ Not found'}`);
      analysis.push(`   Player Controls: ${player.controlsCount} found`);
      analysis.push(
        `   Video Title: ${metadata.title ? '✅ ' + metadata.title.substring(0, 50) + '...' : '❌ Not found'}`
      );
      analysis.push(`   Channel: ${metadata.channel || 'Not found'}`);
      analysis.push(`   Comments: ${engagement.commentsCount} loaded`);
      analysis.push(`   Recommendations: ${engagement.recommendationsCount} found`);
      analysis.push('');
    }

    // Check performance
    if (results.tests?.performance) {
      const { extractionTime, totalElements, extractedElements } = results.tests.performance;
      analysis.push('⚡ Performance:');
      analysis.push(`   Extraction Time: ${extractionTime}ms`);
      analysis.push(`   Total DOM Elements: ${totalElements}`);
      analysis.push(`   Extracted Elements: ${extractedElements}`);
      analysis.push(`   Efficiency: ${((extractedElements / totalElements) * 100).toFixed(2)}%`);

      if (extractionTime > 100) {
        analysis.push('   ⚠️  Extraction took >100ms - consider optimization');
      }
      analysis.push('');
    }

    // Provide recommendations
    analysis.push('💡 Recommendations:');
    if (results.tests?.structure?.suggestions) {
      results.tests.structure.suggestions.forEach((suggestion: string) => {
        analysis.push(`   • ${suggestion}`);
      });
    }

    return analysis.join('\n');
  }
}

// Export for use in testing
export default YouTubeTestSuite;
