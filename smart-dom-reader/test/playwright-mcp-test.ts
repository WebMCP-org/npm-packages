/**
 * Smart DOM Reader - Playwright MCP Tests
 *
 * This file contains test functions that will be executed using Playwright MCP browser tools.
 * Each function tests different aspects of the Smart DOM Reader library.
 */

// Test 1: Basic Interactive Elements Extraction
export async function testBasicInteractiveExtraction() {
  const testCode = `
    // Test SmartDOMReader.extractInteractive()
    const result = SmartDOMReader.extractInteractive(document);

    console.log('=== Interactive Extraction Results ===');
    console.log('Buttons found:', result.interactive.buttons.length);
    console.log('Links found:', result.interactive.links.length);
    console.log('Inputs found:', result.interactive.inputs.length);
    console.log('Forms found:', result.interactive.forms.length);

    // Test specific button extraction
    const primaryBtn = result.interactive.buttons.find(b => b.attributes.id === 'primary-btn');
    console.log('\\nPrimary button:', {
      text: primaryBtn?.text,
      selectors: primaryBtn?.selector,
      hasClickHandler: primaryBtn?.interaction.hasClickHandler
    });

    // Test form extraction
    const testForm = result.interactive.forms[0];
    console.log('\\nTest form:', {
      selector: testForm?.selector,
      action: testForm?.action,
      method: testForm?.method,
      inputs: testForm?.inputs.length,
      buttons: testForm?.buttons.length
    });

    // Verify different selector strategies
    result.interactive.buttons.forEach(button => {
      console.log(\`Button "\${button.text}":\`, {
        css: button.selector.css,
        xpath: button.selector.xpath,
        textBased: button.selector.textBased,
        dataTestId: button.selector.dataTestId,
        ariaLabel: button.selector.ariaLabel
      });
    });

    return result;
  `;

  return testCode;
}

// Test 2: Full Mode Extraction with Semantic Elements
export async function testFullModeExtraction() {
  const testCode = `
    // Test SmartDOMReader.extractFull()
    const result = SmartDOMReader.extractFull(document);

    console.log('=== Full Mode Extraction Results ===');
    console.log('Mode:', result.mode);
    console.log('\\nInteractive elements:', {
      buttons: result.interactive.buttons.length,
      links: result.interactive.links.length,
      inputs: result.interactive.inputs.length
    });

    console.log('\\nSemantic elements:', {
      headings: result.semantic?.headings.length,
      images: result.semantic?.images.length,
      tables: result.semantic?.tables.length,
      lists: result.semantic?.lists.length,
      articles: result.semantic?.articles.length
    });

    console.log('\\nMetadata:', result.metadata);

    // Test heading hierarchy
    result.semantic?.headings.forEach(heading => {
      console.log(\`\${heading.tag}: "\${heading.text}"\`);
    });

    // Test image extraction
    const firstImage = result.semantic?.images[0];
    if (firstImage) {
      console.log('\\nFirst image:', {
        alt: firstImage.attributes.alt,
        src: firstImage.attributes.src?.substring(0, 50) + '...'
      });
    }

    // Test table extraction
    const firstTable = result.semantic?.tables[0];
    if (firstTable) {
      console.log('\\nFirst table selector:', firstTable.selector.css);
    }

    return result;
  `;

  return testCode;
}

// Test 3: Progressive Extraction Approach
export async function testProgressiveExtraction() {
  const testCode = `
    // Test ProgressiveExtractor step-by-step approach
    console.log('=== Progressive Extraction Test ===');

    // Step 1: Extract page structure
    const structure = ProgressiveExtractor.extractStructure(document);
    console.log('\\nPage Structure:', {
      regions: Object.keys(structure.regions),
      forms: structure.forms.length,
      mainContentSelector: structure.summary.mainContentSelector
    });

    console.log('\\nSuggestions:', structure.suggestions);

    // Step 2: Extract specific region (main content)
    const mainSelector = structure.summary.mainContentSelector || 'main';
    const mainContent = ProgressiveExtractor.extractRegion(
      mainSelector,
      document,
      { mode: 'interactive' }
    );

    console.log('\\nMain Content Extraction:', {
      buttons: mainContent.interactive.buttons.length,
      links: mainContent.interactive.links.length,
      inputs: mainContent.interactive.inputs.length
    });

    // Step 3: Extract readable content
    const content = ProgressiveExtractor.extractContent(
      mainSelector,
      document,
      { includeHeadings: true, includeLists: true }
    );

    console.log('\\nContent Extraction:', {
      wordCount: content.metadata.wordCount,
      headings: content.text.headings?.length,
      lists: content.text.lists?.length,
      hasInteractive: content.metadata.hasInteractive
    });

    // Display extracted text preview
    if (content.text.paragraphs && content.text.paragraphs.length > 0) {
      console.log('\\nFirst paragraph:', content.text.paragraphs[0].substring(0, 100) + '...');
    }

    return { structure, mainContent, content };
  `;

  return testCode;
}

