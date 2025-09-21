#!/usr/bin/env node

/**
 * Playwright MCP Test Runner for Smart DOM Reader
 *
 * This script uses the Playwright MCP tools to test the smart-dom-reader library
 * in a real browser environment.
 */

import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Read the built library code
function getLibraryCode(): string {
  try {
    // Try to read the built library
    const distPath = join(__dirname, '../dist/index.js');
    return readFileSync(distPath, 'utf-8');
  } catch (error) {
    console.error('Library not built. Please run "pnpm build" first.');
    process.exit(1);
  }
}

// Test HTML pages
const TEST_PAGES = {
  basicInteractive: `
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="UTF-8">
        <title>Interactive Elements Test</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 20px; }
          .container { max-width: 800px; margin: 0 auto; }
          button, input, select, textarea { margin: 10px 0; display: block; }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>Interactive Elements Test Page</h1>

          <section>
            <h2>Buttons</h2>
            <button id="primary-btn" class="btn btn-primary">Primary Action</button>
            <button data-testid="secondary-action">Secondary Action</button>
            <button aria-label="Delete Item" class="icon-btn">🗑️</button>
            <input type="button" value="Input Button">
            <input type="submit" value="Submit Form">
            <div role="button" tabindex="0">ARIA Button</div>
          </section>

          <section>
            <h2>Links</h2>
            <a href="/home" id="home-link">Home</a>
            <a href="/about" class="nav-link">About Us</a>
            <a href="https://example.com" target="_blank">External Link</a>
            <a href="#section" data-testid="anchor-link">Anchor Link</a>
          </section>

          <section>
            <h2>Form Inputs</h2>
            <form id="test-form" action="/submit" method="post">
              <label for="username">Username:</label>
              <input type="text" id="username" name="username" required placeholder="Enter username">

              <label for="email">Email:</label>
              <input type="email" id="email" name="email" data-testid="email-input">

              <label for="password">Password:</label>
              <input type="password" id="password" name="password">

              <label for="bio">Bio:</label>
              <textarea id="bio" name="bio" rows="4" cols="50">Default bio text</textarea>

              <label for="country">Country:</label>
              <select id="country" name="country">
                <option value="us">United States</option>
                <option value="uk">United Kingdom</option>
                <option value="ca">Canada</option>
              </select>

              <label>
                <input type="checkbox" name="terms" value="accepted">
                Accept Terms & Conditions
              </label>

              <fieldset>
                <legend>Notification Preferences:</legend>
                <label><input type="radio" name="notifications" value="all"> All</label>
                <label><input type="radio" name="notifications" value="important"> Important Only</label>
                <label><input type="radio" name="notifications" value="none"> None</label>
              </fieldset>

              <button type="submit">Submit Form</button>
              <button type="reset">Reset</button>
            </form>
          </section>
        </div>
      </body>
    </html>
  `,

  semanticElements: `
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="UTF-8">
        <title>Semantic Elements Test</title>
        <style>
          body { font-family: Georgia, serif; line-height: 1.6; }
          .container { max-width: 900px; margin: 0 auto; padding: 20px; }
          table { border-collapse: collapse; width: 100%; margin: 20px 0; }
          th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
          img { max-width: 100%; height: auto; }
        </style>
      </head>
      <body>
        <header>
          <nav>
            <ul>
              <li><a href="/">Home</a></li>
              <li><a href="/articles">Articles</a></li>
              <li><a href="/contact">Contact</a></li>
            </ul>
          </nav>
        </header>

        <main class="container">
          <article>
            <header>
              <h1>Main Article Title</h1>
              <p class="meta">Published on <time datetime="2024-01-15">January 15, 2024</time></p>
            </header>

            <section>
              <h2>Introduction</h2>
              <p>This is the introduction paragraph with some <strong>bold text</strong> and <em>italic text</em>.</p>

              <figure>
                <img src="data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAwIiBoZWlnaHQ9IjIwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iNDAwIiBoZWlnaHQ9IjIwMCIgZmlsbD0iI2RkZCIvPjx0ZXh0IHg9IjUwJSIgeT0iNTAlIiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBkeT0iLjNlbSI+UGxhY2Vob2xkZXIgSW1hZ2U8L3RleHQ+PC9zdmc+"
                     alt="Placeholder image for testing">
                <figcaption>Figure 1: Test image with caption</figcaption>
              </figure>
            </section>

            <section>
              <h2>Data Section</h2>
              <h3>Structured Data</h3>

              <table>
                <caption>Sample Data Table</caption>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Value</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>Item 1</td>
                    <td>100</td>
                    <td>Active</td>
                  </tr>
                  <tr>
                    <td>Item 2</td>
                    <td>200</td>
                    <td>Pending</td>
                  </tr>
                </tbody>
              </table>

              <h3>Lists</h3>
              <h4>Ordered List</h4>
              <ol>
                <li>First item</li>
                <li>Second item with nested list:
                  <ul>
                    <li>Nested item A</li>
                    <li>Nested item B</li>
                  </ul>
                </li>
                <li>Third item</li>
              </ol>

              <h4>Unordered List</h4>
              <ul>
                <li>Bullet point one</li>
                <li>Bullet point two</li>
                <li>Bullet point three</li>
              </ul>

              <h4>Definition List</h4>
              <dl>
                <dt>Term 1</dt>
                <dd>Definition of term 1</dd>
                <dt>Term 2</dt>
                <dd>Definition of term 2</dd>
              </dl>
            </section>
          </article>

          <aside>
            <h2>Related Content</h2>
            <p>This is a sidebar with additional information.</p>
          </aside>
        </main>

        <footer>
          <p>&copy; 2024 Test Page. All rights reserved.</p>
        </footer>
      </body>
    </html>
  `,

  shadowDomAndIframes: `
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="UTF-8">
        <title>Shadow DOM & Iframe Test</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 20px; }
          .shadow-container { border: 2px solid #333; padding: 20px; margin: 20px 0; }
          iframe { width: 100%; height: 200px; border: 1px solid #999; }
        </style>
      </head>
      <body>
        <h1>Shadow DOM & Iframe Test Page</h1>

        <section>
          <h2>Regular DOM</h2>
          <button id="regular-btn">Regular Button</button>
          <input type="text" id="regular-input" placeholder="Regular Input">
        </section>

        <section>
          <h2>Shadow DOM Components</h2>
          <div id="shadow-host-1" class="shadow-container"></div>
          <div id="shadow-host-2" class="shadow-container"></div>

          <custom-element></custom-element>
        </section>

        <section>
          <h2>Iframes</h2>
          <iframe id="iframe-1" srcdoc="
            <html>
              <body style='font-family: Arial;'>
                <h3>Iframe Content</h3>
                <button>Iframe Button</button>
                <input type='text' placeholder='Iframe Input'>
                <a href='#'>Iframe Link</a>
              </body>
            </html>
          "></iframe>

          <iframe id="iframe-2" src="data:text/html,
            <html>
              <body>
                <form>
                  <input type='email' placeholder='Email in iframe'>
                  <button type='submit'>Submit in iframe</button>
                </form>
              </body>
            </html>
          "></iframe>
        </section>

        <script>
          // Create Shadow DOM with interactive elements
          const host1 = document.getElementById('shadow-host-1');
          const shadow1 = host1.attachShadow({ mode: 'open' });
          shadow1.innerHTML = \`
            <style>
              button { background: blue; color: white; padding: 10px; border: none; }
              input { padding: 5px; margin: 10px 0; }
            </style>
            <div>
              <h3>Shadow DOM Content 1</h3>
              <button id="shadow-btn">Shadow Button</button>
              <input type="text" placeholder="Shadow Input">
              <select>
                <option>Shadow Option 1</option>
                <option>Shadow Option 2</option>
              </select>
            </div>
          \`;

          const host2 = document.getElementById('shadow-host-2');
          const shadow2 = host2.attachShadow({ mode: 'open' });
          shadow2.innerHTML = \`
            <form>
              <label>Shadow Form:</label>
              <input type="text" name="shadow-field">
              <button type="submit">Shadow Submit</button>
            </form>
          \`;

          // Create custom element with Shadow DOM
          class CustomElement extends HTMLElement {
            constructor() {
              super();
              const shadow = this.attachShadow({ mode: 'open' });
              shadow.innerHTML = \`
                <style>
                  :host { display: block; padding: 10px; background: #f0f0f0; }
                </style>
                <div>
                  <h4>Custom Element</h4>
                  <button>Custom Button</button>
                  <slot></slot>
                </div>
              \`;
            }
          }
          customElements.define('custom-element', CustomElement);
        </script>
      </body>
    </html>
  `,

  complexForms: `
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="UTF-8">
        <title>Complex Forms Test</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 20px; }
          form { border: 1px solid #ddd; padding: 20px; margin: 20px 0; }
          fieldset { margin: 15px 0; }
          label { display: block; margin: 5px 0; }
          input, select, textarea { margin-bottom: 10px; }
          .form-row { display: flex; gap: 20px; margin: 10px 0; }
          .form-col { flex: 1; }
        </style>
      </head>
      <body>
        <h1>Complex Forms Test Page</h1>

        <form id="registration-form" action="/register" method="post" enctype="multipart/form-data">
          <h2>User Registration</h2>

          <fieldset>
            <legend>Personal Information</legend>

            <div class="form-row">
              <div class="form-col">
                <label for="first-name">First Name: *</label>
                <input type="text" id="first-name" name="first_name" required>
              </div>
              <div class="form-col">
                <label for="last-name">Last Name: *</label>
                <input type="text" id="last-name" name="last_name" required>
              </div>
            </div>

            <label for="dob">Date of Birth:</label>
            <input type="date" id="dob" name="dob">

            <label for="phone">Phone:</label>
            <input type="tel" id="phone" name="phone" pattern="[0-9]{3}-[0-9]{3}-[0-9]{4}">
          </fieldset>

          <fieldset>
            <legend>Account Details</legend>

            <label for="reg-email">Email: *</label>
            <input type="email" id="reg-email" name="email" required>

            <label for="reg-password">Password: *</label>
            <input type="password" id="reg-password" name="password" required minlength="8">

            <label for="confirm-password">Confirm Password: *</label>
            <input type="password" id="confirm-password" name="confirm_password" required>
          </fieldset>

          <fieldset>
            <legend>Additional Options</legend>

            <label for="avatar">Profile Picture:</label>
            <input type="file" id="avatar" name="avatar" accept="image/*">

            <label for="color">Favorite Color:</label>
            <input type="color" id="color" name="favorite_color" value="#0080ff">

            <label for="website">Website:</label>
            <input type="url" id="website" name="website" placeholder="https://example.com">

            <label for="experience">Experience Level:</label>
            <input type="range" id="experience" name="experience" min="0" max="10" value="5">

            <label for="interests">Interests:</label>
            <select id="interests" name="interests[]" multiple size="5">
              <option value="tech">Technology</option>
              <option value="sports">Sports</option>
              <option value="music">Music</option>
              <option value="art">Art</option>
              <option value="travel">Travel</option>
            </select>
          </fieldset>

          <label>
            <input type="checkbox" name="newsletter" value="yes">
            Subscribe to newsletter
          </label>

          <label>
            <input type="checkbox" name="terms" value="accepted" required>
            I accept the terms and conditions *
          </label>

          <div class="form-row">
            <button type="submit" name="action" value="register">Register</button>
            <button type="submit" name="action" value="save_draft">Save as Draft</button>
            <button type="reset">Reset Form</button>
            <button type="button" onclick="alert('Cancel clicked')">Cancel</button>
          </div>
        </form>

        <form id="search-form" action="/search" method="get">
          <h2>Search Form</h2>
          <input type="search" name="q" placeholder="Search...">
          <input type="hidden" name="source" value="test_page">
          <datalist id="search-suggestions">
            <option value="JavaScript">
            <option value="TypeScript">
            <option value="React">
            <option value="Vue">
          </datalist>
          <input list="search-suggestions" name="category">
          <button type="submit">Search</button>
        </form>

        <form id="disabled-form">
          <h2>Disabled Elements Form</h2>
          <input type="text" value="Disabled input" disabled>
          <select disabled>
            <option>Disabled select</option>
          </select>
          <textarea disabled>Disabled textarea</textarea>
          <button disabled>Disabled button</button>
          <fieldset disabled>
            <legend>Disabled Fieldset</legend>
            <input type="text" placeholder="Inside disabled fieldset">
            <button>Button in disabled fieldset</button>
          </fieldset>
        </form>
      </body>
    </html>
  `,

  visibilityAndViewport: `
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="UTF-8">
        <title>Visibility & Viewport Test</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 0; padding: 20px; }
          .hidden { display: none; }
          .invisible { visibility: hidden; }
          .zero-size { width: 0; height: 0; overflow: hidden; }
          .off-screen { position: absolute; left: -9999px; }
          .transparent { opacity: 0; }
          .behind { z-index: -1; position: relative; }
          .very-tall { height: 300vh; background: linear-gradient(to bottom, #fff, #f0f0f0); }
          .section { padding: 20px; margin: 20px 0; border: 1px solid #ddd; }
          .overlay {
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0,0,0,0.5);
            display: none;
            z-index: 1000;
          }
          .modal {
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: white;
            padding: 20px;
            z-index: 1001;
            display: none;
          }
          .show { display: block !important; }
        </style>
      </head>
      <body>
        <h1>Visibility & Viewport Test Page</h1>

        <section class="section">
          <h2>Visible Elements</h2>
          <button id="visible-btn">Visible Button</button>
          <input type="text" id="visible-input" placeholder="Visible Input">
          <a href="#" id="visible-link">Visible Link</a>
        </section>

        <section class="section">
          <h2>Hidden Elements (Various Methods)</h2>

          <button class="hidden">Display None Button</button>
          <button class="invisible">Visibility Hidden Button</button>
          <button class="zero-size">Zero Size Button</button>
          <button class="off-screen">Off Screen Button</button>
          <button class="transparent">Transparent Button</button>
          <button class="behind">Behind Button (z-index: -1)</button>

          <div style="position: relative; height: 100px; overflow: hidden;">
            <button style="position: absolute; top: 200px;">Overflow Hidden Button</button>
          </div>

          <details>
            <summary>Collapsed Details</summary>
            <button>Button Inside Collapsed Details</button>
          </details>

          <details open>
            <summary>Open Details</summary>
            <button>Button Inside Open Details</button>
          </details>
        </section>

        <section class="section">
          <h2>Viewport Testing</h2>
          <p>This page is very tall to test viewport detection.</p>
          <button id="top-viewport-btn">Button at Top (In Viewport Initially)</button>
        </section>

        <div class="very-tall">
          <div style="padding-top: 50vh;">
            <button id="middle-btn">Middle Button (Below Initial Viewport)</button>
          </div>

          <div style="padding-top: 100vh;">
            <button id="bottom-btn">Bottom Button (Far Below Viewport)</button>
            <input type="text" placeholder="Input Far Below">
          </div>

          <div style="padding-top: 50vh;">
            <button id="very-bottom-btn">Very Bottom Button</button>
          </div>
        </div>

        <div class="overlay" id="overlay"></div>
        <div class="modal" id="modal">
          <h3>Modal Dialog</h3>
          <p>This is a modal dialog</p>
          <button id="modal-close">Close Modal</button>
          <button id="modal-action">Modal Action</button>
        </div>

        <button id="show-modal" style="position: fixed; bottom: 20px; right: 20px;">
          Show Modal
        </button>

        <div role="alert" style="display: none;" id="error-message">
          Error message (hidden by default)
        </div>

        <div class="loading" style="display: none;" id="loading-indicator">
          Loading...
        </div>

        <script>
          document.getElementById('show-modal').addEventListener('click', () => {
            document.getElementById('overlay').classList.add('show');
            document.getElementById('modal').classList.add('show');
          });

          document.getElementById('modal-close').addEventListener('click', () => {
            document.getElementById('overlay').classList.remove('show');
            document.getElementById('modal').classList.remove('show');
          });
        </script>
      </body>
    </html>
  `,
};

