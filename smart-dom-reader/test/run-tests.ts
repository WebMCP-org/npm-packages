#!/usr/bin/env node
/**
 * Test Runner for Smart DOM Reader using Playwright MCP
 * Simulates Chrome Extension environment for realistic testing
 */

import SmartDOMReaderTestFramework from './playwright-test-framework.js';

// Test configurations
const TEST_URLS = [
  {
    name: 'Simple Page',
    url: 'https://example.com',
    scenarios: ['basic-interactive', 'full-extraction', 'progressive-structure'],
  },
  {
    name: 'GitHub Repository',
    url: 'https://github.com/microsoft/playwright',
    scenarios: ['basic-interactive', 'progressive-structure', 'progressive-region'],
  },
  {
    name: 'MDN Documentation',
    url: 'https://developer.mozilla.org/en-US/docs/Web/JavaScript',
    scenarios: ['progressive-content', 'viewport-only'],
  },
  {
    name: 'W3Schools Form',
    url: 'https://www.w3schools.com/html/tryit.asp?filename=tryhtml_form_submit',
    scenarios: ['iframe-extraction', 'form-extraction'],
  },
];

class TestRunner {
  private framework: SmartDOMReaderTestFramework;
  private results: Map<string, any>;

  constructor() {
    this.framework = new SmartDOMReaderTestFramework();
    this.results = new Map();
  }

  /**
   * Run a single test scenario
   */
  async runTest(url: string, scenario: string): Promise<any> {
    console.log(`\n🧪 Testing: ${scenario} on ${url}`);

    const config = this.framework.generateTestConfig(scenario);
    const injectionScript = this.framework.createInjectionScript({
      ...config,
      tabId: 'test-' + Date.now(),
      url: url,
    });

    // Create a function that can be evaluated by Playwright
    const testFunction = `
      async () => {
        try {
          // Execute the injection script
          const result = ${injectionScript};

          // Log for debugging
          console.log('Test executed:', {
            scenario: '${scenario}',
            url: '${url}',
            success: result.success
          });

          return result;
        } catch (error) {
          return {
            success: false,
            error: error.message,
            stack: error.stack
          };
        }
      }
    `;

    return testFunction;
  }

  /**
   * Run all tests for a URL
   */
  async runTestsForUrl(testConfig: any): Promise<void> {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`📍 Testing: ${testConfig.name}`);
    console.log(`   URL: ${testConfig.url}`);
    console.log('='.repeat(60));

