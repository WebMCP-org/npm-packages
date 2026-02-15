/**
 * {{Site}} WebMCP Tools
 *
 * MCP tools for interacting with {{Site}}.
 *
 * Usage:
 * 1. Navigate to {{site_url}}
 * 2. inject_webmcp_script({ file_path: "./tools/src/{{site}}.ts" })
 * 3. Call tools directly: webmcp_{{site}}_page0_tool_name(...)
 *
 * @website {{site_url}}
 */

// ============================================================================
// Helper Functions
// TODO: Replace with @webmcp/helpers import when published
// ============================================================================

interface ContentItem {
  type: 'text' | 'image' | 'resource';
  text?: string;
  data?: string;
  mimeType?: string;
  uri?: string;
}

interface ToolResponse {
  content: ContentItem[];
  isError?: boolean;
}

function textResponse(text: string): ToolResponse {
  return { content: [{ type: 'text', text }] };
}

function jsonResponse(data: unknown, indent = 2): ToolResponse {
  return { content: [{ type: 'text', text: JSON.stringify(data, null, indent) }] };
}

function errorResponse(message: string): ToolResponse {
  return { content: [{ type: 'text', text: message }], isError: true };
}

function getAllElements(selector: string): Element[] {
  return Array.from(document.querySelectorAll(selector));
}

function getText(selectorOrElement: string | Element | null): string | null {
  const el =
    typeof selectorOrElement === 'string'
      ? document.querySelector(selectorOrElement)
      : selectorOrElement;
  return el?.textContent?.trim() ?? null;
}

interface ModelContextLike {
  registerTool(tool: {
    name: string;
    description: string;
    inputSchema?: unknown;
    execute: (args: Record<string, unknown>) => Promise<ToolResponse>;
  }): void;
}

const modelContext = (navigator as Navigator & { modelContext: ModelContextLike }).modelContext;

// biome-ignore lint/correctness/noUnusedVariables: Exported for use in tools
function waitForElement(selector: string, timeout = 5000): Promise<Element> {
  return new Promise((resolve, reject) => {
    const element = document.querySelector(selector);
    if (element) {
      resolve(element);
      return;
    }

    const observer = new MutationObserver(() => {
      const element = document.querySelector(selector);
      if (element) {
        observer.disconnect();
        resolve(element);
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });

    setTimeout(() => {
      observer.disconnect();
      reject(new Error(`Timeout waiting for element: ${selector}`));
    }, timeout);
  });
}

// Example read-only tool
modelContext.registerTool({
  name: 'get_page_info',
  description: 'Get basic information about the current {{Site}} page',
  inputSchema: {
    type: 'object',
    properties: {},
  },
  execute: async () => {
    try {
      const title = document.title;
      const url = window.location.href;

      return jsonResponse({
        title,
        url,
        // Add more page info here
      });
    } catch (error) {
      return errorResponse(`Failed to get page info: ${error}`);
    }
  },
});

// Example tool with parameters
modelContext.registerTool({
  name: 'search_items',
  description: 'Search for items on the page. Returns matching results.',
  inputSchema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'Search query',
      },
      limit: {
        type: 'number',
        description: 'Maximum number of results (default: 10)',
      },
    },
    required: ['query'],
  },
  execute: async (args: Record<string, unknown>) => {
    try {
      const query = typeof args.query === 'string' ? args.query : '';
      const limit = typeof args.limit === 'number' ? args.limit : 10;
      // TODO: Implement search logic
      // Example:
      // const items = getAllElements('.item-selector');
      // const matches = items.filter(item =>
      //   getText(item)?.toLowerCase().includes(query.toLowerCase())
      // ).slice(0, limit);

      return jsonResponse({
        query,
        limit,
        results: [],
        message: 'TODO: Implement search logic',
      });
    } catch (error) {
      return errorResponse(`Search failed: ${error}`);
    }
  },
});

// Example action tool (read-write)
modelContext.registerTool({
  name: 'click_button',
  description: 'Click a button on the page by its label',
  inputSchema: {
    type: 'object',
    properties: {
      label: {
        type: 'string',
        description: 'Button label text',
      },
    },
    required: ['label'],
  },
  execute: async (args: Record<string, unknown>) => {
    try {
      const label = typeof args.label === 'string' ? args.label : '';
      const buttons = getAllElements('button');
      const button = buttons.find((btn) => getText(btn)?.toLowerCase() === label.toLowerCase());

      if (!button) {
        return errorResponse(`Button "${label}" not found`);
      }

      if (button instanceof HTMLElement) {
        button.click();
      }

      return textResponse(`Clicked button: ${label}`);
    } catch (error) {
      return errorResponse(`Click failed: ${error}`);
    }
  },
});

console.log('[WebMCP] {{Site}} tools registered');
