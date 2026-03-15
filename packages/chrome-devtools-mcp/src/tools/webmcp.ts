/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { EmbeddedResource, ImageContent, Page, TextContent } from '../third_party/index.js';
import { zod } from '../third_party/index.js';

import { ToolCategory } from './categories.js';
import { defineTool } from './ToolDefinition.js';

const DEFAULT_INPUT_SCHEMA = {
  type: 'object',
  properties: {},
} as const;

type JsonObject = Record<string, unknown>;
type WebMcpContentBlock = TextContent | ImageContent | EmbeddedResource;

interface BrowserToolMetadata {
  name: string;
  description: string;
  inputSchema: JsonObject;
}

type BrowserListToolsResult =
  | {
      kind: 'available';
      api: 'modelContext' | 'modelContextTesting';
      tools: BrowserToolMetadata[];
    }
  | {
      kind: 'unavailable';
      message: string;
    };

type BrowserCallToolResult =
  | {
      kind: 'success';
      api: 'modelContext' | 'modelContextTesting';
      value: unknown;
    }
  | {
      kind: 'error';
      message: string;
    };

function globToRegex(pattern: string): RegExp {
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*')
    .replace(/\?/g, '.');
  return new RegExp(`^${escaped}$`, 'i');
}

function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function jsonStringify(value: unknown): string {
  return JSON.stringify(value, null, 2) ?? 'null';
}

function normalizeToolMetadata(
  pageId: number,
  tools: BrowserToolMetadata[]
): Array<BrowserToolMetadata & { pageId: number }> {
  return tools.map((tool) => ({
    ...tool,
    pageId,
  }));
}

function summarizeDescription(description: string): string {
  const firstLine = description.split('\n', 1)[0] ?? '';
  const firstSentence = firstLine.split('. ', 1)[0] ?? '';
  const summary = firstSentence || firstLine || description;
  return summary.length > 120 ? `${summary.slice(0, 117)}...` : summary;
}

function resolvePage(
  context: {
    getPageById(pageId: number): { pptrPage: Page };
    getSelectedMcpPage(): { id: number; pptrPage: Page };
  },
  pageId?: number
) {
  if (pageId !== undefined) {
    return {
      id: pageId,
      pptrPage: context.getPageById(pageId).pptrPage,
    };
  }
  return context.getSelectedMcpPage();
}

async function evaluateListTools(page: Page): Promise<BrowserListToolsResult> {
  return page.evaluate(async (defaultInputSchema) => {
    function isObject(value: unknown): value is Record<string, unknown> {
      return typeof value === 'object' && value !== null && !Array.isArray(value);
    }

    function normalizeCoreSchema(value: unknown): Record<string, unknown> {
      return isObject(value) ? value : defaultInputSchema;
    }

    function normalizeTestingSchema(value: unknown): Record<string, unknown> {
      if (typeof value !== 'string' || value.length === 0) {
        return defaultInputSchema;
      }

      try {
        const parsed = JSON.parse(value);
        return isObject(parsed) ? parsed : defaultInputSchema;
      } catch {
        return defaultInputSchema;
      }
    }

    const nav = navigator as Navigator & {
      modelContext?: {
        listTools?: () => unknown[] | Promise<unknown[]>;
      };
      modelContextTesting?: {
        listTools?: () => unknown[] | Promise<unknown[]>;
      };
    };

    if (nav.modelContext && typeof nav.modelContext.listTools === 'function') {
      const tools = await nav.modelContext.listTools();
      return {
        kind: 'available' as const,
        api: 'modelContext' as const,
        tools: Array.isArray(tools)
          ? tools.map((tool) => {
              const raw = isObject(tool) ? tool : {};
              return {
                name: typeof raw.name === 'string' ? raw.name : '',
                description: typeof raw.description === 'string' ? raw.description : '',
                inputSchema: normalizeCoreSchema(raw.inputSchema),
              };
            })
          : [],
      };
    }

    if (nav.modelContextTesting && typeof nav.modelContextTesting.listTools === 'function') {
      const tools = await nav.modelContextTesting.listTools();
      return {
        kind: 'available' as const,
        api: 'modelContextTesting' as const,
        tools: Array.isArray(tools)
          ? tools.map((tool) => {
              const raw = isObject(tool) ? tool : {};
              return {
                name: typeof raw.name === 'string' ? raw.name : '',
                description: typeof raw.description === 'string' ? raw.description : '',
                inputSchema: normalizeTestingSchema(raw.inputSchema),
              };
            })
          : [],
      };
    }

    return {
      kind: 'unavailable' as const,
      message:
        'Page does not expose navigator.modelContext.listTools() or navigator.modelContextTesting.listTools().',
    };
  }, DEFAULT_INPUT_SCHEMA);
}

