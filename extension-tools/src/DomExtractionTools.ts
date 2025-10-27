import type { ExtractionArgs, ExtractionMethod } from '@mcp-b/smart-dom-reader';
import { SMART_DOM_READER_BUNDLE } from '@mcp-b/smart-dom-reader/bundle-string';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { type ApiAvailability, BaseApiTools } from './BaseApiTools';

type ExtractionError = { error: string };
type ExtractionResult = string | ExtractionError;

export interface DomExtractionToolsOptions {
  extractStructure?: boolean;
  extractRegion?: boolean;
  extractContent?: boolean;
}

/**
 * DOM Extraction Tools for AI Browser Agents
 *
 * Provides step-by-step DOM extraction optimized for token efficiency.
 * Designed for AI agents to progressively understand and interact with web pages.
 *
 * Workflow:
 * 1. extractStructure - Get high-level page overview (minimal tokens)
 * 2. extractRegion - Extract details from specific region based on structure
 * 3. extractContent - Get readable content from a region
 *
 * Uses chrome.userScripts.execute to dynamically import the Smart DOM Reader
 * module inside the page context and immediately return structured data without
 * mutating window scope.
 */
export class DomExtractionTools extends BaseApiTools<DomExtractionToolsOptions> {
  protected apiName = 'DomExtraction';
  private bundleScript: string = SMART_DOM_READER_BUNDLE;
  private userScriptsSupport: boolean | null = null;

  constructor(server: McpServer, options: DomExtractionToolsOptions = {}) {
    super(server, options);
  }

  private getBundleScript(): string {
    // Return the pre-bundled script string
    return this.bundleScript;
  }

  private async resolveTabId(tabId?: number): Promise<number> {
    if (tabId !== undefined) {
      return tabId;
    }

    const [activeTab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });

    if (!activeTab?.id) {
      throw new Error('No active tab found');
    }

