import type {
  InputSchema,
  ModelContext,
  ModelContextClient,
  ModelContextOptions,
  ModelContextTesting,
  ModelContextTestingExecuteToolOptions,
  ToolDescriptor,
  ToolResponse,
} from '@mcp-b/webmcp-types';

const FAILED_TO_PARSE_INPUT_ARGUMENTS_MESSAGE = 'Failed to parse input arguments';
const TOOL_INVOCATION_FAILED_MESSAGE =
  'Tool was executed but the invocation failed. For example, the script function threw an error';
const TOOL_CANCELLED_MESSAGE = 'Tool was cancelled';
const DEFAULT_INPUT_SCHEMA: InputSchema = { type: 'object', properties: {} };

const POLYFILL_MARKER_PROPERTY = '__isWebMCPPolyfill' as const;

interface PolyfillModelContext extends ModelContext {
  [POLYFILL_MARKER_PROPERTY]: true;
}

interface InstallState {
  installed: boolean;
  previousModelContextDescriptor: PropertyDescriptor | undefined;
  previousModelContextTestingDescriptor: PropertyDescriptor | undefined;
}

const installState: InstallState = {
  installed: false,
  previousModelContextDescriptor: undefined,
  previousModelContextTestingDescriptor: undefined,
};

export interface WebMCPPolyfillInitOptions {
  /**
   * Force installation even when navigator.modelContext already exists.
   * Existing descriptors are restored by cleanupWebMCPPolyfill().
   */
  forceOverride?: boolean;

  /**
   * Installs navigator.modelContextTesting when this polyfill provides modelContext.
   * @default true
   */
  installTestingShim?: boolean;

  /**
   * Deprecated no-op kept for compatibility with previous wrapper options.
   */
  disableIframeTransportByDefault?: boolean;
}

class StrictWebMCPContext {
  private tools = new Map<string, ToolDescriptor>();
  private toolsChangedCallback: (() => void) | null = null;

  provideContext(options: ModelContextOptions = {}): void {
    const nextTools = new Map<string, ToolDescriptor>();

    for (const tool of options.tools ?? []) {
      const normalized = normalizeToolDescriptor(tool, nextTools);
      nextTools.set(normalized.name, normalized);
    }

    this.tools = nextTools;
    this.notifyToolsChanged();
  }

  clearContext(): void {
    this.tools.clear();
    this.notifyToolsChanged();
  }

  registerTool(tool: ToolDescriptor): void {
    const normalized = normalizeToolDescriptor(tool, this.tools);
    this.tools.set(normalized.name, normalized);
    this.notifyToolsChanged();
  }

  unregisterTool(name: string): void {
    const removed = this.tools.delete(name);
    if (removed) {
      this.notifyToolsChanged();
    }
  }

  getTestingShim(): ModelContextTesting {
    return {
      listTools: () => {
        return [...this.tools.values()].map((tool) => {
          const output: { name: string; description: string; inputSchema?: string } = {
            name: tool.name,
            description: tool.description,
          };

          try {
            output.inputSchema = JSON.stringify(tool.inputSchema ?? DEFAULT_INPUT_SCHEMA);
          } catch {
            // Keep inputSchema omitted when serialization fails.
          }

          return output;
        });
      },
      executeTool: (
        toolName: string,
        inputArgsJson: string,
        options?: ModelContextTestingExecuteToolOptions
      ) => this.executeToolForTesting(toolName, inputArgsJson, options),
      registerToolsChangedCallback: (callback: () => void) => {
        if (typeof callback !== 'function') {
          throw new TypeError(
            "Failed to execute 'registerToolsChangedCallback' on 'ModelContextTesting': parameter 1 is not of type 'Function'."
          );
        }
        this.toolsChangedCallback = callback;
      },
      getCrossDocumentScriptToolResult: async () => '[]',
    };
  }

