/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {logger} from './logger.js';
import type {
  Browser,
  ChromeReleaseChannel,
  LaunchOptions,
  Target,
} from './third_party/index.js';
import {puppeteer} from './third_party/index.js';

/** Cached browser instance for reuse across calls. */
let browser: Browser | undefined;

/**
 * Get Chrome's default user data directory for the given platform and channel.
 *
 * @returns The platform-specific path to Chrome's user data directory.
 */
function getChromeDefaultUserDataDir(channel: Channel = 'stable'): string {
  const platform = os.platform();
  if (platform === 'darwin') {
    const suffix =
      channel === 'stable'
        ? ''
        : ` ${channel.charAt(0).toUpperCase() + channel.slice(1)}`;
    return path.join(
      os.homedir(),
      'Library',
      'Application Support',
      'Google',
      `Chrome${suffix}`,
    );
  }
  if (platform === 'win32') {
    const appData = process.env.LOCALAPPDATA ?? path.join(os.homedir(), 'AppData', 'Local');
    const suffix =
      channel === 'stable'
        ? ''
        : ` ${channel.charAt(0).toUpperCase() + channel.slice(1)}`;
    return path.join(appData, 'Google', `Chrome${suffix}`, 'User Data');
  }
  // Linux
  const channelSuffix =
    channel === 'stable'
      ? ''
      : channel === 'beta'
        ? '-beta'
        : '-unstable';
  return path.join(os.homedir(), '.config', `google-chrome${channelSuffix}`);
}

/**
 * Try to read a WebSocket endpoint from a DevToolsActivePort file.
 *
 * @param userDataDir - Directory containing the DevToolsActivePort file.
 * @returns The WebSocket endpoint URL, or undefined if the file doesn't exist or is invalid.
 */
function readDevToolsActivePort(
  userDataDir: string,
): string | undefined {
  const portPath = path.join(userDataDir, 'DevToolsActivePort');
  try {
    const fileContent = fs.readFileSync(portPath, 'utf8');
    const [rawPort, rawPath] = fileContent
      .split('\n')
      .map(line => line.trim())
      .filter(line => !!line);
    if (!rawPort || !rawPath) {
      return undefined;
    }
    const port = parseInt(rawPort, 10);
    if (isNaN(port) || port <= 0 || port > 65535) {
      return undefined;
    }
    return `ws://127.0.0.1:${port}${rawPath}`;
  } catch {
    return undefined;
  }
}

/**
 * Create a target filter for Puppeteer that excludes internal Chrome pages.
 *
 * Includes new tab and inspect pages (may be the only user-accessible page),
 * but excludes chrome://, chrome-extension://, and chrome-untrusted:// pages.
 *
 * @returns A filter function for Puppeteer's targetFilter option.
 */
function makeTargetFilter(includeExtensionPages = false): (target: Target) => boolean {
  const ignoredPrefixes = new Set([
    'chrome://',
    ...(includeExtensionPages ? [] : ['chrome-extension://']),
    'chrome-untrusted://',
  ]);

  return function targetFilter(target: Target): boolean {
    if (target.url() === 'chrome://newtab/') {
      return true;
    }
    if (target.url().startsWith('chrome://inspect')) {
      return true;
    }
    for (const prefix of ignoredPrefixes) {
      if (target.url().startsWith(prefix)) {
        return false;
      }
    }
    return true;
  };
}

/**
 * Connect to an existing Chrome browser instance.
 *
 * Connection priority:
 * 1. wsEndpoint - Direct WebSocket connection with optional headers
 * 2. browserURL - HTTP URL to Chrome's DevTools endpoint
 * 3. userDataDir - Read DevToolsActivePort from profile directory
 * 4. channel - Derive profile directory from channel name
 *
 * @param options - Connection options.
 * @returns Connected browser instance.
 * @throws Error if connection fails or no connection method specified.
 */
