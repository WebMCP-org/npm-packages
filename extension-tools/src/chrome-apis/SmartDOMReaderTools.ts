import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { type ApiAvailability, BaseApiTools } from '../BaseApiTools';

export interface SmartDOMReaderToolsOptions {
  extractInteractive?: boolean;
  extractFull?: boolean;
  extractStructure?: boolean;
  extractRegion?: boolean;
  extractContent?: boolean;
}

export class SmartDOMReaderTools extends BaseApiTools {
  protected apiName = 'SmartDOMReader';
  private smartDOMReaderBundle: string | null = null;
  private injectedTabs = new Set<number>();

  constructor(server: McpServer, options: SmartDOMReaderToolsOptions = {}) {
    super(server, options);
  }

  checkAvailability(): ApiAvailability {
    // Check if we have scripting or userScripts API
    try {
      if (!chrome.scripting && !chrome.userScripts) {
        return {
          available: false,
          message: 'Neither chrome.scripting nor chrome.userScripts API is available',
          details:
            'This extension needs the "scripting" permission or "userScripts" permission in its manifest.json',
        };
      }

      return {
        available: true,
        message: 'SmartDOMReader tools are available',
      };
    } catch (error) {
      return {
        available: false,
        message: 'Failed to check API availability',
        details: error instanceof Error ? error.message : 'Unknown error occurred',
      };
    }
  }

  registerTools(): void {
    if (this.shouldRegisterTool('extractInteractive')) {
      this.registerExtractInteractive();
    }

    if (this.shouldRegisterTool('extractFull')) {
      this.registerExtractFull();
    }

    if (this.shouldRegisterTool('extractStructure')) {
      this.registerExtractStructure();
    }

    if (this.shouldRegisterTool('extractRegion')) {
      this.registerExtractRegion();
    }

    if (this.shouldRegisterTool('extractContent')) {
      this.registerExtractContent();
    }
  }

  private async loadSmartDOMReaderBundle(): Promise<string> {
    if (this.smartDOMReaderBundle) {
      return this.smartDOMReaderBundle;
    }

    try {
      const bundleUrl = chrome.runtime.getURL('smart-dom-reader.js');
      const response = await fetch(bundleUrl);
      if (!response.ok) {
        throw new Error(`Failed to fetch bundle: ${response.statusText}`);
      }
      this.smartDOMReaderBundle = await response.text();
      return this.smartDOMReaderBundle;
    } catch (error) {
      throw new Error(
        `Failed to load SmartDOMReader bundle. Please ensure @mcp-b/smart-dom-reader/dist/index.js is copied to your extension as 'smart-dom-reader.js' and listed in web_accessible_resources in manifest.json`
      );
    }
  }

  private async ensureLibraryInjected(tabId: number): Promise<void> {
    // Check if we've already injected into this tab
    if (this.injectedTabs.has(tabId)) {
      // Verify library still exists (tab might have navigated)
      try {
        const results = await chrome.scripting.executeScript({
          target: { tabId },
          func: () => typeof (window as any).SmartDOMReader !== 'undefined',
          world: 'MAIN',
        });

        if (results[0]?.result === true) {
          return; // Library still available
        }
      } catch {
        // Tab might have been closed or navigated
      }
      this.injectedTabs.delete(tabId);
    }

    // Load and inject the bundle
    const bundleCode = await this.loadSmartDOMReaderBundle();

    try {
      // Try userScripts API first if available (no CSP restrictions)
      if (chrome.userScripts?.execute) {
        await chrome.userScripts.execute({
          target: { tabId },
          world: 'MAIN',
          js: [{ code: bundleCode }],
          injectImmediately: true,
        });
      } else {
        // Fallback to scripting API
        await chrome.scripting.executeScript({
          target: { tabId },
          func: (code: string) => {
            const script = document.createElement('script');
            script.textContent = code;
            document.documentElement.appendChild(script);
            script.remove();
          },
          args: [bundleCode],
          world: 'MAIN',
        });
      }

      this.injectedTabs.add(tabId);
    } catch (error) {
      throw new Error(`Failed to inject SmartDOMReader library: ${error}`);
    }
  }