  private async executeToolForTesting(
    toolName: string,
    inputArgsJson: string,
    options?: ModelContextTestingExecuteToolOptions
  ): Promise<string | null> {
    if (options?.signal?.aborted) {
      throw createUnknownError(TOOL_CANCELLED_MESSAGE);
    }

    const tool = this.tools.get(toolName);
    if (!tool) {
      throw createUnknownError(`Tool not found: ${toolName}`);
    }

    const args = parseInputArgsJson(inputArgsJson);
    const validationError = validateArgsWithSchema(args, tool.inputSchema ?? DEFAULT_INPUT_SCHEMA);
    if (validationError) {
      throw createUnknownError(validationError);
    }

    let contextActive = true;
    const client: ModelContextClient = {
      requestUserInteraction: async (callback: () => Promise<unknown>): Promise<unknown> => {
        if (!contextActive) {
          throw new Error(
            `ModelContextClient for tool "${toolName}" is no longer active after execute() resolved`
          );
        }

        if (typeof callback !== 'function') {
          throw new TypeError('requestUserInteraction(callback) requires a function callback');
        }

        return callback();
      },
    };

    try {
      const execution = tool.execute(args, client);
      const result = await withAbortSignal(Promise.resolve(execution), options?.signal);
      return toSerializedTestingResult(result);
    } catch {
      throw createUnknownError(TOOL_INVOCATION_FAILED_MESSAGE);
    } finally {
      contextActive = false;
    }
  }

  private notifyToolsChanged(): void {
    if (!this.toolsChangedCallback) {
      return;
    }

    queueMicrotask(() => {
      try {
        this.toolsChangedCallback?.();
      } catch {
        // Callback errors are ignored to match browser event callback behavior.
      }
    });
  }
}

function createUnknownError(message: string): Error {
  try {
    return new DOMException(message, 'UnknownError');
  } catch {
    const error = new Error(message);
    error.name = 'UnknownError';
    return error;
  }
}