export async function ensureBrowserConnected(options: {
  browserURL?: string;
  wsEndpoint?: string;
  wsHeaders?: Record<string, string>;
  devtools: boolean;
  channel?: Channel;
  userDataDir?: string;
  includeExtensionPages?: boolean;
}): Promise<Browser> {
  const {channel, includeExtensionPages} = options;
  if (browser?.connected) {
    return browser;
  }

  const connectOptions: Parameters<typeof puppeteer.connect>[0] = {
    targetFilter: makeTargetFilter(includeExtensionPages),
    defaultViewport: null,
    handleDevToolsAsPage: true,
    ...(includeExtensionPages && {
      isPageTargetCallback: (target: Target) =>
        target.type() === 'page' ||
        target.url().startsWith('chrome-extension://'),
    }),
  };

  if (options.wsEndpoint) {
    connectOptions.browserWSEndpoint = options.wsEndpoint;
    if (options.wsHeaders) {
      connectOptions.headers = options.wsHeaders;
    }
  } else if (options.browserURL) {
    connectOptions.browserURL = options.browserURL;
  } else if (channel || options.userDataDir) {
    const userDataDir = options.userDataDir;
    if (userDataDir) {
      // Explicit user data dir provided
      const wsEndpoint = readDevToolsActivePort(userDataDir);
      if (wsEndpoint) {
        connectOptions.browserWSEndpoint = wsEndpoint;
      } else {
        throw new Error(
          `Could not connect to Chrome in ${userDataDir}. Check if Chrome is running and remote debugging is enabled.`,
        );
      }
    } else {
      if (!channel) {
        throw new Error('Channel must be provided if userDataDir is missing');
      }
      // Collect candidate WebSocket endpoints from multiple directories.
      // Try each one in order — stale DevToolsActivePort files are common,
      // so we attempt the actual connection before moving to the next.
      const profileDirName =
        channel && channel !== 'stable'
          ? `chrome-profile-${channel}`
          : 'chrome-profile';
      const mcpUserDataDir = path.join(
        os.homedir(),
        '.cache',
        'chrome-devtools-mcp',
        profileDirName,
      );
      const chromeUserDataDir = getChromeDefaultUserDataDir(channel);

      // Chrome's default profile is checked first — this is the user's
      // real browser with remote debugging enabled via chrome://inspect.
      // The MCP cache dir is checked second as a fallback for instances
      // launched by the MCP server itself.
      const candidates: Array<{dir: string; wsEndpoint: string}> = [];
      const chromeWsEndpoint = readDevToolsActivePort(chromeUserDataDir);
      if (chromeWsEndpoint) {
        candidates.push({dir: chromeUserDataDir, wsEndpoint: chromeWsEndpoint});
      }
      const mcpWsEndpoint = readDevToolsActivePort(mcpUserDataDir);
      if (mcpWsEndpoint) {
        candidates.push({dir: mcpUserDataDir, wsEndpoint: mcpWsEndpoint});
      }

      if (candidates.length === 0) {
        throw new Error(
          `Could not connect to Chrome ${channel} channel. Checked ${mcpUserDataDir} and ${chromeUserDataDir}. Ensure Chrome is running with remote debugging enabled (chrome://inspect/#remote-debugging).`,
        );
      }

      // Try each candidate endpoint, returning the first that connects
      for (const candidate of candidates) {
        try {
          logger(
            `Trying DevToolsActivePort from ${candidate.dir}: ${candidate.wsEndpoint}`,
          );
          browser = await puppeteer.connect({
            ...connectOptions,
            browserWSEndpoint: candidate.wsEndpoint,
          });
          logger(`Connected via ${candidate.dir}`);
          return browser;
        } catch (err) {
          logger(
            `Failed to connect via ${candidate.dir}: ${(err as Error).message}`,
          );
        }
      }

      throw new Error(
        `Could not connect to Chrome ${channel} channel. Tried ${candidates.map(c => c.dir).join(' and ')}. Ensure Chrome is running with remote debugging enabled (chrome://inspect/#remote-debugging).`,
      );
    }
  } else {
    throw new Error(
      'Either browserURL, wsEndpoint, channel or userDataDir must be provided',
    );
  }

  logger('Connecting Puppeteer to ', JSON.stringify(connectOptions));
  try {
    browser = await puppeteer.connect(connectOptions);
  } catch (err) {
    throw new Error(
      'Could not connect to Chrome. Check if Chrome is running and remote debugging is enabled by going to chrome://inspect/#remote-debugging.',
      {
        cause: err,
      },
    );
  }
  logger('Connected Puppeteer');
  return browser;
}

