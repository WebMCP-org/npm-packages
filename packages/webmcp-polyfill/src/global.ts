import { createLogger } from './logger.js';
import type {
  ModelContext,
  ModelContextInput,
  ModelContextTesting,
  RegistrationHandle,
  ToolCallEvent,
  ToolCallRecord,
  ToolDescriptor,
  ToolExecutionContext,
  ToolInfo,
  ToolResponse,
  ValidatedToolDescriptor,
  WebModelContextInitOptions,
} from './types.js';
import { compileJsonSchema, validateWithSchema } from './validation.js';

const logger = createLogger('WebModelContext');
const testingLogger = createLogger('ModelContextTesting');

const POLYFILL_MARKER_PROPERTY = '__isWebMCPPolyfill' as const;

interface ToolCallInterceptionEvent extends ToolCallEvent {
  _responded: boolean;
  _response: ToolResponse | null;
}

class WebToolCallEvent extends Event implements ToolCallInterceptionEvent {
  public name: string;
  public arguments: Record<string, unknown>;
  public _responded = false;
  public _response: ToolResponse | null = null;

  constructor(toolName: string, args: Record<string, unknown>) {
    super('toolcall', { cancelable: true });
    this.name = toolName;
    this.arguments = args;
  }

  public respondWith(response: ToolResponse): void {
    if (this._responded) {
      throw new Error('Response already provided for this tool call');
    }

    this._responded = true;
    this._response = response;
  }
}

interface TestingHooks {
  getMockToolResponse(toolName: string): ToolResponse | undefined;
  recordToolCall(call: ToolCallRecord): void;
}

function isTextContentBlock(block: unknown): block is { type: 'text'; text?: string } {
  if (typeof block !== 'object' || block === null) {
    return false;
  }

  const maybeBlock = block as { type?: unknown; text?: unknown };
  if (maybeBlock.type !== 'text') {
    return false;
  }

  return maybeBlock.text === undefined || typeof maybeBlock.text === 'string';
}

class WebModelContext extends EventTarget implements ModelContext {
  private baseTools = new Map<string, ValidatedToolDescriptor>();
  private dynamicTools = new Map<string, ValidatedToolDescriptor>();
  private mergedTools = new Map<string, ValidatedToolDescriptor>();
  private testingHooks?: TestingHooks;
  private toolsChangedScheduled = false;

  public setTestingHooks(hooks: TestingHooks): void {
    this.testingHooks = hooks;
  }

  public provideContext(context: ModelContextInput): void {
    const nextBaseTools = new Map<string, ValidatedToolDescriptor>();

    for (const tool of context.tools ?? []) {
      const validated = this.validateTool(tool as ToolDescriptor);
      if (nextBaseTools.has(validated.name)) {
        throw new Error(`Duplicate tool name in provideContext(): ${validated.name}`);
      }
      if (this.dynamicTools.has(validated.name)) {
        throw new Error(
          `Cannot provideContext() tool "${validated.name}" because a dynamic tool with the same name exists`
        );
      }

      nextBaseTools.set(validated.name, validated);
    }

    this.baseTools = nextBaseTools;
    this.rebuildMergedTools();
    this.scheduleToolsChanged();
  }

  public registerTool(tool: ToolDescriptor): RegistrationHandle {
    const validated = this.validateTool(tool);

    if (this.baseTools.has(validated.name)) {
      throw new Error(
        `Tool "${validated.name}" is already provided by provideContext() and cannot be dynamically registered`
      );
    }

    if (this.dynamicTools.has(validated.name)) {
      throw new Error(`Tool "${validated.name}" is already registered`);
    }

    this.dynamicTools.set(validated.name, validated);
    this.rebuildMergedTools();
    this.scheduleToolsChanged();

    return {
      unregister: () => this.unregisterTool(validated.name),
    };
  }

  public unregisterTool(name: string): void {
    if (!this.dynamicTools.delete(name)) {
      return;
    }

    this.rebuildMergedTools();
    this.scheduleToolsChanged();
  }

