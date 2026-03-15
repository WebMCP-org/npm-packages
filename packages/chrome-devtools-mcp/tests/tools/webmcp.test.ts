/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import { describe, it } from 'node:test';

import type { ParsedArguments } from '../../src/bin/chrome-devtools-mcp-cli-options.js';
import { McpResponse } from '../../src/McpResponse.js';
import { callWebMCPTool, listWebMCPTools } from '../../src/tools/webmcp.js';
import { getTextContent, html, withMcpContext } from '../utils.js';

function buildCorePage(): string {
  return html`
    <script>
      navigator.modelContext = {
        async listTools() {
          return [
            {
              name: 'core_sum',
              description: 'Add two numbers',
              inputSchema: {
                type: 'object',
                properties: {
                  a: { type: 'number' },
                  b: { type: 'number' },
                },
                required: ['a', 'b'],
              },
            },
          ];
        },
        async callTool(request) {
          if (request.name === 'core_sum') {
            const args = request.arguments || {};
            return {
              content: [{ type: 'text', text: String((args.a || 0) + (args.b || 0)) }],
            };
          }

          if (request.name === 'core_blocks') {
            return {
              isError: true,
              content: [
                { type: 'text', text: 'primary' },
                { type: 'image', mimeType: 'image/png', data: 'aGVsbG8=' },
                {
                  type: 'resource',
                  resource: {
                    uri: 'file:///tmp/webmcp.txt',
                    text: 'resource-body',
                    mimeType: 'text/plain',
                  },
                },
              ],
            };
          }

          if (request.name === 'core_throw') {
            throw new Error('core failure');
          }

          throw new Error('Unknown tool: ' + request.name);
        },
      };
    </script>
  `;
}

function buildTestingPage(
  options: {
    invalidSchema?: boolean;
    invalidJson?: boolean;
    nullResult?: boolean;
    plainTextResult?: boolean;
  } = {}
): string {
  return html`
    <script>
      navigator.modelContextTesting = {
        async listTools() {
          return [
            {
              name: 'testing_echo',
              description: 'Echo a message',
              inputSchema: ${
                options.invalidSchema
                  ? JSON.stringify('{"badJson"')
                  : JSON.stringify(
                      JSON.stringify({
                        type: 'object',
                        properties: {
                          message: { type: 'string' },
                        },
                        required: ['message'],
                      })
                    )
              },
            },
          ];
        },
        async executeTool(name, serializedArgs) {
          if (${JSON.stringify(options.nullResult ?? false)}) {
            return null;
          }

          if (${JSON.stringify(options.invalidJson ?? false)}) {
            return '{"broken"';
          }

          if (${JSON.stringify(options.plainTextResult ?? false)}) {
            return 'plain:' + name;
          }

          const args = JSON.parse(serializedArgs);
          if (name === 'testing_echo') {
            return JSON.stringify({
              content: [{ type: 'text', text: 'echo:' + (args.message || '') }],
            });
          }

          return JSON.stringify({
            isError: true,
            content: [{ type: 'text', text: 'missing:' + name }],
          });
        },
      };
    </script>
  `;
}

function buildNoApiPage(): string {
  return html`
    <p>No WebMCP APIs here.</p>
  `;
}

function stripUndefined<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => stripUndefined(item)) as T;
  }
  if (value && typeof value === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value)) {
      if (entry !== undefined) {
        result[key] = stripUndefined(entry);
      }
    }
    return result as T;
  }
  return value;
}

async function parseListResponse(
  response: McpResponse,
  context: Parameters<Parameters<typeof withMcpContext>[0]>[1]
) {
  const result = await response.handle(listWebMCPTools.name, context);
  return JSON.parse(getTextContent(result.content[0])) as {
    pageId?: number;
    selectedPageId?: number;
    pagesScanned?: number;
    api?: string;
    count?: number;
    tools: Array<{
      name: string;
      description: string;
      inputSchema?: Record<string, unknown>;
      pageId: number;
    }>;
    message?: string;
    unavailablePageIds?: number[];
  };
}