function parseInputArgsJson(inputArgsJson: string): Record<string, unknown> {
  let parsed: unknown;

  try {
    parsed = JSON.parse(inputArgsJson);
  } catch {
    throw createUnknownError(FAILED_TO_PARSE_INPUT_ARGUMENTS_MESSAGE);
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw createUnknownError(FAILED_TO_PARSE_INPUT_ARGUMENTS_MESSAGE);
  }

  return parsed as Record<string, unknown>;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function validateInputSchema(schema: unknown): asserts schema is InputSchema {
  if (!isPlainObject(schema)) {
    throw new Error('inputSchema must be a JSON Schema object');
  }

  validateJsonSchemaNode(schema, '$');
}

function validateJsonSchemaNode(node: Record<string, unknown>, path: string): void {
  const typeValue = node.type;
  if (
    typeValue !== undefined &&
    typeof typeValue !== 'string' &&
    !(
      Array.isArray(typeValue) &&
      typeValue.every((entry) => typeof entry === 'string' && entry.length > 0)
    )
  ) {
    throw new Error(`Invalid JSON Schema at ${path}: "type" must be a string or string[]`);
  }

  const requiredValue = node.required;
  if (
    requiredValue !== undefined &&
    !(Array.isArray(requiredValue) && requiredValue.every((entry) => typeof entry === 'string'))
  ) {
    throw new Error(`Invalid JSON Schema at ${path}: "required" must be an array of strings`);
  }

  const propertiesValue = node.properties;
  if (propertiesValue !== undefined) {
    if (!isPlainObject(propertiesValue)) {
      throw new Error(`Invalid JSON Schema at ${path}: "properties" must be an object`);
    }

    for (const [key, value] of Object.entries(propertiesValue)) {
      if (!isPlainObject(value)) {
        throw new Error(`Invalid JSON Schema at ${path}.properties.${key}: expected object schema`);
      }
      validateJsonSchemaNode(value, `${path}.properties.${key}`);
    }
  }

  const itemsValue = node.items;
  if (itemsValue !== undefined) {
    if (Array.isArray(itemsValue)) {
      for (const [index, value] of itemsValue.entries()) {
        if (!isPlainObject(value)) {
          throw new Error(`Invalid JSON Schema at ${path}.items[${index}]: expected object schema`);
        }
        validateJsonSchemaNode(value, `${path}.items[${index}]`);
      }
    } else if (isPlainObject(itemsValue)) {
      validateJsonSchemaNode(itemsValue, `${path}.items`);
    } else {
      throw new Error(`Invalid JSON Schema at ${path}: "items" must be an object or object[]`);
    }
  }

  for (const keyword of ['allOf', 'anyOf', 'oneOf'] as const) {
    const value = node[keyword];
    if (value === undefined) {
      continue;
    }

    if (!Array.isArray(value)) {
      throw new Error(`Invalid JSON Schema at ${path}: "${keyword}" must be an array`);
    }

    for (const [index, entry] of value.entries()) {
      if (!isPlainObject(entry)) {
        throw new Error(
          `Invalid JSON Schema at ${path}.${keyword}[${index}]: expected object schema`
        );
      }
      validateJsonSchemaNode(entry, `${path}.${keyword}[${index}]`);
    }
  }

  const notValue = node.not;
  if (notValue !== undefined) {
    if (!isPlainObject(notValue)) {
      throw new Error(`Invalid JSON Schema at ${path}: "not" must be an object schema`);
    }
    validateJsonSchemaNode(notValue, `${path}.not`);
  }

  try {
    JSON.stringify(node);
  } catch {
    throw new Error(`Invalid JSON Schema at ${path}: schema must be JSON-serializable`);
  }
}

function normalizeToolDescriptor(
  tool: ToolDescriptor,
  existing: Map<string, ToolDescriptor>
): ToolDescriptor {
  if (!tool || typeof tool !== 'object') {
    throw new TypeError('registerTool(tool) requires a tool object');
  }

  if (typeof tool.name !== 'string' || tool.name.length === 0) {
    throw new TypeError('Tool "name" must be a non-empty string');
  }

  if (typeof tool.description !== 'string' || tool.description.length === 0) {
    throw new TypeError('Tool "description" must be a non-empty string');
  }

  if (typeof tool.execute !== 'function') {
    throw new TypeError('Tool "execute" must be a function');
  }

  if (existing.has(tool.name)) {
    throw new Error(`Tool already registered: ${tool.name}`);
  }

  const normalizedInputSchema = (tool.inputSchema ?? DEFAULT_INPUT_SCHEMA) as unknown;
  validateInputSchema(normalizedInputSchema);

  return {
    ...tool,
    inputSchema: normalizedInputSchema,
  };
}

function isMatchingPrimitiveType(value: unknown, type: string): boolean {
  switch (type) {
    case 'string':
      return typeof value === 'string';
    case 'number':
      return typeof value === 'number' && Number.isFinite(value);
    case 'integer':
      return typeof value === 'number' && Number.isInteger(value);
    case 'boolean':
      return typeof value === 'boolean';
    case 'object':
      return isPlainObject(value);
    case 'array':
      return Array.isArray(value);
    case 'null':
      return value === null;
    default:
      return true;
  }
}

function validateArgsWithSchema(args: Record<string, unknown>, schema: InputSchema): string | null {
  if (schema.type === 'object' && !isPlainObject(args)) {
    return 'Input validation error: expected object arguments';
  }

  const properties = isPlainObject(schema.properties) ? schema.properties : undefined;
  const required = Array.isArray(schema.required)
    ? schema.required.filter((name): name is string => typeof name === 'string')
    : [];

  for (const requiredName of required) {
    if (!(requiredName in args)) {
      return `Input validation error: missing required field "${requiredName}"`;
    }
  }

  if (!properties) {
    return null;
  }

  for (const [key, value] of Object.entries(args)) {
    const propertySchema = properties[key];
    if (!propertySchema || !isPlainObject(propertySchema)) {
      continue;
    }

    const declaredType = propertySchema.type;
    if (typeof declaredType === 'string') {
      if (!isMatchingPrimitiveType(value, declaredType)) {
        return `Input validation error: field "${key}" must be of type "${declaredType}"`;
      }
    }
  }

  return null;
}

function getFirstTextBlock(result: ToolResponse): string | null {
  for (const block of result.content ?? []) {
    if (block.type === 'text' && 'text' in block && typeof block.text === 'string') {
      return block.text;
    }
  }

  return null;
}

function toSerializedTestingResult(result: ToolResponse): string | null {
  if (result.isError) {
    const firstText = getFirstTextBlock(result);
    const message = firstText?.replace(/^Error:\s*/i, '').trim() || TOOL_INVOCATION_FAILED_MESSAGE;
    throw createUnknownError(message);
  }

  const metadata = (result as ToolResponse & { metadata?: { willNavigate?: boolean } }).metadata;
  if (metadata && typeof metadata === 'object' && metadata.willNavigate) {
    return null;
  }

  try {
    return JSON.stringify(result);
  } catch {
    throw createUnknownError(TOOL_INVOCATION_FAILED_MESSAGE);
  }
}

function withAbortSignal<T>(operation: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) {
    return operation;
  }

  if (signal.aborted) {
    return Promise.reject(createUnknownError(TOOL_CANCELLED_MESSAGE));
  }

  return new Promise<T>((resolve, reject) => {
    const onAbort = () => {
      cleanup();
      reject(createUnknownError(TOOL_CANCELLED_MESSAGE));
    };

    const cleanup = () => {
      signal.removeEventListener('abort', onAbort);
    };

    signal.addEventListener('abort', onAbort, { once: true });

    operation.then(
      (value) => {
        cleanup();
        resolve(value);
      },
      (error) => {
        cleanup();
        reject(error);
      }
    );
  });
}