// Test 4: Shadow DOM Support
export async function testShadowDOMExtraction() {
  const testCode = `
    // Test Shadow DOM traversal
    console.log('=== Shadow DOM Extraction Test ===');

    // First, check regular extraction
    const withoutShadow = new SmartDOMReader({ includeShadowDOM: false });
    const resultWithout = withoutShadow.extract(document);

    // Then with Shadow DOM enabled
    const withShadow = new SmartDOMReader({ includeShadowDOM: true });
    const resultWith = withShadow.extract(document);

    console.log('\\nWithout Shadow DOM:', {
      buttons: resultWithout.interactive.buttons.length,
      inputs: resultWithout.interactive.inputs.length
    });

    console.log('\\nWith Shadow DOM:', {
      buttons: resultWith.interactive.buttons.length,
      inputs: resultWith.interactive.inputs.length
    });

    // Find shadow DOM elements
    const shadowButtons = resultWith.interactive.buttons.filter(b =>
      b.text.toLowerCase().includes('shadow') ||
      b.text.toLowerCase().includes('custom')
    );

    console.log('\\nShadow DOM buttons found:', shadowButtons.length);
    shadowButtons.forEach(btn => {
      console.log(\`  - "\${btn.text}"\`);
    });

    return { withoutShadow: resultWithout, withShadow: resultWith };
  `;

  return testCode;
}

// Test 5: Iframe Support
export async function testIframeExtraction() {
  const testCode = `
    // Test iframe content extraction
    console.log('=== Iframe Extraction Test ===');

    // Test without iframe support
    const withoutIframes = new SmartDOMReader({ includeIframes: false });
    const resultWithout = withoutIframes.extract(document);

    // Test with iframe support
    const withIframes = new SmartDOMReader({ includeIframes: true });
    const resultWith = withIframes.extract(document);

    console.log('\\nWithout iframes:', {
      buttons: resultWithout.interactive.buttons.length,
      inputs: resultWithout.interactive.inputs.length,
      links: resultWithout.interactive.links.length
    });

    console.log('\\nWith iframes:', {
      buttons: resultWith.interactive.buttons.length,
      inputs: resultWith.interactive.inputs.length,
      links: resultWith.interactive.links.length
    });

    // Find iframe-specific elements
    const iframeButtons = resultWith.interactive.buttons.filter(b =>
      b.text.toLowerCase().includes('iframe')
    );

    console.log('\\nIframe buttons found:', iframeButtons.length);
    iframeButtons.forEach(btn => {
      console.log(\`  - "\${btn.text}"\`);
    });

    return { withoutIframes: resultWithout, withIframes: resultWith };
  `;

  return testCode;
}

