/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {type AggregatedIssue} from '../node_modules/chrome-devtools-frontend/mcp/mcp.js';

import {extractUrlLikeFromDevToolsTitle, urlsEqual} from './DevtoolsUtils.js';
import {ToolListChangedNotificationSchema} from './third_party/index.js';
import type {WebMCPToolHub} from './tools/WebMCPToolHub.js';
import type {ListenerMap} from './PageCollector.js';
import {NetworkCollector, ConsoleCollector} from './PageCollector.js';
import {WEB_MCP_BRIDGE_SCRIPT} from './transports/WebMCPBridgeScript.js';
import {WebMCPClientTransport} from './transports/WebMCPClientTransport.js';
import {Locator} from './third_party/index.js';
import type {
  Browser,
  CDPSession,
  ConsoleMessage,
  Debugger,
  Dialog,
  ElementHandle,
  HTTPRequest,
  Page,
  SerializedAXNode,
  PredefinedNetworkConditions,
} from './third_party/index.js';
import {listPages} from './tools/pages.js';
import {takeSnapshot} from './tools/snapshot.js';
import {CLOSE_PAGE_ERROR} from './tools/ToolDefinition.js';
import type {Context, DevToolsData} from './tools/ToolDefinition.js';
import type {TraceResult} from './trace-processing/parse.js';
import {WaitForHelper} from './WaitForHelper.js';

export interface TextSnapshotNode extends SerializedAXNode {
  id: string;
  backendNodeId?: number;
  children: TextSnapshotNode[];
}

export interface GeolocationOptions {
  latitude: number;
  longitude: number;
}

/**
 * Represents a text-based accessibility snapshot of a page.
 */
export interface TextSnapshot {
  /** Root node of the accessibility tree. */
  root: TextSnapshotNode;
  /** Map of node IDs to their corresponding nodes for O(1) lookup. */
  idToNode: Map<string, TextSnapshotNode>;
  /** Unique identifier for this snapshot version. */
  snapshotId: string;
  /** UID of the currently selected element, if it exists in this snapshot. */
  selectedElementUid?: string;
  /**
   * Indicates if any element is selected in DevTools.
   * Note: The selected element may not be part of this snapshot
   * (e.g., if it's in an iframe or filtered out).
   */
  hasSelectedElement: boolean;
  /** Whether this snapshot includes all accessibility nodes (verbose mode). */
  verbose: boolean;
}

/**
 * Configuration options for McpContext initialization.
 */
interface McpContextOptions {
  /** Whether to expose DevTools windows as debuggable pages. */
  experimentalDevToolsDebugging: boolean;
  /** Whether to expose all page-like targets (including service workers). */
  experimentalIncludeAllPages?: boolean;
}

/**
 * Holds an active WebMCP connection (client + transport) for a specific page.
 */
interface WebMCPConnection {
  client: Client;
  transport: WebMCPClientTransport;
  page: Page;
}

/**
 * Result of attempting to get a WebMCP client.
 */
export type WebMCPClientResult =
  | {connected: true; client: Client}
  | {connected: false; error: string};

/** Default timeout for page operations in milliseconds. */
const DEFAULT_TIMEOUT = 5_000;
/** Default timeout for navigation operations in milliseconds. */
const NAVIGATION_TIMEOUT = 10_000;

/**
 * Get the timeout multiplier for a given network condition.
 *
 * @param condition - The network condition name (e.g., "Fast 4G", "Slow 3G").
 * @returns Multiplier to apply to timeouts (1 = no slowdown, 10 = max slowdown).
 */
function getNetworkMultiplierFromString(condition: string | null): number {
  const puppeteerCondition =
    condition as keyof typeof PredefinedNetworkConditions;

  switch (puppeteerCondition) {
    case 'Fast 4G':
      return 1;
    case 'Slow 4G':
      return 2.5;
    case 'Fast 3G':
      return 5;
    case 'Slow 3G':
      return 10;
  }
  return 1;
}

/**
 * Get the file extension for a given MIME type.
 *
 * @param mimeType - The MIME type (e.g., "image/png").
 * @returns The corresponding file extension without the dot.
 * @throws Error if the MIME type is not supported.
 */
function getExtensionFromMimeType(mimeType: string): string {
  switch (mimeType) {
    case 'image/png':
      return 'png';
    case 'image/jpeg':
      return 'jpeg';
    case 'image/webp':
      return 'webp';
  }
  throw new Error(`No mapping for Mime type ${mimeType}.`);
}

/**
 * Central context for MCP operations on a browser instance.
 *
 * Manages page state, accessibility snapshots, network/console collection,
 * WebMCP connections, and tool registration. This class serves as the primary
 * interface between MCP tools and the browser.
 */
export class McpContext implements Context {
  browser: Browser;
  logger: Debugger;

  /** Cached list of available pages (refreshed by createPagesSnapshot). */
  #pages: Page[] = [];
  /** Mapping of content pages to their associated DevTools inspector pages. */
  #pageToDevToolsPage = new Map<Page, Page>();
  /** Currently selected page for tool operations. */
  #selectedPage?: Page;
  /**
   * Whether the selected page has been explicitly set for this session.
   * When true, createPagesSnapshot() won't auto-switch to pages[0].
   * This prevents MCP sessions from interfering with each other in shared browsers.
   */
  #pageExplicitlySelected = false;
  /** Most recent accessibility snapshot of the selected page. */
  #textSnapshot: TextSnapshot | null = null;
  #networkCollector: NetworkCollector;
  #consoleCollector: ConsoleCollector;

