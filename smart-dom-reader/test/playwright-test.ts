import { ProgressiveExtractor, SmartDOMReader } from '../src/index';

// Test utilities to inject and run the library in browser context
async function injectSmartDOMReader(page: any) {
  // Build the library code to inject
  const libraryCode = await page.evaluate(() => {
    // This will be replaced with the actual bundled code
    return `
      // Smart DOM Reader library code will be injected here
      window.SmartDOMReader = SmartDOMReader;
      window.ProgressiveExtractor = ProgressiveExtractor;
    `;
  });

  await page.addScriptTag({ content: libraryCode });
}

// Main test function
async function runTests() {
  console.log('🧪 Starting Smart DOM Reader Playwright Tests');

  // Test 1: Basic Interactive Extraction
  console.log('\n📝 Test 1: Basic Interactive Extraction');
  await testBasicInteractiveExtraction();

  // Test 2: Full Mode Extraction
  console.log('\n📝 Test 2: Full Mode Extraction');
  await testFullModeExtraction();

  // Test 3: Progressive Extraction
  console.log('\n📝 Test 3: Progressive Extraction');
  await testProgressiveExtraction();

  // Test 4: Form Detection and Extraction
  console.log('\n📝 Test 4: Form Detection and Extraction');
  await testFormExtraction();

  // Test 5: Selector Generation Strategies
  console.log('\n📝 Test 5: Selector Generation Strategies');
  await testSelectorStrategies();

  // Test 6: Content Detection
  console.log('\n📝 Test 6: Content Detection');
  await testContentDetection();

  // Test 7: Shadow DOM Support
  console.log('\n📝 Test 7: Shadow DOM Support');
  await testShadowDOM();

  // Test 8: Iframe Support
  console.log('\n📝 Test 8: Iframe Support');
  await testIframeSupport();

  // Test 9: Viewport and Hidden Elements
  console.log('\n📝 Test 9: Viewport and Hidden Elements');
  await testViewportAndHiddenElements();

  // Test 10: Custom Selectors
  console.log('\n📝 Test 10: Custom Selectors');
  await testCustomSelectors();

  console.log('\n✅ All tests completed!');
}

async function testBasicInteractiveExtraction() {
  // Test basic button, link, and input extraction
  const testHTML = `
    <!DOCTYPE html>
    <html>
      <head><title>Interactive Test</title></head>
      <body>
        <button id="submit-btn">Submit</button>
        <a href="/about">About Us</a>
        <input type="text" name="username" placeholder="Username">
        <textarea name="comment">Enter comment</textarea>
        <select name="country">
          <option>USA</option>
          <option>Canada</option>
        </select>
      </body>
    </html>
  `;

  // Will be implemented with actual Playwright browser context
}

async function testFullModeExtraction() {
  // Test extraction including semantic elements
  const testHTML = `
    <!DOCTYPE html>
    <html>
      <head><title>Full Mode Test</title></head>
      <body>
        <h1>Main Title</h1>
        <article>
          <h2>Article Title</h2>
          <p>Content paragraph</p>
          <img src="test.jpg" alt="Test Image">
        </article>
        <table>
          <tr><th>Name</th><th>Value</th></tr>
          <tr><td>Test</td><td>123</td></tr>
        </table>
        <ul>
          <li>Item 1</li>
          <li>Item 2</li>
        </ul>
      </body>
    </html>
  `;
}

async function testProgressiveExtraction() {
  // Test step-by-step extraction approach
  const testHTML = `
    <!DOCTYPE html>
    <html>
      <head><title>Progressive Test</title></head>
      <body>
        <nav>Navigation area</nav>
        <main>
          <article>
            <h1>Main Article</h1>
            <p>Article content</p>
          </article>
        </main>
        <footer>Footer content</footer>
      </body>
    </html>
  `;
}

async function testFormExtraction() {
  // Test complex form extraction
  const testHTML = `
    <!DOCTYPE html>
    <html>
      <body>
        <form id="login-form" action="/login" method="post">
          <input type="text" name="username" required>
          <input type="password" name="password" required>
          <input type="checkbox" name="remember" value="1">
          <button type="submit">Login</button>
          <button type="reset">Clear</button>
        </form>
      </body>
    </html>
  `;
}

async function testSelectorStrategies() {
  // Test different selector generation strategies
  const testHTML = `
    <!DOCTYPE html>
    <html>
      <body>
        <button id="unique-id">ID Button</button>
        <button class="btn primary">Class Button</button>
        <button data-testid="test-button">TestID Button</button>
        <button aria-label="Close Dialog">ARIA Button</button>
        <button>Text Only Button</button>
      </body>
    </html>
  `;
}

async function testContentDetection() {
  // Test main content area detection
  const testHTML = `
    <!DOCTYPE html>
    <html>
      <body>
        <header>Site Header</header>
        <nav>Navigation</nav>
        <main>
          <article>
            <h1>Main Content</h1>
            <p>This is the main content area</p>
          </article>
        </main>
        <aside>Sidebar</aside>
        <footer>Footer</footer>
      </body>
    </html>
  `;
}

async function testShadowDOM() {
  // Test Shadow DOM traversal
  const testHTML = `
    <!DOCTYPE html>
    <html>
      <body>
        <div id="shadow-host"></div>
        <script>
          const host = document.getElementById('shadow-host');
          const shadow = host.attachShadow({ mode: 'open' });
          shadow.innerHTML = '<button>Shadow Button</button>';
        </script>
      </body>
    </html>
  `;
}

async function testIframeSupport() {
  // Test iframe content extraction
  const testHTML = `
    <!DOCTYPE html>
    <html>
      <body>
        <iframe id="test-iframe" srcdoc="<button>Iframe Button</button>"></iframe>
      </body>
    </html>
  `;
}

async function testViewportAndHiddenElements() {
  // Test viewport-only and hidden element filtering
  const testHTML = `
    <!DOCTYPE html>
    <html>
      <body>
        <button style="display: none;">Hidden Button</button>
        <button style="visibility: hidden;">Invisible Button</button>
        <button>Visible Button</button>
        <div style="height: 200vh;">
          <button style="position: absolute; top: 150vh;">Below Fold Button</button>
        </div>
      </body>
    </html>
  `;
}

async function testCustomSelectors() {
  // Test custom selector extraction
  const testHTML = `
    <!DOCTYPE html>
    <html>
      <body>
        <div data-cy="cypress-element">Cypress Test Element</div>
        <div data-test="jest-element">Jest Test Element</div>
        <div data-qa="qa-element">QA Test Element</div>
      </body>
    </html>
  `;
}

// Export for use in other test runners
export { runTests, injectSmartDOMReader };

// Run tests if executed directly
if (typeof module !== 'undefined' && require.main === module) {
  runTests().catch(console.error);
}