// Test 6: Complex Form Extraction
export async function testComplexFormExtraction() {
  const testCode = `
    // Test complex form extraction
    console.log('=== Complex Form Extraction Test ===');

    const result = SmartDOMReader.extractInteractive(document);

    console.log('Total forms found:', result.interactive.forms.length);

    // Analyze each form
    result.interactive.forms.forEach((form, index) => {
      console.log(\`\\nForm #\${index + 1}:\`);
      console.log('  Selector:', form.selector);
      console.log('  Action:', form.action);
      console.log('  Method:', form.method);
      console.log('  Inputs:', form.inputs.length);
      console.log('  Buttons:', form.buttons.length);

      // Categorize input types
      const inputTypes = {};
      form.inputs.forEach(input => {
        const type = input.attributes.type || 'text';
        inputTypes[type] = (inputTypes[type] || 0) + 1;
      });
      console.log('  Input types:', inputTypes);

      // Find required fields
      const requiredFields = form.inputs.filter(input =>
        input.attributes.required === 'true' ||
        input.attributes.required === ''
      );
      console.log('  Required fields:', requiredFields.length);

      // Check for file inputs
      const fileInputs = form.inputs.filter(input =>
        input.attributes.type === 'file'
      );
      if (fileInputs.length > 0) {
        console.log('  Has file upload:', true);
      }

      // Check for multi-select
      const multiSelects = form.inputs.filter(input =>
        input.attributes.multiple === 'true' ||
        input.attributes.multiple === ''
      );
      if (multiSelects.length > 0) {
        console.log('  Has multi-select:', true);
      }
    });

    // Test disabled elements
    const allInputs = result.interactive.inputs;
    const disabledInputs = allInputs.filter(input =>
      input.interaction.isDisabled
    );
    console.log('\\nDisabled inputs found:', disabledInputs.length);

    return result;
  `;

  return testCode;
}

// Test 7: Visibility and Viewport Filtering
export async function testVisibilityAndViewport() {
  const testCode = `
    // Test visibility and viewport filtering
    console.log('=== Visibility & Viewport Test ===');

    // Test with all elements (including hidden)
    const allElements = new SmartDOMReader({
      includeHidden: true,
      viewportOnly: false
    });
    const resultAll = allElements.extract(document);

    // Test visible only
    const visibleOnly = new SmartDOMReader({
      includeHidden: false,
      viewportOnly: false
    });
    const resultVisible = visibleOnly.extract(document);

    // Test viewport only
    const viewportOnly = new SmartDOMReader({
      includeHidden: false,
      viewportOnly: true
    });
    const resultViewport = viewportOnly.extract(document);

    console.log('\\nAll elements (including hidden):', {
      buttons: resultAll.interactive.buttons.length,
      inputs: resultAll.interactive.inputs.length,
      links: resultAll.interactive.links.length
    });

    console.log('\\nVisible elements only:', {
      buttons: resultVisible.interactive.buttons.length,
      inputs: resultVisible.interactive.inputs.length,
      links: resultVisible.interactive.links.length
    });

    console.log('\\nViewport elements only:', {
      buttons: resultViewport.interactive.buttons.length,
      inputs: resultViewport.interactive.inputs.length,
      links: resultViewport.interactive.links.length
    });

    // Check page state detection
    console.log('\\nPage state:', {
      hasErrors: resultAll.page.hasErrors,
      isLoading: resultAll.page.isLoading,
      hasModals: resultAll.page.hasModals,
      hasFocus: resultAll.page.hasFocus
    });

    // Find hidden buttons for verification
    const allButtons = resultAll.interactive.buttons;
    const hiddenButtons = allButtons.filter(b => b.interaction.isHidden);
    console.log('\\nHidden buttons detected:', hiddenButtons.length);

    return { all: resultAll, visible: resultVisible, viewport: resultViewport };
  `;

  return testCode;
}

// Test 8: Custom Selectors and Filtering
export async function testCustomSelectors() {
  const testCode = `
    // Test custom selector extraction
    console.log('=== Custom Selectors Test ===');

    // Extract with custom selectors for test attributes
    const reader = new SmartDOMReader({
      customSelectors: [
        '[data-cy]',
        '[data-test]',
        '[data-qa]',
        '[data-testid]'
      ]
    });

    const result = reader.extract(document);

    console.log('\\nCustom selector elements found:', result.interactive.clickable.length);

    result.interactive.clickable.forEach(element => {
      console.log(\`\\nElement: \${element.tag}\`);
      console.log('  Text:', element.text);
      console.log('  Attributes:', {
        'data-cy': element.attributes['data-cy'],
        'data-test': element.attributes['data-test'],
        'data-qa': element.attributes['data-qa'],
        'data-testid': element.attributes['data-testid']
      });
      console.log('  Selectors:', element.selector);
    });

    // Test with filter function
    const filtered = new SmartDOMReader({
      filter: (element) => {
        // Only include elements with test attributes
        return element.hasAttribute('data-cy') ||
               element.hasAttribute('data-test') ||
               element.hasAttribute('data-qa') ||
               element.hasAttribute('data-testid');
      }
    });

    const filteredResult = filtered.extract(document);
    console.log('\\nFiltered extraction:', {
      buttons: filteredResult.interactive.buttons.length,
      inputs: filteredResult.interactive.inputs.length,
      links: filteredResult.interactive.links.length
    });

    return { custom: result, filtered: filteredResult };
  `;

  return testCode;
}