  #isRunningTrace = false;
  #networkConditionsMap = new WeakMap<Page, string>();
  #cpuThrottlingRateMap = new WeakMap<Page, number>();
  #geolocationMap = new WeakMap<Page, GeolocationOptions>();
  #dialog?: Dialog;

  #nextSnapshotId = 1;
  #traceResults: TraceResult[] = [];

  #locatorClass: typeof Locator;
  #options: McpContextOptions;
  #webMCPConnections = new WeakMap<Page, WebMCPConnection>();
  #toolHub?: WebMCPToolHub;
  /** Tracks pages that have WebMCP auto-detection listeners installed. */
  #pagesWithWebMCPListeners = new WeakSet<Page>();
  /**
   * The windowId that this MCP session owns.
   * When set, page operations are scoped to only pages in this window.
   */
  #sessionWindowId?: number;
  /** Cached browser-level CDP session for window operations. */
  #browserCdpSession?: CDPSession;

  private constructor(
    browser: Browser,
    logger: Debugger,
    options: McpContextOptions,
    locatorClass: typeof Locator,
  ) {
    this.browser = browser;
    this.logger = logger;
    this.#locatorClass = locatorClass;
    this.#options = options;

    this.#networkCollector = new NetworkCollector(this.browser);

    this.#consoleCollector = new ConsoleCollector(this.browser, collect => {
      return {
        console: event => {
          collect(event);
        },
        pageerror: event => {
          if (event instanceof Error) {
            collect(event);
          } else {
            const error = new Error(`${event}`);
            error.stack = undefined;
            collect(error);
          }
        },
        issue: event => {
          collect(event);
        },
      } as ListenerMap;
    });
  }

  async #init() {
    const pages = await this.createPagesSnapshot();
    await this.#networkCollector.init(pages);
    await this.#consoleCollector.init(pages);

    // Auto-inject WebMCP bridge into all pages
    await this.#setupWebMCPAutoInject();
  }

  /**
   * Set up automatic WebMCP bridge injection for all pages.
   * This injects the bridge script into existing pages and configures
   * the browser to inject it into all future pages.
   */
  async #setupWebMCPAutoInject(): Promise<void> {
    try {
      // Get browser-level CDP session to inject into all new pages
      const browserTarget = this.browser.target();
      const cdpSession = await browserTarget.createCDPSession();

      // Inject bridge script into all future pages
      await cdpSession.send('Page.addScriptToEvaluateOnNewDocument', {
        source: WEB_MCP_BRIDGE_SCRIPT,
      });

      this.logger('WebMCP bridge auto-inject configured for new pages');

      // Inject into existing pages (they won't have the auto-inject yet)
      for (const page of this.#pages) {
        try {
          // Skip chrome:// and devtools:// pages
          const url = page.url();
          if (
            url.startsWith('chrome://') ||
            url.startsWith('chrome-extension://') ||
            url.startsWith('devtools://') ||
            url === 'about:blank'
          ) {
            continue;
          }

          await page.evaluate(WEB_MCP_BRIDGE_SCRIPT);
        } catch (err) {
          // Page might not be ready or accessible - log for debugging
          const message = err instanceof Error ? err.message : String(err);
          this.logger(`Bridge injection skipped for ${page.url()}: ${message}`);
        }
      }

      this.logger('WebMCP bridge injected into existing pages');
    } catch (err) {
      // Non-fatal - auto-inject is a convenience feature
      this.logger('WebMCP auto-inject setup failed:', err);
    }
  }

  dispose() {
    this.#networkCollector.dispose();
    this.#consoleCollector.dispose();
  }

  /**
   * Set the WebMCPToolHub for dynamic tool registration.
   * This enables automatic registration of WebMCP tools as native MCP tools.
   * Also sets up auto-detection for all existing pages.
   */
  setToolHub(hub: WebMCPToolHub): void {
    this.#toolHub = hub;
    // Trigger auto-detection for all existing pages asynchronously
    this.#setupWebMCPAutoDetectionForAllPages().catch(err => {
      const message = err instanceof Error ? err.message : String(err);
      this.logger(`WebMCP auto-detection setup failed: ${message}`);
      // Note: This is non-fatal - individual page connections may still work
      // when explicitly requested via getWebMCPClient()
    });
  }

  /**
   * Get the WebMCPToolHub instance (for testing purposes)
   */
  getToolHub(): WebMCPToolHub | undefined {
    return this.#toolHub;
  }

  /**
   * Get or create a browser-level CDP session for window operations.
   * Recreates the session if it has become invalid.
   */
  async #getBrowserCdpSession(): Promise<CDPSession> {
    if (this.#browserCdpSession) {
      // Verify session is still valid by attempting a simple operation
      try {
        await this.#browserCdpSession.send('Browser.getVersion');
        return this.#browserCdpSession;
      } catch (err) {
        // Session is stale, recreate it
        const message = err instanceof Error ? err.message : String(err);
        this.logger(`Browser CDP session stale (${message}), recreating...`);
        this.#browserCdpSession = undefined;
      }
    }
    this.#browserCdpSession = await this.browser.target().createCDPSession();
    return this.#browserCdpSession;
  }

  /**
   * Get the windowId for a given page using CDP.
   */
  async getWindowIdForPage(page: Page): Promise<number> {
    const cdpSession = await this.#getBrowserCdpSession();
    // @ts-expect-error _targetId is internal but stable
    const targetId = page.target()._targetId as string;
    const {windowId} = await cdpSession.send('Browser.getWindowForTarget', {
      targetId,
    });
    return windowId;
  }

  /**
   * Set the window that this session owns.
   * When set, page operations are scoped to only pages in this window.
   */
  setSessionWindowId(windowId: number): void {
    this.#sessionWindowId = windowId;
    this.logger(`Session bound to windowId: ${windowId}`);
  }

  /**
   * Get the session's window ID, or undefined if not set.
   */
  getSessionWindowId(): number | undefined {
    return this.#sessionWindowId;
  }

  /**
   * Close all pages in the session's window.
   * Called during cleanup when the MCP server is shutting down.
   */
  async closeSessionWindow(): Promise<void> {
    if (this.#sessionWindowId === undefined) {
      this.logger('No session window to close');
      return;
    }

    this.logger(`Closing session window ${this.#sessionWindowId}...`);

    // Get all pages in this session's window and close them
    const pagesToClose = [...this.#pages];
    for (const page of pagesToClose) {
      try {
        if (!page.isClosed()) {
          await page.close();
        }
      } catch (err) {
        // Ignore errors during cleanup - page might already be closed
        const message = err instanceof Error ? err.message : String(err);
        this.logger(`Error closing page during cleanup: ${message}`);
      }
    }

    // Clean up the CDP session
    if (this.#browserCdpSession) {
      try {
        await this.#browserCdpSession.detach();
      } catch (err) {
        // Detach errors during cleanup are expected - log for debugging
        const message = err instanceof Error ? err.message : String(err);
        this.logger(`CDP detach during cleanup: ${message}`);
      }
      this.#browserCdpSession = undefined;
    }

    this.logger('Session window closed');
  }

  /**
   * Set up automatic WebMCP detection for a page.
   * This installs listeners that detect WebMCP after navigation and sync tools.
   */
  #setupWebMCPAutoDetection(page: Page): void {
    // Skip if listeners already installed
    if (this.#pagesWithWebMCPListeners.has(page)) {
      return;
    }

    // Skip chrome:// and devtools:// pages
    const url = page.url();
    if (
      url.startsWith('chrome://') ||
      url.startsWith('chrome-extension://') ||
      url.startsWith('devtools://')
    ) {
      return;
    }

    this.#pagesWithWebMCPListeners.add(page);

    // Handler for frame navigation - detect WebMCP after main frame navigates
    const onFrameNavigated = async (frame: unknown) => {
      // Only handle main frame navigation
      // @ts-expect-error Frame type not exported
      if (frame.parentFrame?.() !== null) {
        return;
      }

      // Skip internal pages
      const newUrl = page.url();
      if (
        newUrl.startsWith('chrome://') ||
        newUrl.startsWith('chrome-extension://') ||
        newUrl.startsWith('devtools://') ||
        newUrl === 'about:blank'
      ) {
        return;
      }

      // Immediately try to connect - no polling needed
      // If no WebMCP, connection will timeout gracefully
      this.#tryConnectWebMCP(page).catch(err => {
        const message = err instanceof Error ? err.message : String(err);
        // Differentiate expected timeouts from unexpected errors
        const isExpected = message.includes('timeout') ||
                           message.includes('WebMCP not detected') ||
                           message.includes('server did not respond');
        if (isExpected) {
          this.logger(`No WebMCP detected after navigation: ${page.url()}`);
        } else {
          this.logger(`Unexpected WebMCP connection error for ${page.url()}: ${message}`);
        }
      });
    };

    page.on('framenavigated', onFrameNavigated);

    // Clean up listener when page closes
    page.once('close', () => {
      page.off('framenavigated', onFrameNavigated);
      this.#pagesWithWebMCPListeners.delete(page);
    });

    this.logger(`WebMCP auto-detection listener installed for page: ${url}`);
  }

  /**
   * Attempt to connect to WebMCP on a page without pre-checking.
   * Uses the extension's approach: just try to connect, handle failure gracefully.
   *
   * This matches the WebMCP extension's behavior:
   * - No pre-flight detection polling
   * - Immediate connection attempt
   * - Graceful handling if no server exists
   * - Notification-based syncing when tools appear later
   *
   * Reference: /WebMCP/apps/extension/entrypoints/content/connection.ts lines 88-118
   */
  async #tryConnectWebMCP(page: Page): Promise<void> {
    // Skip if tool hub is not enabled
    if (!this.#toolHub?.isEnabled()) {
      return;
    }

    try {
      // Immediately try to get/create WebMCP client
      // Transport is configured with requireWebMCP: false and 30s timeout in getWebMCPClient
      const result = await this.getWebMCPClient(page);

      if (result.connected) {
        this.logger(`WebMCP connected for page: ${page.url()}`);
      } else {
        // This is normal for pages without WebMCP
        this.logger(`No WebMCP on page: ${page.url()}`);
      }
    } catch (err) {
      // Connection timeout or error is expected on pages without WebMCP
      this.logger(`WebMCP connection failed for ${page.url()} (normal if page has no WebMCP):`, err);
    }
  }

  /**
   * Set up WebMCP auto-detection for all current pages.
   * Called during initialization and when tool hub is set.
   */
  async #setupWebMCPAutoDetectionForAllPages(): Promise<void> {
    for (const page of this.#pages) {
      this.#setupWebMCPAutoDetection(page);
      // Try to connect immediately (don't await - run in parallel for all pages)
      this.#tryConnectWebMCP(page).catch(err => {
        const message = err instanceof Error ? err.message : String(err);
        // Differentiate expected timeouts from unexpected errors
        const isExpected = message.includes('timeout') ||
                           message.includes('WebMCP not detected') ||
                           message.includes('server did not respond');
        if (isExpected) {
          this.logger(`No WebMCP on page during initial scan: ${page.url()}`);
        } else {
          this.logger(`Unexpected error during initial WebMCP scan for ${page.url()}: ${message}`);
        }
      });
    }
  }

  /**
   * Create a new McpContext instance.
   *
   * @param browser - Puppeteer browser instance to operate on.
   * @param logger - Debug logger for internal operations.
   * @param opts - Configuration options.
   * @param locatorClass - Locator class to use (injectable for testing with
   *   unbundled Puppeteer to avoid class instance mismatch errors).
   * @returns Initialized McpContext ready for use.
   */
  static async from(
    browser: Browser,
    logger: Debugger,
    opts: McpContextOptions,
    locatorClass: typeof Locator = Locator,
  ): Promise<McpContext> {
    const context = new McpContext(browser, logger, opts, locatorClass);
    await context.#init();
    return context;
  }

  resolveCdpRequestId(cdpRequestId: string): number | undefined {
    const selectedPage = this.getSelectedPage();
    if (!cdpRequestId) {
      this.logger('no network request');
      return;
    }
    const request = this.#networkCollector.find(selectedPage, request => {
      // @ts-expect-error id is internal.
      return request.id === cdpRequestId;
    });
    if (!request) {
      this.logger('no network request for ' + cdpRequestId);
      return;
    }
    return this.#networkCollector.getIdForResource(request);
  }

  /**
   * Resolve a CDP backend node ID to a snapshot element UID.
   *
   * @param cdpBackendNodeId - The CDP backend node ID from DevTools.
   * @returns The corresponding snapshot UID, or undefined if not found.
   *
   * @todo Optimize with a backendNodeId index instead of tree traversal.
   */
  resolveCdpElementId(cdpBackendNodeId: number): string | undefined {
    if (!cdpBackendNodeId) {
      this.logger('no cdpBackendNodeId');
      return;
    }
    if (this.#textSnapshot === null) {
      this.logger('no text snapshot');
      return;
    }
    const queue = [this.#textSnapshot.root];
    while (queue.length) {
      const current = queue.pop()!;
      if (current.backendNodeId === cdpBackendNodeId) {
        return current.id;
      }
      for (const child of current.children) {
        queue.push(child);
      }
    }
    return;
  }

  getNetworkRequests(includePreservedRequests?: boolean): HTTPRequest[] {
    const page = this.getSelectedPage();
    return this.#networkCollector.getData(page, includePreservedRequests);
  }

  getConsoleData(
    includePreservedMessages?: boolean,
  ): Array<ConsoleMessage | Error | AggregatedIssue> {
    const page = this.getSelectedPage();
    return this.#consoleCollector.getData(page, includePreservedMessages);
  }

  getConsoleMessageStableId(
    message: ConsoleMessage | Error | AggregatedIssue,
  ): number {
    return this.#consoleCollector.getIdForResource(message);
  }

  getConsoleMessageById(id: number): ConsoleMessage | Error | AggregatedIssue {
    return this.#consoleCollector.getById(this.getSelectedPage(), id);
  }

  async newPage(): Promise<Page> {
    // If we have a session window, ensure our window is focused first
    // This increases the chance that Chrome creates the new tab in our window
    if (this.#sessionWindowId !== undefined && this.#pages.length > 0) {
      try {
        const existingPage = this.#pages[0];
        if (existingPage) {
          await existingPage.bringToFront();
        }
      } catch (err) {
        // Best effort - focus might fail if page is closing
        const message = err instanceof Error ? err.message : String(err);
        this.logger(`Window focus failed (non-critical): ${message}`);
      }
    }

    const page = await this.browser.newPage();

    // Verify the new page is in our window (if session scoping is active)
    if (this.#sessionWindowId !== undefined) {
      try {
        const newPageWindowId = await this.getWindowIdForPage(page);
        if (newPageWindowId !== this.#sessionWindowId) {
          // New tab went to wrong window - this is a known Chrome behavior issue
          this.logger(
            `Warning: new_page created tab in window ${newPageWindowId} instead of session window ${this.#sessionWindowId}. ` +
              `Tab may not be visible in list_pages.`,
          );
        }
      } catch (err) {
        // Failed to get windowId - page might be in an unexpected state
        const message = err instanceof Error ? err.message : String(err);
        this.logger(`Window ID check failed (non-critical): ${message}`);
      }
    }

    await this.createPagesSnapshot();
    // Mark as explicitly selected so this session sticks to this page
    this.selectPage(page, true);
    this.#networkCollector.addPage(page);
    this.#consoleCollector.addPage(page);
    // Set up WebMCP auto-detection for the new page
    this.#setupWebMCPAutoDetection(page);
    return page;
  }

  async newWindow(): Promise<{page: Page; windowId: number}> {
    // Use CDP to create a new browser window instead of just a tab
    const browserTarget = this.browser.target();
    const cdpSession = await browserTarget.createCDPSession();

    // Create a new target with newWindow: true
    const {targetId} = await cdpSession.send('Target.createTarget', {
      url: 'about:blank',
      newWindow: true,
    });

    // Wait for the new page to be available
    const target = await this.browser.waitForTarget(
      target => {
        // @ts-expect-error _targetId is internal but stable
        return target._targetId === targetId;
      },
      {timeout: 5000},
    );

    const page = await target.page();
    if (!page) {
      throw new Error('Failed to get page from new window target');
    }

    // Get window ID for this target (required for session scoping)
    const {windowId} = await cdpSession.send('Browser.getWindowForTarget', {
      targetId,
    });

    // Set window to nearly full screen (large size that fits most displays)
    try {
      // Set to large dimensions (works well on 1920x1080 and larger displays)
      // This is ~95% of common display sizes without being truly fullscreen
      await cdpSession.send('Browser.setWindowBounds', {
        windowId,
        bounds: {
          left: 20,
          top: 20,
          width: 1800,
          height: 1200,
          windowState: 'normal',
        },
      });
    } catch (err) {
      // Non-fatal: window sizing is best-effort
      this.logger('Failed to resize window:', err);
    }

    await cdpSession.detach();

    await this.createPagesSnapshot();
    // Mark as explicitly selected so this session sticks to this window
    this.selectPage(page, true);
    this.#networkCollector.addPage(page);
    this.#consoleCollector.addPage(page);
    // Set up WebMCP auto-detection for the new page
    this.#setupWebMCPAutoDetection(page);
    return {page, windowId};
  }
  async closePage(pageIdx: number): Promise<void> {
    if (this.#pages.length === 1) {
      throw new Error(CLOSE_PAGE_ERROR);
    }
    const page = this.getPageByIdx(pageIdx);
    await page.close({runBeforeUnload: false});
  }

  getNetworkRequestById(reqid: number): HTTPRequest {
    return this.#networkCollector.getById(this.getSelectedPage(), reqid);
  }

  setNetworkConditions(conditions: string | null): void {
    const page = this.getSelectedPage();
    if (conditions === null) {
      this.#networkConditionsMap.delete(page);
    } else {
      this.#networkConditionsMap.set(page, conditions);
    }
    this.#updateSelectedPageTimeouts();
  }

  getNetworkConditions(): string | null {
    const page = this.getSelectedPage();
    return this.#networkConditionsMap.get(page) ?? null;
  }

  setCpuThrottlingRate(rate: number): void {
    const page = this.getSelectedPage();
    this.#cpuThrottlingRateMap.set(page, rate);
    this.#updateSelectedPageTimeouts();
  }

  getCpuThrottlingRate(): number {
    const page = this.getSelectedPage();
    return this.#cpuThrottlingRateMap.get(page) ?? 1;
  }

  setGeolocation(geolocation: GeolocationOptions | null): void {
    const page = this.getSelectedPage();
    if (geolocation === null) {
      this.#geolocationMap.delete(page);
    } else {
      this.#geolocationMap.set(page, geolocation);
    }
  }

  getGeolocation(): GeolocationOptions | null {
    const page = this.getSelectedPage();
    return this.#geolocationMap.get(page) ?? null;
  }

  setIsRunningPerformanceTrace(x: boolean): void {
    this.#isRunningTrace = x;
  }

  isRunningPerformanceTrace(): boolean {
    return this.#isRunningTrace;
  }

  getDialog(): Dialog | undefined {
    return this.#dialog;
  }

  clearDialog(): void {
    this.#dialog = undefined;
  }

  getSelectedPage(): Page {
    const page = this.#selectedPage;
    if (!page) {
      throw new Error('No page selected');
    }
    if (page.isClosed()) {
      throw new Error(
        `The selected page has been closed. Call ${listPages.name} to see open pages.`,
      );
    }
    return page;
  }

  getPageByIdx(idx: number): Page {
    const pages = this.#pages;
    const page = pages[idx];
    if (!page) {
      throw new Error('No page found');
    }
    return page;
  }

  #dialogHandler = (dialog: Dialog): void => {
    this.#dialog = dialog;
  };

  isPageSelected(page: Page): boolean {
    return this.#selectedPage === page;
  }

  selectPage(newPage: Page, explicit = false): void {
    const oldPage = this.#selectedPage;
    if (oldPage) {
      oldPage.off('dialog', this.#dialogHandler);
    }
    this.#selectedPage = newPage;
    if (explicit) {
      // Mark page as explicitly selected to prevent auto-switching
      this.#pageExplicitlySelected = true;
    }
    newPage.on('dialog', this.#dialogHandler);
    this.#updateSelectedPageTimeouts();
  }

  #updateSelectedPageTimeouts() {
    const page = this.getSelectedPage();
    // For waiters 5sec timeout should be sufficient.
    // Increased in case we throttle the CPU
    const cpuMultiplier = this.getCpuThrottlingRate();
    page.setDefaultTimeout(DEFAULT_TIMEOUT * cpuMultiplier);
    // 10sec should be enough for the load event to be emitted during
    // navigations.
    // Increased in case we throttle the network requests
    const networkMultiplier = getNetworkMultiplierFromString(
      this.getNetworkConditions(),
    );
    page.setDefaultNavigationTimeout(NAVIGATION_TIMEOUT * networkMultiplier);
  }

  getNavigationTimeout() {
    const page = this.getSelectedPage();
    return page.getDefaultNavigationTimeout();
  }

  getAXNodeByUid(uid: string) {
    return this.#textSnapshot?.idToNode.get(uid);
  }

  async getElementByUid(uid: string): Promise<ElementHandle<Element>> {
    if (!this.#textSnapshot?.idToNode.size) {
      throw new Error(
        `No snapshot found. Use ${takeSnapshot.name} to capture one.`,
      );
    }
    const [snapshotId] = uid.split('_');

    if (this.#textSnapshot.snapshotId !== snapshotId) {
      throw new Error(
        `This uid (${uid}) is from an old snapshot. The page has changed since then. ` +
        'Always call take_snapshot immediately before using UIDs from it. ' +
        'Workflow: 1) take_snapshot, 2) use the UIDs from that response, 3) repeat for each action.',
      );
    }

    const node = this.#textSnapshot?.idToNode.get(uid);
    if (!node) {
      throw new Error('No such element found in the snapshot');
    }
    const handle = await node.elementHandle();
    if (!handle) {
      throw new Error('No such element found in the snapshot');
    }
    return handle;
  }

  /**
   * Creates a snapshot of the pages.
   * If a sessionWindowId is set, only pages from that window are included.
   */
  async createPagesSnapshot(): Promise<Page[]> {
    const allPages = await this.browser.pages(
      this.#options.experimentalIncludeAllPages,
    );

    this.logger(`createPagesSnapshot: found ${allPages.length} total pages`);
    for (const page of allPages) {
      this.logger(`  - ${page.url()}`);
    }

    // First filter: DevTools pages (unless experimental mode is enabled)
    let filteredPages = allPages.filter(page => {
      return (
        this.#options.experimentalDevToolsDebugging ||
        !page.url().startsWith('devtools://')
      );
    });

    // Second filter: Session window scoping
    // If we have a sessionWindowId, only include pages from that window
    if (this.#sessionWindowId !== undefined) {
      const windowFilteredPages: Page[] = [];
      // Check window IDs in parallel for better performance
      const windowIdResults = await Promise.allSettled(
        filteredPages.map(async page => {
          // Try to get windowId with retry for pages that might be in transitional state
          let windowId: number | null = null;
          let lastError: string | null = null;

          for (let attempt = 0; attempt < 3; attempt++) {
            try {
              windowId = await this.getWindowIdForPage(page);
              break; // Success, exit retry loop
            } catch (err) {
              lastError = err instanceof Error ? err.message : String(err);
              if (attempt < 2) {
                // Wait before retry (50ms, then 100ms)
                await new Promise(r => setTimeout(r, 50 * (attempt + 1)));
              }
            }
          }

          if (windowId !== null) {
            return {page, windowId, url: page.url()};
          }

          // All retries failed
          this.logger(`Failed to get windowId for page ${page.url()} after 3 attempts: ${lastError}`);
          return null;
        }),
      );

      for (const result of windowIdResults) {
        if (result.status === 'fulfilled' && result.value) {
          if (result.value.windowId === this.#sessionWindowId) {
            windowFilteredPages.push(result.value.page);
          } else {
            this.logger(
              `Excluding page ${result.value.url} (windowId ${result.value.windowId} != session ${this.#sessionWindowId})`,
            );
          }
        }
      }
      filteredPages = windowFilteredPages;
      this.logger(`Window filter: ${windowFilteredPages.length} pages in session window ${this.#sessionWindowId}`);

      // Always include the explicitly selected page even if window filtering excluded it
      // This handles edge cases where windowId lookup fails after cross-origin navigation
      if (
        this.#pageExplicitlySelected &&
        this.#selectedPage &&
        !this.#selectedPage.isClosed() &&
        !filteredPages.includes(this.#selectedPage)
      ) {
        this.logger(`Re-adding explicitly selected page that was filtered out: ${this.#selectedPage.url()}`);
        filteredPages.unshift(this.#selectedPage);
      }
    }

    this.#pages = filteredPages;

    // Only auto-select pages[0] if:
    // 1. No page has been explicitly selected for this session AND
    // 2. Either there's no selected page OR the selected page is no longer valid
    if (
      !this.#pageExplicitlySelected &&
      (!this.#selectedPage || this.#pages.indexOf(this.#selectedPage) === -1) &&
      this.#pages[0]
    ) {
      this.selectPage(this.#pages[0]);
    }

    await this.detectOpenDevToolsWindows();

    // Set up WebMCP auto-detection for any new pages
    // (safe to call for existing pages - it checks if listeners are already installed)
    for (const page of this.#pages) {
      this.#setupWebMCPAutoDetection(page);
    }

    return this.#pages;
  }

  /**
   * Detect and map open DevTools windows to their inspected pages.
   *
   * Iterates through all browser pages to find DevTools windows and
   * associates them with the pages they're inspecting.
   *
   * @todo Optimize page lookup with a URL-indexed map instead of nested loops.
   */
  async detectOpenDevToolsWindows(): Promise<void> {
    this.logger('Detecting open DevTools windows');
    const pages = await this.browser.pages(
      this.#options.experimentalIncludeAllPages,
    );
    this.#pageToDevToolsPage = new Map<Page, Page>();
    for (const devToolsPage of pages) {
      if (devToolsPage.url().startsWith('devtools://')) {
        try {
          this.logger('Calling getTargetInfo for ' + devToolsPage.url());
          const data = await devToolsPage
            // @ts-expect-error no types for _client().
            ._client()
            .send('Target.getTargetInfo');
          const devtoolsPageTitle = data.targetInfo.title;
          const urlLike = extractUrlLikeFromDevToolsTitle(devtoolsPageTitle);
          if (!urlLike) {
            continue;
          }
          for (const page of this.#pages) {
            if (urlsEqual(page.url(), urlLike)) {
              this.#pageToDevToolsPage.set(page, devToolsPage);
            }
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          this.logger(`DevTools detection failed for ${devToolsPage.url()}: ${message}`);
        }
      }
    }
  }

  getPages(): Page[] {
    return [...this.#pages];
  }

  getDevToolsPage(page: Page): Page | undefined {
    return this.#pageToDevToolsPage.get(page);
  }

  async getDevToolsData(): Promise<DevToolsData> {
    try {
      this.logger('Getting DevTools UI data');
      const selectedPage = this.getSelectedPage();
      const devtoolsPage = this.getDevToolsPage(selectedPage);
      if (!devtoolsPage) {
        this.logger('No DevTools page detected');
        return {};
      }
      const {cdpRequestId, cdpBackendNodeId} = await devtoolsPage.evaluate(
        async () => {
          // @ts-expect-error no types
          const UI = await import('/bundled/ui/legacy/legacy.js');
          // @ts-expect-error no types
          const SDK = await import('/bundled/core/sdk/sdk.js');
          const request = UI.Context.Context.instance().flavor(
            SDK.NetworkRequest.NetworkRequest,
          );
          const node = UI.Context.Context.instance().flavor(
            SDK.DOMModel.DOMNode,
          );
          return {
            cdpRequestId: request?.requestId(),
            cdpBackendNodeId: node?.backendNodeId(),
          };
        },
      );
      return {cdpBackendNodeId, cdpRequestId};
    } catch (err) {
      this.logger('error getting devtools data', err);
    }
    return {};
  }

  /**
   * Creates a text snapshot of a page.
   */
  async createTextSnapshot(
    verbose = false,
    devtoolsData: DevToolsData | undefined = undefined,
  ): Promise<void> {
    const page = this.getSelectedPage();
    const rootNode = await page.accessibility.snapshot({
      includeIframes: true,
      interestingOnly: !verbose,
    });
    if (!rootNode) {
      return;
    }

    const snapshotId = this.#nextSnapshotId++;
    // Iterate through the whole accessibility node tree and assign node ids that
    // will be used for the tree serialization and mapping ids back to nodes.
    let idCounter = 0;
    const idToNode = new Map<string, TextSnapshotNode>();
    const assignIds = (node: SerializedAXNode): TextSnapshotNode => {
      const nodeWithId: TextSnapshotNode = {
        ...node,
        id: `${snapshotId}_${idCounter++}`,
        children: node.children
          ? node.children.map(child => assignIds(child))
          : [],
      };

      // The AXNode for an option doesn't contain its `value`.
      // Therefore, set text content of the option as value.
      if (node.role === 'option') {
        const optionText = node.name;
        if (optionText) {
          nodeWithId.value = optionText.toString();
        }
      }

      idToNode.set(nodeWithId.id, nodeWithId);
      return nodeWithId;
    };

    const rootNodeWithId = assignIds(rootNode);
    this.#textSnapshot = {
      root: rootNodeWithId,
      snapshotId: String(snapshotId),
      idToNode,
      hasSelectedElement: false,
      verbose,
    };
    const data = devtoolsData ?? (await this.getDevToolsData());
    if (data?.cdpBackendNodeId) {
      this.#textSnapshot.hasSelectedElement = true;
      this.#textSnapshot.selectedElementUid = this.resolveCdpElementId(
        data?.cdpBackendNodeId,
      );
    }
  }

  getTextSnapshot(): TextSnapshot | null {
    return this.#textSnapshot;
  }

  async saveTemporaryFile(
    data: Uint8Array<ArrayBufferLike>,
    mimeType: 'image/png' | 'image/jpeg' | 'image/webp',
  ): Promise<{filename: string}> {
    try {
      const dir = await fs.mkdtemp(
        path.join(os.tmpdir(), 'chrome-devtools-mcp-'),
      );

      const filename = path.join(
        dir,
        `screenshot.${getExtensionFromMimeType(mimeType)}`,
      );
      // Use mode 0o600 (owner read/write only) for secure temp file creation
      await fs.writeFile(filename, data, {mode: 0o600});
      return {filename};
    } catch (err) {
      this.logger(err);
      throw new Error('Could not save a screenshot to a file', {cause: err});
    }
  }

  async saveFile(
    data: Uint8Array<ArrayBufferLike>,
    filename: string,
  ): Promise<{filename: string}> {
    try {
      const filePath = path.resolve(filename);
      // Use mode 0o644 (owner read/write, others read) for user-specified paths
      await fs.writeFile(filePath, data, {mode: 0o644});
      return {filename};
    } catch (err) {
      this.logger(err);
      throw new Error('Could not save a screenshot to a file', {cause: err});
    }
  }

  storeTraceRecording(result: TraceResult): void {
    this.#traceResults.push(result);
  }

  recordedTraces(): TraceResult[] {
    return this.#traceResults;
  }

  getWaitForHelper(
    page: Page,
    cpuMultiplier: number,
    networkMultiplier: number,
  ) {
    return new WaitForHelper(page, cpuMultiplier, networkMultiplier);
  }

  waitForEventsAfterAction(action: () => Promise<unknown>): Promise<void> {
    const page = this.getSelectedPage();
    const cpuMultiplier = this.getCpuThrottlingRate();
    const networkMultiplier = getNetworkMultiplierFromString(
      this.getNetworkConditions(),
    );
    const waitForHelper = this.getWaitForHelper(
      page,
      cpuMultiplier,
      networkMultiplier,
    );
    return waitForHelper.waitForEventsAfterAction(action);
  }

  getNetworkRequestStableId(request: HTTPRequest): number {
    return this.#networkCollector.getIdForResource(request);
  }

  waitForTextOnPage(text: string, timeout?: number): Promise<Element> {
    const page = this.getSelectedPage();
    const frames = page.frames();

    let locator = this.#locatorClass.race(
      frames.flatMap(frame => [
        frame.locator(`aria/${text}`),
        frame.locator(`text/${text}`),
      ]),
    );

    if (timeout) {
      locator = locator.setTimeout(timeout);
    }

    return locator.wait();
  }

  /**
   * Get a WebMCP client for a page, auto-connecting if needed.
   *
   * This method handles the full lifecycle of WebMCP connections:
   * - Maintains separate connections per page (one-to-many relationship)
   * - Detects stale connections (page reload, navigation)
   * - Cleans up old connections before creating new ones
   * - Auto-connects when WebMCP is available on the page
   *
   * @param page - Optional page to get client for. Defaults to selected page.
   */
  async getWebMCPClient(page?: Page): Promise<WebMCPClientResult> {
    const targetPage = page ?? this.getSelectedPage();

    // Check if we have a valid, active connection for this page
    // We must verify isClosed() to detect page reloads where URL stays the same but frames are invalidated
    const conn = this.#webMCPConnections.get(targetPage);
    if (conn && !conn.transport.isClosed()) {
      return {connected: true, client: conn.client};
    }

    // If we have a stale connection, clean up first
    if (conn) {
      try {
        await conn.client.close();
      } catch (err) {
        // Close errors during reconnection are expected - log for debugging
        const message = err instanceof Error ? err.message : String(err);
        this.logger(`WebMCP client close during reconnection: ${message}`);
      }
      this.#webMCPConnections.delete(targetPage);
    }

    // Connect - no pre-checking needed (extension approach)
    try {
      const transport = new WebMCPClientTransport({
        page: targetPage,
        readyTimeout: 30000,     // 30s to handle slow React apps (up from 10s)
        requireWebMCP: false,    // Don't pre-check, just try to connect
      });

      const client = new Client(
        {name: 'chrome-devtools-mcp', version: '1.0.0'},
        {capabilities: {}},
      );

      // Set up onclose handler to clean up connection state
      // This handles page navigations, reloads, and manual disconnections
      transport.onclose = () => {
        const currentConn = this.#webMCPConnections.get(targetPage);
        if (currentConn?.client === client) {
          this.#webMCPConnections.delete(targetPage);
        }

        // Remove tools for this page when transport closes
        this.#toolHub?.removeToolsForPage(targetPage);
      };

      // Also listen for page close events to trigger cleanup
      // This handles cases where the page is closed without navigation
      const onPageClose = () => {
        const currentConn = this.#webMCPConnections.get(targetPage);
        if (currentConn?.client === client) {
          this.#webMCPConnections.delete(targetPage);
        }
        this.#toolHub?.removeToolsForPage(targetPage);
        // Clean up the listener
        targetPage.off('close', onPageClose);
      };
      targetPage.on('close', onPageClose);

      await client.connect(transport);

      // Store connection for this page
      this.#webMCPConnections.set(targetPage, {client, transport, page: targetPage});

      // Subscribe to tool list changes if tool hub is enabled and server supports it
      const serverCapabilities = client.getServerCapabilities();
      if (serverCapabilities?.tools?.listChanged && this.#toolHub?.isEnabled()) {
        client.setNotificationHandler(
          ToolListChangedNotificationSchema,
          async () => {
            this.logger('WebMCP tools changed, re-syncing...');
            await this.#toolHub?.syncToolsForPage(targetPage, client);
          },
        );
      }

      // Initial tool sync if tool hub is enabled
      if (this.#toolHub?.isEnabled()) {
        await this.#toolHub.syncToolsForPage(targetPage, client);
      }

      return {connected: true, client};
    } catch (err) {
      return {
        connected: false,
        error: `Failed to connect: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }

  /**
   * We need to ignore favicon request as they make our test flaky
   */
  async setUpNetworkCollectorForTesting() {
    this.#networkCollector = new NetworkCollector(this.browser, collect => {
      return {
        request: req => {
          if (req.url().includes('favicon.ico')) {
            return;
          }
          collect(req);
        },
      } as ListenerMap;
    });
    await this.#networkCollector.init(await this.browser.pages());
  }
}
