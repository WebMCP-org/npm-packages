import type { ModelContextTesting, ToolInfo, ToolListItem, ToolResponse } from './types.js';

/**
 * Test helper API exposed via @mcp-b/global/testing.
 * Wraps navigator.modelContextTesting and normalizes object-arg tool execution.
 */
export interface ModelContextTestHelper {
  /**
   * Execute a tool with object arguments.
   * Internally delegates to modelContextTesting.executeTool(name, JSON.stringify(args)).
   */
  executeTool(toolName: string, args?: Record<string, unknown>): Promise<unknown>;

  /**
   * List tools exposed by modelContextTesting.
   */
  listTools(): ToolInfo[];

  /**
   * Register for tool list updates.
   */
  onToolsChanged(callback: () => void): void;

  /**
   * Get recorded tool calls.
   * Only available when using the polyfill extensions.
   */
  getToolCalls(): Array<{
    toolName: string;
    arguments: Record<string, unknown>;
    timestamp: number;
  }>;

  /**
   * Clear recorded tool calls.
   * Only available when using the polyfill extensions.
   */
  clearToolCalls(): void;

  /**
   * Set mock response for a tool.
   * Only available when using the polyfill extensions.
   */
  setMockToolResponse(toolName: string, response: ToolResponse): void;

  /**
   * Clear mock response for a tool.
   * Only available when using the polyfill extensions.
   */
  clearMockToolResponse(toolName: string): void;

  /**
   * Clear all mock responses.
   * Only available when using the polyfill extensions.
   */
  clearAllMockToolResponses(): void;

  /**
   * Get registered tools from modelContext internals.
   * Only available when using the polyfill extensions.
   */
  getRegisteredTools(): ToolListItem[];

  /**
   * Reset polyfill testing state.
   * Only available when using the polyfill extensions.
   */
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

  // Prefer bridge-bound instance to avoid touching deprecated navigator accessor.
  if (typeof window !== 'undefined') {
    const bridgeTesting = window.__mcpBridge?.modelContextTesting;
    if (bridgeTesting) {
      return bridgeTesting;
    }
  }

  if (typeof navigator === 'undefined' || !navigator.modelContextTesting) {
    throw new Error(
      'navigator.modelContextTesting is not available. Ensure @mcp-b/global is initialized first.'
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
          'These helpers require the @mcp-b/global polyfill testing extensions.'
      );
    }
  }

  return candidate as PolyfillTestingExtensions;
}

/**
 * Create a testing helper bound to modelContextTesting.
 *
 * @param testingOverride - Optional explicit testing API instance.
 */
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
