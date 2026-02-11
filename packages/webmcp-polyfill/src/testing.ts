import type { ModelContextTesting, ToolInfo, ToolResponse } from './types.js';

/**
 * Test helper API exposed via @mcp-b/webmcp-polyfill/testing.
 * Wraps navigator.modelContextTesting and normalizes object-arg tool execution.
 */
export interface ModelContextTestHelper {
  executeTool(toolName: string, args?: Record<string, unknown>): Promise<unknown>;
  listTools(): ToolInfo[];
  onToolsChanged(callback: () => void): void;
  getToolCalls(): Array<{
    toolName: string;
    arguments: Record<string, unknown>;
    timestamp: number;
  }>;
  clearToolCalls(): void;
  setMockToolResponse(toolName: string, response: ToolResponse): void;
  clearMockToolResponse(toolName: string): void;
  clearAllMockToolResponses(): void;
  getRegisteredTools(): ToolInfo[];
  reset(): void;
}

type PolyfillTestingExtensions = Pick<
  ModelContextTesting,
  | 'getToolCalls'
  | 'clearToolCalls'
  | 'setMockToolResponse'
  | 'clearMockToolResponse'
  | 'clearAllMockToolResponses'
  | 'getRegisteredTools'
  | 'reset'
>;

function resolveTestingAPI(override?: ModelContextTesting): ModelContextTesting {
  if (override) {
    return override;
  }

  if (typeof navigator === 'undefined' || !navigator.modelContextTesting) {
    throw new Error(
      'navigator.modelContextTesting is not available. Ensure @mcp-b/webmcp-polyfill is initialized first.'
    );
  }

  return navigator.modelContextTesting;
}

function getPolyfillExtensions(testing: ModelContextTesting): PolyfillTestingExtensions {
  const candidate = testing as ModelContextTesting & Partial<PolyfillTestingExtensions>;
  const requiredMethods: Array<keyof PolyfillTestingExtensions> = [
    'getToolCalls',
    'clearToolCalls',
    'setMockToolResponse',
    'clearMockToolResponse',
    'clearAllMockToolResponses',
    'getRegisteredTools',
    'reset',
  ];

  for (const method of requiredMethods) {
    if (typeof candidate[method] !== 'function') {
      throw new Error(
        `modelContextTesting.${String(method)} is not available in this runtime. ` +
          'These helpers require the @mcp-b/webmcp-polyfill testing extensions.'
      );
    }
  }

  return candidate as PolyfillTestingExtensions;
}

export function createTestHelper(testingOverride?: ModelContextTesting): ModelContextTestHelper {
  const testing = resolveTestingAPI(testingOverride);
  const polyfillExtensions = () => getPolyfillExtensions(testing);

  return {
    executeTool: (toolName: string, args: Record<string, unknown> = {}) =>
      testing.executeTool(toolName, JSON.stringify(args)),
    listTools: () => testing.listTools(),
    onToolsChanged: (callback: () => void) => testing.registerToolsChangedCallback(callback),
    getToolCalls: () => polyfillExtensions().getToolCalls(),
    clearToolCalls: () => polyfillExtensions().clearToolCalls(),
    setMockToolResponse: (toolName: string, response: ToolResponse) =>
      polyfillExtensions().setMockToolResponse(toolName, response),
    clearMockToolResponse: (toolName: string) =>
      polyfillExtensions().clearMockToolResponse(toolName),
    clearAllMockToolResponses: () => polyfillExtensions().clearAllMockToolResponses(),
    getRegisteredTools: () => polyfillExtensions().getRegisteredTools(),
    reset: () => polyfillExtensions().reset(),
  };
}
