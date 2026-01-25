#!/usr/bin/env tsx

import { constants as fsConstants } from 'node:fs';
import { access, readFile, stat } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { type CallToolResult, ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js';
import { type Browser, chromium, type LaunchOptions, type Page } from 'playwright';
import { z } from 'zod';

const { F_OK } = fsConstants;

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const EMBEDDED_LIBRARY_RELATIVE_PATH = join('..', 'lib', 'smart-dom-reader.bundle.js');
const DEFAULT_LAUNCH_ARGS = ['--no-sandbox', '--disable-setuid-sandbox'] as const;

type ConnectBrowserArgs = {
  executablePath?: string;
  headless: boolean;
};

type NavigateArgs = {
  url: string;
};

type OptionalSelectorArgs = {
  selector?: string;
  detail?: 'summary' | 'region' | 'deep';
  maxTextLength?: number;
  maxElements?: number;
};

type RegionArgs = {
  selector: string;
  options?: ProgressiveExtractorRegionConfig & FormatOptions;
};

type ContentArgs = {
  selector: string;
  options?: ProgressiveExtractorContentConfig & FormatOptions;
};

type InteractiveArgs = {
  selector?: string;
  options?: SmartDomReaderOptions & FormatOptions;
};

type ScreenshotArgs = {
  path?: string;
  fullPage: boolean;
};

type LibraryOperation = 'structure' | 'region' | 'content' | 'interactive';

type StructureOperationArgs = {
  selector: string | null;
};

type RegionOperationArgs = {
  selector: string;
  options: ProgressiveExtractorRegionConfig;
};

type ContentOperationArgs = {
  selector: string;
  options: ProgressiveExtractorContentConfig;
};

type InteractiveOperationArgs = {
  selector: string | null;
  options: SmartDomReaderOptions;
};

const CHROME_ENV_VARS = ['CHROME_PATH', 'GOOGLE_CHROME_SHIM', 'BROWSER_PATH'] as const;

const DEFAULT_CHROME_LOCATIONS: Partial<Record<NodeJS.Platform, readonly string[]>> = {
  darwin: [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Google Chrome Beta.app/Contents/MacOS/Google Chrome Beta',
    '/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
  ],
  linux: [
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium-browser',
    '/usr/bin/chromium',
    '/snap/bin/chromium',
  ],
  win32: [
    ...(process.env.PROGRAMFILES
      ? [join(process.env.PROGRAMFILES, 'Google/Chrome/Application/chrome.exe')]
      : []),
    ...(process.env['ProgramFiles(x86)']
      ? [join(process.env['ProgramFiles(x86)']!, 'Google/Chrome/Application/chrome.exe')]
      : []),
    ...(process.env.LOCALAPPDATA
      ? [join(process.env.LOCALAPPDATA, 'Google/Chrome/Application/chrome.exe')]
      : []),
  ],
};

interface ProgressiveExtractorRegionConfig {
  mode?: 'interactive' | 'full';
  includeHidden?: boolean;
  maxDepth?: number;
}

interface ProgressiveExtractorContentConfig {
  includeHeadings?: boolean;
  includeLists?: boolean;
  includeMedia?: boolean;
  maxTextLength?: number;
}

interface SmartDomReaderOptions {
  viewportOnly?: boolean;
  maxDepth?: number;
}

interface FormatOptions {
  detail?: 'summary' | 'region' | 'deep';
  maxTextLength?: number;
  maxElements?: number;
}

type LibraryCache = {
  path: string;
  code: string;
  mtimeMs: number;
};

async function pathExists(candidate: string | undefined): Promise<boolean> {
  if (!candidate) {
    return false;
  }

  try {
    await access(candidate, F_OK);
    return true;
  } catch {
    return false;
  }
}

function createTextResult(text: string): CallToolResult {
  return {
    content: [
      {
        type: 'text',
        text,
      },
    ],
  };
}

class SmartDomReaderServer {
  private readonly server: McpServer;
  private browser: Browser | null = null;
  private page: Page | null = null;
  private cachedLibrary: LibraryCache | null = null;

  constructor() {
    this.server = new McpServer({
      name: 'smart-dom-reader-server',
      version: '0.2.0',
    });

    this.registerTools();
  }

  async run(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('Smart DOM Reader MCP server running on stdio');
  }

  private registerTools(): void {
    this.server.registerTool(
      'browser_connect',
      {
        title: 'Connect with Playwright',
        description:
          'Launch Chromium for subsequent tools. Use this first. Returns a brief status message. Run headless=false for visual debugging.',
        // Cast to any for Zod v4 compatibility with SDK's v3 type expectations
        inputSchema: {
          executablePath: z
            .string()
            .trim()
            .min(1, { message: 'Provide a non-empty executablePath' })
            .describe(
              'Optional path to a Chrome/Chromium binary. If omitted, Playwright resolves a system or bundled build.'
            )
            .optional(),
          headless: z
            .boolean()
            .default(false)
            .describe(
              'Run without a visible window. Set false to watch interactions. Default: false.'
            ),
        } as any,
      },
      async (args: any) => this.connectBrowser(args as ConnectBrowserArgs)
    );

    this.server.registerTool(
      'browser_navigate',
      {
        title: 'Navigate to URL',
        description:
          'Load an absolute URL in the active tab and wait for network idle. Use after browser_connect.',
        inputSchema: {
          url: z
            .string()
            .url('url must be a valid absolute URL')
            .describe('Absolute URL to navigate to (e.g., https://example.com).'),
        } as any,
      },
      async (args: any) => this.navigate(args as NavigateArgs)
    );

    this.server.registerTool(
      'dom_extract_structure',
      {
        title: 'Extract DOM Structure',
        description:
          'Start here. Returns an XML-wrapped Markdown outline (<outline>) describing page regions. Next: pick a selector/section and call dom_extract_region.',
        inputSchema: {
          selector: z
            .union([z.string().trim().min(1), z.literal('')])
            .describe(
              'Optional container CSS selector to scope the outline. Omit or pass empty string to analyze the whole document.'
            )
            .optional(),
          detail: z
            .enum(['summary', 'region', 'deep'])
            .default('summary')
            .describe("Output depth. 'summary' is concise, 'deep' expands more structure.")
            .optional(),
          maxTextLength: z
            .number()
            .int()
            .min(0)
            .describe('Truncate text snippets to this many characters to save tokens.')
            .optional(),
          maxElements: z
            .number()
            .int()
            .min(0)
            .describe('Limit number of listed items per group (buttons, links, etc.).')
            .optional(),
        } as any,
      },
      async (args: any) => this.extractStructure(args as OptionalSelectorArgs)
    );

    this.server.registerTool(
      'dom_extract_region',
      {
        title: 'Extract DOM Region',
        description:
          'Use after the outline. Returns XML-wrapped Markdown (<section>) with actionable selectors for a specific region. Next: write a script or rerun with higher detail.',
        inputSchema: {
          selector: z
            .string()
            .trim()
            .min(1)
            .describe('CSS selector for the region to analyze (e.g., from the outline).'),
          options: z
            .object({
              mode: z
                .enum(['interactive', 'full'])
                .describe(
                  "Extraction mode. 'interactive' lists controls; 'full' also inspects content structure."
                )
                .optional(),
              includeHidden: z
                .boolean()
                .describe('Include elements that are hidden/offscreen. Default: false.')
                .optional(),
              maxDepth: z
                .number()
                .int()
                .min(0)
                .describe(
                  'Traversal depth for nested elements. Larger values inspect deeper trees.'
                )
                .optional(),
              detail: z
                .enum(['summary', 'region', 'deep'])
                .default('region')
                .describe("Output depth. 'region' is actionable; 'deep' expands more details.")
                .optional(),
              maxTextLength: z
                .number()
                .int()
                .min(0)
                .describe('Truncate text snippets to this many characters to save tokens.')
                .optional(),
              maxElements: z
                .number()
                .int()
                .min(0)
                .describe('Limit number of listed items per group (buttons, links, inputs).')
                .optional(),
            })
            .optional(),
        } as any,
      },
      async (args: any) => this.extractRegion(args as RegionArgs)
    );

    this.server.registerTool(
      'dom_extract_content',
      {
        title: 'Extract DOM Content',
        description:
          'Readable text for a region as XML-wrapped Markdown (<content>). Use for comprehension; for selectors use dom_extract_region.',
        inputSchema: {
          selector: z
            .string()
            .trim()
            .min(1)
            .describe('CSS selector for the content region (e.g., main article or section).'),
          options: z
            .object({
              includeHeadings: z
                .boolean()
                .describe('Include H1–H6 headings in the output.')
                .optional(),
              includeLists: z
                .boolean()
                .describe('Include unordered/ordered lists in the output.')
                .optional(),
              includeMedia: z
                .boolean()
                .describe('Include media references (images, video, audio).')
                .optional(),
              maxTextLength: z
                .number()
                .int()
                .min(0)
                .describe('Truncate text snippets to this many characters to save tokens.')
                .optional(),
              detail: z
                .enum(['summary', 'region', 'deep'])
                .default('region')
                .describe("Output depth. 'summary' is brief; 'deep' expands more content examples.")
                .optional(),
              maxElements: z
                .number()
                .int()
                .min(0)
                .describe('Limit number of listed items (paragraphs, list items, rows).')
                .optional(),
            })
            .optional(),
        } as any,
      },
      async (args: any) => this.extractContent(args as ContentArgs)
    );

    this.server.registerTool(
      'dom_extract_interactive',
      {
        title: 'Extract Interactive Elements',
        description:
          'Quick list of controls within a scope as XML-wrapped Markdown (<section>). Alternative to region when you only need controls.',
        inputSchema: {
          selector: z
            .union([z.string().trim().min(1), z.literal('')])
            .describe(
              'Optional container CSS selector. Omit or pass empty string to scan the whole document.'
            )
            .optional(),
          options: z
            .object({
              viewportOnly: z
                .boolean()
                .default(false)
                .describe('Only include elements currently within the viewport. Default: false.'),
              maxDepth: z
                .number()
                .int()
                .min(0)
                .describe(
                  'Traversal depth for nested elements. Larger values inspect deeper trees.'
                )
                .optional(),
              detail: z
                .enum(['summary', 'region', 'deep'])
                .default('region')
                .describe("Output depth. 'region' is actionable; 'deep' expands more details.")
                .optional(),
              maxTextLength: z
                .number()
                .int()
                .min(0)
                .describe('Truncate text snippets to this many characters to save tokens.')
                .optional(),
              maxElements: z
                .number()
                .int()
                .min(0)
                .describe('Limit number of listed items per group (buttons, links, inputs).')
                .optional(),
            })
            .optional(),
        } as any,
      },
      async (args: any) => this.extractInteractive(args as InteractiveArgs)
    );

    this.server.registerTool(
      'browser_screenshot',
      {
        title: 'Capture Screenshot',
        description:
          'Capture a PNG screenshot of the current page. Returns a short Markdown summary (path and fullPage flag).',
        inputSchema: {
          path: z
            .string()
            .trim()
            .min(1)
            .describe(
              'Optional output path (absolute or workspace-relative). Default: screenshot-<timestamp>.png'
            )
            .optional(),
          fullPage: z
            .boolean()
            .default(false)
            .describe('Capture the full scrollable page. Default: false.'),
        } as any,
      },
      async (args: any) => this.captureScreenshot(args as ScreenshotArgs)
    );

    this.server.registerTool(
      'browser_close',
      {
        title: 'Close Browser',
        description:
          'Shut down the launched browser instance and release resources. Safe to call multiple times.',
        inputSchema: {},
      },
      async () => this.closeBrowser()
    );
  }

  private async connectBrowser(args: ConnectBrowserArgs): Promise<CallToolResult> {
    if (this.browser?.isConnected()) {
      return createTextResult('Browser already connected');
    }

    const launchOptions: LaunchOptions = {
      headless: args.headless,
      args: [...DEFAULT_LAUNCH_ARGS],
    };

    const resolution = await this.resolveChromeExecutable(args.executablePath);
    if (resolution) {
      launchOptions.executablePath = resolution.path;
    }

    try {
      this.browser = await chromium.launch(launchOptions);
    } catch (error) {
      this.browser = null;
      this.page = null;
      const locationDescription = resolution
        ? `Failed to launch Chromium at ${resolution.path}`
        : 'Failed to launch bundled Chromium';
      this.handleToolError(error, locationDescription);
    }

    this.browser?.on('disconnected', () => {
      this.browser = null;
      this.page = null;
    });

    this.page = await this.browser?.newPage();
    const descriptor = args.headless ? ' (headless)' : '';
    const sourceDetails = resolution
      ? ` using ${resolution.path} (${resolution.source}).`
      : ' using bundled Chromium.';
    return createTextResult(`Browser connected${descriptor}${sourceDetails}`);
  }

  private async resolveChromeExecutable(
    explicitPath?: string
  ): Promise<{ path: string; source: string } | null> {
    if (explicitPath && (await pathExists(explicitPath))) {
      return { path: resolve(explicitPath), source: 'user' };
    }

    for (const envVar of CHROME_ENV_VARS) {
      const envPath = process.env[envVar];
      if (await pathExists(envPath)) {
        return { path: resolve(envPath as string), source: `env:${envVar}` };
      }
    }

    const candidates = DEFAULT_CHROME_LOCATIONS[process.platform] ?? [];
    for (const candidate of candidates) {
      if (await pathExists(candidate)) {
        return { path: resolve(candidate), source: 'default' };
      }
    }

    return null;
  }

  private async navigate(args: NavigateArgs): Promise<CallToolResult> {
    const page = this.getActivePage();
    try {
      await page.goto(args.url, { waitUntil: 'networkidle' });
    } catch (error) {
      this.handleToolError(error, `Failed to navigate to ${args.url}`);
    }

    return createTextResult(`Navigated to ${args.url}`);
  }

  private async extractStructure(args: OptionalSelectorArgs): Promise<CallToolResult> {
    const started = Date.now();
    try {
      const text = await this.runLibraryOperation<
        string,
        StructureOperationArgs & { format: FormatOptions }
      >('structure', {
        selector: args.selector && args.selector.trim().length > 0 ? args.selector : null,
        format: {
          detail: args.detail ?? 'summary',
          maxTextLength: args.maxTextLength,
          maxElements: args.maxElements,
        },
      });
      const duration = Date.now() - started;
      return createTextResult(`${text}\n\nDuration: ${duration}ms`);
    } catch (error) {
      this.handleToolError(error, 'Failed to extract structure');
    }
  }

  private async extractRegion(args: RegionArgs): Promise<CallToolResult> {
    const started = Date.now();
    try {
      const text = await this.runLibraryOperation<
        string,
        RegionOperationArgs & { format: FormatOptions }
      >('region', {
        selector: args.selector,
        options: args.options ?? {},
        format: {
          detail: args.options?.detail ?? 'region',
          maxTextLength: args.options?.maxTextLength,
          maxElements: args.options?.maxElements,
        },
      });
      const duration = Date.now() - started;
      return createTextResult(`${text}\n\nDuration: ${duration}ms`);
    } catch (error) {
      this.handleToolError(error, `Failed to extract region for selector ${args.selector}`);
    }
  }

  private async extractContent(args: ContentArgs): Promise<CallToolResult> {
    const started = Date.now();
    try {
      const text = await this.runLibraryOperation<
        string,
        ContentOperationArgs & { format: FormatOptions }
      >('content', {
        selector: args.selector,
        options: args.options ?? {},
        format: {
          detail: args.options?.detail ?? 'region',
          maxTextLength: args.options?.maxTextLength,
          maxElements: args.options?.maxElements,
        },
      });
      const duration = Date.now() - started;
      return createTextResult(`${text}\n\nDuration: ${duration}ms`);
    } catch (error) {
      this.handleToolError(error, `Failed to extract content for selector ${args.selector}`);
    }
  }

  private async extractInteractive(args: InteractiveArgs): Promise<CallToolResult> {
    const started = Date.now();
    try {
      const text = await this.runLibraryOperation<
        string,
        InteractiveOperationArgs & { format: FormatOptions }
      >('interactive', {
        selector: args.selector && args.selector.trim().length > 0 ? args.selector : null,
        options: args.options ?? {},
        format: {
          detail: args.options?.detail ?? 'region',
          maxTextLength: args.options?.maxTextLength,
          maxElements: args.options?.maxElements,
        },
      });
      const duration = Date.now() - started;
      return createTextResult(`${text}\n\nDuration: ${duration}ms`);
    } catch (error) {
      this.handleToolError(error, 'Failed to extract interactive elements');
    }
  }

  private async captureScreenshot(args: ScreenshotArgs): Promise<CallToolResult> {
    const page = this.getActivePage();
    const outputPath = resolve(process.cwd(), args.path ?? `screenshot-${Date.now()}.png`);

    try {
      await page.screenshot({ path: outputPath, fullPage: args.fullPage });
    } catch (error) {
      this.handleToolError(error, `Failed to capture screenshot to ${outputPath}`);
    }

    return createTextResult(
      `Screenshot captured\n- Path: \`${outputPath}\`\n- Full page: ${args.fullPage ? 'yes' : 'no'}`
    );
  }

  private async closeBrowser(): Promise<CallToolResult> {
    if (!this.browser) {
      return createTextResult('Browser already closed');
    }

    if (this.page) {
      try {
        await this.page.close({ runBeforeUnload: true });
      } catch {
        // Ignore failures when shutting down the page.
      }
    }

    try {
      await this.browser.close();
    } finally {
      this.browser = null;
      this.page = null;
    }

    return createTextResult('Browser closed');
  }

  private async runLibraryOperation<TResult, TArgs extends Record<string, unknown>>(
    operation: LibraryOperation,
    args: TArgs
  ): Promise<TResult> {
    const page = this.getActivePage();
    const code = await this.loadLibraryCode();

    return page.evaluate<TResult, { code: string; operation: LibraryOperation; args: TArgs }>(
      async ({ code, operation, args }) => {
        const blob = new Blob([code], { type: 'text/javascript' });
        const url = URL.createObjectURL(blob);

        try {
          const moduleExports = await import(/* webpackIgnore: true */ url);
          const { ProgressiveExtractor, MarkdownFormatter } = moduleExports;
          const SmartDOMReader = moduleExports.SmartDOMReader ?? moduleExports.default;

          switch (operation) {
            case 'structure': {
              if (!ProgressiveExtractor) {
                throw new Error('ProgressiveExtractor export is unavailable.');
              }

              const { selector } = args as StructureOperationArgs;
              const target = selector ? (document.querySelector(selector) ?? document) : document;
              const overview = ProgressiveExtractor.extractStructure(target);
              if (!MarkdownFormatter) throw new Error('MarkdownFormatter export is unavailable.');
              const argsWithFormat = args as Record<string, unknown> & {
                format?: Record<string, unknown>;
              };
              const fmt = argsWithFormat.format ?? {};
              const meta = { title: document.title, url: location.href };
              return MarkdownFormatter.structure(overview, fmt, meta) as TResult;
            }

            case 'region': {
              if (!ProgressiveExtractor) {
                throw new Error('ProgressiveExtractor export is unavailable.');
              }

              const { selector, options } = args as RegionOperationArgs;
              const result = ProgressiveExtractor.extractRegion(
                selector,
                document,
                options ?? {},
                SmartDOMReader
              );
              if (!result)
                return `No matching region for selector ${selector}` as unknown as TResult;
              if (!MarkdownFormatter) throw new Error('MarkdownFormatter export is unavailable.');
              const argsWithFormat = args as Record<string, unknown> & {
                format?: Record<string, unknown>;
              };
              const fmt = argsWithFormat.format ?? {};
              const meta = { title: document.title, url: location.href };
              return MarkdownFormatter.region(result, fmt, meta) as TResult;
            }

            case 'content': {
              if (!ProgressiveExtractor) {
                throw new Error('ProgressiveExtractor export is unavailable.');
              }

              const { selector, options } = args as ContentOperationArgs;
              const content = ProgressiveExtractor.extractContent(
                selector,
                document,
                options ?? {}
              );
              if (!content) return `No content for selector ${selector}` as unknown as TResult;
              if (!MarkdownFormatter) throw new Error('MarkdownFormatter export is unavailable.');
              const argsWithFormat = args as Record<string, unknown> & {
                format?: Record<string, unknown>;
              };
              const fmt = argsWithFormat.format ?? {};
              const meta = { title: document.title, url: location.href };
              return MarkdownFormatter.content(content, fmt, meta) as TResult;
            }

            case 'interactive': {
              if (!SmartDOMReader) {
                throw new Error('SmartDOMReader export is unavailable.');
              }

              const { selector, options } = args as InteractiveOperationArgs;
              const target = selector ? (document.querySelector(selector) ?? document) : document;

              if (typeof SmartDOMReader.extractInteractive === 'function') {
                const result = SmartDOMReader.extractInteractive(target, options ?? {});
                if (!MarkdownFormatter) throw new Error('MarkdownFormatter export is unavailable.');
                const argsWithFormat = args as Record<string, unknown> & {
                  format?: Record<string, unknown>;
                };
                const fmt = argsWithFormat.format ?? {};
                const meta = { title: document.title, url: location.href };
                return MarkdownFormatter.region(result, fmt, meta) as TResult;
              }

              const reader = new SmartDOMReader({ ...options, mode: 'interactive' });
              const result = reader.extract(target, options ?? {});
              if (!MarkdownFormatter) throw new Error('MarkdownFormatter export is unavailable.');
              const argsWithFormat = args as Record<string, unknown> & {
                format?: Record<string, unknown>;
              };
              const fmt = argsWithFormat.format ?? {};
              const meta = { title: document.title, url: location.href };
              return MarkdownFormatter.region(result, fmt, meta) as TResult;
            }

            default: {
              throw new Error(`Unsupported library operation: ${operation}`);
            }
          }
        } finally {
          URL.revokeObjectURL(url);
        }
      },
      { code, operation, args }
    );
  }

  private getActivePage(): Page {
    if (!this.browser || !this.browser.isConnected() || !this.page) {
      throw new McpError(
        ErrorCode.InvalidRequest,
        'Browser not connected. Call browser_connect first.'
      );
    }

    return this.page;
  }

  // All formatting happens in-page via the bundled library; no server-side dynamic imports.

  private async loadLibraryCode(): Promise<string> {
    const embeddedPath = resolve(__dirname, EMBEDDED_LIBRARY_RELATIVE_PATH);
    return this.readLibraryFile(embeddedPath);
  }

  private async readLibraryFile(resolvedPath: string): Promise<string> {
    if (!(await pathExists(resolvedPath))) {
      throw new McpError(
        ErrorCode.InvalidParams,
        `Embedded library file not found at ${resolvedPath}. Ensure the bundled file exists.`
      );
    }

    // If cached, validate mtime to support hot updates without restart
    const { mtimeMs } = await stat(resolvedPath);
    if (this.cachedLibrary?.path === resolvedPath && this.cachedLibrary.mtimeMs === mtimeMs) {
      return this.cachedLibrary.code;
    }

    const code = await readFile(resolvedPath, 'utf8');
    this.cachedLibrary = { path: resolvedPath, code, mtimeMs };
    return code;
  }

  private handleToolError(error: unknown, fallbackMessage: string): never {
    if (error instanceof McpError) {
      throw error;
    }

    if (error instanceof Error) {
      console.error(fallbackMessage, error);
      throw new McpError(ErrorCode.InternalError, error.message);
    }

    throw new McpError(ErrorCode.InternalError, fallbackMessage);
  }
}

const server = new SmartDomReaderServer();
server.run().catch((error) => {
  console.error('Smart DOM Reader server failed to start', error);
  process.exitCode = 1;
});