  private async executeWithLibrary(
    tabId: number | undefined,
    extractionFunc: (...args: any[]) => any,
    extractionArgs: any[] = []
  ): Promise<any> {
    // Get active tab if not specified
    if (tabId === undefined) {
      const [activeTab] = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      });
      if (!activeTab || !activeTab.id) {
        throw new Error('No active tab found');
      }
      tabId = activeTab.id;
    }

    // Ensure library is available
    await this.ensureLibraryInjected(tabId);

    try {
      // Execute the extraction function with arguments
      const results = await chrome.scripting.executeScript({
        target: { tabId },
        func: extractionFunc,
        args: extractionArgs,
        world: 'MAIN',
      });

      return results[0]?.result;
    } catch (error) {
      throw new Error(`Failed to execute extraction: ${error}`);
    }
  }

  private registerExtractInteractive(): void {
    this.server.registerTool(
      'extension_tool_smart_dom_extract_interactive',
      {
        description:
          'Extract interactive elements from the current page using SmartDOMReader. Returns buttons, links, inputs, forms, and clickable elements.',
        inputSchema: {
          tabId: z.number().optional().describe('Tab ID to extract from (defaults to active tab)'),
          options: z
            .object({
              maxDepth: z.number().optional().describe('Maximum traversal depth (default: 5)'),
              includeHidden: z
                .boolean()
                .optional()
                .describe('Include hidden elements (default: false)'),
              includeShadowDOM: z
                .boolean()
                .optional()
                .describe('Include shadow DOM elements (default: true)'),
              includeIframes: z
                .boolean()
                .optional()
                .describe('Include iframe contents (default: false)'),
              viewportOnly: z
                .boolean()
                .optional()
                .describe('Only extract elements in viewport (default: false)'),
              mainContentOnly: z
                .boolean()
                .optional()
                .describe('Only extract from main content area (default: false)'),
              customSelectors: z
                .array(z.string())
                .optional()
                .describe('Additional CSS selectors to include'),
            })
            .optional()
            .describe('Extraction options'),
        },
      },
      async ({ tabId, options = {} }) => {
        try {
          const result = await this.executeWithLibrary(
            tabId,
            (options: any) => {
              const reader = new (window as any).SmartDOMReader.SmartDOMReader(options);
              return reader.extract(document, { mode: 'interactive' });
            },
            [options]
          );

          if (result?.error) {
            return this.formatError(new Error(result.error));
          }

          return this.formatJson(result);
        } catch (error) {
          return this.formatError(error);
        }
      }
    );
  }

  private registerExtractFull(): void {
    this.server.registerTool(
      'extension_tool_smart_dom_extract_full',
      {
        description:
          'Extract all elements from the current page using SmartDOMReader. Includes semantic elements like headings, images, tables, lists, and articles in addition to interactive elements.',
        inputSchema: {
          tabId: z.number().optional().describe('Tab ID to extract from (defaults to active tab)'),
          options: z
            .object({
              maxDepth: z.number().optional().describe('Maximum traversal depth (default: 5)'),
              includeHidden: z
                .boolean()
                .optional()
                .describe('Include hidden elements (default: false)'),
              includeShadowDOM: z
                .boolean()
                .optional()
                .describe('Include shadow DOM elements (default: true)'),
              includeIframes: z
                .boolean()
                .optional()
                .describe('Include iframe contents (default: false)'),
              viewportOnly: z
                .boolean()
                .optional()
                .describe('Only extract elements in viewport (default: false)'),
              mainContentOnly: z
                .boolean()
                .optional()
                .describe('Only extract from main content area (default: false)'),
              customSelectors: z
                .array(z.string())
                .optional()
                .describe('Additional CSS selectors to include'),
            })
            .optional()
            .describe('Extraction options'),
        },
      },
      async ({ tabId, options = {} }) => {
        try {
          const result = await this.executeWithLibrary(
            tabId,
            (options: any) => {
              const reader = new (window as any).SmartDOMReader.SmartDOMReader(options);
              return reader.extract(document, { mode: 'full' });
            },
            [options]
          );

          if (result?.error) {
            return this.formatError(new Error(result.error));
          }

          return this.formatJson(result);
        } catch (error) {
          return this.formatError(error);
        }
      }
    );
  }

  private registerExtractStructure(): void {
    this.server.registerTool(
      'extension_tool_smart_dom_get_structure',
      {
        description:
          'Get a high-level structural overview of the page. Returns main regions, navigation areas, and content sections.',
        inputSchema: {
          tabId: z.number().optional().describe('Tab ID to extract from (defaults to active tab)'),
        },
      },
      async ({ tabId }) => {
        try {
          const result = await this.executeWithLibrary(tabId, () => {
            return (window as any).SmartDOMReader.SmartDOMReader.getStructure();
          }, []);

          if (result?.error) {
            return this.formatError(new Error(result.error));
          }

          return this.formatJson(result);
        } catch (error) {
          return this.formatError(error);
        }
      }
    );
  }

  private registerExtractRegion(): void {
    this.server.registerTool(
      'extension_tool_smart_dom_extract_region',
      {
        description:
          'Extract elements from a specific region of the page identified by a CSS selector.',
        inputSchema: {
          tabId: z.number().optional().describe('Tab ID to extract from (defaults to active tab)'),
          selector: z.string().describe('CSS selector for the region to extract'),
          options: z
            .object({
              maxDepth: z.number().optional().describe('Maximum traversal depth (default: 3)'),
              includeHidden: z
                .boolean()
                .optional()
                .describe('Include hidden elements (default: false)'),
              includeShadowDOM: z
                .boolean()
                .optional()
                .describe('Include shadow DOM elements (default: true)'),
            })
            .optional()
            .describe('Extraction options'),
        },
      },
      async ({ tabId, selector, options = {} }) => {
        try {
          const result = await this.executeWithLibrary(
            tabId,
            (selector: string, options: any) => {
              return (window as any).SmartDOMReader.SmartDOMReader.getRegion(selector, options);
            },
            [selector, options]
          );

          if (result?.error) {
            return this.formatError(new Error(result.error));
          }

          return this.formatJson(result);
        } catch (error) {
          return this.formatError(error);
        }
      }
    );
  }

  private registerExtractContent(): void {
    this.server.registerTool(
      'extension_tool_smart_dom_read_content',
      {
        description:
          'Read text content from a specific element or region identified by a CSS selector.',
        inputSchema: {
          tabId: z.number().optional().describe('Tab ID to extract from (defaults to active tab)'),
          selector: z.string().describe('CSS selector for the content to read'),
          options: z
            .object({
              includeAttributes: z
                .boolean()
                .optional()
                .describe('Include element attributes (default: false)'),
              preserveStructure: z
                .boolean()
                .optional()
                .describe('Preserve HTML structure (default: false)'),
            })
            .optional()
            .describe('Content reading options'),
        },
      },
      async ({ tabId, selector, options = {} }) => {
        try {
          const result = await this.executeWithLibrary(
            tabId,
            (selector: string, options: any) => {
              return (window as any).SmartDOMReader.SmartDOMReader.readContent(selector, options);
            },
            [selector, options]
          );

          if (result?.error) {
            return this.formatError(new Error(result.error));
          }

          return this.formatJson(result);
        } catch (error) {
          return this.formatError(error);
        }
      }
    );
  }
}