    for (const scenario of testConfig.scenarios) {
      const testScript = await this.runTest(testConfig.url, scenario);

      // Store the test script for execution
      this.results.set(`${testConfig.name}-${scenario}`, {
        url: testConfig.url,
        scenario: scenario,
        script: testScript,
        timestamp: Date.now(),
      });

      // Display what we would run
      console.log(`\n📝 Generated test for: ${scenario}`);
      console.log('   Config:', this.framework.generateTestConfig(scenario));
    }
  }

  /**
   * Execute tests with Playwright MCP
   */
  async executeWithPlaywright(): Promise<void> {
    console.log('\n🚀 Executing Tests with Playwright MCP');
    console.log('=====================================\n');

    // Instructions for manual execution
    console.log('📋 INSTRUCTIONS FOR PLAYWRIGHT MCP EXECUTION:\n');
    console.log('1. Navigate to each test URL using mcp__playwright__browser_navigate');
    console.log('2. Execute the test script using mcp__playwright__browser_evaluate');
    console.log('3. Collect and analyze results\n');

    console.log('📦 Test Scripts Generated:');
    this.results.forEach((test, key) => {
      console.log(`\n• ${key}`);
      console.log(`  URL: ${test.url}`);
      console.log(`  Scenario: ${test.scenario}`);
    });

    // Generate example Playwright commands
    console.log('\n📝 Example Playwright MCP Commands:\n');

    const firstTest = Array.from(this.results.values())[0];
    if (firstTest) {
      console.log('// Navigate to test page');
      console.log(`await mcp__playwright__browser_navigate({ url: "${firstTest.url}" });\n`);

      console.log('// Execute test');
      console.log(`await mcp__playwright__browser_evaluate({`);
      console.log(`  function: ${firstTest.script}`);
      console.log(`});\n`);
    }

    // Generate test report template
    this.generateTestReport();
  }

  /**
   * Generate test report
   */
  private generateTestReport(): void {
    console.log('\n📊 Test Report Template');
    console.log('======================\n');

    const report = {
      timestamp: new Date().toISOString(),
      totalTests: this.results.size,
      testGroups: TEST_URLS.map((config) => ({
        name: config.name,
        url: config.url,
        scenarios: config.scenarios,
        status: 'pending',
      })),
      summary: {
        passed: 0,
        failed: 0,
        pending: this.results.size,
      },
    };

    console.log(JSON.stringify(report, null, 2));

    // Save test manifests for later use
    this.saveTestManifest();
  }

  /**
   * Save test manifest for automated execution
   */
  private saveTestManifest(): void {
    const manifest = {
      version: '1.0.0',
      created: new Date().toISOString(),
      tests: Array.from(this.results.entries()).map(([key, test]) => ({
        id: key,
        url: test.url,
        scenario: test.scenario,
        config: this.framework.generateTestConfig(test.scenario),
        expectedResults: this.getExpectedResults(test.scenario),
      })),
    };

    console.log('\n💾 Test Manifest:');
    console.log(JSON.stringify(manifest, null, 2).substring(0, 500) + '...');
  }

  /**
   * Get expected results for validation
   */
  private getExpectedResults(scenario: string): any {
    const expectations: Record<string, any> = {
      'basic-interactive': {
        hasButtons: true,
        hasLinks: true,
        hasMode: 'interactive',
      },
      'full-extraction': {
        hasMode: 'full',
        hasSemantic: true,
        hasMetadata: true,
      },
      'progressive-structure': {
        hasRegions: true,
        hasSummary: true,
        hasSuggestions: true,
      },
      'form-extraction': {
        hasForms: true,
        hasInputs: true,
      },
    };

    return expectations[scenario] || {};
  }

  /**
   * Run all tests
   */
  async runAllTests(): Promise<void> {
    console.log('🎯 Smart DOM Reader Test Suite');
    console.log('==============================');
    console.log(`📅 ${new Date().toLocaleString()}\n`);

    // Build library first
    console.log('📦 Building library...');
    await this.buildLibrary();

    // Generate test scripts
    for (const testConfig of TEST_URLS) {
      await this.runTestsForUrl(testConfig);
    }

    // Execute with Playwright
    await this.executeWithPlaywright();

    console.log('\n✅ Test generation complete!');
    console.log('   Use the generated scripts with Playwright MCP to execute tests.');
  }

  /**
   * Build the library
   */
  private async buildLibrary(): Promise<void> {
    try {
      const { execSync } = require('child_process');
      execSync('pnpm build', { stdio: 'inherit' });
      console.log('✅ Library built successfully\n');
    } catch (error) {
      console.error('❌ Build failed. Some tests may use fallback implementation.\n');
    }
  }
}

// Create reusable test functions for Playwright MCP
export const PlaywrightMCPTests = {
  /**
   * Test basic extraction
   */
  testBasicExtraction: async (url: string) => {
    const framework = new SmartDOMReaderTestFramework();
    const config = framework.generateTestConfig('basic-interactive');
    return framework.createInjectionScript(config);
  },

  /**
   * Test form extraction
   */
  testFormExtraction: async (url: string) => {
    const framework = new SmartDOMReaderTestFramework();
    const config = framework.generateTestConfig('form-extraction');
    return framework.createInjectionScript(config);
  },

  /**
   * Test progressive extraction
   */
  testProgressiveExtraction: async (url: string) => {
    const framework = new SmartDOMReaderTestFramework();
    const config = framework.generateTestConfig('progressive-structure');
    return framework.createInjectionScript(config);
  },

  /**
   * Format and display results
   */
  formatResults: (results: any) => {
    const framework = new SmartDOMReaderTestFramework();
    return framework.formatResults(results);
  },
};

// Run tests if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const runner = new TestRunner();
  runner.runAllTests().catch(console.error);
}

export default TestRunner;
