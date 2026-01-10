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
 * Create a target filter for Puppeteer that excludes internal Chrome pages.
 *
 * Includes new tab and inspect pages (may be the only user-accessible page),
 * but excludes chrome://, chrome-extension://, and chrome-untrusted:// pages.
 *
 * @returns A filter function for Puppeteer's targetFilter option.
 */
function makeTargetFilter(): (target: Target) => boolean {
  const ignoredPrefixes = new Set([
    'chrome://',
    'chrome-extension://',
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
}): Promise<Browser> {
  const {channel} = options;
  if (browser?.connected) {
    return browser;
  }

  const connectOptions: Parameters<typeof puppeteer.connect>[0] = {
    targetFilter: makeTargetFilter(),
    defaultViewport: null,
    handleDevToolsAsPage: true,
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
      // TODO: re-expose this logic via Puppeteer.
      const portPath = path.join(userDataDir, 'DevToolsActivePort');
      try {
        const fileContent = await fs.promises.readFile(portPath, 'utf8');
        const [rawPort, rawPath] = fileContent
          .split('\n')
          .map(line => {
            return line.trim();
          })
          .filter(line => {
            return !!line;
          });
        if (!rawPort || !rawPath) {
          throw new Error(`Invalid DevToolsActivePort '${fileContent}' found`);
        }
        const port = parseInt(rawPort, 10);
        if (isNaN(port) || port <= 0 || port > 65535) {
          throw new Error(`Invalid port '${rawPort}' found`);
        }
        const browserWSEndpoint = `ws://127.0.0.1:${port}${rawPath}`;
        connectOptions.browserWSEndpoint = browserWSEndpoint;
      } catch (error) {
        throw new Error(
          `Could not connect to Chrome in ${userDataDir}. Check if Chrome is running and remote debugging is enabled.`,
          {
            cause: error,
          },
        );
      }
    } else {
      if (!channel) {
        throw new Error('Channel must be provided if userDataDir is missing');
      }
      // Derive the default userDataDir from the channel (same as launch does)
      const profileDirName =
        channel && channel !== 'stable'
          ? `chrome-profile-${channel}`
          : 'chrome-profile';
      const derivedUserDataDir = path.join(
        os.homedir(),
        '.cache',
        'chrome-devtools-mcp',
        profileDirName,
      );
      // Try to read DevToolsActivePort from the derived userDataDir
      const portPath = path.join(derivedUserDataDir, 'DevToolsActivePort');
      try {
        const fileContent = await fs.promises.readFile(portPath, 'utf8');
        const [rawPort, rawPath] = fileContent
          .split('\n')
          .map(line => line.trim())
          .filter(line => !!line);
        if (!rawPort || !rawPath) {
          throw new Error(`Invalid DevToolsActivePort '${fileContent}' found`);
        }
        const port = parseInt(rawPort, 10);
        if (isNaN(port) || port <= 0 || port > 65535) {
          throw new Error(`Invalid port '${rawPort}' found`);
        }
        const browserWSEndpoint = `ws://127.0.0.1:${port}${rawPath}`;
        connectOptions.browserWSEndpoint = browserWSEndpoint;
      } catch (error) {
        throw new Error(
          `Could not connect to Chrome ${channel} channel in ${derivedUserDataDir}. Check if Chrome is running and was launched with remote debugging enabled.`,
          {cause: error},
        );
      }
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
      targetFilter: makeTargetFilter(),
      executablePath,
      defaultViewport: null,
      userDataDir,
      pipe: usePipe,
      headless,
      args,
      acceptInsecureCerts: options.acceptInsecureCerts,
      handleDevToolsAsPage: true,
    });
    if (options.logFile) {
      // FIXME: we are probably subscribing too late to catch startup logs. We
      // should expose the process earlier or expose the getRecentLogs() getter.
      browser.process()?.stderr?.pipe(options.logFile);
      browser.process()?.stdout?.pipe(options.logFile);
    }
    if (options.viewport) {
      const [page] = await browser.pages();
      // @ts-expect-error internal API for now.
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
 * Chrome release channel.
 * - stable: Standard Chrome release
 * - beta: Pre-release testing channel
 * - dev: Development channel with latest features
 * - canary: Nightly builds, may be unstable
 */
export type Channel = 'stable' | 'canary' | 'beta' | 'dev';