describe('webmcp tools', () => {
  describe('list_webmcp_tools', () => {
    it('returns tools from navigator.modelContext.listTools()', async () => {
      await withMcpContext(async (response, context) => {
        const page = context.getSelectedMcpPage();
        await page.pptrPage.setContent(buildCorePage());

        await listWebMCPTools.handler({ params: {} }, response, context);

        const payload = await parseListResponse(response, context);
        assert.strictEqual(payload.api, 'modelContext');
        assert.strictEqual(payload.pageId, page.id);
        assert.deepStrictEqual(payload.tools, [
          {
            name: 'core_sum',
            description: 'Add two numbers',
            inputSchema: {
              type: 'object',
              properties: {
                a: { type: 'number' },
                b: { type: 'number' },
              },
              required: ['a', 'b'],
            },
            pageId: page.id,
          },
        ]);
      });
    });

    it('falls back to navigator.modelContextTesting.listTools()', async () => {
      await withMcpContext(async (response, context) => {
        await context.getSelectedMcpPage().pptrPage.setContent(buildTestingPage());

        await listWebMCPTools.handler({ params: {} }, response, context);

        const payload = await parseListResponse(response, context);
        assert.strictEqual(payload.api, 'modelContextTesting');
        assert.strictEqual(payload.tools[0]?.name, 'testing_echo');
        assert.deepStrictEqual(payload.tools[0]?.inputSchema, {
          type: 'object',
          properties: {
            message: { type: 'string' },
          },
          required: ['message'],
        });
      });
    });

    it('returns a clear empty result when neither API exists', async () => {
      await withMcpContext(async (response, context) => {
        const page = context.getSelectedMcpPage();
        await page.pptrPage.setContent(buildNoApiPage());

        await listWebMCPTools.handler({ params: {} }, response, context);

        const payload = await parseListResponse(response, context);
        assert.strictEqual(payload.pageId, page.id);
        assert.deepStrictEqual(payload.tools, []);
        assert.match(
          payload.message ?? '',
          /does not expose navigator\.modelContext\.listTools\(\) or navigator\.modelContextTesting\.listTools\(\)/
        );
      });
    });

    it('normalizes malformed testing schemas to an empty object schema', async () => {
      await withMcpContext(async (response, context) => {
        await context
          .getSelectedMcpPage()
          .pptrPage.setContent(buildTestingPage({ invalidSchema: true }));

        await listWebMCPTools.handler({ params: {} }, response, context);

        const payload = await parseListResponse(response, context);
        assert.deepStrictEqual(payload.tools[0]?.inputSchema, {
          type: 'object',
          properties: {},
        });
      });
    });

    it('supports summary mode and omits schemas for compact discovery', async () => {
      await withMcpContext(async (response, context) => {
        const page = context.getSelectedMcpPage();
        await page.pptrPage.setContent(buildCorePage());

        await listWebMCPTools.handler({ params: { summary: true } }, response, context);

        const payload = await parseListResponse(response, context);
        assert.strictEqual(payload.pageId, page.id);
        assert.strictEqual(payload.count, 1);
        assert.deepStrictEqual(payload.tools, [
          {
            name: 'core_sum',
            description: 'Add two numbers',
            pageId: page.id,
          },
        ]);
      });
    });

    it('filters tool names with glob patterns', async () => {
      await withMcpContext(async (response, context) => {
        const page = context.getSelectedMcpPage();
        await page.pptrPage.setContent(buildCorePage());

        await listWebMCPTools.handler({ params: { pattern: 'core_*' } }, response, context);

        const payload = await parseListResponse(response, context);
        assert.strictEqual(payload.pageId, page.id);
        assert.strictEqual(payload.count, 1);
        assert.strictEqual(payload.tools[0]?.name, 'core_sum');
      });
    });

    it('searches across all pages when requested', async () => {
      await withMcpContext(async (response, context) => {
        const selectedPage = context.getSelectedMcpPage();
        await selectedPage.pptrPage.setContent(buildCorePage());

        const otherPage = await context.newPage();
        await otherPage.pptrPage.setContent(buildTestingPage());
        context.selectPage(selectedPage);

        await listWebMCPTools.handler(
          { params: { allPages: true, summary: true } },
          response,
          context
        );

        const payload = await parseListResponse(response, context);
        assert.strictEqual(payload.selectedPageId, selectedPage.id);
        assert.strictEqual(payload.pagesScanned, 2);
        assert.strictEqual(payload.count, 2);
        assert.deepStrictEqual(
          payload.tools.map((tool) => ({
            name: tool.name,
            pageId: tool.pageId,
          })),
          [
            { name: 'core_sum', pageId: selectedPage.id },
            { name: 'testing_echo', pageId: otherPage.id },
          ]
        );
      });
    });
  });

  describe('call_webmcp_tool', () => {
    it('uses navigator.modelContext.callTool(...) when available', async () => {
      await withMcpContext(async (_response, context) => {
        await context.getSelectedMcpPage().pptrPage.setContent(buildCorePage());

        const response = new McpResponse({} as ParsedArguments);
        await callWebMCPTool.handler(
          {
            params: {
              name: 'core_sum',
              arguments: { a: 2, b: 5 },
            },
          },
          response,
          context
        );

        const result = await response.handle(callWebMCPTool.name, context);
        assert.deepStrictEqual(stripUndefined(result.content), [{ type: 'text', text: '7' }]);
      });
    });

    it('passes through normalized MCP content blocks and error state once', async () => {
      await withMcpContext(async (_response, context) => {
        await context.getSelectedMcpPage().pptrPage.setContent(buildCorePage());

        const response = new McpResponse({} as ParsedArguments);
        await callWebMCPTool.handler(
          {
            params: {
              name: 'core_blocks',
            },
          },
          response,
          context
        );

        const result = await response.handle(callWebMCPTool.name, context);
        assert.strictEqual(response.isError, true);
        assert.deepStrictEqual(stripUndefined(result.content), [
          { type: 'text', text: 'primary' },
          { type: 'image', mimeType: 'image/png', data: 'aGVsbG8=' },
          {
            type: 'resource',
            resource: {
              uri: 'file:///tmp/webmcp.txt',
              text: 'resource-body',
              mimeType: 'text/plain',
            },
          },
        ]);
      });
    });

    it('falls back to navigator.modelContextTesting.executeTool(...)', async () => {
      await withMcpContext(async (_response, context) => {
        await context.getSelectedMcpPage().pptrPage.setContent(buildTestingPage());

        const response = new McpResponse({} as ParsedArguments);
        await callWebMCPTool.handler(
          {
            params: {
              name: 'testing_echo',
              arguments: { message: 'hi' },
            },
          },
          response,
          context
        );

        const result = await response.handle(callWebMCPTool.name, context);
        assert.deepStrictEqual(stripUndefined(result.content), [{ type: 'text', text: 'echo:hi' }]);
      });
    });

    it('accepts plain text results from the native testing fallback', async () => {
      await withMcpContext(async (_response, context) => {
        await context
          .getSelectedMcpPage()
          .pptrPage.setContent(buildTestingPage({ plainTextResult: true }));

        const response = new McpResponse({} as ParsedArguments);
        await callWebMCPTool.handler(
          {
            params: {
              name: 'testing_echo',
            },
          },
          response,
          context
        );

        const result = await response.handle(callWebMCPTool.name, context);
        assert.deepStrictEqual(stripUndefined(result.content), [
          { type: 'text', text: 'plain:testing_echo' },
        ]);
      });
    });

    it('reports invalid JSON from the testing fallback cleanly', async () => {
      await withMcpContext(async (_response, context) => {
        await context
          .getSelectedMcpPage()
          .pptrPage.setContent(buildTestingPage({ invalidJson: true }));

        await assert.rejects(
          callWebMCPTool.handler(
            {
              params: {
                name: 'testing_echo',
                arguments: { message: 'hi' },
              },
            },
            new McpResponse({} as ParsedArguments),
            context
          ),
          /Testing tool returned invalid JSON/
        );
      });
    });

    it('treats null testing responses as interrupted execution', async () => {
      await withMcpContext(async (_response, context) => {
        await context
          .getSelectedMcpPage()
          .pptrPage.setContent(buildTestingPage({ nullResult: true }));

        await assert.rejects(
          callWebMCPTool.handler(
            {
              params: {
                name: 'testing_echo',
                arguments: { message: 'hi' },
              },
            },
            new McpResponse({} as ParsedArguments),
            context
          ),
          /interrupted by navigation|page became unavailable/i
        );
      });
    });

    it('surfaces call errors without transport state', async () => {
      await withMcpContext(async (_response, context) => {
        await context.getSelectedMcpPage().pptrPage.setContent(buildCorePage());

        await assert.rejects(
          callWebMCPTool.handler(
            {
              params: {
                name: 'core_throw',
              },
            },
            new McpResponse({} as ParsedArguments),
            context
          ),
          /core failure/
        );
      });
    });
  });

  describe('page targeting', () => {
    it('targets the selected page by default and honors pageId overrides', async () => {
      await withMcpContext(async (_response, context) => {
        const selectedPage = context.getSelectedMcpPage();
        await selectedPage.pptrPage.setContent(buildCorePage());

        const otherPage = await context.newPage();
        await otherPage.pptrPage.setContent(buildTestingPage());
        context.selectPage(selectedPage);

        const defaultResponse = new McpResponse({} as ParsedArguments);
        await listWebMCPTools.handler({ params: {} }, defaultResponse, context);
        const defaultPayload = await parseListResponse(defaultResponse, context);
        assert.strictEqual(defaultPayload.pageId, selectedPage.id);
        assert.strictEqual(defaultPayload.tools[0]?.name, 'core_sum');

        const targetedResponse = new McpResponse({} as ParsedArguments);
        await listWebMCPTools.handler(
          { params: { pageId: otherPage.id } },
          targetedResponse,
          context
        );
        const targetedPayload = await parseListResponse(targetedResponse, context);
        assert.strictEqual(targetedPayload.pageId, otherPage.id);
        assert.strictEqual(targetedPayload.tools[0]?.name, 'testing_echo');

        const callResponse = new McpResponse({} as ParsedArguments);
        await callWebMCPTool.handler(
          {
            params: {
              pageId: otherPage.id,
              name: 'testing_echo',
              arguments: { message: 'page' },
            },
          },
          callResponse,
          context
        );
        const callResult = await callResponse.handle(callWebMCPTool.name, context);
        assert.deepStrictEqual(stripUndefined(callResult.content), [
          { type: 'text', text: 'echo:page' },
        ]);
      });
    });
  });
});
