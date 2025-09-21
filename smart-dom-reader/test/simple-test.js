/**
 * Super Simple Test for Smart DOM Reader
 * Run this with Playwright MCP to test DOM extraction
 */

// This is the test function an agent would inject
const testExtraction = (params = {}) => {
  const {
    action = 'extractStructure', // What to do
    selector = null, // Target element
    options = {}, // Extraction options
  } = params;

  // Results object
  const results = {
    action: action,
    timestamp: Date.now(),
    data: null,
    error: null,
  };

  try {
    // Check if library exists (would be injected in real scenario)
    if (typeof SmartDOMReader === 'undefined') {
      // Fallback implementation for testing
      window.SmartDOMReader = {
        extractInteractive: (doc) => {
          const buttons = Array.from(doc.querySelectorAll('button, [role="button"]'));
          const links = Array.from(doc.querySelectorAll('a[href]'));
          const inputs = Array.from(doc.querySelectorAll('input, textarea, select'));

          return {
            interactive: {
              buttons: buttons.map((b) => ({
                text: b.textContent?.trim().substring(0, 50) || b.value || '',
                selector: b.id ? '#' + b.id : 'button',
              })),
              links: links.map((l) => ({
                text: l.textContent?.trim().substring(0, 50) || '',
                href: l.href,
              })),
              inputs: inputs.map((i) => ({
                type: i.type || 'text',
                name: i.name || '',
                value: i.value || '',
              })),
            },
            summary: {
              totalButtons: buttons.length,
              totalLinks: links.length,
              totalInputs: inputs.length,
            },
          };
        },
      };

      window.ProgressiveExtractor = {
        extractStructure: (doc) => {
          const main = doc.querySelector('main, [role="main"], #content, .content');
          const forms = doc.querySelectorAll('form');

          return {
            regions: {
              main: main ? { selector: main.id ? '#' + main.id : 'main' } : null,
              hasHeader: !!doc.querySelector('header'),
              hasFooter: !!doc.querySelector('footer'),
              hasSidebar: !!doc.querySelector('aside, [role="complementary"]'),
            },
            forms: Array.from(forms).map((f) => ({
              selector: f.id ? '#' + f.id : 'form',
              inputs: f.querySelectorAll('input, textarea, select').length,
            })),
            summary: {
              totalInteractive: doc.querySelectorAll('button, a, input').length,
              mainContentSelector: main ? (main.id ? '#' + main.id : 'main') : null,
            },
            suggestions: [],
          };
        },

        extractRegion: (sel, doc) => {
          const element = doc.querySelector(sel);
          if (!element) return { error: 'Element not found: ' + sel };

          return window.SmartDOMReader.extractInteractive(element);
        },

        extractContent: (sel, doc) => {
          const element = doc.querySelector(sel);
          if (!element) return { error: 'Element not found: ' + sel };

          const paragraphs = Array.from(element.querySelectorAll('p'));
          const headings = Array.from(element.querySelectorAll('h1, h2, h3, h4, h5, h6'));

          return {
            text: {
              paragraphs: paragraphs.map((p) => p.textContent?.trim().substring(0, 100)),
              headings: headings.map((h) => ({
                level: parseInt(h.tagName[1]),
                text: h.textContent?.trim().substring(0, 100),
              })),
            },
            metadata: {
              wordCount: element.textContent?.trim().split(/\s+/).length || 0,
              hasInteractive: element.querySelectorAll('button, a, input').length > 0,
            },
          };
        },
      };
    }

    // Execute the requested action
    const target = selector ? document.querySelector(selector) || document : document;

    switch (action) {
      case 'extractStructure':
        results.data = window.ProgressiveExtractor.extractStructure(document);
        break;

      case 'extractRegion':
        results.data = window.ProgressiveExtractor.extractRegion(selector || 'body', document);
        break;

      case 'extractContent':
        results.data = window.ProgressiveExtractor.extractContent(selector || 'body', document);
        break;

      case 'extractInteractive':
        results.data = window.SmartDOMReader.extractInteractive(target);
        break;

      default:
        results.error = 'Unknown action: ' + action;
    }
  } catch (error) {
    results.error = error.message;
  }

  // Log summary for debugging
  console.log('🎯 Extraction Complete:', action);
  if (results.data) {
    console.log('✅ Success');
    if (results.data.summary) {
      console.log('Summary:', results.data.summary);
    }
  } else {
    console.log('❌ Failed:', results.error);
  }

  return results;
};

// Test sequence that simulates agent behavior
const runAgentTest = () => {
  console.log('🤖 Agent DOM Extraction Test');
  console.log('============================\n');

  // Step 1: Get structure
  console.log('Step 1: Analyzing page structure...');
  const structure = testExtraction({
    action: 'extractStructure',
  });

  // Step 2: Extract main content if found
  if (structure.data?.summary?.mainContentSelector) {
    console.log('\nStep 2: Extracting main content region...');
    const mainContent = testExtraction({
      action: 'extractRegion',
      selector: structure.data.summary.mainContentSelector,
    });
  }

  // Step 3: Get all interactive elements
  console.log('\nStep 3: Extracting all interactive elements...');
  const interactive = testExtraction({
    action: 'extractInteractive',
  });

  // Return final results
  return {
    structure: structure.data,
    interactive: interactive.data,
    success: !structure.error && !interactive.error,
  };
};

// Make functions available globally for testing
window.testExtraction = testExtraction;
window.runAgentTest = runAgentTest;

// Auto-run if not in test environment
if (typeof window !== 'undefined' && !window.location.href.includes('test')) {
  console.log('💡 Functions ready to use:');
  console.log('   testExtraction(params) - Extract with specific params');
  console.log('   runAgentTest() - Run full agent simulation');
}