function getNavigator(): Navigator | null {
  if (typeof navigator !== 'undefined') {
    return navigator;
  }

  return null;
}

function defineNavigatorProperty<K extends keyof Navigator>(
  target: Navigator,
  key: K,
  value: Navigator[K]
): void {
  Object.defineProperty(target, key, {
    configurable: true,
    enumerable: true,
    writable: false,
    value,
  });
}

export function initializeWebMCPPolyfill(options?: WebMCPPolyfillInitOptions): void {
  const nav = getNavigator();
  if (!nav) {
    return;
  }

  const forceOverride = options?.forceOverride ?? false;
  const hasModelContext = Boolean(nav.modelContext);

  if (hasModelContext && !forceOverride) {
    return;
  }

  if (installState.installed) {
    cleanupWebMCPPolyfill();
  }

  const context = new StrictWebMCPContext();
  const modelContext = context as unknown as PolyfillModelContext;
  modelContext[POLYFILL_MARKER_PROPERTY] = true;

  installState.previousModelContextDescriptor = Object.getOwnPropertyDescriptor(
    nav,
    'modelContext'
  );
  installState.previousModelContextTestingDescriptor = Object.getOwnPropertyDescriptor(
    nav,
    'modelContextTesting'
  );

  defineNavigatorProperty(nav, 'modelContext', modelContext as Navigator['modelContext']);

  const installTestingShim = options?.installTestingShim ?? true;
  if (installTestingShim) {
    defineNavigatorProperty(
      nav,
      'modelContextTesting',
      context.getTestingShim() as Navigator['modelContextTesting']
    );
  }

  installState.installed = true;
}

export function cleanupWebMCPPolyfill(): void {
  const nav = getNavigator();
  if (!nav || !installState.installed) {
    return;
  }

  const restore = <K extends keyof Navigator>(
    key: K,
    previousDescriptor: PropertyDescriptor | undefined
  ) => {
    if (previousDescriptor) {
      Object.defineProperty(nav, key, previousDescriptor);
      return;
    }

    delete (nav as unknown as Record<string, unknown>)[key as string];
  };

  restore('modelContext', installState.previousModelContextDescriptor);
  restore('modelContextTesting', installState.previousModelContextTestingDescriptor);

  installState.installed = false;
  installState.previousModelContextDescriptor = undefined;
  installState.previousModelContextTestingDescriptor = undefined;
}

export { initializeWebMCPPolyfill as initializeWebModelContextPolyfill };

export type {
  InputSchema,
  ModelContext,
  ModelContextClient,
  ModelContextCore,
  ModelContextOptions,
  ToolAnnotations,
  ToolDescriptor,
  ToolResponse,
} from '@mcp-b/webmcp-types';