async function evaluateCallTool(
  page: Page,
  name: string,
  args: JsonObject
): Promise<BrowserCallToolResult> {
  return page.evaluate(
    async ({ toolName, toolArgs }) => {
      const nav = navigator as Navigator & {
        modelContext?: {
          callTool?: (request: {
            name: string;
            arguments: Record<string, unknown>;
          }) => unknown | Promise<unknown>;
        };
        modelContextTesting?: {
          executeTool?: (
            toolName: string,
            serializedArgs: string
          ) => string | null | Promise<string | null>;
        };
      };

      try {
        if (nav.modelContext && typeof nav.modelContext.callTool === 'function') {
          return {
            kind: 'success' as const,
            api: 'modelContext' as const,
            value: await nav.modelContext.callTool({
              name: toolName,
              arguments: toolArgs,
            }),
          };
        }

        if (nav.modelContextTesting && typeof nav.modelContextTesting.executeTool === 'function') {
          const serialized = await nav.modelContextTesting.executeTool(
            toolName,
            JSON.stringify(toolArgs)
          );
          if (serialized === null) {
            return {
              kind: 'error' as const,
              message:
                'Tool execution was interrupted by navigation or the page became unavailable.',
            };
          }

          const trimmed = serialized.trim();
          try {
            return {
              kind: 'success' as const,
              api: 'modelContextTesting' as const,
              value: JSON.parse(serialized),
            };
          } catch {
            // Native modelContextTesting can return a plain text string for
            // simple tool results. Preserve invalid JSON errors for payloads
            // that look like structured data but fail to parse.
            if (
              trimmed.length > 0 &&
              !['{', '[', '"'].includes(trimmed[0]) &&
              !/^[-\d]/.test(trimmed[0])
            ) {
              return {
                kind: 'success' as const,
                api: 'modelContextTesting' as const,
                value: serialized,
              };
            }
            return {
              kind: 'error' as const,
              message: `Testing tool returned invalid JSON: ${serialized.slice(0, 200)}`,
            };
          }
        }

        return {
          kind: 'error' as const,
          message:
            'Page does not expose navigator.modelContext.callTool() or navigator.modelContextTesting.executeTool().',
        };
      } catch (error) {
        return {
          kind: 'error' as const,
          message: error instanceof Error ? error.message : String(error),
        };
      }
    },
    {
      toolName: name,
      toolArgs: args,
    }
  );
}

function normalizeResource(value: unknown): EmbeddedResource['resource'] | null {
  if (!isJsonObject(value) || typeof value.uri !== 'string') {
    return null;
  }

  if (typeof value.text === 'string') {
    return {
      uri: value.uri,
      text: value.text,
      mimeType: typeof value.mimeType === 'string' ? value.mimeType : undefined,
      _meta: isJsonObject(value._meta) ? value._meta : undefined,
    };
  }

  if (typeof value.blob === 'string') {
    return {
      uri: value.uri,
      blob: value.blob,
      mimeType: typeof value.mimeType === 'string' ? value.mimeType : undefined,
      _meta: isJsonObject(value._meta) ? value._meta : undefined,
    };
  }

  return null;
}

function normalizeContentBlock(value: unknown): WebMcpContentBlock {
  if (isJsonObject(value)) {
    if (value.type === 'text' && typeof value.text === 'string') {
      return {
        type: 'text',
        text: value.text,
        annotations: isJsonObject(value.annotations) ? value.annotations : undefined,
        _meta: isJsonObject(value._meta) ? value._meta : undefined,
      };
    }

    if (
      value.type === 'image' &&
      typeof value.data === 'string' &&
      typeof value.mimeType === 'string'
    ) {
      return {
        type: 'image',
        data: value.data,
        mimeType: value.mimeType,
        annotations: isJsonObject(value.annotations) ? value.annotations : undefined,
        _meta: isJsonObject(value._meta) ? value._meta : undefined,
      };
    }

    if (value.type === 'resource') {
      const resource = normalizeResource(value.resource);
      if (resource) {
        return {
          type: 'resource',
          resource,
          annotations: isJsonObject(value.annotations) ? value.annotations : undefined,
          _meta: isJsonObject(value._meta) ? value._meta : undefined,
        };
      }
    }
  }

  return {
    type: 'text',
    text: typeof value === 'string' ? value : jsonStringify(value),
  };
}

function normalizeToolResult(value: unknown): {
  content: WebMcpContentBlock[];
  isError: boolean;
} {
  if (!isJsonObject(value)) {
    return {
      content: [normalizeContentBlock(value)],
      isError: false,
    };
  }

  const content = Array.isArray(value.content)
    ? value.content.map((block) => normalizeContentBlock(block))
    : [];

  if (!content.length) {
    if (value.structuredContent !== undefined) {
      content.push({
        type: 'text',
        text: jsonStringify(value.structuredContent),
      });
    } else {
      content.push({
        type: 'text',
        text: '',
      });
    }
  }

  return {
    content,
    isError: value.isError === true,
  };
}

function formatListedTools(
  tools: Array<BrowserToolMetadata & { pageId: number }>,
  summary: boolean
): Array<
  | {
      name: string;
      description: string;
      pageId: number;
    }
  | {
      name: string;
      description: string;
      inputSchema: JsonObject;
      pageId: number;
    }