  public listTools(): ToolInfo[] {
    return Array.from(this.mergedTools.values()).map((tool) => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema,
      ...(tool.outputSchema && { outputSchema: tool.outputSchema }),
      ...(tool.annotations && { annotations: tool.annotations }),
    }));
  }

  public async callTool(params: {
    name: string;
    arguments?: Record<string, unknown>;
  }): Promise<ToolResponse> {
    const tool = this.mergedTools.get(params.name);
    if (!tool) {
      throw new Error(`Tool not found: ${params.name}`);
    }

    const args = (params.arguments ?? {}) as Record<string, unknown>;
    const inputValidation = validateWithSchema(args, tool.inputValidator);
    if (!inputValidation.success) {
      throw new Error(inputValidation.error);
    }

    this.testingHooks?.recordToolCall({
      toolName: params.name,
      arguments: args,
      timestamp: Date.now(),
    });

    const mockResponse = this.testingHooks?.getMockToolResponse(params.name);
    if (mockResponse) {
      this.validateOutput(tool, mockResponse);
      return mockResponse;
    }

    const event = new WebToolCallEvent(params.name, args);
    this.dispatchEvent(event);

    if (event._responded) {
      if (!event._response) {
        throw new Error('Tool call event interception returned no response');
      }

      this.validateOutput(tool, event._response);
      return event._response;
    }

    const context: ToolExecutionContext = {
      elicitInput: async () => {
        throw new Error('Elicitation is not supported by @mcp-b/webmcp-polyfill runtime');
      },
    };

    const response = await tool.execute(args, context);
    this.validateOutput(tool, response);
    return response;
  }

  public clearContext(): void {
    this.baseTools.clear();
    this.dynamicTools.clear();
    this.rebuildMergedTools();
    this.scheduleToolsChanged();
  }

  public override addEventListener(
    type: 'toolcall',
    listener: (event: ToolCallEvent) => void | Promise<void>,
    options?: boolean | AddEventListenerOptions
  ): void;
  public override addEventListener(
    type: 'toolschanged',
    listener: () => void,
    options?: boolean | AddEventListenerOptions
  ): void;
  public override addEventListener(
    type: string,
    listener:
      | ((event: ToolCallEvent) => void | Promise<void>)
      | (() => void)
      | EventListenerOrEventListenerObject
      | null,
    options?: boolean | AddEventListenerOptions
  ): void {
    super.addEventListener(type, listener as EventListenerOrEventListenerObject | null, options);
  }

  public override removeEventListener(
    type: 'toolcall',
    listener: (event: ToolCallEvent) => void | Promise<void>,
    options?: boolean | EventListenerOptions
  ): void;
  public override removeEventListener(
    type: 'toolschanged',
    listener: () => void,
    options?: boolean | EventListenerOptions
  ): void;
  public override removeEventListener(
    type: string,
    listener:
      | ((event: ToolCallEvent) => void | Promise<void>)
      | (() => void)
      | EventListenerOrEventListenerObject
      | null,
    options?: boolean | EventListenerOptions
  ): void {
    super.removeEventListener(type, listener as EventListenerOrEventListenerObject | null, options);
  }

  private validateOutput(tool: ValidatedToolDescriptor, response: ToolResponse): void {
    if (!tool.outputValidator || response.structuredContent === undefined) {
      return;
    }

    const outputValidation = validateWithSchema(response.structuredContent, tool.outputValidator);
    if (!outputValidation.success) {
      throw new Error(`Output validation failed for tool ${tool.name}: ${outputValidation.error}`);
    }
  }

  private validateTool(tool: ToolDescriptor): ValidatedToolDescriptor {
    if (!tool || typeof tool !== 'object') {
      throw new Error('Invalid tool descriptor');
    }

    if (!tool.name || typeof tool.name !== 'string') {
      throw new Error('Tool name is required and must be a string');
    }

    if (!tool.description || typeof tool.description !== 'string') {
      throw new Error(`Tool "${tool.name}" description is required and must be a string`);
    }

    if (typeof tool.execute !== 'function') {
      throw new Error(`Tool "${tool.name}" execute must be a function`);
    }

    const inputSchema = (tool.inputSchema ?? {
      type: 'object',
      properties: {},
    }) as ToolDescriptor['inputSchema'];
    const inputValidator = compileJsonSchema(inputSchema, { strict: true });
    const outputValidator =
      tool.outputSchema !== undefined
        ? compileJsonSchema(tool.outputSchema, { strict: true })
        : undefined;

    return {
      name: tool.name,
      description: tool.description,
      inputSchema,
      ...(tool.outputSchema && { outputSchema: tool.outputSchema }),
      ...(tool.annotations && { annotations: tool.annotations }),
      execute: tool.execute as ValidatedToolDescriptor['execute'],
      inputValidator,
      ...(outputValidator && { outputValidator }),
    };
  }

  private rebuildMergedTools(): void {
    this.mergedTools.clear();

    for (const [name, descriptor] of this.baseTools) {
      this.mergedTools.set(name, descriptor);
    }

    for (const [name, descriptor] of this.dynamicTools) {
      this.mergedTools.set(name, descriptor);
    }
  }

  private scheduleToolsChanged(): void {
    if (this.toolsChangedScheduled) {
      return;
    }

    this.toolsChangedScheduled = true;
    queueMicrotask(() => {
      this.toolsChangedScheduled = false;
      this.dispatchEvent(new Event('toolschanged'));
    });
  }
}

