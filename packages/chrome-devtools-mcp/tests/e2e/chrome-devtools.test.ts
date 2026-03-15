/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { describe, it, afterEach, beforeEach } from 'node:test';

import { executablePath } from 'puppeteer';

import { serverHooks } from '../server.js';
import { registerRouteAwareWebMCPFixture } from '../webmcp-fixture.js';

const CLI_PATH = path.resolve('build/src/bin/chrome-devtools.js');
const server = serverHooks();

function parseCliJson<T>(stdout: string): T {
  const parsed = JSON.parse(stdout.trim()) as unknown;
  if (
    typeof parsed === 'object' &&
    parsed !== null &&
    'message' in parsed &&
    typeof (parsed as { message: unknown }).message === 'string'
  ) {
    return parseCliJson<T>((parsed as { message: string }).message);
  }
  if (typeof parsed === 'string') {
    return JSON.parse(parsed) as T;
  }
  if (
    Array.isArray(parsed) &&
    parsed.length === 1 &&
    typeof parsed[0] === 'string' &&
    /^[\[{]/.test(parsed[0].trim())
  ) {
    return JSON.parse(parsed[0]) as T;
  }
  return parsed as T;
}

async function runCli(
  args: string[]
): Promise<{ status: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn('node', [CLI_PATH, ...args]);
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
      process.stdout.write(chunk);
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
      process.stderr.write(chunk);
    });
    child.on('close', (status) => resolve({ status, stdout, stderr }));
    child.on('error', reject);
  });
}