// Function to run tests using Playwright MCP
async function runPlaywrightTests() {
  console.log('🚀 Starting Smart DOM Reader Playwright Tests\n');
  console.log('📦 Building library code for injection...\n');

  const libraryCode = getLibraryCode();

  console.log('✅ Library code loaded successfully');
  console.log('📋 Test pages prepared');
  console.log('\n' + '='.repeat(60) + '\n');

  // Instructions for running tests
  console.log('📝 INSTRUCTIONS FOR TESTING WITH PLAYWRIGHT MCP:\n');
  console.log('1. The test HTML pages have been prepared');
  console.log('2. Use the Playwright MCP browser tools to:');
  console.log('   - Navigate to each test page using data URLs');
  console.log('   - Inject the Smart DOM Reader library');
  console.log('   - Execute extraction tests');
  console.log('   - Verify the results\n');

  console.log('3. Test sequence:');
  console.log('   a) Test basic interactive element extraction');
  console.log('   b) Test full mode with semantic elements');
  console.log('   c) Test progressive extraction approach');
  console.log('   d) Test shadow DOM and iframe support');
  console.log('   e) Test complex form extraction');
  console.log('   f) Test visibility and viewport filtering\n');

  console.log('4. For each test, verify:');
  console.log('   - Correct element detection');
  console.log('   - Accurate selector generation');
  console.log('   - Proper context preservation');
  console.log('   - Expected filtering behavior\n');

  // Output test pages for reference
  console.log('📄 TEST PAGE DATA URLS:\n');

  Object.entries(TEST_PAGES).forEach(([name, html]) => {
    const dataUrl = `data:text/html;base64,${Buffer.from(html).toString('base64')}`;
    console.log(`${name}:`);
    console.log(`  Length: ${html.length} chars`);
    console.log(`  Data URL: ${dataUrl.substring(0, 100)}...`);
    console.log('');
  });

  console.log('🎯 Ready to test with Playwright MCP!');
}

// Export functions
export { runPlaywrightTests, TEST_PAGES, getLibraryCode };

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runPlaywrightTests().catch(console.error);
}