/**
 * Options for launching a new Chrome browser instance.
 */
interface McpLaunchOptions {
  /** Whether to accept insecure SSL certificates. */
  acceptInsecureCerts?: boolean;
  /** Path to Chrome executable (overrides channel). */
  executablePath?: string;
  /** Chrome release channel to use. */
  channel?: Channel;
  /** Custom user data directory for Chrome profile. */
  userDataDir?: string;
  /** Whether to run Chrome in headless mode. */
  headless: boolean;
  /** Whether to use an isolated temporary profile. */
  isolated: boolean;
  /** Stream to pipe Chrome's stdout/stderr logs to. */
  logFile?: fs.WriteStream;
  /** Initial viewport dimensions. */
  viewport?: {
    width: number;
    height: number;
  };
  /** Additional Chrome command-line arguments. */
  args?: string[];
  /** Whether to auto-open DevTools for each tab. */
  devtools: boolean;
  /** Whether to include chrome-extension:// pages in target filtering. */
  includeExtensionPages?: boolean;
}

/**
 * Launch a new Chrome browser instance.
 *
 * @param options - Launch configuration options.
 * @returns Launched browser instance.
 * @throws Error if Chrome is already running with the same profile.
 */
export async function launch(options: McpLaunchOptions): Promise<Browser> {
  const {channel, executablePath, headless, isolated} = options;
  const profileDirName =
    channel && channel !== 'stable'
      ? `chrome-profile-${channel}`
      : 'chrome-profile';

  let userDataDir = options.userDataDir;
  if (!isolated && !userDataDir) {
    userDataDir = path.join(
      os.homedir(),
      '.cache',
      'chrome-devtools-mcp',
      profileDirName,
    );
    await fs.promises.mkdir(userDataDir, {
      recursive: true,
    });
  }

  const extraArgs = options.args ?? [];
  const hasRemoteDebuggingPipe = extraArgs.includes('--remote-debugging-pipe');
  const hasRemoteDebuggingPort = extraArgs.some(arg =>
    arg.startsWith('--remote-debugging-port'),
  );
  const hasRemoteDebuggingAddress = extraArgs.some(arg =>
    arg.startsWith('--remote-debugging-address'),
  );

  const args: LaunchOptions['args'] = [
    ...extraArgs,
    '--hide-crash-restore-bubble',
  ];

  const enableRemoteDebuggingPort =
    !isolated && !hasRemoteDebuggingPipe && !hasRemoteDebuggingPort;
  if (enableRemoteDebuggingPort) {
    args.push('--remote-debugging-port=0');
    if (!hasRemoteDebuggingAddress) {
      args.push('--remote-debugging-address=127.0.0.1');
    }
  }
  if (headless) {
    args.push('--screen-info={3840x2160}');
  }
  let puppeteerChannel: ChromeReleaseChannel | undefined;
  if (options.devtools) {
    args.push('--auto-open-devtools-for-tabs');
  }
  if (!executablePath) {
    puppeteerChannel =
      channel && channel !== 'stable'
        ? (`chrome-${channel}` as ChromeReleaseChannel)
        : 'chrome';
  }
  const usePipe =
    hasRemoteDebuggingPipe ||
    (!hasRemoteDebuggingPort && !enableRemoteDebuggingPort);

  try {
    const browser = await puppeteer.launch({
      channel: puppeteerChannel,
      targetFilter: makeTargetFilter(options.includeExtensionPages),
      executablePath,
      defaultViewport: null,
      userDataDir,
      pipe: usePipe,
      headless,
      args,
      acceptInsecureCerts: options.acceptInsecureCerts,
      handleDevToolsAsPage: true,
      ...(options.includeExtensionPages && {
        enableExtensions: true,
        isPageTargetCallback: (target: {type: string; url?: string}) =>
          target.type === 'page' ||
          target.url?.startsWith('chrome-extension://') === true,
      }),
    });
    if (options.logFile) {
      // FIXME: we are probably subscribing too late to catch startup logs. We
      // should expose the process earlier or expose the getRecentLogs() getter.
      browser.process()?.stderr?.pipe(options.logFile);
      browser.process()?.stdout?.pipe(options.logFile);
    }
    if (options.viewport) {
      const [page] = await browser.pages();
      await page?.resize({
        contentWidth: options.viewport.width,
        contentHeight: options.viewport.height,
      });
    }
    return browser;
  } catch (error) {
    if (
      userDataDir &&
      (error as Error).message.includes('The browser is already running')
    ) {
      throw new Error(
        `The browser is already running for ${userDataDir}. Use --isolated to run multiple browser instances.`,
        {
          cause: error,
        },
      );
    }
    throw error;
  }
}