> {
  if (summary) {
    return tools.map((tool) => ({
      name: tool.name,
      description: summarizeDescription(tool.description),
      pageId: tool.pageId,
    }));
  }

  return tools;
}

export const listWebMCPTools = defineTool({
  name: 'list_webmcp_tools',
  description:
    'List WebMCP tools exposed by the selected page, a specific pageId, or across all open pages. Supports compact summaries and glob filtering.',
  annotations: {
    category: ToolCategory.DEBUGGING,
    readOnlyHint: true,
  },
  schema: {
    pageId: zod
      .number()
      .optional()
      .describe('Targets a specific page by ID. Defaults to the selected page.'),
    allPages: zod
      .boolean()
      .optional()
      .describe('If true, search across all open pages instead of only the selected page.'),
    pattern: zod
      .string()
      .optional()
      .describe('Optional glob pattern to filter tool names, for example "list_*" or "*_entity".'),
    summary: zod
      .boolean()
      .optional()
      .describe('If true, omit input schemas and return compact tool summaries.'),
  },
  handler: async (request, response, context) => {
    const { allPages = false, pageId, pattern, summary = false } = request.params;

    if (allPages && pageId !== undefined) {
      throw new Error('Specify either pageId or allPages, not both.');
    }

    const regex = pattern ? globToRegex(pattern) : null;

    if (!allPages) {
      const page = resolvePage(context, pageId);
      const result = await evaluateListTools(page.pptrPage);

      if (result.kind === 'unavailable') {
        response.appendResponseLine(
          jsonStringify({
            pageId: page.id,
            count: 0,
            tools: [],
            message: result.message,
          })
        );
        return;
      }

      let tools = normalizeToolMetadata(page.id, result.tools);
      if (regex) {
        tools = tools.filter((tool) => regex.test(tool.name));
      }

      if (!tools.length) {
        response.appendResponseLine(
          jsonStringify({
            pageId: page.id,
            api: result.api,
            count: 0,
            tools: [],
            message: pattern
              ? `No WebMCP tools matched pattern "${pattern}" on page ${page.id}.`
              : 'No WebMCP tools were exposed on the selected page.',
          })
        );
        return;
      }

      response.appendResponseLine(
        jsonStringify({
          pageId: page.id,
          api: result.api,
          count: tools.length,
          tools: formatListedTools(tools, summary),
        })
      );
      return;
    }

    const selectedPageId = context.getSelectedMcpPage().id;
    const pages = context
      .getPages()
      .map((pptrPage) => {
        const id = context.getPageId(pptrPage);
        return id === undefined ? null : { id, pptrPage };
      })
      .filter((page) => page !== null);

    const pageResults = await Promise.all(
      pages.map(async (page) => ({
        page,
        result: await evaluateListTools(page.pptrPage),
      }))
    );

    const tools = pageResults.flatMap(({ page, result }) => {
      if (result.kind !== 'available') {
        return [];
      }
      return normalizeToolMetadata(page.id, result.tools);
    });

    const filteredTools = regex ? tools.filter((tool) => regex.test(tool.name)) : tools;

    const unavailablePageIds = pageResults
      .filter((entry) => entry.result.kind === 'unavailable')
      .map((entry) => entry.page.id);

    response.appendResponseLine(
      jsonStringify({
        selectedPageId,
        pagesScanned: pages.length,
        count: filteredTools.length,
        tools: formatListedTools(filteredTools, summary),
        message:
          filteredTools.length > 0
            ? undefined
            : pattern
              ? `No WebMCP tools matched pattern "${pattern}" across ${pages.length} page(s).`
              : 'No WebMCP tools were exposed across the scanned pages.',
        unavailablePageIds: unavailablePageIds.length > 0 ? unavailablePageIds : undefined,
      })
    );
  },
});

export const callWebMCPTool = defineTool({
  name: 'call_webmcp_tool',
  description: 'Call a WebMCP tool exposed by the selected page or a specific pageId.',
  annotations: {
    category: ToolCategory.DEBUGGING,
    readOnlyHint: false,
  },
  schema: {
    name: zod.string().describe('The WebMCP tool name to invoke.'),
    arguments: zod
      .record(zod.unknown())
      .optional()
      .describe('Tool arguments. Defaults to an empty object.'),
    pageId: zod
      .number()
      .optional()
      .describe('Targets a specific page by ID. Defaults to the selected page.'),
  },
  handler: async (request, response, context) => {
    const page = resolvePage(context, request.params.pageId);
    const result = await evaluateCallTool(
      page.pptrPage,
      request.params.name,
      request.params.arguments ?? {}
    );

    if (result.kind === 'error') {
      throw new Error(result.message);
    }

    const normalized = normalizeToolResult(result.value);
    response.setToolResultError(normalized.isError);
    for (const block of normalized.content) {
      response.appendMcpContent(block);
    }
  },
});