    return activeTab.id;
  }

  private async canUseUserScripts(): Promise<boolean> {
    if (!chrome.userScripts?.execute || typeof chrome.userScripts.getScripts !== 'function') {
      return false;
    }

    if (this.userScriptsSupport !== null) {
      return this.userScriptsSupport;
    }

    try {
      await chrome.userScripts.getScripts();
      this.userScriptsSupport = true;
    } catch {
      this.userScriptsSupport = false;
    }

    return this.userScriptsSupport;
  }

  private isExtractionError(result: unknown): result is { error: string } {
    return typeof result === 'object' && result !== null && 'error' in result;
  }

  private async ensureUserScriptsEnabled(): Promise<void> {
    if (!(await this.canUseUserScripts())) {
      throw new Error(
        'User Scripts API is not enabled. Please grant the "userScripts" permission and enable the Allow User Scripts toggle for this extension.'
      );
    }
  }

  private serializeArgs(args: unknown): string {
    // Safely serialize the args object for injection
    return JSON.stringify(args);
  }

  private async executeExtraction<M extends ExtractionMethod>(
    tabId: number,
    method: M,
    args: ExtractionArgs[M]
  ): Promise<ExtractionResult> {
    const code = `
      (() => {
        // Inject the bundle
        ${this.getBundleScript()}

        // Execute extraction and return result immediately
        const method = ${JSON.stringify(method)};
        const args = ${this.serializeArgs(args)};

        return SmartDOMReaderBundle.executeExtraction(method, args);
      })()
    `;

    try {
      const executions = await chrome.userScripts.execute({
        target: { tabId },
        world: 'USER_SCRIPT',
        injectImmediately: true,
        js: [{ code }],
      });

      const execution = executions[0];
      if (!execution) {
        return { error: 'User script execution returned no result' };
      }

      if (execution.error) {
        return { error: execution.error };
      }

      return execution.result as ExtractionResult;
    } catch (error) {
      return { error: error instanceof Error ? error.message : String(error) };
    }
  }

  checkAvailability(): ApiAvailability {
    try {
      if (!chrome.userScripts || typeof chrome.userScripts.execute !== 'function') {
        return {
          available: false,
          message: 'chrome.userScripts API is not available',
          details:
            'Ensure the "userScripts" permission is granted and the Allow User Scripts toggle is enabled for this extension.',
        };
      }

      return {
        available: true,
        message: 'DOM Extraction tools are available via chrome.userScripts',
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
    // Progressive extraction tools for AI agents
    if (this.shouldRegisterTool('extractStructure')) {
      this.registerExtractStructure();
    }

    if (this.shouldRegisterTool('extractRegion')) {
      this.registerExtractRegion();
    }

    if (this.shouldRegisterTool('extractContent')) {
      this.registerExtractContent();
    }

    // Full extraction tools for single-pass extraction
    // Disabled while we finalize stateless injection APIs
    // if (this.shouldRegisterTool('extractInteractive')) {
    //   this.registerExtractInteractive();
    // }

    // if (this.shouldRegisterTool('extractFull')) {
    //   this.registerExtractFull();
    // }
  }

  private registerExtractStructure(): void {
    this.server.registerTool(
      'dom_extract_structure',
      {
        description: `Extract high-level structural overview of the page.
        This is the first step for AI agents to understand page layout.
        Returns regions (header, nav, main, footer, etc.), forms, and suggestions.
        Token-efficient: provides minimal data for intelligent decision-making.`,
        inputSchema: {
          tabId: z.number().optional().describe('Tab ID to extract from (defaults to active tab)'),
          selector: z
            .string()
            .optional()
            .describe(
              'Optional container CSS selector to scope the outline. If omitted, analyzes the whole document (or targeted iframe).'
            ),
          frameSelector: z
            .string()
            .optional()
            .describe(
              'Optional CSS selector to target a specific iframe. If not provided, uses the main document.'
            ),
        },
      },
      async ({ tabId, selector, frameSelector }) => {
        try {
          await this.ensureUserScriptsEnabled();

          const resolvedTabId = await this.resolveTabId(tabId);
          const args: any = {
            formatOptions: { detail: 'summary' },
          };
          if (selector !== undefined) args.selector = selector;
          if (frameSelector !== undefined) args.frameSelector = frameSelector;
          const result = await this.executeExtraction(resolvedTabId, 'extractStructure', args);

          if (this.isExtractionError(result)) {
            return this.formatError(new Error(result.error));
          }

          // Result is already markdown string
          return {
            content: [{ type: 'text', text: result as string }],
          };
        } catch (error) {
          return this.formatError(error);
        }
      }
    );
  }

  private registerExtractRegion(): void {
    this.server.registerTool(
      'dom_extract_region',
      {
        description: `Extract detailed information from a specific page region.
        Step 2 for AI agents after analyzing structure.
        Returns interactive elements, forms, and optionally semantic content.
        Use selector from extractStructure results for targeted extraction.`,
        inputSchema: {
          tabId: z.number().optional().describe('Tab ID to extract from (defaults to active tab)'),
          selector: z.string().describe('CSS selector for the region to extract'),
          mode: z
            .enum(['interactive', 'full'])
            .default('interactive')
            .describe(
              'Extraction mode: "interactive" for UI elements only, "full" for all content'
            ),
          frameSelector: z
            .string()
            .optional()
            .describe('Optional CSS selector to target a specific iframe'),
          options: z
            .object({
              includeHidden: z.boolean().optional().describe('Include hidden elements'),
              viewportOnly: z.boolean().optional().describe('Only extract elements in viewport'),
              maxDepth: z.number().optional().describe('Maximum traversal depth'),
              textTruncateLength: z.number().optional().describe('Maximum text length per element'),
              filter: z
                .object({
                  includeSelectors: z
                    .array(z.string())
                    .optional()
                    .describe('Only include elements matching these selectors'),
                  excludeSelectors: z
                    .array(z.string())
                    .optional()
                    .describe('Exclude elements matching these selectors'),
                  tags: z.array(z.string()).optional().describe('Only include these HTML tags'),
                  textContains: z
                    .array(z.string())
                    .optional()
                    .describe('Only include elements containing this text'),
                  interactionTypes: z
                    .array(z.enum(['click', 'change', 'submit', 'nav']))
                    .optional()
                    .describe('Filter by interaction type'),
                })
                .optional(),
            })
            .optional(),
        },
      },
      async ({ tabId, selector, mode, frameSelector, options }) => {
        try {
          await this.ensureUserScriptsEnabled();

          const resolvedTabId = await this.resolveTabId(tabId);
          const args: any = {
            selector,
            mode: mode || 'interactive',
            formatOptions: { detail: 'region' },
          };
          if (frameSelector !== undefined) args.frameSelector = frameSelector;
          if (options !== undefined) args.options = options;
          const result = await this.executeExtraction(resolvedTabId, 'extractRegion', args);

          if (this.isExtractionError(result)) {
            return this.formatError(new Error(result.error));
          }

          // Result is already markdown string
          return {
            content: [{ type: 'text', text: result as string }],
          };
        } catch (error) {
          return this.formatError(error);
        }
      }
    );
  }

  private registerExtractContent(): void {
    this.server.registerTool(
      'dom_extract_content',
      {
        description: `Extract readable content from a specific region.
        Step 3 for AI agents to get text content for analysis.
        Returns structured text, headings, lists, tables, and media info.
        Optimized for content understanding and summarization.`,
        inputSchema: {
          tabId: z.number().optional().describe('Tab ID to extract from (defaults to active tab)'),
          selector: z.string().describe('CSS selector for the region to extract content from'),
          frameSelector: z
            .string()
            .optional()
            .describe('Optional CSS selector to target a specific iframe'),
          options: z
            .object({
              includeHeadings: z.boolean().optional().describe('Include heading elements'),
              includeLists: z.boolean().optional().describe('Include list elements'),
              includeTables: z.boolean().optional().describe('Include table data'),
              includeMedia: z
                .boolean()
                .optional()
                .describe('Include media elements (img, video, audio)'),
              maxTextLength: z.number().optional().describe('Maximum text length per element'),
            })
            .optional(),
        },
      },
      async ({ tabId, selector, frameSelector, options }) => {
        try {
          await this.ensureUserScriptsEnabled();

          const resolvedTabId = await this.resolveTabId(tabId);
          const args: any = {
            selector,
            formatOptions: { detail: 'region' },
          };
          if (frameSelector !== undefined) args.frameSelector = frameSelector;
          if (options !== undefined) args.options = options;
          const result = await this.executeExtraction(resolvedTabId, 'extractContent', args);

          if (this.isExtractionError(result)) {
            return this.formatError(new Error(result.error));
          }

          // Result is already markdown string
          return {
            content: [{ type: 'text', text: result as string }],
          };
        } catch (error) {
          return this.formatError(error);
        }
      }
    );
  }
}