/**
 * Ensure a browser is launched, reusing existing instance if connected.
 *
 * @param options - Launch configuration options.
 * @returns Connected or newly launched browser instance.
 */
export async function ensureBrowserLaunched(
  options: McpLaunchOptions,
): Promise<Browser> {
  if (browser?.connected) {
    return browser;
  }
  browser = await launch(options);
  return browser;
}

/**
 * Disconnect from the current browser without killing the process.
 * Clears the cached browser reference so future calls can connect to a new instance.
 */
export function disconnectBrowser(): void {
  if (browser) {
    try {
      browser.disconnect();
    } catch {
      // Ignore disconnect errors — browser may already be gone
    }
    browser = undefined;
  }
}

/**
 * Connect to a new browser instance, replacing the cached reference.
 *
 * @param options - Connection options (browserURL or wsEndpoint).
 * @returns Connected browser instance.
 */
export async function connectToNewBrowser(options: {
  browserURL?: string;
  wsEndpoint?: string;
  wsHeaders?: Record<string, string>;
  includeExtensionPages?: boolean;
}): Promise<Browser> {
  const connectOptions: Parameters<typeof puppeteer.connect>[0] = {
    targetFilter: makeTargetFilter(options.includeExtensionPages),
    defaultViewport: null,
    handleDevToolsAsPage: true,
    ...(options.includeExtensionPages && {
      isPageTargetCallback: (target: Target) =>
        target.type() === 'page' ||
        target.url().startsWith('chrome-extension://'),
    }),
  };

  if (options.wsEndpoint) {
    connectOptions.browserWSEndpoint = options.wsEndpoint;
    if (options.wsHeaders) {
      connectOptions.headers = options.wsHeaders;
    }
  } else if (options.browserURL) {
    connectOptions.browserURL = options.browserURL;
  } else {
    throw new Error('Either browserURL or wsEndpoint must be provided');
  }

  logger('Connecting Puppeteer to new browser:', JSON.stringify(connectOptions));
  browser = await puppeteer.connect(connectOptions);
  logger('Connected to new browser');
  return browser;
}

/**
 * Chrome release channel.
 * - stable: Standard Chrome release
 * - beta: Pre-release testing channel
 * - dev: Development channel with latest features
 * - canary: Nightly builds, may be unstable
 */
export type Channel = 'stable' | 'canary' | 'beta' | 'dev';