class WebModelContextTestingImpl implements ModelContextTesting {
  public [POLYFILL_MARKER_PROPERTY] = true;

  private toolCalls: ToolCallRecord[] = [];
  private mockResponses = new Map<string, ToolResponse>();
  private toolsChangedCallbacks = new Set<() => void>();

  constructor(private readonly modelContext: WebModelContext) {
    modelContext.setTestingHooks({
      getMockToolResponse: (toolName: string) => this.mockResponses.get(toolName),
      recordToolCall: (call: ToolCallRecord) => {
        this.toolCalls.push(call);
      },
    });

    modelContext.addEventListener('toolschanged', () => {
      for (const callback of this.toolsChangedCallbacks) {
        callback();
      }
    });
  }

  public async executeTool(toolName: string, inputArgsJson: string): Promise<unknown> {
    const parsed = JSON.parse(inputArgsJson) as Record<string, unknown>;
    const result = await this.modelContext.callTool({
      name: toolName,
      arguments: parsed,
    });

    const textBlock = result.content.find((block) => isTextContentBlock(block));
    if (textBlock && textBlock.text !== undefined) {
      return textBlock.text;
    }

    return result;
  }

  public listTools(): ToolInfo[] {
    return this.modelContext.listTools();
  }

  public registerToolsChangedCallback(callback: () => void): void {
    this.toolsChangedCallbacks.add(callback);
  }

  public getToolCalls(): ToolCallRecord[] {
    return [...this.toolCalls];
  }

  public clearToolCalls(): void {
    this.toolCalls = [];
  }

  public setMockToolResponse(toolName: string, response: ToolResponse): void {
    this.mockResponses.set(toolName, response);
  }

  public clearMockToolResponse(toolName: string): void {
    this.mockResponses.delete(toolName);
  }

  public clearAllMockToolResponses(): void {
    this.mockResponses.clear();
  }

  public getRegisteredTools(): ToolInfo[] {
    return this.modelContext.listTools();
  }

  public reset(): void {
    this.clearToolCalls();
    this.clearAllMockToolResponses();
  }
}

export function initializeWebModelContext(options?: WebModelContextInitOptions): void {
  if (typeof window === 'undefined') {
    return;
  }

  const mergedOptions = options ?? window.__webModelContextOptions;
  const shouldInitialize = mergedOptions?.autoInitialize !== false;
  if (!shouldInitialize) {
    return;
  }

  if (window.navigator.modelContext) {
    logger.warn('window.navigator.modelContext already exists, skipping initialization');
    return;
  }

  const modelContext = new WebModelContext();
  const testing = new WebModelContextTestingImpl(modelContext);

  Object.defineProperty(window.navigator, 'modelContext', {
    value: modelContext,
    writable: false,
    configurable: true,
  });

  Object.defineProperty(window.navigator, 'modelContextTesting', {
    value: testing,
    writable: false,
    configurable: true,
  });

  testingLogger.info('Polyfill testing API installed at navigator.modelContextTesting');
}

export function cleanupWebModelContext(): void {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    delete (window.navigator as unknown as Record<string, unknown>).modelContext;
  } catch {
    // ignore
  }

  try {
    delete (window.navigator as unknown as Record<string, unknown>).modelContextTesting;
  } catch {
    // ignore
  }
}