// Test 9: Main Content Detection
export async function testMainContentDetection() {
  const testCode = `
    // Test main content detection
    console.log('=== Main Content Detection Test ===');

    // Test without main content focus
    const fullPage = new SmartDOMReader({ mainContentOnly: false });
    const resultFull = fullPage.extract(document);

    // Test with main content focus
    const mainOnly = new SmartDOMReader({ mainContentOnly: true });
    const resultMain = mainOnly.extract(document);

    console.log('\\nFull page extraction:', {
      buttons: resultFull.interactive.buttons.length,
      links: resultFull.interactive.links.length,
      inputs: resultFull.interactive.inputs.length
    });

    console.log('\\nMain content only:', {
      buttons: resultMain.interactive.buttons.length,
      links: resultMain.interactive.links.length,
      inputs: resultMain.interactive.inputs.length,
      mainContentSelector: resultMain.metadata?.mainContent
    });

    // Test content detection utilities
    const landmarks = resultFull.landmarks;
    console.log('\\nLandmarks detected:', {
      navigation: landmarks.navigation.length,
      main: landmarks.main.length,
      forms: landmarks.forms.length,
      headers: landmarks.headers.length,
      footers: landmarks.footers.length,
      articles: landmarks.articles.length,
      sections: landmarks.sections.length
    });

    return { fullPage: resultFull, mainContent: resultMain };
  `;

  return testCode;
}

// Test 10: Performance and Large Pages
export async function testPerformance() {
  const testCode = `
    // Test performance with different configurations
    console.log('=== Performance Test ===');

    const configs = [
      { name: 'Minimal', options: { mode: 'interactive', viewportOnly: true, maxDepth: 3 } },
      { name: 'Standard', options: { mode: 'interactive' } },
      { name: 'Full', options: { mode: 'full' } },
      { name: 'Everything', options: { mode: 'full', includeHidden: true, includeIframes: true } }
    ];

    const results = [];

    for (const config of configs) {
      const startTime = performance.now();
      const reader = new SmartDOMReader(config.options);
      const result = reader.extract(document);
      const endTime = performance.now();

      const stats = {
        name: config.name,
        time: Math.round(endTime - startTime),
        elements: result.metadata?.extractedElements ||
                  result.interactive.buttons.length +
                  result.interactive.links.length +
                  result.interactive.inputs.length
      };

      results.push(stats);
      console.log(\`\\n\${config.name}:\`);
      console.log(\`  Time: \${stats.time}ms\`);
      console.log(\`  Elements: \${stats.elements}\`);
    }

    return results;
  `;

  return testCode;
}

// Helper function to inject the library
export function getLibraryInjectionCode(): string {
  return `
    // This will be replaced with actual library code
    // For now, we'll check if the library is available
    if (typeof SmartDOMReader === 'undefined' || typeof ProgressiveExtractor === 'undefined') {
      console.error('Smart DOM Reader library not loaded!');
      return false;
    }
    console.log('✅ Smart DOM Reader library loaded successfully');
    return true;
  `;
}

// Export all test functions
export const tests = {
  basicInteractive: testBasicInteractiveExtraction,
  fullMode: testFullModeExtraction,
  progressive: testProgressiveExtraction,
  shadowDOM: testShadowDOMExtraction,
  iframes: testIframeExtraction,
  complexForms: testComplexFormExtraction,
  visibility: testVisibilityAndViewport,
  customSelectors: testCustomSelectors,
  mainContent: testMainContentDetection,
  performance: testPerformance,
};

export default tests;