describe('chrome-devtools', () => {
  const browserExecutablePath = executablePath();

  async function assertDaemonIsNotRunning() {
    const result = await runCli(['status']);
    assert.strictEqual(result.stdout, 'chrome-devtools-mcp daemon is not running.\n');
  }

  async function assertDaemonIsRunning() {
    const result = await runCli(['status']);
    assert.ok(
      result.stdout.startsWith('chrome-devtools-mcp daemon is running.\n'),
      'chrome-devtools-mcp daemon is not running'
    );
  }

  beforeEach(async () => {
    await runCli(['stop']);
    await assertDaemonIsNotRunning();
  });

  afterEach(async () => {
    await runCli(['stop']);
    await assertDaemonIsNotRunning();
  });

  it('reports daemon status correctly', async () => {
    await assertDaemonIsNotRunning();

    const startResult = await runCli(['start']);
    assert.strictEqual(startResult.status, 0, `start command failed: ${startResult.stderr}`);

    await assertDaemonIsRunning();
  });

  it('can start and stop the daemon', async () => {
    await assertDaemonIsNotRunning();

    const startResult = await runCli(['start']);
    assert.strictEqual(startResult.status, 0, `start command failed: ${startResult.stderr}`);

    await assertDaemonIsRunning();

    const stopResult = await runCli(['stop']);
    assert.strictEqual(stopResult.status, 0, `stop command failed: ${stopResult.stderr}`);

    await assertDaemonIsNotRunning();
  });

  it('can invoke list_pages', async () => {
    await assertDaemonIsNotRunning();

    const startResult = await runCli(['start']);
    assert.strictEqual(startResult.status, 0, `start command failed: ${startResult.stderr}`);

    const listPagesResult = await runCli(['list_pages']);
    assert.strictEqual(
      listPagesResult.status,
      0,
      `list_pages command failed: ${listPagesResult.stderr}`
    );
    assert(listPagesResult.stdout.includes('about:blank'), 'list_pages output is unexpected');

    await assertDaemonIsRunning();
  });

  it('can take screenshot', async () => {
    const startResult = await runCli(['start']);
    assert.strictEqual(startResult.status, 0, `start command failed: ${startResult.stderr}`);

    const result = await runCli(['take_screenshot']);
    assert.strictEqual(result.status, 0, `take_screenshot command failed: ${result.stderr}`);
    assert(result.stdout.includes('.png'), 'take_screenshot output is unexpected');
  });

  it('forwards disclaimers to stderr on start', async () => {
    const result = await runCli(['start']);
    assert.strictEqual(result.status, 0, `start command failed: ${result.stderr}`);
    assert(
      result.stderr.includes('chrome-devtools-mcp exposes content'),
      'Disclaimer not found in stderr on start'
    );
  });

  it('supports WebMCP workflows through the daemon-backed CLI', async () => {
    registerRouteAwareWebMCPFixture(server);

    const startResult = await runCli([
      'start',
      '--headless',
      '--isolated',
      '--executablePath',
      browserExecutablePath,
    ]);
    assert.strictEqual(startResult.status, 0, `start command failed: ${startResult.stderr}`);

    const newPageResult = await runCli(['new_page', server.getRoute('/'), '--output-format=json']);
    assert.strictEqual(newPageResult.status, 0, `new_page command failed: ${newPageResult.stderr}`);

    const rootToolsResult = await runCli([
      'list_webmcp_tools',
      '--summary',
      '--output-format=json',
    ]);
    assert.strictEqual(
      rootToolsResult.status,
      0,
      `list_webmcp_tools command failed: ${rootToolsResult.stderr}`
    );
    const rootPayload = parseCliJson<{
      pageId: number;
      api: string;
      count: number;
      tools: Array<{ name: string; description: string; pageId: number }>;
    }>(rootToolsResult.stdout);
    assert.strictEqual(rootPayload.api, 'modelContext');
    assert.strictEqual(rootPayload.count, 3);
    assert.strictEqual(typeof rootPayload.pageId, 'number');
    assert.deepStrictEqual(
      rootPayload.tools.map((tool) => ({
        name: tool.name,
        description: tool.description,
        pageId: tool.pageId,
      })),
      [
        {
          name: 'navigate',
          description: 'Navigate to a route in the test app.',
          pageId: rootPayload.pageId,
        },
        {
          name: 'get_current_context',
          description: 'Return the current route path.',
          pageId: rootPayload.pageId,
        },
        {
          name: 'list_all_routes',
          description: 'List routes in the test app.',
          pageId: rootPayload.pageId,
        },
      ]
    );

    const currentContextResult = await runCli(['call_webmcp_tool', 'get_current_context']);
    assert.strictEqual(
      currentContextResult.status,
      0,
      `call_webmcp_tool command failed: ${currentContextResult.stderr}`
    );
    assert.strictEqual(currentContextResult.stdout.trim(), '/');

    const navigateResult = await runCli([
      'call_webmcp_tool',
      'navigate',
      '--arguments',
      '{"to":"/entities"}',
    ]);
    assert.strictEqual(
      navigateResult.status,
      0,
      `navigate command failed: ${navigateResult.stderr}`
    );
    assert.strictEqual(navigateResult.stdout.trim(), 'Navigated to /entities');

    const entityToolsResult = await runCli([
      'list_webmcp_tools',
      '--summary',
      '--output-format=json',
    ]);
    assert.strictEqual(
      entityToolsResult.status,
      0,
      `list_webmcp_tools on /entities failed: ${entityToolsResult.stderr}`
    );
    const entityPayload = parseCliJson<{
      pageId: number;
      api: string;
      count: number;
      tools: Array<{ name: string; description: string; pageId: number }>;
    }>(entityToolsResult.stdout);
    assert.strictEqual(entityPayload.api, 'modelContext');
    assert.strictEqual(entityPayload.pageId, rootPayload.pageId);
    assert.strictEqual(entityPayload.count, 3);
    assert.deepStrictEqual(
      entityPayload.tools.map((tool) => ({
        name: tool.name,
        description: tool.description,
        pageId: tool.pageId,
      })),
      [
        {
          name: 'navigate',
          description: 'Navigate to a route in the test app.',
          pageId: rootPayload.pageId,
        },
        {
          name: 'get_current_context',
          description: 'Return the current route path.',
          pageId: rootPayload.pageId,
        },
        {
          name: 'list_entities',
          description: 'List entities visible on the entities route.',
          pageId: rootPayload.pageId,
        },
      ]
    );

    const listEntitiesResult = await runCli(['call_webmcp_tool', 'list_entities']);
    assert.strictEqual(
      listEntitiesResult.status,
      0,
      `list_entities command failed: ${listEntitiesResult.stderr}`
    );
    assert.strictEqual(listEntitiesResult.stdout.trim(), '3 entities: Ada, Linus, Grace');
  });
});
