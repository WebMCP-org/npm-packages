#!/usr/bin/env tsx

import { constants as fsConstants } from 'node:fs';
import { access, readFile } from 'node:fs/promises';
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
};

type RegionArgs = {
  selector: string;
  options?: ProgressiveExtractorRegionConfig;
};

type ContentArgs = {
  selector: string;
  options?: ProgressiveExtractorContentConfig;
};

type InteractiveArgs = {
  selector?: string;
  options?: SmartDomReaderOptions;
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

type LibraryCache = {
  path: string;
  code: string;
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

function asJsonText(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }

  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
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

function createJsonResult(payload: unknown): CallToolResult {
  return createTextResult(asJsonText(payload));
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
        description: 'Launch a Chromium instance using Playwright automation',
        inputSchema: {
          executablePath: z
            .string()
            .trim()
            .min(1, { message: 'Provide a non-empty executablePath' })
            .optional(),
          headless: z.boolean().default(false),
        },
      },
      async (args) => this.connectBrowser(args)
    );

    this.server.registerTool(
      'browser_navigate',
      {
        title: 'Navigate to URL',
        description: 'Load a URL in the active tab',
        inputSchema: {
          url: z.string().url('url must be a valid absolute URL'),
        },
      },
      async (args) => this.navigate(args)
    );

    this.server.registerTool(
      'dom_extract_structure',
      {
        title: 'Extract DOM Structure',
        description: 'Capture the structural outline of the DOM',
        inputSchema: {
          selector: z.string().trim().min(1).optional(),
        },
      },
      async (args) => this.extractStructure(args)
    );

    this.server.registerTool(
      'dom_extract_region',
      {
        title: 'Extract DOM Region',
        description: 'Capture details for a targeted DOM region',
        inputSchema: {
          selector: z.string().trim().min(1),
          options: z
            .object({
              mode: z.enum(['interactive', 'full']).optional(),
              includeHidden: z.boolean().optional(),
              maxDepth: z.number().int().min(0).optional(),
            })
            .optional(),
        },
      },
      async (args) => this.extractRegion(args)
    );

    this.server.registerTool(
      'dom_extract_content',
      {
        title: 'Extract DOM Content',
        description: 'Capture textual and media content for a DOM region',
        inputSchema: {
          selector: z.string().trim().min(1),
          options: z
            .object({
              includeHeadings: z.boolean().optional(),
              includeLists: z.boolean().optional(),
              includeMedia: z.boolean().optional(),
              maxTextLength: z.number().int().min(0).optional(),
            })
            .optional(),
        },
      },
      async (args) => this.extractContent(args)
    );

    this.server.registerTool(
      'dom_extract_interactive',
      {
        title: 'Extract Interactive Elements',
        description: 'Enumerate interactive elements within the target scope',
        inputSchema: {
          selector: z.string().trim().min(1).optional(),
          options: z
            .object({
              viewportOnly: z.boolean().default(false),
              maxDepth: z.number().int().min(0).optional(),
            })
            .optional(),
        },
      },
      async (args) => this.extractInteractive(args)
    );

    this.server.registerTool(
      'browser_screenshot',
      {
        title: 'Capture Screenshot',
        description: 'Take a PNG screenshot of the current page',
        inputSchema: {
          path: z.string().trim().min(1).optional(),
          fullPage: z.boolean().default(false),
        },
      },
      async (args) => this.captureScreenshot(args)
    );

    this.server.registerTool(
      'browser_close',
      {
        title: 'Close Browser',
        description: 'Shut down the launched browser instance',
        inputSchema: {},
      },
      async () => this.closeBrowser()
    );
  }

  private async connectBrowser(args: ConnectBrowserArgs): Promise<CallToolResult> {
    if (this.browser && this.browser.isConnected()) {
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

    this.browser!.on('disconnected', () => {
      this.browser = null;
      this.page = null;
    });

    this.page = await this.browser!.newPage();
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
    try {
      const result = await this.runLibraryOperation<unknown, StructureOperationArgs>('structure', {
        selector: args.selector ?? null,
      });
      return createJsonResult(result);
    } catch (error) {
      this.handleToolError(error, 'Failed to extract structure');
    }
  }

  private async extractRegion(args: RegionArgs): Promise<CallToolResult> {
    try {
      const result = await this.runLibraryOperation<unknown, RegionOperationArgs>('region', {
        selector: args.selector,
        options: args.options ?? {},
      });
      return createJsonResult(result);
    } catch (error) {
      this.handleToolError(error, `Failed to extract region for selector ${args.selector}`);
    }
  }

  private async extractContent(args: ContentArgs): Promise<CallToolResult> {
    try {
      const result = await this.runLibraryOperation<unknown, ContentOperationArgs>('content', {
        selector: args.selector,
        options: args.options ?? {},
      });
      return createJsonResult(result);
    } catch (error) {
      this.handleToolError(error, `Failed to extract content for selector ${args.selector}`);
    }
  }

  private async extractInteractive(args: InteractiveArgs): Promise<CallToolResult> {
    try {
      const result = await this.runLibraryOperation<unknown, InteractiveOperationArgs>(
        'interactive',
        {
          selector: args.selector ?? null,
          options: args.options ?? {},
        }
      );
      return createJsonResult(result);
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

    return createJsonResult({
      message: 'Screenshot captured',
      path: outputPath,
      fullPage: args.fullPage,
    });
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
          const { ProgressiveExtractor } = moduleExports;
          const SmartDOMReader = moduleExports.SmartDOMReader ?? moduleExports.default;

          switch (operation) {
            case 'structure': {
              if (!ProgressiveExtractor) {
                throw new Error('ProgressiveExtractor export is unavailable.');
              }

              const { selector } = args as StructureOperationArgs;
              const target = selector ? (document.querySelector(selector) ?? document) : document;
              return ProgressiveExtractor.extractStructure(target) as TResult;
            }

            case 'region': {
              if (!ProgressiveExtractor) {
                throw new Error('ProgressiveExtractor export is unavailable.');
              }

              const { selector, options } = args as RegionOperationArgs;
              return ProgressiveExtractor.extractRegion(
                selector,
                document,
                options ?? {},
                SmartDOMReader
              ) as TResult;
            }

            case 'content': {
              if (!ProgressiveExtractor) {
                throw new Error('ProgressiveExtractor export is unavailable.');
              }

              const { selector, options } = args as ContentOperationArgs;
              return ProgressiveExtractor.extractContent(
                selector,
                document,
                options ?? {}
              ) as TResult;
            }

            case 'interactive': {
              if (!SmartDOMReader) {
                throw new Error('SmartDOMReader export is unavailable.');
              }

              const { selector, options } = args as InteractiveOperationArgs;
              const target = selector ? (document.querySelector(selector) ?? document) : document;

              if (typeof SmartDOMReader.extractInteractive === 'function') {
                return SmartDOMReader.extractInteractive(target, options ?? {}) as TResult;
              }

              const reader = new SmartDOMReader({ ...options, mode: 'interactive' });
              return reader.extract(target, options ?? {}) as TResult;
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

  private async loadLibraryCode(): Promise<string> {
    const embeddedPath = resolve(__dirname, EMBEDDED_LIBRARY_RELATIVE_PATH);
    return this.readLibraryFile(embeddedPath);
  }

  private async readLibraryFile(resolvedPath: string): Promise<string> {
    if (this.cachedLibrary?.path === resolvedPath) {
      return this.cachedLibrary.code;
    }

    if (!(await pathExists(resolvedPath))) {
      throw new McpError(
        ErrorCode.InvalidParams,
        `Embedded library file not found at ${resolvedPath}. Ensure the bundled file exists.`
      );
    }

    const code = await readFile(resolvedPath, 'utf8');
    this.cachedLibrary = { path: resolvedPath, code };
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
